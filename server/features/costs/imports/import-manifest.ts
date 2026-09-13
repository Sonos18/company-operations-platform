import { createHash } from 'node:crypto'
import { controlledImportManifestSchema, type ControlledImportManifest } from '../../../../shared/schemas/costs/imports'

function columnNumber(value: string) { return [...value].reduce((total, character) => total * 26 + character.charCodeAt(0) - 64, 0) }
function columnLabel(value: number) { let result = ''; for (let current = value; current > 0; current = Math.floor((current - 1) / 26)) result = String.fromCharCode(65 + (current - 1) % 26) + result; return result }
function cell(value: string) { const match = /^([A-Za-z]+)([1-9]\d*)$/.exec(value.trim()); if (!match) throw new Error('INPUT_INVALID'); return { column: columnNumber(match[1]!.toUpperCase()), row: Number(match[2]) } }
function normalizeLocator(locator: ControlledImportManifest['sections'][number]['locator']) {
  if (locator.kind !== 'cell_range') return locator.kind === 'whole_file' ? { ...locator, note: locator.note } : locator
  const [left, right] = locator.range.split(':'); const a = cell(left!); const b = cell(right ?? left!);
  return { kind: 'cell_range' as const, sheetName: locator.sheetName, range: `${columnLabel(Math.min(a.column,b.column))}${Math.min(a.row,b.row)}:${columnLabel(Math.max(a.column,b.column))}${Math.max(a.row,b.row)}` }
}
function canonical(value: unknown): string { if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`; if (value && typeof value === 'object') return `{${Object.keys(value as Record<string, unknown>).filter(key => (value as Record<string, unknown>)[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`; return JSON.stringify(value) }
export function canonicalizeManifest(input: unknown) { const parsed = controlledImportManifestSchema.parse(input); const manifest = { ...parsed, sections: parsed.sections.map(section => ({ ...section, locator: normalizeLocator(section.locator) })) }; const payload = canonical(manifest); return { manifest, digest: createHash('sha256').update(payload).digest('hex') }
}
export function validateReviewedImport({ manifest, approvedManifestDigest, actualInputDigests, trustedCompanyId, permittedAdapter }: { manifest: unknown; approvedManifestDigest: string; actualInputDigests: string[]; trustedCompanyId: string; permittedAdapter: { id: string; version: string } }) {
  const value = canonicalizeManifest(manifest); if (value.manifest.targetCompanyId !== trustedCompanyId) throw new Error('COMPANY_FORBIDDEN'); if (value.manifest.adapter.id !== permittedAdapter.id || value.manifest.adapter.version !== permittedAdapter.version) throw new Error('ADAPTER_NOT_PERMITTED'); if (value.digest !== approvedManifestDigest) throw new Error('MANIFEST_DIGEST_MISMATCH'); if (value.manifest.inputs.map(input => input.sha256).join('|') !== actualInputDigests.join('|')) throw new Error('INPUT_DIGEST_MISMATCH'); return value
}
export function occurrenceIdentity(locator: ControlledImportManifest['sections'][number]['locator']) { const normalized = normalizeLocator(locator); return normalized.kind === 'whole_file' ? 'whole_file' : normalized.kind === 'logical_section' ? `logical_section|${normalized.section}` : `cell_range|${normalized.sheetName}|${normalized.range}` }
export function decideReplay({ companyId, command, idempotencyKey, payloadDigest, existing }: { companyId: string; command: string; idempotencyKey: string; payloadDigest: string; existing?: { companyId: string; command: string; idempotencyKey: string; payloadDigest: string } }) { if (!existing || existing.companyId !== companyId || existing.command !== command || existing.idempotencyKey !== idempotencyKey) return 'new'; return existing.payloadDigest === payloadDigest ? 'replay' : 'IDEMPOTENCY_CONFLICT' }
