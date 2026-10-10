import Decimal from 'decimal.js'
import { z } from 'zod'
import { getRouterParam, readBody, type H3Event } from 'h3'
import {
  materialQuotationAnalysisInputSchema,
  materialQuotationAnalysisResultSchema,
  materialQuotationExtractionSchema,
  type MaterialQuotationAnalysisInput,
  type MaterialQuotationAnalysisResult,
} from '../../../../shared/schemas/costs/material-quotation-analysis'
import { COST_EVIDENCE_MAX_BYTES } from '../../../../shared/schemas/costs/cost-evidence'
import type { MaterialProposalView } from '../../../../shared/schemas/costs/material-procurement'
import { workflowMoneySchema, workflowUuidSchema } from '../../../../shared/schemas/costs/cost-workflow'
import { AppApiError } from '../../../utils/api-error'
import { c1RequestContext } from '../../c1-master-data/context'
import { verifyEvidenceBlob } from '../evidence/evidence-file-integrity'
import { SupabaseMaterialProcurementRepository } from './repository'
import { MaterialProcurementService, type MaterialProcurementContext } from './service'
import { extractMaterialQuotation } from './quotation-provider'

function invalidOutput(): never {
  throw new AppApiError(502, 'QUOTATION_ANALYSIS_INVALID', 'Kết quả phân tích không đủ rõ ràng. Vui lòng kiểm tra báo giá và nhập tay.')
}

// A separator with three trailing digits is ambiguous between grouping and decimals.
function unambiguousDecimal(raw: string | null, normalized: string | null) {
  if (!raw || !normalized || !/^(?:0|[1-9]\d{0,15})(?:\.\d{1,4})?$/u.test(raw.trim())
    || /^\d+\.\d{3}$/u.test(raw.trim())) return null
  return new Decimal(raw.trim()).equals(normalized) ? normalized : null
}

// Reuse the quotation-layout mapper's VND grouping rule, without inferring a quantity locale.
function quotationPrice(raw: string | null, normalized: string | null, currencyCode: string | null) {
  if (currencyCode === 'VND' && raw && normalized) {
    const value = raw.trim().replace(/\s+/gu, '').replace(/(?:VND|VNĐ|đồng|₫|đ)$/iu, '')
    if (/^\d{1,3}([.,])\d{3}(?:\1\d{3})*$/u.test(value)) {
      const integer = value.replace(/[.,]/gu, '')
      return new Decimal(integer).equals(normalized) ? normalized : null
    }
  }
  return unambiguousDecimal(raw, normalized)
}

// At most 20 significant digits per operand; 60 keeps the quantity-price product exact.
const QuantityDecimal = Decimal.clone({ precision: 60 })

const groupedNumber = /^(?:0|[1-9]\d{0,2})([.,])\d{3}(?:\1\d{3})*$/u

function numberCandidates(raw: string | null) {
  const text = raw?.trim()
  if (!text) return []
  let values: string[]
  if (groupedNumber.test(text)) {
    const parts = text.split(/[.,]/u)
    values = [parts.join(''), ...(parts.length === 2 ? [parts.join('.')] : [])]
  } else if (workflowMoneySchema.safeParse(text).success) values = [text]
  else return []
  return [...new Set(values.map(value => new QuantityDecimal(value).toFixed())
    .filter(value => workflowMoneySchema.safeParse(value).success && new QuantityDecimal(value).greaterThan(0)))]
}

function proofNumber(raw: string | null, normalized: string | null, currencyCode: string | null) {
  const existing = quotationPrice(raw, normalized, currencyCode)
  if (existing !== null) return existing
  return normalized !== null && numberCandidates(raw).some(value => new QuantityDecimal(value).equals(normalized))
    ? normalized : null
}

function confirmedAmbiguousQuantity(raw: string | null, price: string | null, printedTotal: string | null) {
  if (!raw || !price || !printedTotal || !groupedNumber.test(raw.trim())) return null
  const matches = numberCandidates(raw).filter(value =>
    new QuantityDecimal(value).times(price).equals(printedTotal))
  return matches.length === 1 ? (matches[0] ?? null) : null
}

