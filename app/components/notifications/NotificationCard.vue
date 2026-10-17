<script setup lang="ts">
import { computed } from 'vue'
import {
  fullDateTimeText,
  relativeTimeText,
  type NotificationBadge,
  type NotificationTone,
} from '../../utils/notifications/notification-display'

const props = defineProps<{
  badge: NotificationBadge
  title: string
  body?: string
  createdAt: string
  now: Date
  unread: boolean
  disabled?: boolean
  undelivered?: boolean
}>()

defineEmits<{ open: [] }>()

// Complete class strings (not built dynamically) so Tailwind can see them.
const toneClasses: Record<NotificationTone, string> = {
  warning: 'bg-amber-100 text-amber-800',
  success: 'bg-green-100 text-green-800',
  error: 'bg-red-100 text-red-800',
  reminder: 'bg-orange-100 text-orange-800',
  info: 'bg-blue-100 text-blue-800',
}

const relativeTime = computed(() => relativeTimeText(props.createdAt, props.now))
const fullTime = computed(() => fullDateTimeText(props.createdAt))
</script>

<template>
  <button
    type="button"
    class="flex w-full min-w-0 flex-col gap-1.5 rounded-xl border border-slate-200 p-3 text-left transition-colors hover:border-slate-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-wait disabled:opacity-70"
    :class="unread ? 'bg-sky-50' : 'bg-white'"
    :disabled="disabled"
    @click="$emit('open')"
  >
    <span class="flex w-full items-center justify-between gap-2">
      <span class="flex min-w-0 items-center gap-2">
        <span
          v-if="unread"
          class="size-2 shrink-0 rounded-full bg-blue-600"
          role="img"
          aria-label="Chưa đọc"
        />
        <span class="rounded-md px-2 py-0.5 text-xs font-semibold" :class="toneClasses[badge.tone]">
          {{ badge.label }}
        </span>
        <span v-if="undelivered" class="text-xs text-amber-600">Chưa nhận thông báo</span>
      </span>
      <time class="shrink-0 text-xs text-slate-500" :datetime="createdAt" :title="fullTime">{{ relativeTime }}</time>
    </span>
    <span class="break-words text-sm font-bold text-slate-900">{{ title }}</span>
    <span v-if="body" class="break-words text-sm text-slate-500">{{ body }}</span>
  </button>
</template>
