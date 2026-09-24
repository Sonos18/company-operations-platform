<script setup lang="ts">
import { canonicalNavigationLinks, filterNavigationLinks } from './navigation-permissions'

const props = defineProps<{
  collapsed: boolean
}>()

const emit = defineEmits<{
  toggle: []
}>()

const route = useRoute()
const companyAccessStore = useNuxtApp().$companyAccessStore
const visibleLinks = computed(() => filterNavigationLinks(canonicalNavigationLinks, companyAccessStore))

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
    </div>

    <div class="sidebar-note">
      <UIcon name="i-lucide-flask-conical" aria-hidden="true" />
      <div>
        <strong>Dữ liệu thử nghiệm</strong>
        <span>Mọi thao tác đều có thể khôi phục.</span>
      </div>
    </div>
  </aside>

  <nav class="mobile-nav" :class="{ 'mobile-nav--dense': visibleLinks.length > 6 }" aria-label="Điều hướng chính trên điện thoại">
    <NuxtLink
      v-for="link in visibleLinks"
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
  padding: 24px 14px 18px;
  border-right: 1px solid var(--color-border-light);
  background: rgba(255, 255, 255, 0.75);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  transition: width 200ms ease, top 200ms ease, padding 200ms ease;
}

.sidebar-main { display: grid; gap: 12px; }
.sidebar-toggle {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-sm);
  background: #ffffff;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 150ms ease;
}
.sidebar-toggle:hover {
  background: var(--color-hover);
  color: var(--color-text-primary);
  border-color: var(--color-border);
}
.sidebar-toggle :deep(svg) { width: 19px; height: 19px; }
.sidebar-label { padding: 0 10px 10px; color: var(--color-text-muted); }
.sidebar-nav { display: grid; gap: 4px; }
.sidebar-link {
  display: flex;
  align-items: center;
  gap: 11px;
  min-height: 42px;
  padding: 0 12px;
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
  font-family: var(--font-sans);
  font-size: 0.86rem;
  font-weight: 600;
  transition: all 140ms ease;
}
.sidebar-link :deep(svg) { width: 19px; height: 19px; }
.sidebar-link:hover {
  background: var(--color-hover);
  color: var(--color-text-primary);
}
.sidebar-link--active {
  background: var(--color-primary-light);
  color: var(--color-primary);
  font-weight: 650;
}
.sidebar-link--active:hover {
  background: rgba(29, 78, 216, 0.16);
  color: var(--color-primary);
}
.sidebar-note {
  display: flex;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.8);
  color: var(--color-text-primary);
}
.sidebar-note :deep(svg) {
  flex: 0 0 18px;
  margin-top: 2px;
  color: var(--color-accent);
}
.sidebar-note div { display: grid; gap: 2px; }
.sidebar-note strong { font-size: 0.75rem; color: var(--color-text-primary); }
.sidebar-note span { color: var(--color-text-secondary); font-size: 0.68rem; line-height: 1.35; }
.app-sidebar--collapsed { padding-inline: 10px; }
.app-sidebar--collapsed .sidebar-toggle { margin-inline: auto; }
.app-sidebar--collapsed .sidebar-label,
.app-sidebar--collapsed .sidebar-note { display: none; }
.app-sidebar--collapsed .sidebar-link { justify-content: center; padding-inline: 0; }
.mobile-nav { display: none; }

@media (max-width: 767px) {
  .app-sidebar { display: none; }
  .sidebar-toggle { display: none; }
  .mobile-nav {
    position: fixed;
    z-index: 60;
    inset: auto 10px calc(10px + env(safe-area-inset-bottom, 0px));
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    min-height: 58px;
    padding: 5px;
    gap: 4px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: var(--radius-sm);
    background: #0f172a;
    box-shadow: var(--shadow-lg);
  }
  .mobile-nav a {
    display: grid;
    place-items: center;
    align-content: center;
    gap: 2px;
    min-height: 44px;
    padding: 4px;
    border-radius: 6px;
    color: #94a3b8;
    font-size: 0.67rem;
    font-weight: 600;
  }
  .mobile-nav a :deep(svg) { width: 19px; height: 19px; }
  .mobile-nav a.active {
    background: var(--color-primary);
    color: #ffffff;
  }
  .mobile-nav--dense { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}

@media (prefers-reduced-motion: reduce) {
  .app-sidebar { transition: none; }
}
</style>
