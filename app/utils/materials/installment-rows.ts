export const MAX_INSTALLMENT_ROWS = 50

/** Editable installment row. `percent` and `amount` hold the raw text typed by the user (Vietnamese number format). */
export interface InstallmentRow {
  installmentKey: string
  name: string
  mode: 'percent' | 'amount'
  percent: string
  amount: string
  dueOn: string
  isAdvance: boolean
}

export interface ResolvedInstallment {
  installmentKey: string
  name: string
  /** Canonical decimal string with 4 decimals. */
  amount: string
  dueOn: string
  isAdvance: boolean
}

export interface InstallmentEditorResult {
  installments: ResolvedInstallment[]
  issues: string[]
}

export function createInstallmentRow(overrides: Partial<InstallmentRow> = {}): InstallmentRow {
  return {
    installmentKey: crypto.randomUUID(),
    name: '',
    mode: 'percent',
    percent: '',
    amount: '',
    dueOn: '',
    isAdvance: false,
    ...overrides,
  }
}
