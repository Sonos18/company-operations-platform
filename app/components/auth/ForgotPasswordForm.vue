<script setup lang="ts">
import { forgotPasswordInputSchema } from '../../../shared/schemas/auth'

const genericSuccessMessage = 'Nếu email tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã được gửi.'
const authStore = useNuxtApp().$authStore
const email = ref('')
const emailError = ref('')
const success = ref(false)
const form = ref<HTMLFormElement | null>(null)
const submitting = computed(() => authStore.operations.requestPasswordReset.status === 'pending')

async function submit(): Promise<void> {
  if (submitting.value) return
  success.value = false
  const parsed = forgotPasswordInputSchema.safeParse({ email: email.value })
  if (!parsed.success) {
    emailError.value = !email.value.trim() ? 'Email là bắt buộc.' : 'Email hợp lệ là bắt buộc.'
    await nextTick()
    form.value?.querySelector<HTMLInputElement>('#forgot-email')?.focus()
    return
  }

  emailError.value = ''
  try { await authStore.requestPasswordReset({ email: email.value }) }
  catch { /* The visible response remains generic to prevent account enumeration. */ }
  success.value = true
}
</script>

<template>
  <form ref="form" class="auth-form" novalidate @submit.prevent="submit">
    <div><p class="eyebrow">Khôi phục truy cập</p><h1>Quên mật khẩu</h1><p>Chúng tôi sẽ gửi hướng dẫn đến email của bạn nếu tài khoản tồn tại.</p></div>
    <p v-if="success" class="auth-form__success" role="status">{{ genericSuccessMessage }}</p>
    <div class="auth-field"><label for="forgot-email">Email</label><input id="forgot-email" v-model="email" name="email" type="email" autocomplete="email" :disabled="submitting" :aria-invalid="Boolean(emailError)" :aria-describedby="emailError ? 'forgot-email-error' : undefined"><p v-if="emailError" id="forgot-email-error" class="field-error">{{ emailError }}</p></div>
    <button class="auth-form__submit" type="submit" :disabled="submitting">{{ submitting ? 'Đang gửi…' : 'Gửi hướng dẫn' }}</button>
    <NuxtLink to="/login">Quay lại đăng nhập</NuxtLink>
  </form>
</template>

<style scoped>
.auth-form { display: grid; width: min(100%, 430px); gap: 18px; }.auth-form > div:first-child { display: grid; gap: 8px; }.auth-form h1 { font-size: clamp(2rem, 5vw, 2.7rem); }.auth-form > div:first-child > p:last-child { color: var(--ink-muted); line-height: 1.55; }.auth-field { display: grid; gap: 6px; }.auth-field label { color: var(--forest-deep); font-size: .85rem; font-weight: 700; }.auth-field input { min-height: 44px; padding: 9px 10px; border: 1px solid var(--line); background: white; color: var(--ink); font: inherit; }.field-error { margin: 0; color: #a3442d; font-size: .8rem; }.auth-form__success { margin: 0; padding: 10px 12px; border: 1px solid #7eb89d; background: #ecfff9; color: #135b49; line-height: 1.45; }.auth-form__submit { min-height: 46px; border: 0; background: var(--forest); color: white; cursor: pointer; font: inherit; font-weight: 750; }.auth-form__submit:disabled { cursor: wait; opacity: .65; }.auth-form a { width: fit-content; color: var(--forest); font-size: .9rem; font-weight: 700; text-decoration: underline; text-underline-offset: 3px; }
</style>
