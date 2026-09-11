import { describe, expect, it } from 'vitest'
import { permissionCodes } from '../../../shared/constants/permissions'
import {
  createEngagementInputSchema,
  createProjectRegisterInputSchema,
  decimalStringSchema,
  updateProjectRegisterInputSchema,
} from '../../../shared/schemas/costs/master-data'

describe('C1 master-data contracts', () => {
  it('accepts a project without Opportunity or Journey and rejects unsafe decimal text', () => {
    expect(createProjectRegisterInputSchema.parse({ code: 'EG-001', name: 'Synthetic project', origin: 'legacy_import' }).origin).toBe('legacy_import')
    expect(decimalStringSchema.safeParse('9007199254740993.0000').success).toBe(true)
    expect(decimalStringSchema.safeParse('1e3').success).toBe(false)
  })

  it('requires expectedVersion for mutable master data and preserves engagement scope', () => {
    expect(updateProjectRegisterInputSchema.safeParse({ name: 'Renamed' }).success).toBe(false)
    expect(createEngagementInputSchema.safeParse({ partyId: '00000000-0000-4000-8000-000000000001', code: 'CREW-01', name: 'Crew', currencyCode: 'VND' }).success).toBe(true)
  })

  it('registers every explicit C1 permission without assigning it to a role', () => {
    for (const code of ['project.register.manage', 'party.manage', 'engagement.manage', 'cost.read', 'cost.source.read', 'cost.prepare', 'cost.publish_import', 'cost.record_cash', 'cost.correct', 'cost.file.read', 'cost.coverage.assert', 'cost.config.manage']) {
      expect(permissionCodes).toContain(code)
    }
  })
})
