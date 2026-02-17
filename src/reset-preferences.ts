import { getPayload } from 'payload'
import * as configModule from './payload.config'

const run = async () => {
    console.log('Starting preference reset...')

    // Robustly handle export default vs named export
    const config = (configModule as any).default || (configModule as any).config || configModule

    if (!config) {
        console.error('Could not find Payload config!')
        process.exit(1)
    }

    try {
        console.log('Initializing Payload (this may prompt for migration - please answer if so)...')
        const payload = await getPayload({ config })

        console.log('Resetting "payload-preferences" to fix schema mismatch errors...')
        const result = await payload.delete({
            collection: 'payload-preferences',
            where: {
                id: { exists: true },
            },
            overrideAccess: true,
        })

        console.log(`Successfully deleted ${result.docs.length} preference documents.`)
        console.log('---------------------------------------------------')
        console.log('SUCCESS! now please run: npm run dev')
        console.log('And select "rename column" for any migration prompts.')
        console.log('---------------------------------------------------')
    } catch (err) {
        console.error('Error during reset:', err)
    }
    process.exit(0)
}

run()
