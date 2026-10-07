<script setup lang="ts">
import type { CompanyAccess } from '../../../shared/schemas/session'
import { canonicalNavigationLinks, filterNavigationLinks } from './navigation-permissions'

const props = defineProps<{
  collapsed: boolean
  productName: string
  productMark: string
  companyName: string
  userEmail: string | null
  companies: readonly CompanyAccess[]
  activeCompanyId: string | null
  signingOut: boolean
}>()

const emit = defineEmits<{
  toggle: []
  selectCompany: [companyId: string, control: HTMLSelectElement]
  signOut: []
}>()

const route = useRoute()
const companyAccessStore = useNuxtApp().$companyAccessStore
const workflowMode=useCostWorkflowMode()
watch(workflowMode.scope,()=>{workflowMode.invalidate();void workflowMode.refresh()},{immediate:true,flush:'sync'})
const visibleLinks = computed(() => filterNavigationLinks(canonicalNavigationLinks, companyAccessStore,workflowMode.mode.value))

function isActive(to: string) {
  if (route.path === to) return true
  if (to === '/projects') return route.path.startsWith('/projects/')
  if (to === '/costs') return route.path.startsWith('/costs/') && !route.path.startsWith('/costs/sources') && !route.path.startsWith('/costs/projects/')
  if (to === '/costs/sources') return route.path.startsWith('/costs/projects/')
  return false
}
</script>

<template>
  <aside
    id="app-sidebar"
    class="app-sidebar"
    :class="{ 'app-sidebar--collapsed': props.collapsed }"
    aria-label="Điều hướng chính"
    data-testid="app-sidebar"
  >
    <div class="sidebar-top">
      <NuxtLink to="/projects" class="sidebar-brand" :title="props.productName" :aria-label="`${props.productName} — Về danh sách dự án`">
        <span class="sidebar-brand-mark" aria-hidden="true">{{ props.productMark }}</span>
        <span class="sidebar-brand-name" :class="{ 'sr-only': props.collapsed }">{{ props.productName }}</span>
      </NuxtLink>
      <button
        class="sidebar-toggle"
        type="button"
        aria-controls="app-sidebar"
        :aria-expanded="!props.collapsed"
        :aria-label="props.collapsed ? 'Mở rộng thanh điều hướng bên trái' : 'Thu gọn thanh điều hướng bên trái'"
        @click="emit('toggle')"
      >
        <UIcon :name="props.collapsed ? 'i-lucide-panel-left-open' : 'i-lucide-panel-left-close'" aria-hidden="true" />
      </button>
    </div>

    <div class="sidebar-divider" aria-hidden="true" />

    <nav class="sidebar-nav" aria-label="Không gian làm việc">
      <p class="sidebar-label eyebrow" :class="{ 'sr-only': props.collapsed }">Không gian làm việc</p>
      <NuxtLink
        v-for="link in visibleLinks"
        :key="link.to"
        :to="link.to"
        class="sidebar-link"
        :class="{ 'sidebar-link--active': isActive(link.to) }"
        :title="props.collapsed ? link.label : undefined"
      >
        <UIcon :name="link.icon" aria-hidden="true" />
        <span :class="{ 'sr-only': props.collapsed }">{{ link.label }}</span>
      </NuxtLink>
    </nav>

    <div class="sidebar-divider" aria-hidden="true" />

    <div class="sidebar-utilities">
      <AppHeader
        :show-notification-bell="false"
        :product-name="props.productName"
        :product-mark="props.productMark"
        :company-name="props.companyName"
        :user-email="props.userEmail"
        :companies="props.companies"
        :active-company-id="props.activeCompanyId"
        :signing-out="props.signingOut"
        @select-company="(id, el) => emit('selectCompany', id, el)"
        @sign-out="emit('signOut')"
      />
    </div>
  </aside>

  <nav class="mobile-nav" aria-label="Điều hướng trên điện thoại">
    <div class="mobile-nav-utilities">
      <NuxtLink to="/projects" class="mobile-brand" :aria-label="`${props.productName} — Về danh sách dự án`">
        <span class="sidebar-brand-mark" aria-hidden="true">{{ props.productMark }}</span>
        <span class="mobile-brand-name">{{ props.productName }}</span>
      </NuxtLink>
      <AppHeader
        :product-name="props.productName"
        :product-mark="props.productMark"
        :company-name="props.companyName"
        :user-email="props.userEmail"
        :companies="props.companies"
        :active-company-id="props.activeCompanyId"
        :signing-out="props.signingOut"
        @select-company="(id, el) => emit('selectCompany', id, el)"
        @sign-out="emit('signOut')"
      />
    </div>
    <div class="mobile-nav-divider" aria-hidden="true" />
    <div class="mobile-nav-grid" :class="{ 'mobile-nav-grid--dense': visibleLinks.length > 6 }" role="navigation" aria-label="Các trang chính">
      <NuxtLink
        v-for="link in visibleLinks"
        :key="link.to"
        :to="link.to"
        class="mobile-nav-link"
        :class="{ active: isActive(link.to) }"
      >
        <UIcon :name="link.icon" aria-hidden="true" />
        <span>{{ link.label }}</span>
      </NuxtLink>
    </div>
  </nav>
