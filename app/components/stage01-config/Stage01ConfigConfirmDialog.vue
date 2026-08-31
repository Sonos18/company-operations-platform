<script setup lang="ts">
const props = withDefaults(defineProps<{
  open: boolean
  title: string
  body: string
  cancelText: string
  confirmText: string
  pending?: boolean
}>(), {
  pending: false,
})

const emit = defineEmits<{
  'update:open': [value: boolean]
  confirm: []
}>()

const open = computed({
  get: () => props.open,
  set: (value: boolean) => emit('update:open', value),
})

function cancel(): void {
  open.value = false
}
</script>

<template>
  <UModal v-model:open="open" :title="props.title" :description="props.body" :dismissible="!props.pending">
    <template #body>
      <p class="confirm-dialog__body">{{ props.body }}</p>
    </template>
    <template #footer>
      <div class="confirm-dialog__actions">
        <UButton color="neutral" variant="outline" :disabled="props.pending" @click="cancel">{{ props.cancelText }}</UButton>
        <UButton color="error" :loading="props.pending" @click="emit('confirm')">{{ props.confirmText }}</UButton>
      </div>
    </template>
  </UModal>
</template>

<style scoped>
.confirm-dialog__body { margin: 0; color: var(--ink-muted); line-height: 1.5; }.confirm-dialog__actions { display: flex; justify-content: end; gap: 8px; width: 100%; }
</style>