export function buildMaterialQuotationResult(
  value: unknown,
  proposal: MaterialProposalView,
  currencyCode: string,
  source: MaterialQuotationAnalysisResult['source'],
): MaterialQuotationAnalysisResult {
  const parsed = materialQuotationExtractionSchema.safeParse(value)
  if (!parsed.success) invalidOutput()
  const extraction = parsed.data
  const byLine = new Map(extraction.lines.map(line => [line.proposalLineId, line]))
  const rowKeys = extraction.lines.flatMap(line => line.sourceRowKey ? [line.sourceRowKey] : [])
  if (byLine.size !== extraction.lines.length || byLine.size !== proposal.lines.length
    || new Set(rowKeys).size !== rowKeys.length
    || extraction.lines.some(line => !proposal.lines.some(item => item.lineId === line.proposalLineId))) invalidOutput()
  const lines = proposal.lines.map(item => {
    const row = byLine.get(item.lineId)
    if (!row) invalidOutput()
    const { rawLineTotal, lineTotal, lineTotalBasis, ...publicRow } = row
    const extractedUnitPrice = quotationPrice(row.rawUnitPrice, row.unitPrice, extraction.currencyCode)
    const warnings = row.warnings.slice(0, 94)
    const semanticMatch = !!row.sourceRowKey && row.sourceRowKey.split(':')[0] === String(row.sourcePage) && !!row.quotationMaterialName
      && !!row.quotationUnit && row.nameMatches && row.specificationMatches && row.unitMatches
    const directQuantity = unambiguousDecimal(row.rawQuantity, row.quotationQuantity)
    const arithmeticQuantity = directQuantity === null && semanticMatch && lineTotalBasis === 'same_as_unit_price'
      ? confirmedAmbiguousQuantity(row.rawQuantity, proofNumber(row.rawUnitPrice, row.unitPrice, extraction.currencyCode), proofNumber(rawLineTotal, lineTotal, extraction.currencyCode))
      : null
    const quotationQuantity = directQuantity ?? arithmeticQuantity
    if (arithmeticQuantity !== null) warnings.push('Số lượng được xác nhận bằng đơn giá × số lượng = thành tiền in trên cùng dòng; mua hàng vẫn cần kiểm tra.')
    const quantityMatchesProposal = quotationQuantity !== null && new Decimal(quotationQuantity).equals(item.quantity)
    if (quotationQuantity === null) warnings.push('Số lượng báo giá thiếu hoặc chưa rõ.')
    else if (!quantityMatchesProposal) warnings.push('Số lượng báo giá khác số lượng đề xuất; cần kiểm tra đơn từng phần.')
    if (!semanticMatch) warnings.push('Tên, quy cách hoặc đơn vị chưa được đối chiếu đầy đủ.')
    const priceUsable = semanticMatch && row.taxBasis === 'exclusive' && extraction.currencyCode === currencyCode
    if (row.taxBasis === 'unknown') warnings.push('Chưa xác định đơn giá đã gồm VAT hay chưa; vui lòng kiểm tra và nhập đơn giá chưa VAT.')
    else if (row.taxBasis === 'inclusive') warnings.push('AI nhận diện đơn giá đã gồm VAT; vui lòng đối chiếu PDF và nhập đơn giá chưa VAT.')
    if (extraction.currencyCode === null) warnings.push('Chưa xác định được đồng tiền trên PDF; không tự điền đơn giá.')
    else if (extraction.currencyCode !== currencyCode) warnings.push('Đồng tiền báo giá ' + extraction.currencyCode + ' khác đồng tiền hệ thống ' + currencyCode + '; không tự điền đơn giá.')
    if (extractedUnitPrice === null) warnings.push('Đơn giá thiếu hoặc chưa rõ.')
    const remaining = new Decimal(item.remainingQuantity)
    const suggestedAllocationQuantity = semanticMatch && quotationQuantity && remaining.greaterThan(0)
      ? Decimal.min(quotationQuantity, remaining).toFixed() : null
    return {
      ...publicRow, quotationQuantity, extractedUnitPrice,
      unitPrice: priceUsable ? extractedUnitPrice : null,
      quantityMatchesProposal,
      matched: semanticMatch && quantityMatchesProposal,
      suggestedAllocationQuantity,
      warnings,
    }
  })
  return materialQuotationAnalysisResultSchema.parse({
    model: 'gpt-5.4-mini', source, matched: lines.every(line => line.matched),
    supplier: extraction.supplier, currencyCode: extraction.currencyCode,
    warnings: [...extraction.warnings.slice(0, 99), 'AI chỉ hỗ trợ đối chiếu; mua hàng phải kiểm tra và xác nhận mapping trước khi tạo đơn.'],
    lines,
  })
}

