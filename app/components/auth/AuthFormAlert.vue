<script setup lang="ts">
defineProps<{ message: string }>()
</script>

<template>
  <p class="auth-form-alert" role="alert">{{ message }}</p>
</template>

<style scoped>
.auth-form-alert { margin: 0; padding: 10px 12px; border: 1px solid #d87d68; background: #fff4f1; color: #87372e; font-size: .875rem; line-height: 1.45; }
</style>
