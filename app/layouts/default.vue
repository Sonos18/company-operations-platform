<script setup lang="ts">
import CostNotificationBell from '../components/costs/CostNotificationBell.vue'
import { PRODUCT_BRAND } from '../../shared/constants/product-brand'
import { selectCompanyWithUnsavedChanges } from '../components/app/company-switcher'

const nuxtApp = useNuxtApp()
const authStore = nuxtApp.$authStore
const companyAccessStore = nuxtApp.$companyAccessStore
const unsavedChangesGuard = useUnsavedChangesGuard()
const sidebarCollapsed = ref(true)

const companyName = computed(() => companyAccessStore.activeCompany?.companyName ?? 'Đang chọn công ty')
const signingOut = computed(() => authStore.operations.signOut.status === 'pending')

async function selectCompany(companyId: string, control: HTMLSelectElement): Promise<void> {
  await selectCompanyWithUnsavedChanges(companyId, {
    activeCompanyId: companyAccessStore.activeCompanyId ?? '',
    control,
    confirmLeave: unsavedChangesGuard.confirmLeave,
    clear: unsavedChangesGuard.clear,
    actions: { selectCompany: companyAccessStore.selectCompany, clearRuntimeData: clearNuxtData, reloadNuxtApp },
  })
}

async function signOut(): Promise<void> {
  if (signingOut.value) return
  try {
    await authStore.signOut()
  } catch {
    /* The auth store clears local Auth and company state even when provider logout fails. */
  } finally {
    clearNuxtData()
    await navigateTo('/login')
  }
}
</script>

<template>
  <div class="app-shell" :data-sidebar-collapsed="sidebarCollapsed || undefined">
    <AppSidebar
      :collapsed="sidebarCollapsed"
      :product-name="PRODUCT_BRAND.name"
      :product-mark="PRODUCT_BRAND.mark"
      :company-name="companyName"
      :user-email="authStore.user?.email ?? null"
      :companies="companyAccessStore.companies"
      :active-company-id="companyAccessStore.activeCompanyId"
      :signing-out="signingOut"
      @toggle="sidebarCollapsed = !sidebarCollapsed"
      @select-company="selectCompany"
      @sign-out="signOut"
    />
    <main class="app-main" data-testid="app-main">
      <div v-if="companyAccessStore.hasPermission('cost.notification.read')" class="cost-notification-toolbar"><CostNotificationBell /></div>
      <slot />
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  --shell-sidebar-width: var(--sidebar-width, 224px);
  --shell-bottom-nav-height: calc(192px + env(safe-area-inset-bottom, 0px));
  min-height: 100vh;
  background: var(--app-background, var(--color-bg-primary, #f6f5f2));
  background-attachment: fixed;
}
.app-shell[data-sidebar-collapsed] {
  --shell-sidebar-width: 64px;
}
.cost-notification-toolbar { display:flex;justify-content:flex-end;margin-bottom:8px; }
.app-main {
  min-height: 100vh;
  padding: 24px 24px 32px calc(var(--shell-sidebar-width) + 24px);
  transition: padding 200ms ease;
}
@media (max-width: 767.98px) {
  .app-main {
    padding: 16px 14px var(--shell-bottom-nav-height);
  }
}
@media (prefers-reduced-motion: reduce) {
  .app-main {
    transition: none;
  }
}
</style>
