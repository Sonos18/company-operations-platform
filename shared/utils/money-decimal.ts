import Decimal from 'decimal.js'

/**
 * Decimal for money. decimal.js keeps 20 significant digits by default, which is exactly
 * numeric(20,4) and too few for sums or quantity x price products. Every A4/A5 money
 * helper builds its values with this constructor so no digit is rounded away.
 */
export const MoneyDecimal = Decimal.clone({ precision: 64, rounding: Decimal.ROUND_HALF_UP })
