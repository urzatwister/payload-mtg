'use client'

import { toast, useDocumentInfo } from '@payloadcms/ui'
import React, { useCallback, useEffect, useRef, useState } from 'react'

import './index.scss'

// Approximate USD → SGD exchange rate (can be updated as needed)
const USD_TO_SGD = 1.3

interface ScryfallCard {
    id: string
    name: string
    set_name: string
    set: string
    rarity: string
    mana_cost?: string
    type_line?: string
    collector_number: string
    foil: boolean
    nonfoil: boolean
    prices?: {
        usd?: string | null
        usd_foil?: string | null
        eur?: string | null
        tix?: string | null
    }
    image_uris?: {
        small?: string
        normal?: string
        large?: string
        art_crop?: string
    }
    card_faces?: Array<{
        image_uris?: {
            small?: string
            normal?: string
            large?: string
        }
    }>
}

function getCardImage(card: ScryfallCard, size: 'small' | 'normal' | 'large' = 'small'): string {
    if (card.image_uris?.[size]) return card.image_uris[size]!
    if (card.card_faces?.[0]?.image_uris?.[size]) return card.card_faces[0].image_uris[size]!
    return ''
}

export const ScryfallSearch: React.FC = () => {
    const [query, setQuery] = useState('')
    const [results, setResults] = useState<ScryfallCard[]>([])
    const [loading, setLoading] = useState(false)
    const [importing, setImporting] = useState<string | null>(null)
    const [isOpen, setIsOpen] = useState(false)
    const [foilSelections, setFoilSelections] = useState<Map<string, boolean>>(new Map())
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Get the current document ID from Payload
    const { id: documentId } = useDocumentInfo()

    const handleSearch = useCallback(async (searchQuery: string) => {
        if (searchQuery.length < 2) {
            setResults([])
            return
        }

        setLoading(true)
        try {
            const res = await fetch(
                `/api/scryfall-search?q=${encodeURIComponent(searchQuery)}`,
                { credentials: 'include' },
            )
            const data = await res.json()
            setResults(data.data || [])
        } catch (err) {
            console.error('Search error:', err)
            toast.error('Failed to search Scryfall')
        } finally {
            setLoading(false)
        }
    }, [])

    const handleInputChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const value = e.target.value
            setQuery(value)
            setIsOpen(true)

            if (debounceRef.current) clearTimeout(debounceRef.current)
            debounceRef.current = setTimeout(() => {
                handleSearch(value)
            }, 400)
        },
        [handleSearch],
    )

    const handleSelectCard = useCallback(
        async (card: ScryfallCard) => {
            if (!documentId) {
                toast.error('Please save the product as a draft first, then use Scryfall search.')
                return
            }

            setImporting(card.id)
            setIsOpen(false)

            try {
                // Determine foil selection
                let isFoil = foilSelections.get(card.id) || false

                if (card.foil && !card.nonfoil) {
                    isFoil = true
                } else if (!card.foil && card.nonfoil) {
                    isFoil = false
                }

                console.log('[Scryfall] Importing card:', {
                    name: card.name,
                    isFoil,
                    documentId,
                })

                // Step 1: Import the image
                const imageUrl = getCardImage(card, 'large') || getCardImage(card, 'normal')
                let mediaId: string | number | null = null

                if (imageUrl) {
                    const importRes = await fetch('/api/scryfall-import', {
                        method: 'POST',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            imageUrl,
                            cardName: card.name,
                            scryfallId: card.id,
                        }),
                    })

                    if (importRes.ok) {
                        const importData = await importRes.json()
                        mediaId = importData.mediaId
                        console.log('[Scryfall] Image imported, mediaId:', mediaId)
                    } else {
                        console.error('[Scryfall] Image import failed')
                        toast.error('Failed to import card image, but other fields will still be populated.')
                    }
                }

                // Step 3: Calculate Scryfall price
                const priceString = isFoil ? card.prices?.usd_foil : card.prices?.usd
                const usdPrice = priceString ? parseFloat(priceString) : null
                let sgdCents: number | undefined
                if (usdPrice !== null && !isNaN(usdPrice)) {
                    sgdCents = Math.round(usdPrice * USD_TO_SGD * 100)
                    console.log('[Scryfall] Price:', { usdPrice, sgdCents })
                }

                // Step 4: Lookup Card Kingdom price
                let ckPriceUSD: number | undefined
                let ckPriceLastUpdated: string | undefined
                try {
                    const ckLookupRes = await fetch('/api/ck-price-lookup', {
                        method: 'POST',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            scryfallId: card.id,
                            isFoil,
                        }),
                    })

                    if (ckLookupRes.ok) {
                        const ckData = await ckLookupRes.json()
                        if (ckData.price !== null) {
                            ckPriceUSD = ckData.price // in USD cents
                            ckPriceLastUpdated = new Date().toISOString()
                            console.log('[Scryfall] Card Kingdom price found:', ckPriceUSD)

                            // Override Scryfall price with CK price if available
                            sgdCents = Math.round((ckPriceUSD / 100) * USD_TO_SGD * 100)
                        } else {
                            console.log('[Scryfall] No Card Kingdom price found for this card')
                        }
                    }
                } catch (err) {
                    console.warn('[Scryfall] Card Kingdom lookup failed, skipping:', err)
                }

                // Step 5: Build the update payload and clear gallery
                const updateData: Record<string, unknown> = {
                    title: card.name, // Always update title to the new card
                    slug: card.id, // Use Scryfall ID as slug to ensure uniqueness
                    scryfallId: card.id,
                    setName: card.set_name,
                    setCode: card.set,
                    rarity: card.rarity,
                    collectorNumber: card.collector_number,
                    isFoil,
                    // Clear fields that might not have values for this card
                    manaCost: card.mana_cost || '',
                    cardType: card.type_line || '',
                    // Clear gallery - we'll set it with only the new image
                    gallery: [],
                }

                // Set price or clear it
                if (sgdCents !== undefined) {
                    updateData.priceInSGD = sgdCents
                    updateData.priceInSGDEnabled = true
                } else {
                    updateData.priceInSGD = 0
                    updateData.priceInSGDEnabled = false
                }

                // Set Card Kingdom price fields
                if (ckPriceUSD !== undefined && ckPriceLastUpdated !== undefined) {
                    updateData.ckPriceUSD = ckPriceUSD
                    updateData.ckPriceLastUpdated = ckPriceLastUpdated
                } else {
                    updateData.ckPriceUSD = null
                    updateData.ckPriceLastUpdated = null
                }

                console.log('[Scryfall] Updating product via REST API:', updateData)

                // Step 5: PATCH the product via Payload REST API
                const patchRes = await fetch(`/api/products/${documentId}`, {
                    method: 'PATCH',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updateData),
                })

                if (!patchRes.ok) {
                    const errorText = await patchRes.text()
                    console.error('[Scryfall] PATCH failed:', errorText)
                    toast.error('Failed to update product with card data.')
                    return
                }

                await patchRes.json()
                console.log('[Scryfall] Product updated successfully!')

                // Step 6: Add image to gallery if we have one (replaces cleared gallery)
                if (mediaId) {
                    const newGalleryItem = {
                        image: mediaId,
                    }

                    const galleryPatchRes = await fetch(`/api/products/${documentId}`, {
                        method: 'PATCH',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            gallery: [newGalleryItem], // Only the new image, no old images
                        }),
                    })

                    if (galleryPatchRes.ok) {
                        console.log('[Scryfall] Gallery updated successfully')
                    } else {
                        console.error('[Scryfall] Gallery update failed:', await galleryPatchRes.text())
                    }
                }

                const foilText = isFoil ? ' (Foil)' : ''
                toast.success(`Imported "${card.name}"${foilText} — refreshing page...`)

                // Step 7: Reload the page to show updated data
                setTimeout(() => {
                    window.location.reload()
                }, 800)

            } catch (err) {
                console.error('[Scryfall] Import error:', err)
                toast.error('Failed to import card')
            } finally {
                setImporting(null)
            }
        },
        [documentId, foilSelections],
    )

    // Close dropdown when clicking outside
    const containerRef = useRef<HTMLDivElement>(null)
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    return (
        <div className="scryfall-search" ref={containerRef}>
            <div className="scryfall-search__header">
                <svg
                    className="scryfall-search__icon"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                    id="scryfall-search-input"
                    name="scryfall-search"
                    className="scryfall-search__input"
                    type="text"
                    value={query}
                    onChange={handleInputChange}
                    onFocus={() => results.length > 0 && setIsOpen(true)}
                    placeholder='Search Scryfall for an MTG card (e.g. "Lightning Bolt" or "Black Lotus")'
                />
                {loading && <span className="scryfall-search__spinner" />}
            </div>

            {isOpen && results.length > 0 && (
                <div className="scryfall-search__results">
                    <div className="scryfall-search__results-header">
                        <span>
                            {results.length} result{results.length !== 1 ? 's' : ''} found
                        </span>
                        <button
                            className="scryfall-search__close"
                            onClick={() => setIsOpen(false)}
                            type="button"
                        >
                            ✕
                        </button>
                    </div>
                    <div className="scryfall-search__grid">
                        {results.slice(0, 50).map((card) => {
                            const thumb = getCardImage(card, 'small')
                            const isImporting = importing === card.id
                            const isFoil = foilSelections.get(card.id) || false

                            const priceString = isFoil ? card.prices?.usd_foil : card.prices?.usd
                            const usdPrice = priceString ? parseFloat(priceString) : null
                            const sgdPrice = usdPrice ? (usdPrice * USD_TO_SGD).toFixed(2) : null

                            const hasFoil = card.foil && card.prices?.usd_foil
                            const hasNonFoil = card.nonfoil && card.prices?.usd
                            const bothAvailable = hasFoil && hasNonFoil

                            return (
                                <div
                                    key={`${card.id}-${card.collector_number}`}
                                    className={`scryfall-search__card-wrapper ${isImporting ? 'scryfall-search__card-wrapper--importing' : ''}`}
                                >
                                    <button
                                        className="scryfall-search__card"
                                        onClick={() => handleSelectCard(card)}
                                        disabled={isImporting || importing !== null}
                                        type="button"
                                    >
                                        {thumb && (
                                            <img
                                                className="scryfall-search__card-image"
                                                src={thumb}
                                                alt={card.name}
                                                loading="lazy"
                                            />
                                        )}
                                        <div className="scryfall-search__card-info">
                                            <span className="scryfall-search__card-name">{card.name}</span>
                                            <span className="scryfall-search__card-set">
                                                {card.set_name} · {card.collector_number}
                                            </span>
                                            <span
                                                className={`scryfall-search__card-rarity scryfall-search__card-rarity--${card.rarity}`}
                                            >
                                                {card.rarity}
                                            </span>
                                            {sgdPrice && (
                                                <span className="scryfall-search__card-price">
                                                    ${sgdPrice} SGD
                                                    {isFoil && ' ✨'}
                                                </span>
                                            )}
                                        </div>
                                        {isImporting && (
                                            <div className="scryfall-search__card-overlay">
                                                <span className="scryfall-search__spinner scryfall-search__spinner--large" />
                                                <span>Importing…</span>
                                            </div>
                                        )}
                                    </button>

                                    {bothAvailable && !isImporting && (
                                        <div className="scryfall-search__foil-controls">
                                            <button
                                                type="button"
                                                className={`scryfall-search__foil-btn ${!isFoil ? 'scryfall-search__foil-btn--active' : ''}`}
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    setFoilSelections(new Map(foilSelections).set(card.id, false))
                                                }}
                                            >
                                                Regular
                                            </button>
                                            <button
                                                type="button"
                                                className={`scryfall-search__foil-btn ${isFoil ? 'scryfall-search__foil-btn--active' : ''}`}
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    setFoilSelections(new Map(foilSelections).set(card.id, true))
                                                }}
                                            >
                                                ✨ Foil
                                            </button>
                                        </div>
                                    )}

                                    {!bothAvailable && (hasFoil || hasNonFoil) && (
                                        <div className="scryfall-search__availability-badge">
                                            {hasFoil ? '✨ Foil Only' : 'Regular Only'}
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}
        </div>
    )
}
