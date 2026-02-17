import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q')

    if (!q || q.length < 2) {
        return NextResponse.json({ data: [] })
    }

    try {
        const scryfallUrl = new URL('https://api.scryfall.com/cards/search')
        scryfallUrl.searchParams.set('q', q)
        scryfallUrl.searchParams.set('unique', 'prints')

        const response = await fetch(scryfallUrl.toString(), {
            headers: {
                'User-Agent': 'PayloadMTG/1.0',
                Accept: 'application/json',
            },
        })

        if (!response.ok) {
            const error = await response.json()
            return NextResponse.json(
                { data: [], error: error?.details || 'No results found' },
                { status: response.status === 404 ? 200 : response.status },
            )
        }

        const data = await response.json()
        return NextResponse.json(data)
    } catch (error) {
        console.error('Scryfall search error:', error)
        return NextResponse.json({ data: [], error: 'Failed to search Scryfall' }, { status: 500 })
    }
}
