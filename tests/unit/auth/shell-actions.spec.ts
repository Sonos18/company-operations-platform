import { describe, expect, it, vi } from 'vitest'
import { switchCompanyAndReload } from '../../../app/components/app/shell-actions'

describe('shell company switching', () => {
  it('clears runtime state and forces middleware re-evaluation on the projects route after a successful selection', async () => {
    const selectCompany = vi.fn(() => true)
    const clearRuntimeData = vi.fn()
    const reloadNuxtApp = vi.fn()

    await switchCompanyAndReload('company-2', { selectCompany, clearRuntimeData, reloadNuxtApp })

    expect(clearRuntimeData).toHaveBeenCalledOnce()
    expect(reloadNuxtApp).toHaveBeenCalledWith({ path: '/projects', force: true })
  })

  it('does not clear runtime state or reload when the company selection is invalid', async () => {
    const selectCompany = vi.fn(() => false)
    const clearRuntimeData = vi.fn()
    const reloadNuxtApp = vi.fn()

    await switchCompanyAndReload('unknown-company', { selectCompany, clearRuntimeData, reloadNuxtApp })

    expect(clearRuntimeData).not.toHaveBeenCalled()
    expect(reloadNuxtApp).not.toHaveBeenCalled()
  })
})
