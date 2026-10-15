<template>
  <div class="money-field">
    <label v-if="label" class="money-label" :for="id">{{ label }}</label>
    <input
      :id="id"
      class="cockpit-input"
      type="text"
      inputmode="decimal"
      autocomplete="off"
      placeholder="VD: 1.000.000 hoặc 12.500,5"
      :value="modelValue"
      :disabled="disabled"
      :aria-label="ariaLabel"
      :aria-invalid="status.kind === 'error' ? 'true' : undefined"
      :aria-describedby="`${id}-hint`"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    >
    <p
      :id="`${id}-hint`"
      class="money-hint"
      :class="{ 'money-hint--ok': status.kind === 'ok', 'money-hint--error': status.kind === 'error' }"
      :data-testid="testId ? `${testId}-interpreted` : undefined"
    >
      <template v-if="status.kind === 'ok'">Hiểu là: {{ status.text }}</template>
      <template v-else-if="status.kind === 'error'">{{ status.text }}</template>
      <template v-else>"." ngăn cách hàng nghìn, "," là dấu thập phân.</template>
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { formatVnNumber, parseVnMoney } from '../../../utils/materials/vn-number'

interface Props {
  modelValue: string
  id: string
  label?: string
  ariaLabel?: string
  disabled?: boolean
  /** Used to build the data-testid of the interpreted-value line: `<testId>-interpreted`. */
  testId?: string
}

const props = withDefaults(defineProps<Props>(), {
  label: '',
  ariaLabel: undefined,
  disabled: false,
  testId: '',
})

const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>()

const status = computed<{ kind: 'empty' | 'ok' | 'error', text: string }>(() => {
  if (!props.modelValue.trim()) return { kind: 'empty', text: '' }
  const parsed = parseVnMoney(props.modelValue)
  return parsed.ok
    ? { kind: 'ok', text: formatVnNumber(parsed.value) }
    : { kind: 'error', text: parsed.message }
})
</script>

<style scoped>
.money-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.money-label { font-size: 0.78rem; font-weight: 600; color: #334155; }
.money-hint { margin: 0; font-size: 0.74rem; color: #64748b; }
.money-hint--ok { color: #047857; }
.money-hint--error { color: #991b1b; }
</style>
