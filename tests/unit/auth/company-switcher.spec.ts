import { describe, expect, it, vi } from 'vitest'
import { selectCompanyWithUnsavedChanges } from '../../../app/components/app/company-switcher'

describe('company switcher selection', () => {
  it('restores an alternate select value after declining unsaved changes without switching companies', async () => {
    const control = { value: 'company-2' } as HTMLSelectElement
    const confirmLeave = vi.fn(() => false)
    const clear = vi.fn()
    const selectCompany = vi.fn(() => true)
    const clearRuntimeData = vi.fn()
    const reloadNuxtApp = vi.fn()

    await selectCompanyWithUnsavedChanges('company-2', {
      activeCompanyId: 'company-1',
      control,
      confirmLeave,
      clear,
      actions: { selectCompany, clearRuntimeData, reloadNuxtApp },
    })

    expect(control.value).toBe('company-1')
    expect(clear).not.toHaveBeenCalled()
    expect(selectCompany).not.toHaveBeenCalled()
    expect(clearRuntimeData).not.toHaveBeenCalled()
    expect(reloadNuxtApp).not.toHaveBeenCalled()
  })

  it('keeps the selected value and delegates the existing switch flow after confirmation', async () => {
    const control = { value: 'company-2' } as HTMLSelectElement
    const confirmLeave = vi.fn(() => true)
    const clear = vi.fn()
    const selectCompany = vi.fn(() => true)
    const clearRuntimeData = vi.fn()
    const reloadNuxtApp = vi.fn()

    await selectCompanyWithUnsavedChanges('company-2', {
      activeCompanyId: 'company-1',
      control,
      confirmLeave,
      clear,
      actions: { selectCompany, clearRuntimeData, reloadNuxtApp },
    })

    expect(control.value).toBe('company-2')
    expect(clear).toHaveBeenCalledOnce()
    expect(selectCompany).toHaveBeenCalledWith('company-2')
    expect(clearRuntimeData).toHaveBeenCalledOnce()
    expect(reloadNuxtApp).toHaveBeenCalledWith({ path: '/projects', force: true })
  })
})
