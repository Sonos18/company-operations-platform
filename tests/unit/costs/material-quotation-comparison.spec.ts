import { describe, expect, it } from 'vitest'
import { compareMaterialQuotation } from '../../../shared/utils/material-quotation-comparison'
import { ids } from '../material-procurement/fixtures'

describe('material quotation comparison', () => {
  it('matches quantity only and keeps exact four-decimal variance', () => {
    expect(compareMaterialQuotation({
      proposalLineId: ids.proposalLine,
      allocationQuantity: '10.0000',
      quotedQuantity: '10.0000',
    })).toEqual({
      proposalLineId: ids.proposalLine,
      allocationQuantity: '10.0000',
      quotedQuantity: '10.0000',
      varianceQuantity: '0.0000',
      matchesAllocation: true,
    })

    expect(compareMaterialQuotation({
      proposalLineId: ids.proposalLine,
      allocationQuantity: '10.0000',
      quotedQuantity: '11.0000',
    })).toMatchObject({ varianceQuantity: '1.0000', matchesAllocation: false })

    expect(compareMaterialQuotation({
      proposalLineId: ids.proposalLine,
      allocationQuantity: '0.1001',
      quotedQuantity: '0.1002',
    })).toMatchObject({ varianceQuantity: '0.0001', matchesAllocation: false })
  })
})
