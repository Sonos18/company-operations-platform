<script setup lang="ts">
const repositories = useRepositories()
const { data: company } = await useAsyncData('active-company-config', () => repositories.company.getConfig())
</script>

<template>
  <div class="app-shell">
    <AppHeader
      :company-name="company?.displayName ?? 'Đang tải công ty'"
      :short-name="company?.shortName ?? 'Nền tảng vận hành'"
    />
    <AppSidebar />
    <main class="app-main">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.app-main { min-height: 100vh; padding: calc(var(--header-height) + 24px) 24px 32px calc(var(--sidebar-width) + 24px); }
@media (max-width: 767px) { .app-main { padding: calc(var(--header-height) + 16px) 14px 86px; } }
</style>
