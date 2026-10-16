import { describe, expect, it } from 'vitest'
import { installmentDueStatus, summarizeMaterialFinance, vietnamToday } from '../../../shared/utils/material-finance-summary'

const contract = (total: string, invoiced: string, installments: Array<[string, string, string, string]>) => ({
  total,
  invoiced,
  installments: installments.map(([amount, dueOn, paid, pending], index) => ({
    installmentKey: `00000000-0000-4000-8000-00000000000${index}`,
    amount, dueOn, paid, pending,
  })),
})

describe('material finance summary', () => {
  it('computes committed, paid, pending, remaining for contract 100 paid 30 pending 20', () => {
    expect(summarizeMaterialFinance([contract('100.0000', '0.0000', [['100.0000', '2026-12-01', '30.0000', '20.0000']])], '2026-10-15')).toEqual({
      committed: '100.0000', paid: '30.0000', pending: '20.0000', remaining: '70.0000',
      overdue: '0.0000', invoiced: '0.0000', paidWithoutInvoice: '30.0000',
    })
  })

  it('counts only unpaid part of past-due installments as overdue; pending does not reduce overdue', () => {
    const result = summarizeMaterialFinance([contract('100.0000', '50.0000', [
      ['30.0000', '2026-10-01', '10.0000', '20.0000'],
      ['70.0000', '2026-10-15', '0.0000', '0.0000'],
    ])], '2026-10-15')
    expect(result.overdue).toBe('20.0000')
    expect(result.paidWithoutInvoice).toBe('0.0000')
  })

  it('sums several contracts without floating point drift', () => {
    const result = summarizeMaterialFinance([
      contract('0.1000', '0.0000', [['0.1000', '2027-01-01', '0.1000', '0.0000']]),
      contract('0.2000', '0.0000', [['0.2000', '2027-01-01', '0.2000', '0.0000']]),
    ], '2026-10-15')
    expect(result.paid).toBe('0.3000')
  })

  it('classifies installment due status with a 3 day window', () => {
    const base = { installmentKey: '00000000-0000-4000-8000-000000000001', amount: '10.0000', pending: '0.0000' }
    expect(installmentDueStatus({ ...base, dueOn: '2026-10-18', paid: '0.0000' }, '2026-10-15')).toBe('due_soon')
    expect(installmentDueStatus({ ...base, dueOn: '2026-10-19', paid: '0.0000' }, '2026-10-15')).toBe('not_due')
    expect(installmentDueStatus({ ...base, dueOn: '2026-10-15', paid: '0.0000' }, '2026-10-15')).toBe('due_soon')
    expect(installmentDueStatus({ ...base, dueOn: '2026-10-14', paid: '0.0000' }, '2026-10-15')).toBe('overdue')
    expect(installmentDueStatus({ ...base, dueOn: '2026-10-14', paid: '10.0000' }, '2026-10-15')).toBe('settled')
  })

  it('uses Asia/Ho_Chi_Minh for today', () => {
    expect(vietnamToday(new Date('2026-10-15T18:30:00Z'))).toBe('2026-10-16')
    expect(vietnamToday(new Date('2026-10-15T16:59:59Z'))).toBe('2026-10-15')
  })
})
