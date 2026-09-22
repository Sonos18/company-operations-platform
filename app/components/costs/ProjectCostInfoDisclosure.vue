<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

interface Props {
  id: string
  tooltipText: string
  label?: string
  buttonTestId?: string
  popoverTestId?: string
}

withDefaults(defineProps<Props>(), {
  label: 'Thông tin nguồn thu từ chủ đầu tư',
  buttonTestId: 'info-disclosure-btn',
  popoverTestId: 'info-tooltip-popover',
})

const isPinned = ref(false)
const isHovered = ref(false)
const isFocused = ref(false)
const isDismissed = ref(false)
const anchorRef = ref<HTMLElement | null>(null)

const isOpen = computed(() => {
  if (isDismissed.value) return false
  return isPinned.value || isHovered.value || isFocused.value
})

function toggleInfo() {
  if (isPinned.value) {
    isPinned.value = false
    isHovered.value = false
    isFocused.value = false
  }
  else {
    isDismissed.value = false
    isPinned.value = true
  }
}

function onMouseEnter() {
  isDismissed.value = false
  isHovered.value = true
}

function onMouseLeave() {
  isHovered.value = false
}

function onFocus() {
  isDismissed.value = false
  isFocused.value = true
}

function onBlur() {
  isFocused.value = false
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    isDismissed.value = true
    isPinned.value = false
    isHovered.value = false
    isFocused.value = false
  }
}

function onDocumentClick(e: MouseEvent) {
  if (!isOpen.value) return
  if (anchorRef.value && !anchorRef.value.contains(e.target as Node)) {
    isDismissed.value = true
    isPinned.value = false
    isHovered.value = false
    isFocused.value = false
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  document.addEventListener('click', onDocumentClick)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
  document.removeEventListener('click', onDocumentClick)
})
</script>

<template>
  <div ref="anchorRef" class="info-disclosure-anchor">
    <button
      type="button"
      class="info-trigger-btn"
      :aria-expanded="isOpen ? 'true' : 'false'"
      :aria-label="label"
      :aria-describedby="`info-popover-${id}`"
      :data-testid="buttonTestId"
      @click.stop="toggleInfo"
      @mouseenter="onMouseEnter"
      @mouseleave="onMouseLeave"
      @focus="onFocus"
      @blur="onBlur"
    >
      <UIcon name="i-lucide-info" class="info-icon" aria-hidden="true" />
    </button>
    <div
      v-show="isOpen"
      :id="`info-popover-${id}`"
      role="tooltip"
      class="info-tooltip-popover cockpit-card"
      :data-testid="popoverTestId"
      @click.stop
    >
      <p class="info-tooltip-text">
        {{ tooltipText }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.info-disclosure-anchor {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.info-trigger-btn {
  background: none;
  border: none;
  padding: 2px;
  margin: 0;
  cursor: pointer;
  color: var(--color-text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm, 4px);
  transition: color 0.15s ease;
}

.info-trigger-btn:hover,
.info-trigger-btn:focus-visible {
  color: var(--color-primary);
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}

.info-icon {
  font-size: 0.875rem;
}

.info-tooltip-popover {
  position: absolute;
  top: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  width: 240px;
  padding: 10px 12px;
  z-index: 50;
  box-shadow: var(--shadow-lg, 0 10px 15px -3px rgba(0, 0, 0, 0.1));
  border-radius: var(--radius-md, 8px);
  background: var(--color-surface, #ffffff);
  border: 1px solid var(--color-border);
}

.info-tooltip-text {
  margin: 0;
  font-size: 0.775rem;
  line-height: 1.4;
  color: var(--color-text-secondary);
}
</style>