export function requireQuotationScope(context: MaterialProcurementContext, projectId: string, proposalId: string, input: MaterialQuotationAnalysisInput, proposal: MaterialProposalView) {
  if (!context.permissions.includes('material.read') || !context.permissions.includes('material.order.manage')) {
    throw new AppApiError(403, 'PERMISSION_DENIED', 'Bạn không có quyền phân tích báo giá.')
  }
  if (proposal.id !== proposalId || proposal.projectId !== projectId
    || proposal.reviewState !== 'approved' || proposal.currentRevisionId !== input.approvedRevisionId
    || proposal.approvedRevisionId !== input.approvedRevisionId || proposal.version !== input.expectedProposalVersion) {
    throw new AppApiError(409, 'VERSION_CONFLICT', 'Đề xuất hoặc phiên bản duyệt đã thay đổi. Vui lòng tải lại.')
  }
}

const fileSchema = z.object({
  id: workflowUuidSchema, tenant_id: workflowUuidSchema, company_id: workflowUuidSchema, project_id: workflowUuidSchema,
  status: z.literal('finalized'), bucket_id: z.literal('c1-accounting-evidence'),
  object_path: z.string().min(1), verified_mime_type: z.literal('application/pdf'),
  verified_size_bytes: z.number().int().positive().max(COST_EVIDENCE_MAX_BYTES),
  verified_sha256: z.string().regex(/^[a-f0-9]{64}$/u), version: z.number().int().nonnegative(),
}).strict()

function sourceDenied(stage: 'scope_metadata' | 'file_metadata' | 'file_validation' | 'object_path' | 'storage_download' | 'blob_size_or_mime' | 'blob_integrity', backendCode?: string, phase: 'before_provider' | 'after_provider' = 'before_provider'): never {
  const details: Record<string, unknown> = { phase, stage }
  if (backendCode && /^[A-Z0-9_]{1,32}$/u.test(backendCode)) details.backendCode = backendCode
  throw new AppApiError(409, 'SOURCE_SELECTION_SCOPE_MISMATCH', 'PDF chưa hoàn tất hoặc không thuộc đề xuất và phiên bản duyệt hiện tại.', details)
}

type Context = Awaited<ReturnType<typeof c1RequestContext>>
async function quotationSnapshot(context: Context, projectId: string, proposalId: string, input: MaterialQuotationAnalysisInput, phase: 'before_provider' | 'after_provider') {
  // Check permission before even reading metadata or storage.
  if (!context.permissions.includes('material.read') || !context.permissions.includes('material.order.manage')) {
    throw new AppApiError(403, 'PERMISSION_DENIED', 'Bạn không có quyền phân tích báo giá.')
  }
  const service = new MaterialProcurementService(new SupabaseMaterialProcurementRepository(context.db))
  const proposal = await service.readProposal(context, projectId, proposalId)
  requireQuotationScope(context, projectId, proposalId, input, proposal)
  const currency = await service.readOrderCurrency(context)
  const scope = await context.db.from('material_evidence_scopes').select('evidence_file_id')
    .eq('evidence_file_id', input.evidenceFileId).eq('tenant_id', context.tenantId)
    .eq('company_id', context.companyId).eq('project_id', projectId)
    .eq('target_kind', 'material_proposal').eq('proposal_id', proposalId)
    .eq('revision_id', input.approvedRevisionId).eq('evidence_role', 'unsigned_quotation').maybeSingle()
  if (scope.error || !scope.data) sourceDenied('scope_metadata', scope.error?.code, phase)
  const result = await context.db.from('cost_evidence_files')
    .select('id,tenant_id,company_id,project_id,status,bucket_id,object_path,verified_mime_type,verified_size_bytes,verified_sha256,version')
    .eq('id', input.evidenceFileId).eq('tenant_id', context.tenantId).eq('company_id', context.companyId)
    .eq('project_id', projectId).maybeSingle()
  const parsed = fileSchema.safeParse(result.data)
  if (result.error) sourceDenied('file_metadata', result.error.code, phase)
  if (!parsed.success) sourceDenied('file_validation', undefined, phase)
  const file = parsed.data
  if (file.object_path !== [context.tenantId, context.companyId, projectId, input.evidenceFileId].join('/')) sourceDenied('object_path', undefined, phase)
  return { proposal, currency, file }
}

