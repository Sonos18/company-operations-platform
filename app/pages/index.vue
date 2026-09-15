<script setup lang="ts">
import { resolvePreferredRoute } from '../services/auth/access-policy'

await navigateTo(resolvePreferredRoute(useNuxtApp().$companyAccessStore.permissions), { replace: true })
</script>

<template><span class="sr-only">Đang mở danh sách dự án</span></template>
