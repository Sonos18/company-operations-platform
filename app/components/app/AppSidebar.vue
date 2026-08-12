<script setup lang="ts">
const route = useRoute()
const links = [
  { to: '/projects', label: 'Dự án', icon: 'i-lucide-panels-top-left' },
  { to: '/my-work', label: 'Công việc của tôi', icon: 'i-lucide-circle-check-big' },
]

function isActive(to: string) {
  return route.path === to || (to === '/projects' && route.path.startsWith('/projects/'))
}
</script>

<template>
  <aside class="app-sidebar" aria-label="Điều hướng chính">
    <nav class="sidebar-nav">
      <p class="eyebrow sidebar-label">Không gian làm việc</p>
      <NuxtLink
        v-for="link in links"
        :key="link.to"
        :to="link.to"
        class="sidebar-link"
        :class="{ 'sidebar-link--active': isActive(link.to) }"
      >
        <UIcon :name="link.icon" aria-hidden="true" />
        <span>{{ link.label }}</span>
      </NuxtLink>
    </nav>

    <div class="sidebar-note">
      <UIcon name="i-lucide-flask-conical" aria-hidden="true" />
      <div><strong>Dữ liệu thử nghiệm</strong><span>Mọi thao tác đều có thể khôi phục.</span></div>
    </div>
  </aside>

  <nav class="mobile-nav" aria-label="Điều hướng chính trên điện thoại">
    <NuxtLink v-for="link in links" :key="link.to" :to="link.to" :class="{ active: isActive(link.to) }">
      <UIcon :name="link.icon" aria-hidden="true" /><span>{{ link.label }}</span>
    </NuxtLink>
  </nav>
</template>

<style scoped>
.app-sidebar {
  position: fixed;
  z-index: 40;
  inset: var(--header-height) auto 0 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  width: var(--sidebar-width);
  padding: 24px 16px 18px;
  border-right: 1px solid var(--line);
  background: #f1f2ed;
}
.sidebar-label { padding: 0 10px 10px; }
.sidebar-nav { display: grid; gap: 6px; }
.sidebar-link { display: flex; align-items: center; gap: 11px; min-height: 44px; padding: 0 11px; border-radius: var(--radius-md); color: var(--ink-muted); font-size: 0.88rem; font-weight: 650; }
.sidebar-link :deep(svg) { width: 19px; height: 19px; }
.sidebar-link:hover { background: color-mix(in srgb, var(--forest) 7%, transparent); color: var(--forest); }
.sidebar-link--active { background: var(--forest); color: white; }
.sidebar-link--active:hover { background: var(--forest-deep); color: white; }
.sidebar-note { display: flex; gap: 10px; padding: 13px; border: 1px solid #d7d9d1; border-radius: var(--radius-md); background: var(--paper); color: var(--forest); }
.sidebar-note :deep(svg) { flex: 0 0 18px; margin-top: 2px; }
.sidebar-note div { display: grid; gap: 2px; }
.sidebar-note strong { font-size: 0.75rem; }
.sidebar-note span { color: var(--ink-muted); font-size: 0.68rem; line-height: 1.35; }
.mobile-nav { display: none; }

@media (max-width: 767px) {
  .app-sidebar { display: none; }
  .mobile-nav { position: fixed; z-index: 60; inset: auto 10px 10px; display: grid; grid-template-columns: repeat(2, 1fr); min-height: 58px; padding: 5px; border: 1px solid #d7d9d1; border-radius: 8px; background: var(--forest-deep); box-shadow: 0 10px 30px rgb(16 39 28 / 20%); }
  .mobile-nav a { display: grid; place-items: center; align-content: center; gap: 2px; border-radius: 4px; color: #b9c8c0; font-size: 0.67rem; font-weight: 650; }
  .mobile-nav a :deep(svg) { width: 19px; height: 19px; }
  .mobile-nav a.active { background: white; color: var(--forest); }
}
</style>
