<script setup lang="ts">
import { vi } from '@nuxt/ui/locale'
import { revalidateAccessAfterAuthAction } from './middleware/access.global'
import ConnectionErrorState from './components/auth/ConnectionErrorState.vue'

const nuxtApp = useNuxtApp()
const authStore = import.meta.client ? nuxtApp.$authStore : null
const route = useRoute()
const lifecycle = computed(() => authStore?.lifecycle ?? 'bootstrapping')
const isBootstrapping = computed(() => lifecycle.value === 'idle' || lifecycle.value === 'bootstrapping')
const isConnectionError = computed(() => lifecycle.value === 'connection_error')
const connectionError = computed(() => authStore?.operations.refreshAppSession.error?.message
  ?? authStore?.operations.initialize.error?.message
  ?? undefined)
const retryingConnection = computed(() => authStore?.operations.refreshAppSession.status === 'pending')
const signingOut = computed(() => authStore?.operations.signOut.status === 'pending')

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
    <ConnectionErrorState
      v-else-if="isConnectionError"
      :message="connectionError"
      :retrying="retryingConnection"
      :signing-out="signingOut"
      @retry="retryConnection"
      @sign-out="signOut"
    />
    <NuxtLayout v-else>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
