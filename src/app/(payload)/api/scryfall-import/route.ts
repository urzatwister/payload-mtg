import config from '@payload-config'
import fs from 'fs'
import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import { getPayload } from 'payload'
import { fileURLToPath } from 'url'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export async function POST(req: NextRequest) {
    try {
        const body = await req.json()
        const { imageUrl, cardName, scryfallId } = body

        if (!imageUrl || !cardName) {
            return NextResponse.json({ error: 'Missing imageUrl or cardName' }, { status: 400 })
        }

        const payload = await getPayload({ config })

        // Check if user is authenticated (admin only)
        const { user } = await payload.auth({ headers: req.headers })
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Download the image from Scryfall
        const imageResponse = await fetch(imageUrl, {
            headers: {
                'User-Agent': 'PayloadMTG/1.0',
                Accept: 'image/*',
            },
        })

        if (!imageResponse.ok) {
            return NextResponse.json({ error: 'Failed to download image from Scryfall' }, { status: 502 })
        }

        const imageBuffer = Buffer.from(await imageResponse.arrayBuffer())
        const contentType = imageResponse.headers.get('content-type') || 'image/jpeg'
        const extension = contentType.includes('png') ? 'png' : 'jpg'
        const sanitizedName = cardName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()
        const fileName = `${sanitizedName}_${scryfallId || Date.now()}.${extension}`

        // Write to a temp file so Payload can process it
        const mediaDir = path.resolve(process.cwd(), 'public/media')
        if (!fs.existsSync(mediaDir)) {
            fs.mkdirSync(mediaDir, { recursive: true })
        }
        const tempPath = path.resolve(mediaDir, fileName)
        fs.writeFileSync(tempPath, imageBuffer)

        // Create Media document via Payload Local API
        const mediaDoc = await payload.create({
            collection: 'media',
            data: {
                alt: cardName,
            },
            filePath: tempPath,
        })

        return NextResponse.json({
            success: true,
            mediaId: mediaDoc.id,
            mediaDoc,
        })
    } catch (error) {
        console.error('Scryfall import error:', error)
        return NextResponse.json(
            { error: 'Failed to import card image' },
            { status: 500 },
        )
    }
}
