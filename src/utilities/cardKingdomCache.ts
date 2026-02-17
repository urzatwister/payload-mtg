import fs from 'fs'
import path from 'path'

const CACHE_DIR = path.resolve(process.cwd(), '.ck-cache')
const PRICELIST_PATH = path.join(CACHE_DIR, 'pricelist.json')
const META_PATH = path.join(CACHE_DIR, 'meta.json')

const CK_API_URL = 'https://api.cardkingdom.com/api/v2/pricelist'
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000 // 24 hours

export interface CKProduct {
    id: number
    sku: string
    url: string
    name: string
    variation: string
    edition: string
    is_foil: boolean
    price_retail: number
    qty_retail: number
    price_buy: number
    qty_buying: number
    scryfall_id: string
    condition_values?: {
        nm_price?: number
        nm_qty?: number
        ex_price?: number
        ex_qty?: number
        vg_price?: number
        vg_qty?: number
        g_price?: number
        g_qty?: number
    }
}

interface CKPricelistResponse {
    meta: {
        base_url: string
        date_updated: string
        [key: string]: unknown
    }
    data: CKProduct[]
}

interface CacheMeta {
    lastFetched: string
    productCount: number
}

function ensureCacheDir(): void {
    if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true })
    }
}

function getCacheMeta(): CacheMeta | null {
    try {
        if (fs.existsSync(META_PATH)) {
            const raw = fs.readFileSync(META_PATH, 'utf-8')
            return JSON.parse(raw) as CacheMeta
        }
    } catch {
        // Corrupted meta — treat as no cache
    }
    return null
}

function isCacheStale(): boolean {
    const meta = getCacheMeta()
    if (!meta) return true

    const lastFetched = new Date(meta.lastFetched).getTime()
    const now = Date.now()
    return now - lastFetched > CACHE_MAX_AGE_MS
}

/**
 * Downloads the Card Kingdom pricelist and caches it to disk.
 * Returns the number of products in the pricelist.
 */
export async function refreshCache(): Promise<number> {
    ensureCacheDir()

    console.log('[CK Cache] Downloading pricelist from Card Kingdom...')
    const response = await fetch(CK_API_URL, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; PayloadMTG/1.0)',
            Accept: 'application/json',
        },
    })

    if (!response.ok) {
        const errorMsg = `[CK Cache] Failed to download pricelist: ${response.status} ${response.statusText}`
        console.error(errorMsg)

        // If we have a stale cache, we can still use it
        if (fs.existsSync(PRICELIST_PATH)) {
            console.warn('[CK Cache] Using stale cache as fallback.')
            const raw = fs.readFileSync(PRICELIST_PATH, 'utf-8')
            const data = JSON.parse(raw) as CKPricelistResponse
            return data.data?.length ?? 0
        }

        throw new Error(errorMsg)
    }

    const data = (await response.json()) as CKPricelistResponse
    const productCount = data.data?.length ?? 0

    // Write the full pricelist
    fs.writeFileSync(PRICELIST_PATH, JSON.stringify(data), 'utf-8')

    // Write cache metadata
    const meta: CacheMeta = {
        lastFetched: new Date().toISOString(),
        productCount,
    }
    fs.writeFileSync(META_PATH, JSON.stringify(meta, null, 2), 'utf-8')

    console.log(`[CK Cache] Cached ${productCount} products.`)
    return productCount
}

/**
 * Ensures the cache is fresh (downloads if stale), then returns
 * the raw pricelist data from disk.
 */
export async function ensureFreshCache(): Promise<CKPricelistResponse> {
    if (isCacheStale()) {
        await refreshCache()
    }

    const raw = fs.readFileSync(PRICELIST_PATH, 'utf-8')
    return JSON.parse(raw) as CKPricelistResponse
}

/**
 * Builds and returns a Map of scryfallId → CKProduct for fast lookups.
 * Automatically refreshes the cache if it's stale.
 */
export async function buildScryfallIdMap(): Promise<Map<string, CKProduct>> {
    const pricelist = await ensureFreshCache()
    const map = new Map<string, CKProduct>()

    for (const product of pricelist.data) {
        if (product.scryfall_id) {
            // If there are multiple entries for same scryfall_id (e.g. foil vs non-foil),
            // prefer non-foil as the base price, or whichever comes first
            if (!map.has(product.scryfall_id)) {
                map.set(product.scryfall_id, product)
            } else if (!product.is_foil && map.get(product.scryfall_id)?.is_foil) {
                // Replace foil entry with non-foil
                map.set(product.scryfall_id, product)
            }
        }
    }

    console.log(`[CK Cache] Built lookup map with ${map.size} unique scryfall IDs.`)
    return map
}
