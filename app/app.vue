<script setup lang="ts">
import { vi } from '@nuxt/ui/locale'
</script>

<template>
  <UApp :locale="vi">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