export interface QuotationAnalysisDependencies {
  resolveContext: typeof c1RequestContext
  apiKey(event: H3Event): string
  extract?: typeof extractMaterialQuotation
}

export function createMaterialQuotationAnalysisRoute(dependencies: QuotationAnalysisDependencies) {
  return async (event: H3Event) => {
    const companyId = workflowUuidSchema.safeParse(getRouterParam(event, 'companyId'))
    const projectId = workflowUuidSchema.safeParse(getRouterParam(event, 'projectId'))
    const proposalId = workflowUuidSchema.safeParse(getRouterParam(event, 'proposalId'))
    const body = materialQuotationAnalysisInputSchema.safeParse(await readBody(event))
    if (!companyId.success || !projectId.success || !proposalId.success || !body.success) {
      throw new AppApiError(400, 'INPUT_INVALID', 'Dữ liệu yêu cầu không hợp lệ.')
    }
    const input = body.data
    const context = await dependencies.resolveContext(event, companyId.data)
    const before = await quotationSnapshot(context, projectId.data, proposalId.data, input, 'before_provider')
    const apiKey = dependencies.apiKey(event)
    if (!apiKey.trim()) throw new AppApiError(503, 'QUOTATION_ANALYSIS_NOT_CONFIGURED', 'Dịch vụ phân tích báo giá chưa được cấu hình.')
    const downloaded = await context.db.storage.from(before.file.bucket_id).download(before.file.object_path)
    if (downloaded.error || !(downloaded.data instanceof Blob)) sourceDenied('storage_download')
    if (downloaded.data.size !== before.file.verified_size_bytes || downloaded.data.type !== 'application/pdf') sourceDenied('blob_size_or_mime')
    const identity = await verifyEvidenceBlob(downloaded.data, COST_EVIDENCE_MAX_BYTES, 'application/pdf')
    if (identity.sha256 !== before.file.verified_sha256 || identity.sizeBytes !== before.file.verified_size_bytes) sourceDenied('blob_integrity')
    const extraction = await (dependencies.extract ?? extractMaterialQuotation)(
      apiKey, Buffer.from(await downloaded.data.arrayBuffer()), before.proposal,
    )
    const currentContext = await dependencies.resolveContext(event, companyId.data)
    const after = await quotationSnapshot(currentContext, projectId.data, proposalId.data, input, 'after_provider')
    if (currentContext.actorId !== context.actorId || currentContext.tenantId !== context.tenantId
      || currentContext.companyId !== context.companyId || JSON.stringify(after) !== JSON.stringify(before)) {
      throw new AppApiError(409, 'VERSION_CONFLICT', 'Ngữ cảnh, đề xuất hoặc PDF đã thay đổi trong lúc phân tích. Vui lòng tải lại.')
    }
    return buildMaterialQuotationResult(extraction, after.proposal, after.currency.currencyCode, {
      evidenceFileId: input.evidenceFileId, sha256: after.file.verified_sha256,
      actorId: currentContext.actorId, companyId: currentContext.companyId, projectId: projectId.data,
      proposalId: proposalId.data, approvedRevisionId: input.approvedRevisionId, proposalVersion: after.proposal.version,
    })
  }
}

export const analyzeMaterialQuotation = createMaterialQuotationAnalysisRoute({
  resolveContext: c1RequestContext,
  apiKey: event => useRuntimeConfig(event).materialQuotationOpenaiApiKey,
})
