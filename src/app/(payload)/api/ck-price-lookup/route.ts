import { buildScryfallIdMap } from '@/utilities/cardKingdomCache'
import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/ck-price-lookup
 * 
 * Looks up a card's Card Kingdom price by scryfallId.
 * Request body: { scryfallId: string, isFoil?: boolean }
 * Returns: { price: number | null } (price in USD cents)
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
    try {
        const body = await req.json()
        const { scryfallId, isFoil } = body

        if (!scryfallId) {
            return NextResponse.json(
                { error: 'scryfallId is required' },
                { status: 400 },
            )
        }

        // Build the CK lookup map (will use cached data if fresh)
        const ckMap = await buildScryfallIdMap()

        // Look up the card
        const ckProduct = ckMap.get(scryfallId)

        let price: number | null = null

        if (!ckProduct) {
            price = null
        } else if (isFoil !== undefined) {
            // Check if the map entry matches our foil requirement
            if (ckProduct.is_foil !== isFoil) {
                // Map entry doesn't match (e.g. map has non-foil, we want foil)
                // We need to find the specific variant in the full pricelist
                const { ensureFreshCache } = await import('@/utilities/cardKingdomCache')
                const pricelist = await ensureFreshCache()

                const exactMatch = pricelist.data.find(
                    (p) => p.scryfall_id === scryfallId && p.is_foil === isFoil
                )

                if (exactMatch) {
                    price = exactMatch.price_retail
                } else {
                    // Fallback: if we wanted foil but only have non-foil (or vice versa),
                    // we might want to return null to indicate "exact match not found"
                    // OR return the other price with a warning.
                    // For now, let's return null if we can't find the specific foil/non-foil version
                    // so we don't price a foil card as non-foil
                    price = null
                }
            } else {
                price = ckProduct.price_retail
            }
        } else {
            price = ckProduct.price_retail
        }

        if (price === null) {
            return NextResponse.json({ price: null })
        }

        // Convert to USD cents
        const priceInCents = Math.round(price * 100)

        return NextResponse.json({ price: priceInCents })
    } catch (err) {
        console.error('[CK Price Lookup] Error:', err)
        return NextResponse.json(
            { error: 'Failed to lookup Card Kingdom price' },
            { status: 500 },
        )
    }
}
