<script setup lang="ts">
import ResetPasswordForm from '../components/auth/ResetPasswordForm.vue'

definePageMeta({ authMode: 'recovery', requiresCompany: false, layout: 'auth' })
</script>

<template><ResetPasswordForm /></template>
