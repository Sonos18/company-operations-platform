<script setup lang="ts">
import LoginForm from '../components/auth/LoginForm.vue'

definePageMeta({ authMode: 'guest', requiresCompany: false, layout: 'auth' })
</script>

<template><LoginForm /></template>
