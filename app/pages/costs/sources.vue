<script setup lang="ts">
import SourceWizard from '../../components/costs/SourceWizard.vue'
import type { AccountingSource } from '../../../shared/schemas/costs/sources'
definePageMeta({ requiredAnyPermissions: ['cost.source.read', 'cost.prepare'] })
const repositories = useRepositories()
const { data: sources, refresh } = await useAsyncData('accounting-sources', () => repositories.accountingSources.list(), { default: (): AccountingSource[] => [] })
</script>

<template>
  <section class="sources-page">
    <header><p class="eyebrow">C1 · Hồ sơ nguồn</p><h1>Nguồn kế toán</h1><p>File, vùng nguồn và số theo báo cáo được giữ riêng khỏi hồ sơ tài chính.</p></header>
    <SourceWizard @created="refresh" />
    <ul><li v-for="source in sources" :key="source.id"><strong>{{ source.code }}</strong> — {{ source.title }}</li></ul>
  </section>
</template>
