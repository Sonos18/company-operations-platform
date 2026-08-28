<script setup lang="ts">
import ForgotPasswordForm from '../components/auth/ForgotPasswordForm.vue'

definePageMeta({ authMode: 'guest', requiresCompany: false, layout: 'auth' })
</script>

<template><ForgotPasswordForm /></template>
