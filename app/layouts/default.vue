<script setup lang="ts">
const repositories = useRepositories()
const { data: company } = await useAsyncData('active-company-config', () => repositories.company.getConfig())
const headerCollapsed = ref(false)
</script>

<template>
  <div
    class="app-shell"
    :data-header-collapsed="headerCollapsed || undefined"
  >
    <AppHeader
      :company-name="company?.displayName ?? 'Đang tải công ty'"
      :short-name="company?.shortName ?? 'Nền tảng vận hành'"
      :collapsed="headerCollapsed"
      @toggle="headerCollapsed = !headerCollapsed"
    />
    <AppSidebar />
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

.app-main {
  min-height: 100vh;
  padding: calc(var(--shell-header-height) + 24px) 24px 32px calc(var(--shell-sidebar-width) + 24px);
  transition: padding 200ms ease;
}

@media (max-width: 767px) {
  .app-shell[data-header-collapsed='true'] {
    --shell-header-height: var(--header-height);
  }

  .app-main {
    padding: calc(var(--shell-header-height) + 16px) 14px 86px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .app-main { transition: none; }
}
</style>
