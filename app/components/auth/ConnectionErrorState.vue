<script setup lang="ts">
defineProps<{ message?: string, retrying?: boolean, signingOut?: boolean }>()
defineEmits<{ retry: [], signOut: [] }>()
</script>

<template>
  <main class="connection-error" role="alert">
    <p class="eyebrow">Kết nối</p>
    <h1>Không thể xác minh quyền truy cập</h1>
    <p>{{ message ?? 'Vui lòng thử lại.' }}</p>
    <div>
      <button type="button" :disabled="retrying || signingOut" @click="$emit('retry')">{{ retrying ? 'Đang thử lại…' : 'Thử lại' }}</button>
      <button type="button" :disabled="retrying || signingOut" @click="$emit('signOut')">{{ signingOut ? 'Đang đăng xuất…' : 'Đăng xuất' }}</button>
    </div>
  </main>
</template>

<style scoped>
.connection-error { display: grid; min-height: 100vh; max-width: 680px; align-content: center; gap: 14px; padding: 24px; margin: auto; }.connection-error h1 { font-size: clamp(2rem, 6vw, 3.2rem); }.connection-error > p:not(.eyebrow) { color: var(--ink-muted); line-height: 1.55; }.connection-error div { display: flex; flex-wrap: wrap; gap: 10px; }.connection-error button { min-height: 44px; padding: 0 16px; border: 1px solid var(--forest); background: var(--forest); color: white; cursor: pointer; font: inherit; font-weight: 700; }.connection-error button + button { background: transparent; color: var(--forest); }.connection-error button:disabled { cursor: wait; opacity: .6; }
</style>
