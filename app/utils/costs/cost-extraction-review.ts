import Decimal from 'decimal.js'
import { workflowMoneySchema } from '../../../shared/schemas/costs/cost-workflow'

const ExactDecimal = Decimal.clone({ precision: 80 })

/** Current form lines can contain incomplete edits; never display a guessed sum. */
export function sumMaterialReviewLines(lines: ReadonlyArray<{ quantity: string; unitPrice: string }>, currencyCode: string): string | null {
  let total = new ExactDecimal(0)
  for (const line of lines) {
    if (!workflowMoneySchema.safeParse(line.quantity).success || !workflowMoneySchema.safeParse(line.unitPrice).success) return null
    const product = new ExactDecimal(line.quantity).times(line.unitPrice)
    total = total.plus(currencyCode === 'VND' ? product.toDecimalPlaces(0, ExactDecimal.ROUND_HALF_UP) : product)
  }
  return total.toFixed()
}
