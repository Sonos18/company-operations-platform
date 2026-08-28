<script setup lang="ts">
definePageMeta({ authMode: 'authenticated', requiresCompany: false, layout: 'auth' })

const nuxtApp = useNuxtApp()
const companyAccessStore = nuxtApp.$companyAccessStore
const authStore = nuxtApp.$authStore
const error = ref('')
const submitting = ref(false)

async function selectCompany(companyId: string): Promise<void> {
  if (submitting.value) return
  error.value = ''
  submitting.value = true
  try {
    if (!companyAccessStore.selectCompany(companyId)) {
      error.value = 'Không thể chọn công ty này. Vui lòng thử lại.'
      return
    }
    await navigateTo('/projects')
  }
  finally { submitting.value = false }
}

async function signOut(): Promise<void> {
  if (submitting.value) return
  submitting.value = true
  error.value = ''
  try { await authStore.signOut(); await navigateTo('/login') }
  catch { error.value = 'Không thể đăng xuất ngay bây giờ. Vui lòng thử lại.' }
  finally { submitting.value = false }
}
</script>

<template>
  <section class="access-state">
    <p class="eyebrow">Không gian làm việc</p>
    <h1>Chọn công ty</h1>
    <p>Chọn công ty bạn muốn làm việc trong phiên này.</p>
    <AuthFormAlert v-if="error" :message="error" />
    <ul aria-label="Danh sách công ty">
      <li v-for="company in companyAccessStore.companies" :key="company.companyId">
        <button type="button" :disabled="submitting" @click="selectCompany(company.companyId)"><strong>{{ company.companyName }}</strong><span>{{ company.companyCode }}</span></button>
      </li>
    </ul>
    <button class="secondary-action" type="button" :disabled="submitting" @click="signOut">Đăng xuất</button>
  </section>
</template>

<style scoped>
.access-state { display: grid; width: min(100%, 520px); gap: 15px; }.access-state h1 { font-size: clamp(2rem, 5vw, 2.7rem); }.access-state > p:not(.eyebrow) { color: var(--ink-muted); line-height: 1.55; }.access-state ul { display: grid; gap: 10px; padding: 0; margin: 0; list-style: none; }.access-state li button { display: grid; width: 100%; gap: 4px; padding: 14px; border: 1px solid var(--line); background: white; color: var(--forest-deep); cursor: pointer; text-align: left; font: inherit; }.access-state li button:hover { border-color: var(--forest); }.access-state li button span { color: var(--ink-muted); font-size: .8rem; }.secondary-action { width: fit-content; min-height: 44px; padding: 0 14px; border: 1px solid var(--forest); background: transparent; color: var(--forest); cursor: pointer; font: inherit; font-weight: 700; }.access-state button:disabled { cursor: wait; opacity: .65; }
</style>
