<script setup lang="ts">
definePageMeta({ authMode: 'authenticated', requiresCompany: false, layout: 'auth' })

const authStore = useNuxtApp().$authStore
const error = ref('')
const pending = ref(false)

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
    <p class="eyebrow">Quyền truy cập</p><h1>Bạn không có quyền thực hiện thao tác này.</h1><p>Hãy quay lại danh sách dự án hoặc liên hệ quản trị viên nếu bạn cần thêm quyền.</p>
    <AuthFormAlert v-if="error" :message="error" />
    <div><NuxtLink to="/projects">Quay lại dự án</NuxtLink><button class="secondary-action" type="button" :disabled="pending" @click="signOut">{{ pending ? 'Đang đăng xuất…' : 'Đăng xuất' }}</button></div>
  </section>
</template>

<style scoped>
.access-state { display: grid; width: min(100%, 520px); gap: 15px; }.access-state h1 { font-size: clamp(2rem, 5vw, 2.7rem); }.access-state > p:not(.eyebrow) { color: var(--ink-muted); line-height: 1.55; }.access-state div { display: flex; flex-wrap: wrap; gap: 10px; }.access-state a,.access-state button { display: inline-grid; min-height: 44px; align-items: center; padding: 0 14px; border: 1px solid var(--forest); background: var(--forest); color: white; cursor: pointer; font: inherit; font-weight: 700; }.access-state .secondary-action { background: transparent; color: var(--forest); }.access-state button:disabled { cursor: wait; opacity: .65; }
</style>
