<script setup lang="ts">
const props = defineProps<{
  collapsed: boolean
}>()

const emit = defineEmits<{
  toggle: []
}>()

const route = useRoute()
const links = [
  { to: '/projects', label: 'Dự án', icon: 'i-lucide-panels-top-left' },
  { to: '/my-work', label: 'Công việc của tôi', icon: 'i-lucide-circle-check-big' },
  { to: '/employees', label: 'Nhân sự', icon: 'i-lucide-users-round' },
]

function isActive(to: string) {
  return route.path === to || (to === '/projects' && route.path.startsWith('/projects/'))
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
    <div class="sidebar-main">
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

      <nav class="sidebar-nav">
        <p class="eyebrow sidebar-label">Không gian làm việc</p>
        <NuxtLink
          v-for="link in links"
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
    </div>

    <div class="sidebar-note">
      <UIcon name="i-lucide-flask-conical" aria-hidden="true" />
      <div>
        <strong>Dữ liệu thử nghiệm</strong>
        <span>Mọi thao tác đều có thể khôi phục.</span>
      </div>
    </div>
  </aside>

  <nav class="mobile-nav" aria-label="Điều hướng chính trên điện thoại">
    <NuxtLink
      v-for="link in links"
      :key="link.to"
      :to="link.to"
      :class="{ active: isActive(link.to) }"
    >
      <UIcon :name="link.icon" aria-hidden="true" />
      <span>{{ link.label }}</span>
    </NuxtLink>
  </nav>
</template>

<style scoped>
.app-sidebar {
  position: fixed;
  z-index: 40;
  inset: var(--shell-header-height) auto 0 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  width: var(--shell-sidebar-width);
  padding: 24px 16px 18px;
  border-right: 1px solid var(--line);
  background: #f1f2ed;
  transition: width 200ms ease, top 200ms ease, padding 200ms ease;
}

.sidebar-main { display: grid; gap: 12px; }
.sidebar-toggle { display: grid; width: 44px; height: 44px; place-items: center; border: 1px solid #d6d8d1; border-radius: var(--radius-md); background: var(--paper-raised); color: var(--forest); cursor: pointer; }
.sidebar-toggle :deep(svg) { width: 19px; height: 19px; }
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
.app-sidebar--collapsed { padding-inline: 10px; }
.app-sidebar--collapsed .sidebar-toggle { margin-inline: auto; }
.app-sidebar--collapsed .sidebar-label,
.app-sidebar--collapsed .sidebar-note { display: none; }
.app-sidebar--collapsed .sidebar-link { justify-content: center; padding-inline: 0; }
.mobile-nav { display: none; }

@media (max-width: 767px) {
  .app-sidebar { display: none; }
  .sidebar-toggle { display: none; }
  .mobile-nav { position: fixed; z-index: 60; inset: auto 10px 10px; display: grid; grid-template-columns: repeat(3, 1fr); min-height: 58px; padding: 5px; border: 1px solid #d7d9d1; border-radius: 8px; background: var(--forest-deep); box-shadow: 0 10px 30px rgb(16 39 28 / 20%); }
  .mobile-nav a { display: grid; place-items: center; align-content: center; gap: 2px; border-radius: 4px; color: #b9c8c0; font-size: 0.67rem; font-weight: 650; }
  .mobile-nav a :deep(svg) { width: 19px; height: 19px; }
  .mobile-nav a.active { background: white; color: var(--forest); }
}

@media (prefers-reduced-motion: reduce) {
  .app-sidebar { transition: none; }
}
</style>
