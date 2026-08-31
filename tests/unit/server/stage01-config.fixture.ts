export const ids = {
  actor: '74000000-0000-4000-8000-000000000001',
  tenant: '74000000-0000-4000-8000-000000000010',
  company: '74000000-0000-4000-8000-000000000020',
  snapshot: '74000000-0000-4000-8000-000000000030',
  draft: '74000000-0000-4000-8000-000000000031',
  request: '74000000-0000-4000-8000-000000000099',
} as const

export const taxonomies = {
  customer_type: [{ code: 'customer', label: 'Customer', semanticKey: 'customer' }],
  contact_relationship: [{ code: 'primary_contact', label: 'Primary contact', semanticKey: 'primary' }],
  scope: [{ code: 'scope', label: 'Scope', semanticKey: 'scope' }],
  lead_source: [{ code: 'referral', label: 'Referral', semanticKey: 'referral', behavior: { requiresReferrer: true } }],
  referrer_type: [{ code: 'partner', label: 'Partner', semanticKey: 'partner' }],
  engagement_status: [{ code: 'active', label: 'Active', semanticKey: 'active' }],
  invalid_reason: [{ code: 'invalid', label: 'Invalid', semanticKey: 'invalid' }],
  budget_status: [{ code: 'unknown', label: 'Unknown', semanticKey: 'unknown' }],
  timeline_status: [{ code: 'unknown', label: 'Unknown', semanticKey: 'unknown' }],
  priority: [{ code: 'normal', label: 'Normal', semanticKey: 'normal' }],
  intake_channel: [{ code: 'phone', label: 'Phone', semanticKey: 'phone' }],
  blocker_category: [{ code: 'follow_up', label: 'Follow up', semanticKey: 'follow_up' }],
}

export const businessTaxonomies = Object.fromEntries(
  Object.entries(taxonomies).map(([key, entries]) => [
    key,
    entries.map(({ semanticKey: _semanticKey, ...entry }) => entry),
  ]),
)

export const criteria = [
  ['customer_need', 'Customer need'],
  ['scope_capability', 'Scope capability'],
  ['resources_schedule', 'Resources schedule'],
  ['commercial_viability', 'Commercial viability'],
  ['risk_special_conditions', 'Risk and special conditions'],
].map(([dimensionKey, label], index) => ({
  key: dimensionKey,
  dimensionKey,
  label,
  description: `${label} is understood.`,
  criticality: 'required' as const,
  applicabilityMode: 'always' as const,
  allowsNotApplicable: false,
  displayOrder: index + 1,
}))

export const definition = {
  nodes: [{ key: '01.1' }, { key: '01.2' }],
  dependencies: [{ from: '01.1', to: '01.2', requires: 'completed_current_valid' }],
  dimensions: ['customer_need', 'scope_capability', 'resources_schedule', 'commercial_viability', 'risk_special_conditions'],
  taxonomies,
  criteria,
  capabilities: { start: 'journey.node.start' },
  gates: { intake: ['approved_minimum'] },
}

export const draft = {
  id: ids.draft,
  baseSnapshotId: ids.snapshot,
  version: 0,
  createdBy: ids.actor,
  createdAt: '2026-08-31T00:00:00.000Z',
  updatedBy: ids.actor,
  updatedAt: '2026-08-31T00:00:00.000Z',
  taxonomies: businessTaxonomies,
  criteria,
}

export const context = {
  actorId: ids.actor,
  tenantId: ids.tenant,
  companyId: ids.company,
  permissions: ['stage01.config.read', 'stage01.config.update', 'stage01.config.publish'] as const,
  requestId: ids.request,
}
