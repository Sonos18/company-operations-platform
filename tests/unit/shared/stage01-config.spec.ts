import { describe, expect, it } from 'vitest'
import { permissionCodes } from '../../../shared/constants/permissions'
import { apiErrorCodeSchema } from '../../../shared/schemas/api-error'
import {
  createStage01ConfigDraftInputSchema,
  discardStage01ConfigDraftInputSchema,
  publishStage01ConfigDraftInputSchema,
  stage01BusinessTaxonomiesSchema,
  stage01CriteriaSchema,
  updateStage01ConfigDraftInputSchema,
} from '../../../shared/schemas/stage01-config'

const ids = {
  snapshot: '10000000-0000-4000-8000-000000000001',
}

const validTaxonomies = {
  customer_type: [{ code: 'customer', label: 'Customer' }],
  contact_relationship: [{ code: 'primary_contact', label: 'Primary contact' }],
  scope: [{ code: 'scope', label: 'Scope' }],
  lead_source: [{ code: 'referral', label: 'Referral', behavior: { requiresReferrer: true } }],
  referrer_type: [{ code: 'partner', label: 'Partner' }],
  engagement_status: [{ code: 'active', label: 'Active' }],
  invalid_reason: [{ code: 'invalid', label: 'Invalid' }],
  budget_status: [{ code: 'unknown', label: 'Unknown' }],
  timeline_status: [{ code: 'unknown', label: 'Unknown' }],
  priority: [{ code: 'normal', label: 'Normal' }],
  intake_channel: [{ code: 'phone', label: 'Phone' }],
  blocker_category: [{ code: 'follow_up', label: 'Follow up' }],
}

const validCriteria = [
  {
    key: 'customer_need',
    dimensionKey: 'customer_need',
    label: 'Customer need',
    description: 'Customer need is understood.',
    criticality: 'required',
    applicabilityMode: 'always',
    allowsNotApplicable: false,
    displayOrder: 1,
  },
  {
    key: 'scope_capability',
    dimensionKey: 'scope_capability',
    label: 'Scope capability',
    description: 'Scope capability is understood.',
    criticality: 'required',
    applicabilityMode: 'always',
    allowsNotApplicable: false,
    displayOrder: 2,
  },
  {
    key: 'resources_schedule',
    dimensionKey: 'resources_schedule',
    label: 'Resources schedule',
    description: 'Resources schedule is understood.',
    criticality: 'required',
    applicabilityMode: 'always',
    allowsNotApplicable: false,
    displayOrder: 3,
  },
  {
    key: 'commercial_viability',
    dimensionKey: 'commercial_viability',
    label: 'Commercial viability',
    description: 'Commercial viability is understood.',
    criticality: 'required',
    applicabilityMode: 'always',
    allowsNotApplicable: false,
    displayOrder: 4,
  },
  {
    key: 'risk_special_conditions',
    dimensionKey: 'risk_special_conditions',
    label: 'Risk and special conditions',
    description: 'Risks and special conditions are understood.',
    criticality: 'required',
    applicabilityMode: 'always',
    allowsNotApplicable: false,
    displayOrder: 5,
  },
]

