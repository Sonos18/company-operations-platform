<script setup lang="ts">
definePageMeta({ authMode: 'authenticated', requiresCompany: false, layout: 'auth' })

const authStore = useNuxtApp().$authStore
const error = ref('')
const pending = ref(false)

async function retry(): Promise<void> {
  if (pending.value) return
  pending.value = true
  error.value = ''
  try { await authStore.refreshAppSession() }
  catch { error.value = 'Không thể cập nhật quyền truy cập. Vui lòng thử lại.' }
  finally { pending.value = false }
}

async function signOut(): Promise<void> {
  if (pending.value) return
  pending.value = true
  error.value = ''
  try { await authStore.signOut(); await navigateTo('/login') }
  catch { error.value = 'Không thể đăng xuất ngay bây giờ. Vui lòng thử lại.' }
  finally { pending.value = false }
}
</script>

<template>
  <section class="access-state">
    <p class="eyebrow">Quyền truy cập</p><h1>Bạn chưa có quyền truy cập công ty.</h1><p>Liên hệ quản trị viên để được cấp quyền phù hợp.</p>
    <AuthFormAlert v-if="error" :message="error" />
    <div><button type="button" :disabled="pending" @click="retry">{{ pending ? 'Đang thử lại…' : 'Thử lại' }}</button><button class="secondary-action" type="button" :disabled="pending" @click="signOut">Đăng xuất</button></div>
  </section>
</template>

<style scoped>
.access-state { display: grid; width: min(100%, 520px); gap: 15px; }.access-state h1 { font-size: clamp(2rem, 5vw, 2.7rem); }.access-state > p:not(.eyebrow) { color: var(--ink-muted); line-height: 1.55; }.access-state div { display: flex; flex-wrap: wrap; gap: 10px; }.access-state button { min-height: 44px; padding: 0 14px; border: 1px solid var(--forest); background: var(--forest); color: white; cursor: pointer; font: inherit; font-weight: 700; }.access-state .secondary-action { background: transparent; color: var(--forest); }.access-state button:disabled { cursor: wait; opacity: .65; }
</style>
