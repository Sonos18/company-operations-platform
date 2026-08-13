<script setup lang="ts">
const props = defineProps<{
  companyName: string
  shortName: string
  collapsed: boolean
}>()

const emit = defineEmits<{
  toggle: []
}>()

const brandMark = computed(() => props.shortName
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 3)
  .map(word => word[0])
  .join('')
  .toLocaleUpperCase('vi-VN'))
const { resetting, resetPrototype } = usePrototypeReset()
</script>

<template>
  <header
    id="app-header"
    class="app-header"
    :class="{ 'app-header--collapsed': collapsed }"
    data-testid="app-header"
  >
    <div class="app-header__primary">
      <NuxtLink to="/projects" class="brand" aria-label="Về danh sách dự án">
        <span class="brand__mark" aria-hidden="true">{{ brandMark }}</span>
        <span class="brand__copy">
          <strong>{{ shortName }}</strong>
          <small>{{ companyName }}</small>
        </span>
      </NuxtLink>
      <button
        class="navigation-toggle"
        type="button"
        aria-controls="app-header"
        :aria-expanded="!collapsed"
        :aria-label="collapsed ? 'Mở rộng thanh điều hướng phía trên' : 'Thu gọn thanh điều hướng phía trên'"
        @click="emit('toggle')"
      >
        <UIcon :name="collapsed ? 'i-lucide-panel-top-open' : 'i-lucide-panel-top-close'" aria-hidden="true" />
      </button>
    </div>

    <div class="app-header__context">
      <span class="prototype-pill"><span /> Prototype nội bộ</span>
      <button class="reset-action" type="button" :disabled="resetting" aria-label="Khôi phục dữ liệu mẫu" @click="resetPrototype">
        <UIcon name="i-lucide-rotate-ccw" aria-hidden="true" />
        <span>{{ resetting ? 'Đang khôi phục' : 'Khôi phục dữ liệu mẫu' }}</span>
      </button>
      <button class="header-action" type="button" aria-label="Mở thông báo">
        <UIcon name="i-lucide-bell" aria-hidden="true" />
      </button>
      <span class="avatar" aria-label="Người dùng thử">NH</span>
    </div>
  </header>
</template>

<style scoped>
.app-header {
  position: fixed;
  z-index: 50;
  inset: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--shell-header-height);
  padding: 0 20px;
  border-bottom: 1px solid color-mix(in srgb, var(--forest) 15%, transparent);
  background: color-mix(in srgb, var(--paper) 96%, white);
  transition: all 200ms ease;
}

.brand,
.app-header__context {
  display: flex;
  align-items: center;
}

.app-header__primary {
  display: flex;
  align-items: center;
  gap: 10px;
}

.brand { gap: 12px; }
.app-header__context { gap: 10px; }

.navigation-toggle {
  display: grid;
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
  place-items: center;
  border: 1px solid #d6d8d1;
  border-radius: var(--radius-md);
  background: white;
  color: var(--forest);
  cursor: pointer;
}

.navigation-toggle :deep(svg) {
  width: 19px;
  height: 19px;
}

.brand__mark {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: var(--radius-md);
  background: var(--forest);
  color: white;
  font-family: 'Space Grotesk Variable', sans-serif;
  font-size: 0.84rem;
  font-weight: 750;
  letter-spacing: -0.06em;
}

.brand__copy { display: grid; line-height: 1.1; }
.brand__copy strong { color: var(--forest-deep); font-family: 'Space Grotesk Variable', sans-serif; font-size: 0.93rem; }
.brand__copy small { max-width: 330px; overflow: hidden; color: var(--ink-muted); font-size: 0.69rem; text-overflow: ellipsis; white-space: nowrap; }

.prototype-pill {
  display: flex;
  align-items: center;
  gap: 7px;
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid #d6d8d1;
  border-radius: 999px;
  color: var(--ink-muted);
  font-size: 0.74rem;
  font-weight: 650;
}
.prototype-pill span { width: 7px; height: 7px; border-radius: 50%; background: var(--mint); box-shadow: 0 0 0 3px color-mix(in srgb, var(--mint) 30%, transparent); }
.reset-action { display: flex; align-items: center; gap: 6px; min-height: 38px; padding: 0 10px; border: 1px solid #d6d8d1; background: white; color: var(--forest); cursor: pointer; font: inherit; font-size: .68rem; font-weight: 750; }.reset-action :deep(svg),.reset-action :deep(.iconify) { display: block; width: 17px; height: 17px; flex: 0 0 17px; }.reset-action :deep(svg) { stroke-width: 2.2; }.reset-action:disabled { cursor: wait; opacity: .55; }

.header-action,
.avatar {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border: 1px solid #d6d8d1;
  border-radius: 50%;
  background: white;
}
.header-action { color: var(--forest); cursor: pointer; font-size: 1.05rem; }
.avatar { border-color: var(--forest); background: var(--forest); color: white; font-size: 0.72rem; font-weight: 750; }

.app-header--collapsed {
  padding-inline: 10px;
}

.app-header--collapsed .brand__copy,
.app-header--collapsed .app-header__context {
  display: none;
}

.app-header--collapsed .brand__mark {
  width: 32px;
  height: 32px;
}

@media (max-width: 767px) {
  .app-header { padding: 0 14px; }
  .navigation-toggle { display: none; }
  .app-header--collapsed { padding: 0 14px; }
  .app-header--collapsed .brand__copy { display: grid; }
  .app-header--collapsed .app-header__context { display: flex; }
  .app-header--collapsed .brand__mark { width: 38px; height: 38px; }
  .brand__copy small,
  .prototype-pill,
  .reset-action span { display: none; }
  .reset-action { width: 38px; padding: 0; justify-content: center; }
}

@media (prefers-reduced-motion: reduce) {
  .app-header { transition: none; }
}
</style>
