<script setup lang="ts">
import type { CompanyAccess } from '../../../shared/schemas/session'
import { canonicalAdminLinks, filterNavigationLinks } from './navigation-permissions'

const props = withDefaults(defineProps<{
  productName: string
  productMark: string
  companyName: string
  userEmail: string | null
  companies: readonly CompanyAccess[]
  activeCompanyId: string | null
  signingOut: boolean
  showNotificationBell?: boolean
}>(), { showNotificationBell: true })

const emit = defineEmits<{
  selectCompany: [companyId: string, control: HTMLSelectElement]
  signOut: []
}>()

const { resetting, resetPrototype } = usePrototypeReset()
const companyAccessStore = useNuxtApp().$companyAccessStore
const route = useRoute()

const isOpen = ref(false)
const avatarButtonRef = ref<HTMLButtonElement | null>(null)
const popoverRef = ref<HTMLElement | null>(null)
const menuId = useId()
const menuMaxHeight = ref<string | null>(null)

let mediaQueryList: MediaQueryList | null = null

const displayValue = computed(() => props.userEmail ?? '')
const visibleAdminLinks = computed(() => filterNavigationLinks(canonicalAdminLinks, companyAccessStore))
const initials = computed(() => {
  const parts = displayValue.value.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  return parts.slice(0, 2).map(part => part.slice(0, 1).toLocaleUpperCase()).join('') || '?'
})

const popoverStyle = computed(() => {
  if (!menuMaxHeight.value) return undefined
  return { maxHeight: menuMaxHeight.value }
})

function updateMenuMaxHeight(): void {
  if (typeof window === 'undefined' || !avatarButtonRef.value) return
  const rect = avatarButtonRef.value.getBoundingClientRect()
  const availableSpace = rect.top - 8 - 12
  menuMaxHeight.value = `${Math.max(0, Math.floor(availableSpace))}px`
}

function onWindowResize(): void {
  if (isOpen.value) {
    updateMenuMaxHeight()
  }
}

function onBreakpointChange(): void {
  if (isOpen.value) {
    closeMenu(false)
  }
}

function getFocusableElements(): HTMLElement[] {
  if (!popoverRef.value) return []
  return Array.from(
    popoverRef.value.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  )
}

function openMenu(): void {
  updateMenuMaxHeight()
  isOpen.value = true
  if (typeof document !== 'undefined') {
    document.addEventListener('click', onDocumentClick)
    document.addEventListener('keydown', onDocumentKeydown)
  }
  nextTick(() => {
    if (!isOpen.value) return
    updateMenuMaxHeight()
    const focusable = getFocusableElements()
    focusable[0]?.focus()
  })
}

function closeMenu(restoreFocus = true): void {
  if (!isOpen.value) return
  isOpen.value = false
  if (typeof document !== 'undefined') {
    document.removeEventListener('click', onDocumentClick)
    document.removeEventListener('keydown', onDocumentKeydown)
  }
  if (restoreFocus) {
    avatarButtonRef.value?.focus()
  }
}

function toggleMenu(): void {
  if (isOpen.value) closeMenu(true)
  else openMenu()
}

function onDocumentClick(event: MouseEvent): void {
  const target = event.target as Node | null
  if (!target) return
  if (popoverRef.value?.contains(target) || avatarButtonRef.value?.contains(target)) return
  closeMenu(false)
}

function onDocumentKeydown(event: KeyboardEvent): void {
  if (!isOpen.value) return
  if (event.key === 'Escape') {
    event.preventDefault()
    closeMenu(true)
    return
  }
  if (event.key === 'Tab') {
    const elements = getFocusableElements()
    if (elements.length === 0) {
      event.preventDefault()
      return
    }
    const first = elements[0]
    const last = elements[elements.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first?.focus()
    }
  }
}

watch(() => route.fullPath, () => {
  if (isOpen.value) closeMenu(false)
})

