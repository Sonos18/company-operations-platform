import Decimal from 'decimal.js'
import {
  materialQuotationComparisonInputSchema,
  materialQuotationComparisonViewSchema,
  type MaterialQuotationComparisonInput,
  type MaterialQuotationComparisonView,
} from '../schemas/costs/material-procurement'

export function compareMaterialQuotation(input: MaterialQuotationComparisonInput): MaterialQuotationComparisonView {
  const value = materialQuotationComparisonInputSchema.parse(input)
  const variance = new Decimal(value.quotedQuantity).minus(value.allocationQuantity)
  return materialQuotationComparisonViewSchema.parse({
    ...value,
    varianceQuantity: variance.abs().toFixed(4),
    matchesAllocation: variance.isZero(),
  })
}
