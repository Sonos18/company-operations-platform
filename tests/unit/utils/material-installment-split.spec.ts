import { describe, expect, it } from 'vitest'
import { splitInstallments } from '../../../app/utils/materials/installment-split'

describe('splitInstallments', () => {
  it('splits by percent with the last installment absorbing rounding', () => {
    expect(splitInstallments('100.0000', [{ percent: '33.3333' }, { percent: '33.3333' }, { percent: '33.3334' }]))
      .toEqual(['33.3333', '33.3333', '33.3334'])
    expect(splitInstallments('10.0000', [{ percent: '33' }, { percent: '33' }, { percent: '34' }]))
      .toEqual(['3.3000', '3.3000', '3.4000'])
    expect(splitInstallments('1000.0000', [{ percent: '33.33333' }, { percent: '66.66667' }]))
      .toEqual(['333.3333', '666.6667'])
  })
  it('mixes fixed amounts and percent; result always sums to total', () => {
    const parts = splitInstallments('110.0000', [{ amount: '33.0000' }, { percent: '50' }, { percent: '20' }])
    expect(parts.reduce((a, b) => a + Number(b), 0)).toBeCloseTo(110, 4)
    expect(parts[2]).toBe('22.0000')
  })
})
