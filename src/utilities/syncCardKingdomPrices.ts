import type { Payload } from 'payload'
import { buildScryfallIdMap } from './cardKingdomCache'

// USD → SGD conversion rate
const USD_TO_SGD = 1.3

export interface SyncResult {
    totalProducts: number
    matched: number
    updated: number
    skipped: number
    errors: string[]
}

/**
 * Syncs Card Kingdom prices to all products that have a scryfallId.
 *
 * 1. Refreshes the CK cache if stale (>24 hours)
 * 2. Queries all products with a scryfallId
 * 3. Looks up each product in the CK pricelist by scryfallId
 * 4. Converts CK PriceRetail (USD) → SGD cents
 * 5. Updates priceInSGD, priceInSGDEnabled, ckPriceUSD, ckPriceLastUpdated
 */
export async function syncCardKingdomPrices(payload: Payload): Promise<SyncResult> {
    const result: SyncResult = {
        totalProducts: 0,
        matched: 0,
        updated: 0,
        skipped: 0,
        errors: [],
    }

    try {
        // Build the CK lookup map (refreshes cache if stale)
        const ckMap = await buildScryfallIdMap()

        // Query all products with a scryfallId, paginate through all
        let page = 1
        let hasMore = true

        while (hasMore) {
            const products = await payload.find({
                collection: 'products',
                where: {
                    scryfallId: {
                        exists: true,
                    },
                },
                limit: 100,
                page,
                depth: 0,
                select: {
                    scryfallId: true,
                    priceInSGD: true,
                    title: true,
                },
            })

            result.totalProducts += products.docs.length

            for (const product of products.docs) {
                const scryfallId = product.scryfallId
                if (!scryfallId) {
                    result.skipped++
                    continue
                }

                const ckProduct = ckMap.get(scryfallId)
                if (!ckProduct) {
                    result.skipped++
                    continue
                }

                result.matched++

                try {
                    // CK price is in USD dollars (e.g. 12.99)
                    // Convert to SGD cents: 12.99 * 1.3 * 100 = 1689
                    const priceRetailUSD = ckProduct.price_retail
                    const sgdCents = Math.round(priceRetailUSD * USD_TO_SGD * 100)
                    const usdCents = Math.round(priceRetailUSD * 100)

                    await payload.update({
                        collection: 'products',
                        id: product.id,
                        data: {
                            priceInSGD: sgdCents,
                            priceInSGDEnabled: true,
                            ckPriceUSD: usdCents,
                            ckPriceLastUpdated: new Date().toISOString(),
                        },
                    })

                    result.updated++
                } catch (err) {
                    const message = `Failed to update product ${product.id} (${product.title}): ${err instanceof Error ? err.message : String(err)}`
                    result.errors.push(message)
                    console.error(`[CK Sync] ${message}`)
                }
            }

            hasMore = products.hasNextPage
            page++
        }

        console.log(
            `[CK Sync] Complete: ${result.totalProducts} total, ${result.matched} matched, ${result.updated} updated, ${result.skipped} skipped, ${result.errors.length} errors`,
        )
    } catch (err) {
        const message = `Sync failed: ${err instanceof Error ? err.message : String(err)}`
        result.errors.push(message)
        console.error(`[CK Sync] ${message}`)
    }

    return result
}
