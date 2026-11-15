/** Shapes the ratings API sends. */

/** The public rating of a company: only sent once it has enough ratings. */
export interface RatingSummary { average: number; count: number }

/** A passenger's own rating of one trip. */
export interface OwnRating {
  id: string
  stars: number
  comment: string | null
  /** The admin hid the comment: only the stars can be changed. */
  commentHidden: boolean
}

export const MAX_COMMENT = 500

export interface CompanyRatings {
  average: number | null
  count: number
  distribution: Record<string, number>
  publicFrom: number
  publiclyShown: boolean
  buses: { busId: string; plateNumber: string; busType: string | null; average: number | null; count: number }[]
  recent: {
    id: string
    stars: number
    comment: string | null
    commentHidden: boolean
    passenger: string
    plateNumber: string
    fromCity: string
    toCity: string
    departureTime: string
    createdAt: string
  }[]
}

export interface AdminRatings {
  companies: { operatorId: string; companyName: string; average: number | null; count: number; publiclyShown: boolean }[]
  ratings: {
    id: string
    stars: number
    comment: string | null
    commentHidden: boolean
    commentHiddenReason: string | null
    passenger: string
    companyName: string
    plateNumber: string
    fromCity: string
    toCity: string
    departureTime: string
    createdAt: string
  }[]
  total: number
  page: number
  limit: number
}
