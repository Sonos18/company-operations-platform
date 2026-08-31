import { describe, expect, it } from 'vitest'
import {
  stage01ConfigDraftSchema,
  stage01PublishedConfigSchema,
  type Stage01BusinessTaxonomies,
} from '../../../shared/schemas/stage01-config'
import {
  buildStage01ConfigUpdateInput,
  cloneEditableConfig,
  isEditableConfigEqual,
  publishedCriterionKeys,
  publishedTaxonomyCodes,
  stage01ApplicabilityModeOptions,
  stage01CriterionCriticalityOptions,
  stage01DimensionOptions,
  stage01TaxonomyLabels,
} from '../../../app/features/stage01-config/stage01-config-editor'

const taxonomies = {
  customer_type: [{ code: 'individual', label: 'Khách lẻ' }],
  contact_relationship: [{ code: 'primary_contact', label: 'Liên hệ chính' }],
  scope: [{ code: 'interior', label: 'Nội thất' }],
  lead_source: [{ code: 'referral', label: 'Giới thiệu', behavior: { requiresReferrer: true } }],
  referrer_type: [{ code: 'partner', label: 'Đối tác' }],
  engagement_status: [{ code: 'active', label: 'Đang tương tác' }],
  invalid_reason: [{ code: 'duplicate', label: 'Trùng lặp' }],
  budget_status: [{ code: 'confirmed', label: 'Đã xác nhận' }],
  timeline_status: [{ code: 'planned', label: 'Đã lên kế hoạch' }],
  priority: [{ code: 'normal', label: 'Bình thường' }],
  intake_channel: [{ code: 'phone', label: 'Điện thoại' }],
  blocker_category: [{ code: 'approval', label: 'Chờ phê duyệt' }],
} satisfies Stage01BusinessTaxonomies

const criteria = [
  ['customer_need', 'Nhu cầu khách hàng'],
  ['scope_capability', 'Khả năng phạm vi'],
  ['resources_schedule', 'Nguồn lực và tiến độ'],
  ['commercial_viability', 'Tính khả thi thương mại'],
  ['risk_special_conditions', 'Rủi ro và điều kiện đặc biệt'],
].map(([dimensionKey, label], index) => ({
  key: dimensionKey,
  dimensionKey,
  label,
  description: `${label} đã được xác định.`,
  criticality: 'required' as const,
  applicabilityMode: 'always' as const,
  allowsNotApplicable: false,
  displayOrder: index + 1,
}))

const draftFixture = stage01ConfigDraftSchema.parse({
  id: '10000000-0000-4000-8000-000000000001',
  baseSnapshotId: '10000000-0000-4000-8000-000000000002',
  version: 4,
  createdBy: '10000000-0000-4000-8000-000000000003',
  createdAt: '2026-08-31T00:00:00.000Z',
  updatedBy: '10000000-0000-4000-8000-000000000003',
  updatedAt: '2026-08-31T00:00:00.000Z',
  taxonomies,
  criteria,
})

const publishedFixture = stage01PublishedConfigSchema.parse({
  snapshotId: '10000000-0000-4000-8000-000000000002',
  templateVersion: 2,
  schemaVersion: 1,
  definitionHash: 'stage01-definition-hash',
  publishedAt: '2026-08-30T00:00:00.000Z',
  taxonomies,
  criteria,
  system: {
    nodes: [],
    dependencies: [],
    dimensions: ['customer_need', 'scope_capability', 'resources_schedule', 'commercial_viability', 'risk_special_conditions'],
    capabilities: {},
    gates: {},
  },
})

describe('Stage 01 configuration editor state', () => {
  // Defect caught: editing local configuration state could mutate the canonical draft and include protected draft metadata.
  it('clones only editable business fields from a draft', () => {
    const editable = cloneEditableConfig(draftFixture)

    expect(editable).toEqual({ taxonomies: draftFixture.taxonomies, criteria: draftFixture.criteria })
    expect(editable.taxonomies).not.toBe(draftFixture.taxonomies)
    expect(editable.criteria).not.toBe(draftFixture.criteria)

    editable.taxonomies.customer_type[0]!.label = 'Khách hàng cá nhân'
    expect(draftFixture.taxonomies.customer_type[0]!.label).toBe('Khách lẻ')
  })

  // Defect caught: a dirty indicator could depend on reactive object identity instead of the persisted editable content.
  it('derives dirty state from editable content, not object identity', () => {
    const left = cloneEditableConfig(draftFixture)
    const right = cloneEditableConfig(draftFixture)

    expect(isEditableConfigEqual(left, right)).toBe(true)

    right.taxonomies.priority[0]!.label = 'Ưu tiên mới'
    expect(isEditableConfigEqual(left, right)).toBe(false)
  })

  // Defect caught: a save request could omit optimistic concurrency or include draft metadata outside the B1 update contract.
  it('builds the exact B1 update contract', () => {
    const editableFixture = cloneEditableConfig(draftFixture)

    expect(buildStage01ConfigUpdateInput(4, editableFixture)).toEqual({
      expectedDraftVersion: 4,
      taxonomies: editableFixture.taxonomies,
      criteria: editableFixture.criteria,
    })
  })

  // Defect caught: an editor could treat translated labels or row position as the identity of a published value.
  it('indexes published taxonomy codes and criterion keys as stable identities', () => {
    expect(publishedTaxonomyCodes(publishedFixture).customer_type.has('individual')).toBe(true)
    expect(publishedCriterionKeys(publishedFixture).has('customer_need')).toBe(true)
  })

  // Defect caught: future editor controls could omit a valid persisted enum value or show an untranslated taxonomy section.
  it('provides Vietnamese labels for every taxonomy and friendly metadata for persisted enums', () => {
    expect(stage01TaxonomyLabels).toEqual({
      customer_type: 'Loại khách hàng',
      contact_relationship: 'Quan hệ liên hệ',
      scope: 'Phạm vi nhu cầu',
      lead_source: 'Nguồn khách hàng',
      referrer_type: 'Loại người giới thiệu',
      engagement_status: 'Trạng thái tương tác',
      invalid_reason: 'Lý do không hợp lệ',
      budget_status: 'Trạng thái ngân sách',
      timeline_status: 'Trạng thái thời gian',
      priority: 'Mức ưu tiên',
      intake_channel: 'Kênh tiếp nhận',
      blocker_category: 'Nhóm vướng mắc',
    })
    expect(stage01DimensionOptions.map(({ value }) => value)).toEqual([
      'customer_need',
      'scope_capability',
      'resources_schedule',
      'commercial_viability',
      'risk_special_conditions',
    ])
    expect(stage01CriterionCriticalityOptions.map(({ value }) => value)).toEqual(['required', 'optional', 'conditional'])
    expect(stage01ApplicabilityModeOptions.map(({ value }) => value)).toEqual(['always', 'manual'])
    for (const option of [
      ...stage01DimensionOptions,
      ...stage01CriterionCriticalityOptions,
      ...stage01ApplicabilityModeOptions,
    ]) expect(option.label.trim()).not.toBe('')
  })
})
