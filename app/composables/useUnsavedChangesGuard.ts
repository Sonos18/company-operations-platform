import { readonly, type Ref } from 'vue'

export const UNSAVED_CHANGES_MESSAGE = 'Bạn có thay đổi chưa lưu. Rời trang sẽ làm mất các thay đổi này.'

export function shouldAllowUnsavedNavigation(
  dirty: boolean,
  confirmLeave: (message: string) => boolean,
): boolean {
  return !dirty || confirmLeave(UNSAVED_CHANGES_MESSAGE)
}

export function useUnsavedChangesGuard(): {
  dirty: Readonly<Ref<boolean>>
  setDirty(value: boolean): void
  confirmLeave(): boolean
  clear(): void
} {
  const dirty = useState<boolean>('unsaved-changes-dirty', () => false)

  function confirmLeave(): boolean {
    if (!import.meta.client) return true

    return shouldAllowUnsavedNavigation(dirty.value, (message) => window.confirm(message))
  }

  function setDirty(value: boolean): void {
    dirty.value = value
  }

  function clear(): void {
    dirty.value = false
  }

  return {
    dirty: readonly(dirty),
    setDirty,
    confirmLeave,
    clear,
  }
}
