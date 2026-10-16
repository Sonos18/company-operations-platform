/**
 * Orders below this total may be recorded without a contract and paid in cash (R1).
 * Money is a decimal string; the database uses the same value and the same strict
 * "less than" comparison, and only for the currency below (R2).
 */
export const MATERIAL_SMALL_ORDER_THRESHOLD = '5000000'
export const MATERIAL_SMALL_ORDER_CURRENCY = 'VND'

export const materialContractDocumentations = ['contract', 'quotation_only'] as const
export type MaterialContractDocumentation = typeof materialContractDocumentations[number]

export const materialPaymentMethods = ['bank_transfer', 'cash'] as const
export type MaterialPaymentMethod = typeof materialPaymentMethods[number]
