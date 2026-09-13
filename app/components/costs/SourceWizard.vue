<script setup lang="ts">
const emit = defineEmits<{ created: [] }>()
const repositories = useRepositories()
const code = ref('')
const title = ref('')
const pending = ref(false)
const error = ref('')
async function submit() {
  pending.value = true; error.value = ''
  try { await repositories.accountingSources.create({ code: code.value, title: title.value, sourceSystem: 'manual_upload' }); emit('created') } catch { error.value = 'Không thể tạo hồ sơ nguồn.' } finally { pending.value = false }
}
</script>

<template>
  <form class="source-wizard" @submit.prevent="submit">
    <h2>Tạo hồ sơ nguồn</h2>
    <p>Nguồn có thể được lưu trước khi xác định project, đối tác hoặc giao khoán. Việc này không tạo số liệu tài chính.</p>
    <UInput v-model="code" required name="source-code" label="Mã nguồn" />
    <UInput v-model="title" required name="source-title" label="Tên nguồn" />
    <UAlert v-if="error" color="error" :title="error" />
    <UButton type="submit" :loading="pending">Lưu hồ sơ nguồn</UButton>
  </form>
</template>
