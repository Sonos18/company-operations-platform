<script setup lang="ts">
const props = withDefaults(defineProps<{
  id: string
  label: string
  name: string
  autocomplete: string
  error?: string
  disabled?: boolean
}>(), { error: '', disabled: false })

const model = defineModel<string>({ default: '' })
const visible = ref(false)
const descriptionId = computed(() => props.error ? `${props.id}-error` : undefined)
</script>

<template>
  <div class="password-field">
    <label :for="id">{{ label }}</label>
    <div class="password-field__input">
      <input
        :id="id"
        v-model="model"
        :name="name"
        :type="visible ? 'text' : 'password'"
        :autocomplete="autocomplete"
        :disabled="disabled"
        :aria-invalid="Boolean(error)"
        :aria-describedby="descriptionId"
      >
      <button
        type="button"
        :disabled="disabled"
        :aria-label="visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'"
        @click="visible = !visible"
      >{{ visible ? 'Ẩn' : 'Hiện' }}</button>
    </div>
    <p v-if="error" :id="`${id}-error`" class="field-error">{{ error }}</p>
  </div>
</template>

<style scoped>
.password-field { display: grid; gap: 6px; }
.password-field label { color: var(--color-text-primary); font-size: .85rem; font-weight: 650; }
.password-field__input {
  display: flex;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: white;
  transition: border-color 150ms ease, box-shadow 150ms ease;
}
.password-field__input:focus-within {
  border-color: var(--color-primary);
  box-shadow: var(--focus-box-shadow);
}
.password-field input {
  min-width: 0;
  flex: 1;
  min-height: 44px;
  padding: 9px 12px;
  border: 0;
  background: transparent;
  color: var(--color-text-primary);
  font: inherit;
  outline: none;
}
.password-field button {
  min-width: 52px;
  border: 0;
  border-left: 1px solid var(--color-border-light);
  background: transparent;
  color: var(--color-primary);
  cursor: pointer;
  font: inherit;
  font-size: .8rem;
  font-weight: 650;
  transition: background-color 150ms ease;
}
.password-field button:hover:not(:disabled) {
  background: var(--color-hover);
}
.password-field button:disabled { cursor: wait; opacity: .55; }
.field-error { margin: 0; color: var(--color-danger); font-size: .8rem; }
</style>
