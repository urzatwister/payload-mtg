import { CallToAction } from '@/blocks/CallToAction/config'
import { Content } from '@/blocks/Content/config'
import { MediaBlock } from '@/blocks/MediaBlock/config'
import { generatePreviewPath } from '@/utilities/generatePreviewPath'
import { CollectionOverride } from '@payloadcms/plugin-ecommerce/types'
import {
  MetaDescriptionField,
  MetaImageField,
  MetaTitleField,
  OverviewField,
  PreviewField,
} from '@payloadcms/plugin-seo/fields'
import {
  FixedToolbarFeature,
  HeadingFeature,
  HorizontalRuleFeature,
  InlineToolbarFeature,
  lexicalEditor,
} from '@payloadcms/richtext-lexical'
import { DefaultDocumentIDType, slugField, Where } from 'payload'

export const ProductsCollection: CollectionOverride = ({ defaultCollection }) => ({
  ...defaultCollection,
  admin: {
    ...defaultCollection?.admin,
    defaultColumns: ['title', 'setName', 'rarity', 'collectorNumber', '_status'],
    livePreview: {
      url: ({ data, req }) =>
        generatePreviewPath({
          slug: data?.slug,
          collection: 'products',
          req,
        }),
    },
    preview: (data, { req }) =>
      generatePreviewPath({
        slug: data?.slug as string,
        collection: 'products',
        req,
      }),
    useAsTitle: 'title',
  },
  defaultPopulate: {
    ...defaultCollection?.defaultPopulate,
    title: true,
    slug: true,
    variantOptions: true,
    variants: true,
    enableVariants: true,
    gallery: true,
    priceInSGD: true,
    inventory: true,
    meta: true,
    scryfallId: true,
    setName: true,
    setCode: true,
    rarity: true,
    manaCost: true,
    cardType: true,
    collectorNumber: true,
  },
  fields: [
    {
      name: 'scryfallSearch',
      type: 'ui',
      admin: {
        components: {
          Field: '@/components/ScryfallSearch#ScryfallSearch',
        },
      },
    },
    { name: 'title', type: 'text', required: true },
    {
      type: 'tabs',
      tabs: [
        {
          fields: [
            {
              name: 'description',
              type: 'richText',
              editor: lexicalEditor({
                features: ({ rootFeatures }) => {
                  return [
                    ...rootFeatures,
                    HeadingFeature({ enabledHeadingSizes: ['h1', 'h2', 'h3', 'h4'] }),
                    FixedToolbarFeature(),
                    InlineToolbarFeature(),
                    HorizontalRuleFeature(),
                  ]
                },
              }),
              label: false,
              required: false,
            },
            {
              name: 'gallery',
              type: 'array',
              minRows: 1,
              fields: [
                {
                  name: 'image',
                  type: 'upload',
                  relationTo: 'media',
                  required: true,
                },
                {
                  name: 'variantOption',
                  type: 'relationship',
                  relationTo: 'variantOptions',
                  admin: {
                    condition: (data) => {
                      return data?.enableVariants === true && data?.variantTypes?.length > 0
                    },
                  },
                  filterOptions: ({ data }) => {
                    if (data?.enableVariants && data?.variantTypes?.length) {
                      const variantTypeIDs = data.variantTypes.map((item: any) => {
                        if (typeof item === 'object' && item?.id) {
                          return item.id
                        }
                        return item
                      }) as DefaultDocumentIDType[]

                      if (variantTypeIDs.length === 0)
                        return {
                          variantType: {
                            in: [],
                          },
                        }

                      const query: Where = {
                        variantType: {
                          in: variantTypeIDs,
                        },
                      }

                      return query
                    }

                    return {
                      variantType: {
                        in: [],
                      },
                    }
                  },
                },
              ],
            },

            {
              name: 'layout',
              type: 'blocks',
              blocks: [CallToAction, Content, MediaBlock],
            },
          ],
          label: 'Content',
        },
        {
          label: 'Card Details',
          fields: [
            {
              type: 'row',
              fields: [
                {
                  name: 'scryfallId',
                  type: 'text',
                  label: 'Scryfall ID',
                  admin: {
                    readOnly: true,
                    description: 'Auto-populated from Scryfall search',
                  },
                },
                {
                  name: 'collectorNumber',
                  type: 'text',
                  label: 'Collector Number',
                  admin: {
                    readOnly: true,
                  },
                },
              ],
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'setName',
                  type: 'text',
                  label: 'Set Name',
                  admin: {
                    readOnly: true,
                  },
                },
                {
                  name: 'setCode',
                  type: 'text',
                  label: 'Set Code',
                  admin: {
                    readOnly: true,
                  },
                },
              ],
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'rarity',
                  type: 'select',
                  label: 'Rarity',
                  options: [
                    { label: 'Common', value: 'common' },
                    { label: 'Uncommon', value: 'uncommon' },
                    { label: 'Rare', value: 'rare' },
                    { label: 'Mythic', value: 'mythic' },
                    { label: 'Special', value: 'special' },
                    { label: 'Bonus', value: 'bonus' },
                  ],
                  admin: {
                    readOnly: true,
                  },
                },
                {
                  name: 'manaCost',
                  type: 'text',
                  label: 'Mana Cost',
                  admin: {
                    readOnly: true,
                  },
                },
              ],
            },
            {
              name: 'cardType',
              type: 'text',
              label: 'Card Type',
              admin: {
                readOnly: true,
              },
            },
            {
              name: 'isFoil',
              type: 'checkbox',
              label: 'Foil',
              defaultValue: false,
              admin: {
                readOnly: true,
                description: 'Auto-populated from Scryfall search',
              },
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'ckPriceUSD',
                  type: 'number',
                  label: 'Card Kingdom Price (USD cents)',
                  admin: {
                    readOnly: true,
                    description: 'Auto-populated from Card Kingdom pricelist',
                  },
                },
                {
                  name: 'ckPriceLastUpdated',
                  type: 'date',
                  label: 'CK Price Last Updated',
                  admin: {
                    readOnly: true,
                    date: {
                      pickerAppearance: 'dayAndTime',
                    },
                  },
                },
              ],
            },
          ],
        },
        {
          fields: [
            ...defaultCollection.fields,
            {
              name: 'relatedProducts',
              type: 'relationship',
              filterOptions: ({ id }) => {
                if (id) {
                  return {
                    id: {
                      not_in: [id],
                    },
                  }
                }

                // ID comes back as undefined during seeding so we need to handle that case
                return {
                  id: {
                    exists: true,
                  },
                }
              },
              hasMany: true,
              relationTo: 'products',
            },
          ],
          label: 'Product Details',
        },
        {
          name: 'meta',
          label: 'SEO',
          fields: [
            OverviewField({
              titlePath: 'meta.title',
              descriptionPath: 'meta.description',
              imagePath: 'meta.image',
            }),
            MetaTitleField({
              hasGenerateFn: true,
            }),
            MetaImageField({
              relationTo: 'media',
            }),

            MetaDescriptionField({}),
            PreviewField({
              // if the `generateUrl` function is configured
              hasGenerateFn: true,

              // field paths to match the target field for data
              titlePath: 'meta.title',
              descriptionPath: 'meta.description',
            }),
          ],
        },
      ],
    },
    {
      name: 'categories',
      type: 'relationship',
      admin: {
        position: 'sidebar',
        sortOptions: 'title',
      },
      hasMany: true,
      relationTo: 'categories',
    },
    slugField(),
  ],
})
