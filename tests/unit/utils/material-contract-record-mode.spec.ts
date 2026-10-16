import { describe, expect, it } from 'vitest'
import { canRecordWithoutContract } from '../../../app/utils/materials/contract-record-mode'

describe('canRecordWithoutContract', () => {
  it('returns true for orders under 5,000,000 VND and false at or above 5,000,000 VND', () => {
    expect(canRecordWithoutContract('4999999', 'VND')).toBe(true)
    expect(canRecordWithoutContract('5000000', 'VND')).toBe(false)
  })
})