</template>

<style scoped>
.app-sidebar { position: fixed; top: 0; bottom: 0; left: 0; z-index: 40; display: flex; flex-direction: column; width: var(--shell-sidebar-width, 224px); padding: 16px 12px 14px; border-right: 1px solid var(--color-border-light); background: var(--color-surface-card); backdrop-filter: blur(12px); transition: width 200ms ease, padding 200ms ease; overflow: visible; }
.app-sidebar--collapsed { width: 64px; padding: 14px 10px; }
.sidebar-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 44px; flex-shrink: 0; }
.app-sidebar--collapsed .sidebar-top { flex-direction: column; justify-content: center; gap: 6px; }
.sidebar-brand { display: inline-flex; align-items: center; gap: 10px; min-height: 44px; min-width: 44px; text-decoration: none; }
.sidebar-brand-mark { width: 34px; height: 34px; min-width: 34px; border-radius: var(--radius-sm); background: var(--gradient-primary); color: #fff; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.85rem; }
.sidebar-brand-name { font-weight: 700; font-size: 1rem; color: var(--color-text-primary); }
.sidebar-toggle { width: 44px; height: 44px; min-width: 44px; min-height: 44px; border-radius: var(--radius-sm); border: none; background: transparent; color: var(--color-text-secondary); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; transition: background 150ms ease; }
.sidebar-toggle:hover { background: var(--color-hover); }
.sidebar-divider { height: 1px; background: var(--color-border-light); margin: 10px 0; width: 100%; flex-shrink: 0; }
.sidebar-nav { display: flex; flex-direction: column; gap: 4px; flex: 1 1 0%; min-height: 0; overflow-y: auto; overflow-x: hidden; }
.sidebar-label { font-size: 0.72rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-text-muted); padding: 4px 10px; margin: 0; }
.sidebar-link { display: flex; align-items: center; gap: 11px; min-height: 44px; padding: 0 12px; border-radius: var(--radius-sm); color: var(--color-text-secondary); font-size: 0.86rem; font-weight: 600; text-decoration: none; transition: background 150ms ease, color 150ms ease; }
.sidebar-link:hover { background: var(--color-hover); }
.sidebar-link--active { background: var(--color-primary-light); color: var(--color-primary); }
.app-sidebar--collapsed .sidebar-link { justify-content: center; padding: 0; width: 44px; margin: 0 auto; }
.sidebar-utilities { flex-shrink: 0; min-height: 44px; display: flex; justify-content: center; position: relative; overflow: visible; }
.app-sidebar--collapsed .sidebar-utilities { min-height: 94px; }
.app-sidebar--collapsed .sidebar-utilities :deep(.account-utilities) { flex-direction: column; gap: 6px; }
.mobile-nav { display: none; }
@media (max-width: 767.98px) {
  .app-sidebar { display: none; }
  .mobile-nav { display: flex; flex-direction: column; position: fixed; inset: auto 10px calc(10px + env(safe-area-inset-bottom, 0px)); z-index: 60; background: #0f172a; border: 1px solid rgba(255, 255, 255, .1); border-radius: var(--radius-md); box-shadow: var(--shadow-lg); padding: 6px 8px; }
  .mobile-nav-utilities { display: flex; justify-content: space-between; align-items: center; min-height: 44px; }
  .mobile-brand { display: flex; align-items: center; gap: 8px; min-height: 44px; min-width: 44px; text-decoration: none; }
  .mobile-brand-name { color: #fff; font-weight: 700; font-size: 0.95rem; }
  .mobile-nav-divider { height: 1px; background: rgba(255, 255, 255, .1); margin: 4px 0 6px; flex-shrink: 0; }
  .mobile-nav-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; }
  .mobile-nav-grid--dense { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .mobile-nav-link { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 44px; padding: 4px 2px; border-radius: var(--radius-sm); color: #94a3b8; font-size: 0.67rem; font-weight: 600; text-align: center; text-decoration: none; }
  .mobile-nav-link span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
  .mobile-nav-link:hover { color: #fff; }
  .mobile-nav-link.active { background: var(--color-primary); color: #fff; }
  .mobile-nav :deep(.utility-bell) { color: #94a3b8; }
  .mobile-nav :deep(.utility-bell:hover) { color: #fff; background: var(--color-hover); }
  .mobile-nav :deep(.utility-avatar) { background: var(--color-primary); color: #fff; }
}
@media (prefers-reduced-motion: reduce) {
  .app-sidebar, .sidebar-link, .sidebar-toggle { transition: none; }
}
</style>
