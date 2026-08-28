<script setup lang="ts">
import { signInInputSchema } from '../../../shared/schemas/auth'
import { sanitizeInternalRedirect } from '../../../shared/utils/app-url'
import { ClientError } from '../../errors/client-error'
import PasswordField from './PasswordField.vue'

const authStore = useNuxtApp().$authStore
const route = useRoute()
const email = ref('')
const password = ref('')
const fieldErrors = ref<Record<string, string>>({})
const formError = ref('')
const form = ref<HTMLFormElement | null>(null)
const submitting = computed(() => authStore.operations.signIn.status === 'pending')

function focusFirstInvalidField(): void {
  nextTick(() => form.value?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
}

function validate(): boolean {
  const parsed = signInInputSchema.safeParse({ email: email.value, password: password.value })
  if (parsed.success) return true

  fieldErrors.value = {}
  if (!email.value.trim()) fieldErrors.value.email = 'Email là bắt buộc.'
  if (!password.value) fieldErrors.value.password = 'Mật khẩu là bắt buộc.'
  for (const issue of parsed.error.issues) {
    const field = issue.path[0]
    if (field === 'email' && !fieldErrors.value.email) fieldErrors.value.email = 'Email hợp lệ là bắt buộc.'
    if (field === 'password' && !fieldErrors.value.password) fieldErrors.value.password = 'Mật khẩu là bắt buộc.'
  }
  focusFirstInvalidField()
  return false
}

async function submit(): Promise<void> {
  if (submitting.value) return
  fieldErrors.value = {}
  formError.value = ''
  if (!validate()) return

  try {
    await authStore.signIn({ email: email.value, password: password.value })
    await navigateTo(sanitizeInternalRedirect(route.query.redirect) ?? '/projects')
  }
  catch (error) {
    formError.value = error instanceof ClientError ? error.message : 'Không thể đăng nhập. Vui lòng thử lại.'
    password.value = ''
    focusFirstInvalidField()
  }
}
</script>

<template>
  <form ref="form" class="auth-form" novalidate @submit.prevent="submit">
    <div><p class="eyebrow">Chào mừng trở lại</p><h1>Đăng nhập</h1><p>Đăng nhập bằng tài khoản đã được mời vào Taskovia.</p></div>
    <AuthFormAlert v-if="formError" :message="formError" />
    <div class="auth-field"><label for="login-email">Email</label><input id="login-email" v-model="email" name="email" type="email" autocomplete="email" :disabled="submitting" :aria-invalid="Boolean(fieldErrors.email)" :aria-describedby="fieldErrors.email ? 'login-email-error' : undefined"><p v-if="fieldErrors.email" id="login-email-error" class="field-error">{{ fieldErrors.email }}</p></div>
    <PasswordField id="login-password" v-model="password" label="Mật khẩu" name="password" autocomplete="current-password" :disabled="submitting" :error="fieldErrors.password" />
    <button class="auth-form__submit" type="submit" :disabled="submitting">{{ submitting ? 'Đang đăng nhập…' : 'Đăng nhập' }}</button>
    <NuxtLink to="/forgot-password">Quên mật khẩu?</NuxtLink>
  </form>
</template>

<style scoped>
.auth-form { display: grid; width: min(100%, 430px); gap: 18px; }.auth-form > div:first-child { display: grid; gap: 8px; }.auth-form h1 { font-size: clamp(2rem, 5vw, 2.7rem); }.auth-form > div:first-child > p:last-child { color: var(--ink-muted); line-height: 1.55; }.auth-field { display: grid; gap: 6px; }.auth-field label { color: var(--forest-deep); font-size: .85rem; font-weight: 700; }.auth-field input { min-height: 44px; padding: 9px 10px; border: 1px solid var(--line); background: white; color: var(--ink); font: inherit; }.field-error { margin: 0; color: #a3442d; font-size: .8rem; }.auth-form__submit { min-height: 46px; border: 0; background: var(--forest); color: white; cursor: pointer; font: inherit; font-weight: 750; }.auth-form__submit:disabled { cursor: wait; opacity: .65; }.auth-form a { width: fit-content; color: var(--forest); font-size: .9rem; font-weight: 700; text-decoration: underline; text-underline-offset: 3px; }
</style>
