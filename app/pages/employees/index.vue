<script setup lang="ts">
import EmployeeTable from '../../components/employees/EmployeeTable.vue'
import type { EmployeeSummary } from '../../features/employees/employee.types'

const repositories = useRepositories()
const search = ref('')
const selectedDepartment = ref('all')
const selectedStatus = ref('all')
const { data: employees, pending, error, refresh } = await useAsyncData(
  'employee-directory',
  () => repositories.employees.list(),
  { default: (): EmployeeSummary[] => [] },
)

const departmentItems = computed(() => [
  { label: 'Tất cả phòng ban', value: 'all' },
  ...[...new Set(employees.value.map(employee => employee.department.name))]
    .sort((left, right) => left.localeCompare(right, 'vi'))
    .map(name => ({ label: name, value: name })),
])

const statusItems = [
  { label: 'Tất cả trạng thái', value: 'all' },
  { label: 'Đang làm việc', value: 'active' },
  { label: 'Thử việc', value: 'probation' },
  { label: 'Tạm nghỉ', value: 'on_leave' },
  { label: 'Đã nghỉ việc', value: 'terminated' },
]

const filteredEmployees = computed(() => {
  const query = search.value.trim().toLocaleLowerCase('vi')
  return employees.value.filter((employee) => {
    const matchesSearch = !query || [employee.fullName, employee.workEmail, employee.account?.email, employee.department.name]
      .filter((value): value is string => Boolean(value))
      .some(value => value.toLocaleLowerCase('vi').includes(query))
    const matchesDepartment = selectedDepartment.value === 'all' || employee.department.name === selectedDepartment.value
    const matchesStatus = selectedStatus.value === 'all' || employee.employmentStatus === selectedStatus.value
    return matchesSearch && matchesDepartment && matchesStatus
  })
})
</script>

<template>
  <section class="employees-page" aria-labelledby="employees-heading">
    <header class="page-heading">
      <div>
        <p class="eyebrow">Danh bạ nội bộ</p>
        <h1 id="employees-heading">Nhân sự</h1>
        <p>Tra cứu nhân sự, tài khoản, phòng ban và các vai trò đang hoạt động trong công ty.</p>
      </div>
      <div class="employee-count"><strong>{{ employees.length }}</strong><span>nhân sự</span></div>
    </header>

    <div class="directory-controls" aria-label="Lọc danh sách nhân sự">
      <UInput v-model="search" type="search" name="employee-search" aria-label="Tìm nhân sự" placeholder="Tìm theo tên hoặc email" icon="i-lucide-search" size="lg" />
      <USelect v-model="selectedDepartment" aria-label="Phòng ban" :items="departmentItems" size="lg" />
      <USelect v-model="selectedStatus" aria-label="Trạng thái" :items="statusItems" size="lg" />
    </div>

    <div v-if="pending" class="employee-loading" aria-label="Đang tải danh sách nhân sự">
      <USkeleton v-for="index in 4" :key="index" class="h-20 w-full" />
    </div>
    <UAlert v-else-if="error" role="alert" color="error" variant="subtle" icon="i-lucide-circle-alert" title="Không thể tải danh sách nhân sự" description="Vui lòng thử lại sau.">
      <template #actions><UButton class="employee-retry" color="error" variant="outline" size="md" @click="() => refresh()">Thử lại</UButton></template>
    </UAlert>
    <template v-else-if="employees.length">
      <EmployeeTable v-if="filteredEmployees.length" :employees="filteredEmployees" />
      <UAlert v-else color="neutral" variant="subtle" icon="i-lucide-search-x" title="Không tìm thấy nhân sự phù hợp." description="Hãy thay đổi từ khóa hoặc bộ lọc để xem lại danh sách." />
    </template>
    <UAlert v-else color="neutral" variant="subtle" icon="i-lucide-users" title="Chưa có nhân sự" description="Danh bạ sẽ hiển thị khi có dữ liệu nhân sự trong công ty." />
  </section>
</template>

<style scoped>
.employees-page { display: grid; gap: 18px; max-width: 1480px; margin: 0 auto; }.page-heading { display: flex; align-items: end; justify-content: space-between; gap: 24px; padding-bottom: 18px; border-bottom: 1px solid var(--line); }.page-heading h1 { margin: 4px 0 7px; font-size: clamp(2.5rem, 5vw, 5rem); line-height: .9; }.page-heading p:not(.eyebrow) { max-width: 680px; color: var(--ink-muted); }.employee-count { display: grid; min-width: 110px; padding: 13px 15px; border-left: 3px solid var(--coral); background: var(--paper-raised); }.employee-count strong { color: var(--forest); font-family: 'Space Grotesk Variable', sans-serif; font-size: 1.5rem; }.employee-count span { color: var(--ink-muted); font-size: .68rem; }
.directory-controls { display: grid; grid-template-columns: minmax(240px, 1fr) minmax(180px, .35fr) minmax(180px, .35fr); gap: 10px; }.directory-controls :deep(input),.directory-controls :deep(button),.employee-retry { min-height: 44px; }.employee-loading { display: grid; gap: 10px; }
@media (max-width: 767px) { .page-heading { align-items: start; }.employee-count { display: none; }.directory-controls { grid-template-columns: 1fr; }.employees-page { gap: 15px; } }
</style>
