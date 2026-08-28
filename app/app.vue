<script setup lang="ts">
import { vi } from '@nuxt/ui/locale'
import { revalidateAccessAfterAuthAction } from './middleware/access.global'

const nuxtApp = useNuxtApp()
const authStore = import.meta.client ? nuxtApp.$authStore : null
const route = useRoute()
const lifecycle = computed(() => authStore?.lifecycle ?? 'bootstrapping')
const isBootstrapping = computed(() => lifecycle.value === 'idle' || lifecycle.value === 'bootstrapping')
const isConnectionError = computed(() => lifecycle.value === 'connection_error')

async function retryConnection(): Promise<void> {
  try {
    await authStore?.retryConnection()
  }
  catch {
    // The store keeps the fail-closed connection state and its safe error details.
  }
  finally {
    await revalidateAccessAfterAuthAction(lifecycle.value, () => reloadNuxtApp({ path: route.fullPath, force: true }))
  }
}

async function signOut(): Promise<void> {
  try {
    await authStore?.signOut()
  }
  catch {
    // Sign-out clears local application state even if the provider call fails.
  }
  finally {
    await revalidateAccessAfterAuthAction(lifecycle.value, () => reloadNuxtApp({ path: route.fullPath, force: true }))
  }
}
</script>

<template>
  <UApp :locale="vi">
    <main v-if="isBootstrapping" aria-busy="true" aria-live="polite">
      Đang xác thực phiên làm việc…
    </main>
    <main v-else-if="isConnectionError" role="alert">
      <p>Không thể xác minh quyền truy cập. Vui lòng thử lại.</p>
      <UButton @click="retryConnection">Thử lại</UButton>
      <UButton variant="ghost" @click="signOut">Đăng xuất</UButton>
    </main>
    <NuxtLayout v-else>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