onMounted(() => {
  if (typeof window === 'undefined') return
  window.addEventListener('resize', onWindowResize)
  if (typeof window.matchMedia === 'function') {
    mediaQueryList = window.matchMedia('(min-width: 768px)')
    mediaQueryList.addEventListener('change', onBreakpointChange)
  }
})

function cleanupListeners(): void {
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', onWindowResize)
  }
  if (mediaQueryList) {
    mediaQueryList.removeEventListener('change', onBreakpointChange)
    mediaQueryList = null
  }
  if (typeof document !== 'undefined') {
    document.removeEventListener('click', onDocumentClick)
    document.removeEventListener('keydown', onDocumentKeydown)
  }
}

onBeforeUnmount(cleanupListeners)

function onSelectCompany(event: Event): void {
  const control = event.currentTarget as HTMLSelectElement
  if (control?.value) emit('selectCompany', control.value, control)
}

async function onResetPrototype(): Promise<void>
{
  await resetPrototype()
  closeMenu(false)
}

function onSignOut(): void {
  closeMenu(false)
  emit('signOut')
}
</script>

<template>
  <div class="account-utilities">
    <button
      v-if="props.showNotificationBell !== false"
      type="button"
      class="utility-btn utility-bell"
      aria-label="Mở thông báo"
      title="Thông báo"
    >
      <UIcon name="i-lucide-bell" aria-hidden="true" />
    </button>

    <div class="account-anchor">
      <button
        ref="avatarButtonRef"
        type="button"
        class="utility-btn utility-avatar"
        :aria-expanded="isOpen"
        :aria-controls="menuId"
        aria-haspopup="dialog"
        aria-label="Mở menu tài khoản"
        @click="toggleMenu"
      >
        <span class="avatar-text">{{ initials }}</span>
      </button>

      <div
        v-if="isOpen"
        :id="menuId"
        ref="popoverRef"
        class="account-popover"
        :style="popoverStyle"
        role="dialog"
        aria-modal="true"
        aria-label="Menu tài khoản"
      >
        <div class="account-header">
          <p class="account-email" :title="props.userEmail ?? undefined">{{ props.userEmail || 'Chưa có email' }}</p>
          <p class="account-company">{{ props.companyName }}</p>
          <div class="prototype-pill">
            <UIcon name="i-lucide-flask-conical" aria-hidden="true" />
            <span>Dữ liệu thử nghiệm nội bộ</span>
          </div>
        </div>

        <div v-if="props.companies.length > 1" class="account-group">
          <label :for="`${menuId}-company-select`" class="account-label">Chuyển công ty</label>
          <select
            :id="`${menuId}-company-select`"
            class="account-select"
            :value="props.activeCompanyId ?? undefined"
            aria-label="Chuyển công ty"
            @change="onSelectCompany"
          >
            <option v-for="c in props.companies" :key="c.companyId" :value="c.companyId">
              {{ c.companyName }}
            </option>
          </select>
        </div>

        <div v-if="visibleAdminLinks.length > 0" class="account-group account-links">
          <NuxtLink
            v-for="link in visibleAdminLinks"
            :key="link.to"
            :to="link.to"
            class="account-link"
            :aria-label="link.label"
            @click="closeMenu(false)"
          >
            <UIcon :name="link.icon" aria-hidden="true" />
            <span>{{ link.label }}</span>
          </NuxtLink>
        </div>

        <div class="account-group">
          <button
            type="button"
            class="account-action-btn"
            :disabled="resetting"
            aria-label="Khôi phục dữ liệu mẫu"
            @click="onResetPrototype"
          >
            <UIcon name="i-lucide-rotate-ccw" aria-hidden="true" />
            <span>{{ resetting ? 'Đang khôi phục...' : 'Khôi phục dữ liệu mẫu' }}</span>
          </button>
        </div>

        <div class="account-footer">
          <button
            type="button"
            class="account-logout-btn"
            :disabled="props.signingOut"
            aria-label="Đăng xuất"
            @click="onSignOut"
          >
            <UIcon name="i-lucide-log-out" aria-hidden="true" />
            <span>{{ props.signingOut ? 'Đang đăng xuất' : 'Đăng xuất' }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.account-utilities { display: flex; align-items: center; justify-content: center; gap: 8px; position: relative; }
.utility-btn { width: 44px; height: 44px; min-width: 44px; min-height: 44px; border-radius: var(--radius-sm); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; border: none; background: transparent; transition: background 150ms ease; }
.utility-btn:hover { background: var(--color-hover); }
.utility-bell { color: var(--color-text-secondary); font-size: 1.2rem; }
.utility-avatar { background: var(--color-primary-light); color: var(--color-primary); font-weight: 700; font-size: 0.85rem; }
.utility-avatar:hover { background: var(--color-primary-light); }
.avatar-text { line-height: 1; }
.account-anchor { position: relative; }
.account-popover { position: absolute; bottom: calc(100% + 8px); left: 0; width: 270px; max-width: calc(100vw - 24px); max-height: calc(100dvh - 90px); overflow-y: auto; z-index: 80; background: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); box-shadow: var(--shadow-lg); padding: 12px; display: flex; flex-direction: column; gap: 10px; box-sizing: border-box; }
@media (max-width: 767.98px) {
  .account-popover { left: auto; right: 0; width: min(300px, calc(100vw - 20px)); }
}
.account-header { padding-bottom: 8px; border-bottom: 1px solid var(--color-border-light); }
.account-email { font-size: 0.85rem; font-weight: 600; color: var(--color-text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin: 0; }
.account-company { font-size: 0.78rem; color: var(--color-text-secondary); margin: 2px 0 0; }
.prototype-pill { display: inline-flex; align-items: center; gap: 4px; margin-top: 6px; padding: 2px 6px; border-radius: var(--radius-sm); background: var(--color-primary-light); color: var(--color-primary); font-size: 0.72rem; font-weight: 600; }
.account-group { display: flex; flex-direction: column; gap: 4px; }
.account-label { font-size: 0.75rem; font-weight: 600; color: var(--color-text-muted); }
.account-select { min-height: 44px; width: 100%; border-radius: var(--radius-sm); border: 1px solid var(--color-border); background: var(--color-bg-secondary); color: var(--color-text-primary); padding: 0 8px; font-size: 0.85rem; }
.account-links { border-top: 1px solid var(--color-border-light); padding-top: 6px; }
.account-link { min-height: 44px; display: flex; align-items: center; gap: 8px; padding: 0 8px; border-radius: var(--radius-sm); color: var(--color-text-secondary); font-size: 0.84rem; text-decoration: none; }
.account-link:hover { background: var(--color-hover); color: var(--color-text-primary); }
.account-action-btn { min-height: 44px; width: 100%; display: inline-flex; align-items: center; gap: 8px; padding: 0 8px; border-radius: var(--radius-sm); border: 1px dashed var(--color-border); background: transparent; color: var(--color-text-secondary); font-size: 0.82rem; cursor: pointer; text-align: left; }
.account-action-btn:hover:not(:disabled) { background: var(--color-hover); }
.account-action-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.account-footer { border-top: 1px solid var(--color-border-light); padding-top: 8px; }
.account-logout-btn { width: 100%; min-height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; border-radius: var(--radius-sm); border: none; background: var(--color-primary); color: #fff; font-size: 0.86rem; font-weight: 600; cursor: pointer; transition: background 150ms ease; }
.account-logout-btn:hover:not(:disabled) { background: var(--color-primary-hover); }
.account-logout-btn:disabled { opacity: 0.65; cursor: not-allowed; }
@media (prefers-reduced-motion: reduce) {
  .utility-btn, .account-logout-btn, .account-action-btn, .account-link { transition: none; }
}
</style>
