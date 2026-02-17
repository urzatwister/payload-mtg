export type SortFilterItem = {
  reverse: boolean
  slug: null | string
  title: string
}

export const defaultSort: SortFilterItem = {
  slug: null,
  reverse: false,
  title: 'Alphabetic A-Z',
}

export const sorting: SortFilterItem[] = [
  defaultSort,
  { slug: '-createdAt', reverse: true, title: 'Latest arrivals' },
  { slug: 'priceInSGD', reverse: false, title: 'Price: Low to high' }, // asc
  { slug: '-priceInSGD', reverse: true, title: 'Price: High to low' },
]
