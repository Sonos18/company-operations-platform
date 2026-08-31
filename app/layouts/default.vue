<script setup lang="ts">
import { PRODUCT_BRAND } from '../../shared/constants/product-brand'
import { selectCompanyWithUnsavedChanges } from '../components/app/company-switcher'

const nuxtApp = useNuxtApp()
const authStore = nuxtApp.$authStore
const companyAccessStore = nuxtApp.$companyAccessStore
const unsavedChangesGuard = useUnsavedChangesGuard()
const headerCollapsed = ref(false)
const sidebarCollapsed = ref(false)
const companyName = computed(() => companyAccessStore.activeCompany?.companyName ?? 'Đang chọn công ty')
const signingOut = computed(() => authStore.operations.signOut.status === 'pending')

async function selectCompany(companyId: string, control: HTMLSelectElement): Promise<void> {
  await selectCompanyWithUnsavedChanges(companyId, {
    activeCompanyId: companyAccessStore.activeCompanyId ?? '',
    control,
    confirmLeave: unsavedChangesGuard.confirmLeave,
    clear: unsavedChangesGuard.clear,
    actions: {
      selectCompany: companyAccessStore.selectCompany,
      clearRuntimeData: clearNuxtData,
      reloadNuxtApp,
    },
  })
}

async function signOut(): Promise<void> {
  if (signingOut.value) return

  try {
    await authStore.signOut()
  }
  catch {
    // The auth store clears local Auth and company state even when provider logout fails.
  }
  finally {
    clearNuxtData()
    await navigateTo('/login')
  }
}
</script>

<template>
  <div
    class="app-shell"
    :data-header-collapsed="headerCollapsed || undefined"
    :data-sidebar-collapsed="sidebarCollapsed || undefined"
  >
    <AppHeader
      :product-name="PRODUCT_BRAND.name"
      :product-mark="PRODUCT_BRAND.mark"
      :company-name="companyName"
      :user-email="authStore.user?.email ?? null"
      :companies="companyAccessStore.companies"
      :active-company-id="companyAccessStore.activeCompanyId"
      :signing-out="signingOut"
      :collapsed="headerCollapsed"
      @toggle="headerCollapsed = !headerCollapsed"
      @select-company="selectCompany"
      @sign-out="signOut"
    />
    <AppSidebar
      :collapsed="sidebarCollapsed"
      @toggle="sidebarCollapsed = !sidebarCollapsed"
    />
    <main class="app-main" data-testid="app-main">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  --shell-header-height: var(--header-height);
  --shell-sidebar-width: var(--sidebar-width);
}

.app-shell[data-header-collapsed='true'] {
  --shell-header-height: 44px;
}

.app-shell[data-sidebar-collapsed='true'] {
  --shell-sidebar-width: 64px;
}

.app-main {
  min-height: 100vh;
  padding: calc(var(--shell-header-height) + 24px) 24px 32px calc(var(--shell-sidebar-width) + 24px);
  transition: padding 200ms ease;
}

@media (max-width: 767px) {
  .app-shell[data-header-collapsed='true'] {
    --shell-header-height: var(--header-height);
  }

  .app-shell[data-sidebar-collapsed='true'] {
    --shell-sidebar-width: var(--sidebar-width);
  }

  .app-main {
    padding: calc(var(--shell-header-height) + 16px) 14px 86px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .app-main { transition: none; }
}
</style>
