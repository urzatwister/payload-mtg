import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'

import { syncCardKingdomPrices } from '@/utilities/syncCardKingdomPrices'

export async function POST(req: NextRequest) {
    try {
        const payload = await getPayload({ config })

        // Check if user is authenticated (admin only)
        const { user } = await payload.auth({ headers: req.headers })
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Check admin role
        const isAdmin = user.roles?.includes('admin')
        if (!isAdmin) {
            return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 })
        }

        console.log('[CK Sync] Manual sync triggered by admin:', user.email)

        const result = await syncCardKingdomPrices(payload)

        return NextResponse.json({
            success: true,
            ...result,
        })
    } catch (error) {
        console.error('[CK Sync] Route error:', error)
        return NextResponse.json(
            { error: 'Failed to sync Card Kingdom prices' },
            { status: 500 },
        )
    }
}
