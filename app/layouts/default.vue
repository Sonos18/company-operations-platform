<script setup lang="ts">
import { PRODUCT_BRAND } from '../../shared/constants/product-brand'

const repositories = useRepositories()
const { data: company } = await useAsyncData('active-company-config', () => repositories.company.getConfig())
const headerCollapsed = ref(false)
const sidebarCollapsed = ref(false)
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
      :company-name="company?.displayName ?? 'Đang tải công ty'"
      :collapsed="headerCollapsed"
      @toggle="headerCollapsed = !headerCollapsed"
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
