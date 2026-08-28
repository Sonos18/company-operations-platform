<script setup lang="ts">
import { authCallbackQuerySchema } from '../../../shared/schemas/auth'
import { ClientError } from '../../errors/client-error'

definePageMeta({ authMode: 'recovery', requiresCompany: false, layout: 'auth' })

const authStore = useNuxtApp().$authStore
const route = useRoute()
const status = ref<'loading' | 'error'>('loading')
const message = ref('Đang xác minh liên kết bảo mật…')

onMounted(async () => {
  const parsed = authCallbackQuerySchema.safeParse(route.query)

  window.history.replaceState(window.history.state, '', '/auth/callback')
  if (!parsed.success) {
    status.value = 'error'
    message.value = 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.'
    return
  }

  try {
    await authStore.completeEmailCallback(parsed.data)
    await navigateTo('/reset-password', { replace: true })
  }
  catch (error) {
    status.value = 'error'
    message.value = error instanceof ClientError ? error.message : 'Không thể xác minh liên kết. Vui lòng yêu cầu một liên kết mới.'
  }
})
</script>

<template>
  <section class="callback-state" :aria-busy="status === 'loading'">
    <p class="eyebrow">Xác minh bảo mật</p>
    <h1>{{ status === 'loading' ? 'Đang xác minh liên kết' : 'Không thể xác minh liên kết' }}</h1>
    <p role="alert">{{ message }}</p>
    <NuxtLink v-if="status === 'error'" to="/forgot-password">Yêu cầu liên kết mới</NuxtLink>
  </section>
</template>

<style scoped>
.callback-state { display: grid; width: min(100%, 430px); gap: 14px; }.callback-state h1 { font-size: clamp(2rem, 5vw, 2.7rem); }.callback-state > p:last-of-type { color: var(--ink-muted); line-height: 1.55; }.callback-state a { width: fit-content; color: var(--forest); font-weight: 700; text-decoration: underline; text-underline-offset: 3px; }
</style>