describe('Stage 01 business configuration contracts', () => {
  // Defect caught: a partial or differently named taxonomy catalog could be accepted for a Stage 01 configuration draft.
  it('requires exactly the twelve approved taxonomy groups and preserves lead-source referrer behavior', () => {
    expect(stage01BusinessTaxonomiesSchema.parse(validTaxonomies)).toEqual(validTaxonomies)

    const missingGroup = structuredClone(validTaxonomies)
    delete missingGroup.blocker_category
    expect(stage01BusinessTaxonomiesSchema.safeParse(missingGroup).success).toBe(false)

    expect(stage01BusinessTaxonomiesSchema.safeParse({
      ...validTaxonomies,
      extra_taxonomy: [],
    }).success).toBe(false)
  })

  // Defect caught: invalid business taxonomy values could enter a draft and later make a published definition invalid.
  it('rejects blank labels or codes and duplicate business codes within a taxonomy', () => {
    expect(stage01BusinessTaxonomiesSchema.safeParse({
      ...validTaxonomies,
      customer_type: [{ code: ' ', label: 'Customer' }],
    }).success).toBe(false)
    expect(stage01BusinessTaxonomiesSchema.safeParse({
      ...validTaxonomies,
      customer_type: [{ code: 'customer', label: ' ' }],
    }).success).toBe(false)
    expect(stage01BusinessTaxonomiesSchema.safeParse({
      ...validTaxonomies,
      customer_type: [
        { code: 'customer', label: 'Customer' },
        { code: 'customer', label: 'Another customer' },
      ],
    }).success).toBe(false)
  })

  // Defect caught: a business caller could claim or overwrite a system-reserved taxonomy semantic identity.
  it('rejects semantic keys from editable taxonomy entries', () => {
    expect(stage01BusinessTaxonomiesSchema.safeParse({
      ...validTaxonomies,
      customer_type: [{ code: 'customer', label: 'Customer', semanticKey: 'reserved_customer' }],
    }).success).toBe(false)
  })

  // Defect caught: duplicate criterion identities or dimensions outside the approved Stage 01 dimension contract could be persisted.
  it('requires unique criterion keys across the existing five approved dimensions', () => {
    expect(stage01CriteriaSchema.parse(validCriteria)).toEqual(validCriteria)
    expect(stage01CriteriaSchema.safeParse([
      ...validCriteria,
      { ...validCriteria[0] },
    ]).success).toBe(false)
    expect(stage01CriteriaSchema.safeParse([
      ...validCriteria.slice(0, 4),
      { ...validCriteria[4], dimensionKey: 'unknown_dimension' },
    ]).success).toBe(false)
  })

  // Defect caught: stale or malformed optimistic-concurrency versions could be accepted by create, update, discard, or publish commands.
  it('accepts only nonnegative integer expected versions and a UUID snapshot expectation', () => {
    expect(createStage01ConfigDraftInputSchema.parse({
      expectedPublishedSnapshotId: ids.snapshot,
    })).toEqual({ expectedPublishedSnapshotId: ids.snapshot })
    expect(updateStage01ConfigDraftInputSchema.parse({
      expectedDraftVersion: 0,
      taxonomies: validTaxonomies,
      criteria: validCriteria,
    }).expectedDraftVersion).toBe(0)
    for (const schema of [discardStage01ConfigDraftInputSchema, publishStage01ConfigDraftInputSchema]) {
      expect(schema.safeParse({ expectedDraftVersion: -1 }).success).toBe(false)
      expect(schema.safeParse({ expectedDraftVersion: 0.5 }).success).toBe(false)
    }
  })

  // Defect caught: an update request could overwrite protected runtime/system definition fields instead of only business configuration.
  it('rejects system fields and raw definitions from draft updates', () => {
    const validUpdate = {
      expectedDraftVersion: 1,
      taxonomies: validTaxonomies,
      criteria: validCriteria,
    }
    for (const protectedField of [
      'nodes',
      'dependencies',
      'dimensions',
      'capabilities',
      'gates',
      'workflowKey',
      'schemaVersion',
      'definition',
    ]) {
      expect(updateStage01ConfigDraftInputSchema.safeParse({
        ...validUpdate,
        [protectedField]: [],
      }).success).toBe(false)
    }
  })

  // Defect caught: authorization and client error mapping could omit the new Stage 01 configuration operations.
  it('extends permission and API-error catalogs with the exact configuration additions', () => {
    const configurationPermissions = [
      'stage01.config.read',
      'stage01.config.update',
      'stage01.config.publish',
    ] as const
    const configurationErrors = [
      'STAGE01_CONFIG_DRAFT_EXISTS',
      'STAGE01_CONFIG_DRAFT_NOT_FOUND',
    ] as const

    for (const permission of configurationPermissions) expect(permissionCodes).toContain(permission)
    for (const error of configurationErrors) expect(apiErrorCodeSchema.safeParse(error).success).toBe(true)
  })
})
