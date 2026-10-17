import { describe, expect, it } from 'vitest'
import {
  materialSummarySchema,
  materialSummaryText,
  orderCodeLabel,
  proposalCodeLabel,
  revisionSuffix,
  withProjectName,
  withSupplierName,
} from '../../../shared/utils/material-codes'

describe('material codes', () => {
  it('labels a proposal and an order', () => {
    expect(proposalCodeLabel(18)).toBe('Đơn 18')
    expect(orderCodeLabel(18, 1)).toBe('ĐH 18-1')
  })

  it('prefixes the project name only when it is present', () => {
    expect(withProjectName('Eo Gió', 'Đơn 18')).toBe('Eo Gió · Đơn 18')
    expect(withProjectName(null, 'Đơn 18')).toBe('Đơn 18')
    expect(withProjectName(undefined, 'Đơn 18')).toBe('Đơn 18')
    expect(withProjectName('  ', 'Đơn 18')).toBe('Đơn 18')
  })

  it('suffixes the supplier name only when it is present', () => {
    expect(withSupplierName('ĐH 18-1', 'Hòa Phát')).toBe('ĐH 18-1 · Hòa Phát')
    expect(withSupplierName('ĐH 18-1', undefined)).toBe('ĐH 18-1')
    expect(withSupplierName('ĐH 18-1', null)).toBe('ĐH 18-1')
    expect(withSupplierName('ĐH 18-1', ' ')).toBe('ĐH 18-1')
  })

  it('shows a revision suffix only from the second revision on', () => {
    expect(revisionSuffix(null)).toBe('')
    expect(revisionSuffix(undefined)).toBe('')
    expect(revisionSuffix(1)).toBe('')
    expect(revisionSuffix(2)).toBe(' (lần 2)')
  })

  it('summarises material names', () => {
    expect(materialSummaryText([], 0)).toBe('')
    expect(materialSummaryText(['Thép D10'], 1)).toBe('Thép D10')
    expect(materialSummaryText(['Thép D10', 'Xi măng PCB40'], 2)).toBe('Thép D10, Xi măng PCB40')
    expect(materialSummaryText(['Thép D10', 'Xi măng PCB40'], 5)).toBe('Thép D10, Xi măng PCB40 và 3 vật tư khác')
    expect(materialSummaryText(['Thép D10'], 3)).toBe('Thép D10 và 2 vật tư khác')
  })

  it('validates the summary shape strictly', () => {
    expect(materialSummarySchema.safeParse({ names: ['A', 'B'], total: 2 }).success).toBe(true)
    expect(materialSummarySchema.safeParse({ names: [], total: 0 }).success).toBe(true)
    expect(materialSummarySchema.safeParse({ names: ['A', 'B', 'C'], total: 3 }).success).toBe(false)
    expect(materialSummarySchema.safeParse({ names: ['A'], total: -1 }).success).toBe(false)
    expect(materialSummarySchema.safeParse({ names: ['A'], total: 1, extra: true }).success).toBe(false)
  })
})
