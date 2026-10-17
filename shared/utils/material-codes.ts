import { z } from 'zod'

const SEPARATOR = ' · '

/** Up to two leading material names plus the total number of lines of the proposal or order. */
export const materialSummarySchema = z.object({
  names: z.array(z.string()).max(2),
  total: z.number().int().min(0),
}).strict()

export type MaterialSummary = z.infer<typeof materialSummarySchema>

/** "Đơn 18" */
export function proposalCodeLabel(proposalNo: number): string {
  return `Đơn ${proposalNo}`
}

/** "ĐH 18-1" */
export function orderCodeLabel(proposalNo: number, orderSeq: number): string {
  return `ĐH ${proposalNo}-${orderSeq}`
}

/** "Eo Gió · Đơn 18", or the bare label when the project name is missing or blank. */
export function withProjectName(projectName: string | null | undefined, label: string): string {
  const name = projectName?.trim()
  return name ? `${name}${SEPARATOR}${label}` : label
}

/** "ĐH 18-1 · Hòa Phát", or the bare label when the supplier name is missing or blank. */
export function withSupplierName(label: string, supplierName: string | null | undefined): string {
  const name = supplierName?.trim()
  return name ? `${label}${SEPARATOR}${name}` : label
}

/** "" for the first (or unknown) revision, " (lần 2)" from the second revision on. */
export function revisionSuffix(revisionNo: number | null | undefined): string {
  return revisionNo !== null && revisionNo !== undefined && revisionNo > 1 ? ` (lần ${revisionNo})` : ''
}

/** "", "A", "A, B" or "A, B và 3 vật tư khác". */
export function materialSummaryText(names: readonly string[], total: number): string {
  const listed = names.join(', ')
  const others = total - names.length
  return others > 0 && listed ? `${listed} và ${others} vật tư khác` : listed
}
