<script setup lang="ts">
import CostDirectory from './costs/index.vue'

definePageMeta({ requiredPermission: 'cost.request.read' })
</script>

<template>
  <CostDirectory />
</template>
