import { z } from 'zod'

/**
 * A DB/API instant with an explicit ISO timezone: Z or a numeric offset.
 * Validation retains the original string, including fractional precision.
 * Calendar dates, timezone-naive inputs and display conversion are separate.
 */
export const isoTimestampSchema = z.string().datetime({ offset: true })
