<script setup lang="ts">
import { resetPasswordInputSchema } from '../../../shared/schemas/auth'
import { ClientError } from '../../errors/client-error'
import PasswordField from './PasswordField.vue'

const authStore = useNuxtApp().$authStore
const password = ref('')
const confirmation = ref('')
const fieldErrors = ref<Record<string, string>>({})
const formError = ref('')
const form = ref<HTMLFormElement | null>(null)
const submitting = computed(() => authStore.operations.completePasswordReset.status === 'pending')

function focusFirstInvalidField(): void {
  nextTick(() => form.value?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
}

function validate(): boolean {
  const parsed = resetPasswordInputSchema.safeParse({ password: password.value, confirmation: confirmation.value })
  if (parsed.success) return true
  fieldErrors.value = {}
  for (const issue of parsed.error.issues) {
    const field = issue.path[0]
    if (field === 'password') fieldErrors.value.password = 'Mật khẩu phải có từ 12 đến 72 ký tự và không chỉ gồm khoảng trắng.'
    if (field === 'confirmation') fieldErrors.value.confirmation = 'Xác nhận mật khẩu phải trùng khớp.'
  }
  focusFirstInvalidField()
  return false
}

async function submit(): Promise<void> {
  if (submitting.value) return
  formError.value = ''
  fieldErrors.value = {}
  if (!validate()) return
  try {
    await authStore.completePasswordReset({ password: password.value, confirmation: confirmation.value })
    password.value = ''
    confirmation.value = ''
    await navigateTo('/projects')
  }
  catch (error) {
    password.value = ''
    confirmation.value = ''
    formError.value = error instanceof ClientError ? error.message : 'Không thể đặt lại mật khẩu. Vui lòng thử lại.'
  }
}
</script>

<template>
  <form ref="form" class="auth-form" novalidate @submit.prevent="submit">
    <div><p class="eyebrow">Bảo mật tài khoản</p><h1>Đặt lại mật khẩu</h1><p>Chọn mật khẩu mới có từ 12 đến 72 ký tự.</p></div>
    <AuthFormAlert v-if="formError" :message="formError" />
    <PasswordField id="reset-password" v-model="password" label="Mật khẩu mới" name="password" autocomplete="new-password" :disabled="submitting" :error="fieldErrors.password" />
    <PasswordField id="reset-confirmation" v-model="confirmation" label="Xác nhận mật khẩu mới" name="confirmation" autocomplete="new-password" :disabled="submitting" :error="fieldErrors.confirmation" />
    <button class="auth-form__submit" type="submit" :disabled="submitting">{{ submitting ? 'Đang cập nhật…' : 'Cập nhật mật khẩu' }}</button>
  </form>
</template>

<style scoped>
.auth-form { display: grid; width: min(100%, 430px); gap: 18px; }.auth-form > div:first-child { display: grid; gap: 8px; }.auth-form h1 { font-size: clamp(2rem, 5vw, 2.7rem); }.auth-form > div:first-child > p:last-child { color: var(--ink-muted); line-height: 1.55; }.auth-form__submit { min-height: 46px; border: 0; background: var(--forest); color: white; cursor: pointer; font: inherit; font-weight: 750; }.auth-form__submit:disabled { cursor: wait; opacity: .65; }
</style>
