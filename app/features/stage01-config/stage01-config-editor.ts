import {
  stage01BusinessTaxonomiesSchema,
  stage01BusinessTaxonomyKeySchema,
  stage01ConfigDraftSchema,
  stage01CriteriaSchema,
  stage01PublishedConfigSchema,
  updateStage01ConfigDraftInputSchema,
  type Stage01BusinessTaxonomies,
  type Stage01BusinessTaxonomyKey,
  type Stage01ConfigDraft,
  type Stage01Criteria,
  type Stage01PublishedConfig,
  type UpdateStage01ConfigDraftInput,
} from '../../../shared/schemas/stage01-config'
import type {
  stage01ApplicabilityModeSchema,
  stage01CriterionCriticalitySchema,
  stage01DimensionSchema,
} from '../../../shared/schemas/stage01'

export interface Stage01ConfigEditableState {
  taxonomies: Stage01BusinessTaxonomies
  criteria: Stage01Criteria
}

type Stage01Dimension = (typeof stage01DimensionSchema.options)[number]
type Stage01CriterionCriticality = (typeof stage01CriterionCriticalitySchema.options)[number]
type Stage01ApplicabilityMode = (typeof stage01ApplicabilityModeSchema.options)[number]

export const stage01TaxonomyLabels = {
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
} satisfies Record<Stage01BusinessTaxonomyKey, string>

export const stage01DimensionOptions = [
  { value: 'customer_need', label: 'Nhu cầu khách hàng' },
  { value: 'scope_capability', label: 'Khả năng đáp ứng phạm vi' },
  { value: 'resources_schedule', label: 'Nguồn lực và tiến độ' },
  { value: 'commercial_viability', label: 'Tính khả thi thương mại' },
  { value: 'risk_special_conditions', label: 'Rủi ro và điều kiện đặc biệt' },
] as const satisfies ReadonlyArray<{ value: Stage01Dimension, label: string }>

export const stage01CriterionCriticalityOptions = [
  { value: 'required', label: 'Bắt buộc' },
  { value: 'optional', label: 'Tùy chọn' },
  { value: 'conditional', label: 'Có điều kiện' },
] as const satisfies ReadonlyArray<{ value: Stage01CriterionCriticality, label: string }>

export const stage01ApplicabilityModeOptions = [
  { value: 'always', label: 'Luôn áp dụng' },
  { value: 'manual', label: 'Xác định thủ công' },
] as const satisfies ReadonlyArray<{ value: Stage01ApplicabilityMode, label: string }>

function parseEditableConfig(editable: Stage01ConfigEditableState): Stage01ConfigEditableState {
  return {
    taxonomies: stage01BusinessTaxonomiesSchema.parse(editable.taxonomies),
    criteria: stage01CriteriaSchema.parse(editable.criteria),
  }
}

export function cloneEditableConfig(draft: Stage01ConfigDraft): Stage01ConfigEditableState {
  const parsedDraft = stage01ConfigDraftSchema.parse(draft)
  const editable = structuredClone({
    taxonomies: parsedDraft.taxonomies,
    criteria: parsedDraft.criteria,
  })

  return parseEditableConfig(editable)
}

export function isEditableConfigEqual(
  left: Stage01ConfigEditableState,
  right: Stage01ConfigEditableState,
): boolean {
  return JSON.stringify(parseEditableConfig(left)) === JSON.stringify(parseEditableConfig(right))
}

export function buildStage01ConfigUpdateInput(
  expectedDraftVersion: number,
  editable: Stage01ConfigEditableState,
): UpdateStage01ConfigDraftInput {
  const parsedEditable = parseEditableConfig(editable)
  return updateStage01ConfigDraftInputSchema.parse({
    expectedDraftVersion,
    taxonomies: parsedEditable.taxonomies,
    criteria: parsedEditable.criteria,
  })
}

export function publishedTaxonomyCodes(
  published: Stage01PublishedConfig,
): Record<Stage01BusinessTaxonomyKey, Set<string>> {
  const parsedPublished = stage01PublishedConfigSchema.parse(published)
  return Object.fromEntries(
    stage01BusinessTaxonomyKeySchema.options.map((taxonomyKey) => [
      taxonomyKey,
      new Set(parsedPublished.taxonomies[taxonomyKey].map(({ code }) => code)),
    ]),
  ) as Record<Stage01BusinessTaxonomyKey, Set<string>>
}

export function publishedCriterionKeys(published: Stage01PublishedConfig): Set<string> {
  return new Set(stage01PublishedConfigSchema.parse(published).criteria.map(({ key }) => key))
}
