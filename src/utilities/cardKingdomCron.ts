import cron from 'node-cron'
import type { Payload } from 'payload'

import { syncCardKingdomPrices } from './syncCardKingdomPrices'

let isScheduled = false

/**
 * Schedules a daily Card Kingdom price sync cron job.
 * Runs at midnight (00:00) every day.
 * Safe to call multiple times — only schedules once.
 */
export function scheduleCardKingdomSync(payload: Payload): void {
    if (isScheduled) {
        console.log('[CK Cron] Price sync already scheduled, skipping.')
        return
    }

    // Run daily at midnight
    cron.schedule('0 0 * * *', async () => {
        console.log('[CK Cron] Running scheduled Card Kingdom price sync...')
        try {
            const result = await syncCardKingdomPrices(payload)
            console.log(
                `[CK Cron] Scheduled sync complete: ${result.updated}/${result.totalProducts} products updated.`,
            )
        } catch (err) {
            console.error('[CK Cron] Scheduled sync failed:', err)
        }
    })

    isScheduled = true
    console.log('[CK Cron] Card Kingdom price sync scheduled to run daily at midnight.')
}
