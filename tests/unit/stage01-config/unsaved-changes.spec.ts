import { describe, expect, it, vi } from 'vitest'
import {
  UNSAVED_CHANGES_MESSAGE,
  shouldAllowUnsavedNavigation,
} from '../../../app/composables/useUnsavedChangesGuard'

describe('unsaved changes navigation decision', () => {
  it('allows clean navigation without asking for confirmation', () => {
    const confirmLeave = vi.fn(() => false)

    expect(shouldAllowUnsavedNavigation(false, confirmLeave)).toBe(true)
    expect(confirmLeave).not.toHaveBeenCalled()
  })

  it('blocks dirty navigation when leaving is declined', () => {
    const confirmLeave = vi.fn(() => false)

    expect(shouldAllowUnsavedNavigation(true, confirmLeave)).toBe(false)
    expect(confirmLeave).toHaveBeenCalledWith(UNSAVED_CHANGES_MESSAGE)
  })

  it('allows dirty navigation when leaving is confirmed', () => {
    const confirmLeave = vi.fn(() => true)

    expect(shouldAllowUnsavedNavigation(true, confirmLeave)).toBe(true)
    expect(confirmLeave).toHaveBeenCalledWith(UNSAVED_CHANGES_MESSAGE)
  })
})
