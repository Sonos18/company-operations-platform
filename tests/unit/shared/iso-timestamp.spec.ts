import { describe, expect, it } from 'vitest'
import { isoTimestampSchema } from '../../../shared/schemas/iso-timestamp'
import { isoTimestampSchema as sourceReadTimestampSchema } from '../../../shared/schemas/costs/source-read-model'
import { financeProjectContextSchema, financeTimestampSchema } from '../../../shared/schemas/costs/project-finance'
import { workflowNotificationViewSchema } from '../../../shared/schemas/costs/cost-workflow'
import { accountingSourceVersionSchema } from '../../../shared/schemas/costs/sources'
import { businessPartySchema, companyCostSettingsSchema, engagementComponentSchema, engagementSchema, projectRegisterSchema } from '../../../shared/schemas/costs/master-data'

const accepted = [
  '2026-09-14T11:45:08.001438+00:00', // Actual canonical DEV Supabase timestamp.
  '2026-09-20T10:17:25.280126+00:00',
  '2026-10-07T11:07:46Z',
  '2026-10-07T11:07:46.123456789Z',
  '2026-10-07T18:07:46.123456789+07:00',
  '2026-10-07T07:37:46.123456-03:30',
  '2024-02-29T23:59:59.000001+00:00',
]

describe('Shared DB/API ISO timestamp convention', () => {
  it.each(accepted)('preserves %s without normalization or precision loss', value => {
    expect(isoTimestampSchema.parse(value)).toBe(value)
  })

  it.each([
    '2026-10-07', '2026-10-07T11:07:46', '2026-10-07 11:07:46+00:00',
    '2026-02-30T11:07:46Z', '2025-02-29T11:07:46Z',
    '2026-10-07T24:07:46Z', '2026-10-07T11:07:46+24:00',
    '2026-10-07T11:07:46+07:60', '2026-10-07T11:07:46+99:99',
    'not-a-timestamp', '',
  ])('rejects invalid, timezone-naive or date-only input %s', value => {
    expect(isoTimestampSchema.safeParse(value).success).toBe(false)
  })

  it('keeps nullable and optional behavior explicit and never coerces values', () => {
    expect(isoTimestampSchema.nullable().parse(null)).toBeNull()
    expect(isoTimestampSchema.optional().parse(undefined)).toBeUndefined()
    for (const value of [null, undefined, 1791371266000, new Date('2026-10-07T11:07:46Z')]) {
      expect(isoTimestampSchema.safeParse(value).success).toBe(false)
    }
  })

  it('retains the existing exported timestamp aliases and lifecycle wrappers', () => {
    expect(sourceReadTimestampSchema).toBe(isoTimestampSchema)
    expect(financeTimestampSchema).toBe(isoTimestampSchema)
    expect(workflowNotificationViewSchema.shape.readAt.parse(null)).toBeNull()
    expect(workflowNotificationViewSchema.shape.readAt.parse(accepted[4])).toBe(accepted[4])
    expect(accountingSourceVersionSchema.shape.sharedAt.parse(null)).toBeNull()
    expect(accountingSourceVersionSchema.shape.sharedAt.parse(accepted[0])).toBe(accepted[0])
    expect(financeProjectContextSchema.shape.updatedAt.parse(undefined)).toBeUndefined()
    expect(financeProjectContextSchema.shape.updatedAt.parse(accepted[5])).toBe(accepted[5])
  })

  it.each([
    ['project', projectRegisterSchema], ['party', businessPartySchema],
    ['engagement', engagementSchema], ['component', engagementComponentSchema],
    ['cost settings', companyCostSettingsSchema],
  ] as const)('uses the same convention for %s master-data timestamps', (_name, schema) => {
    expect(schema.shape.createdAt).toBe(isoTimestampSchema)
    expect(schema.shape.updatedAt).toBe(isoTimestampSchema)
    expect(schema.shape.createdAt.parse(accepted[0])).toBe(accepted[0])
  })
})
