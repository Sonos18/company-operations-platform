<template>
  <div v-if="canRead" ref="bellRef" class="cost-notification-bell">
    <button
      type="button"
      class="bell-btn"
      :aria-expanded="isOpen"
      :aria-controls="panelId"
      :aria-label="bellLabel"
      @click="togglePanel"
    >
      <span class="bell-icon" aria-hidden="true">🔔</span>
      <span v-if="unreadCount > 0" class="badge">{{ unreadCount > 99 ? '99+' : unreadCount }}</span>
    </button>

    <div v-if="isOpen" :id="panelId" class="panel" role="region" aria-label="Danh sách thông báo">
      <div class="panel-header">
        <strong>{{ panelTitle }}</strong>
        <button type="button" class="link-btn" :disabled="loading" @click="loadNotifications">Làm mới</button>
      </div>

      <div v-if="loading" class="empty">Đang nạp thông báo...</div>
      <div v-else-if="entries.length === 0" class="empty">Không có thông báo nào.</div>
      <ul v-else class="list">
        <template v-for="entry in entries" :key="entry.key">
        <li
          v-if="entry.source === 'material'"
          class="item item--material"
          :class="{ unread: !entry.notification.readAt }"
          data-testid="material-notification"
        >
          <button
            type="button"
            class="item-open"
            :disabled="Boolean(openingMaterial)"
            @click="openMaterial(entry.notification)"
          >
            <span class="item-title">{{ entry.text.title }}</span>
            <span v-if="entry.text.body">{{ entry.text.body }}</span>
            <span class="item-date">{{ formatDate(entry.notification.createdAt) }}</span>
          </button>
        </li>
        <li
          v-else
          class="item"
          :class="{ unread: entry.notification.deliveryState === 'available' && !entry.notification.readAt, undelivered: entry.notification.deliveryState === 'undelivered' }"
        >
          <div class="item-content">
            <span class="item-title">{{ kindTitle(entry.notification.kind) }}</span>
            <span>Phê duyệt độc lập với xác nhận thu/chi thực tế.</span>
            <span class="item-date">{{ formatDate(entry.notification.createdAt) }}</span>
            <span v-if="entry.notification.deliveryState === 'undelivered'" class="pending-tag">Chưa nhận thông báo</span>
          </div>
          <div class="item-actions">
            <NuxtLink :to="{path: `/costs/${entry.notification.projectId}/requests/${entry.notification.requestId}`, query: {kind:entry.notification.kind,submittedVersionId:entry.notification.submittedVersionId}}" class="view-link" @click="markRead(entry.notification)">Xem hồ sơ đã duyệt</NuxtLink>
            <button
              v-if="entry.notification.deliveryState === 'available' && !entry.notification.readAt"
              type="button"
              class="ack-btn" :disabled="Boolean(acknowledging)"
              @click="markRead(entry.notification)"
            >
              Đã đọc
            </button>
          </div>
        </li>
        </template>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import type { WorkflowNotificationView } from '../../../shared/schemas/costs/cost-workflow'
import type { AppNotificationView } from '../../../shared/schemas/costs/material-finance'
import type { CostWorkflowRepository } from '../../repositories/cost-workflow.contracts'
import type { MaterialFinanceRepository } from '../../repositories/material-finance.contracts'
import { appNotificationText, type AppNotificationText } from '../../utils/notifications/app-notification-text'
import { createAsyncRequestTracker } from '../../utils/costs/async-request-tracker'


type NotificationEntry =
  | { source: 'cost', key: string, createdAt: string, notification: WorkflowNotificationView }
  | { source: 'material', key: string, createdAt: string, notification: AppNotificationView, text: AppNotificationText }

const repositories = useRepositories()
const repo: CostWorkflowRepository = repositories.costWorkflow
const materialRepo: MaterialFinanceRepository = repositories.materialFinance
const store = useNuxtApp().$companyAccessStore
const panelId = useId()
const bellRef = ref<HTMLElement | null>(null)

const isOpen = ref(false)
const loading = ref(false)
const notifications = ref<WorkflowNotificationView[]>([])
const materialNotifications = ref<AppNotificationView[]>([])
const openingMaterial = ref<string | null>(null)
const materialAckKeys = new Map<string, string>()

const tracker = createAsyncRequestTracker<{ fp: string }>()
const ackTracker = createAsyncRequestTracker<{ id: string; fp: string }>()
const materialTracker = createAsyncRequestTracker<{ id: string; fp: string }>()
const acknowledging=ref<string|null>(null)
const ackKeys = new Map<string, string>()

function getFingerprint(): string {
  const p = store?.permissions ? [...store.permissions].sort().join(',') : ''
  return `${store?.activeCompanyId || ''}::${p}`
}

function hasPermission(permission: 'cost.notification.read' | 'material.read'): boolean {
  if (!store?.activeCompanyId) return false
  return Boolean(store.hasPermission ? store.hasPermission(permission) : store.permissions?.includes(permission))
}

const canReadCost = computed(() => hasPermission('cost.notification.read'))
const canReadMaterial = computed(() => hasPermission('material.read'))
const canRead = computed(() => canReadCost.value || canReadMaterial.value)

const bellLabel = computed(() => canReadCost.value ? 'Thông báo phê duyệt khoản chi' : 'Thông báo vật tư')
const panelTitle = computed(() => canReadCost.value && canReadMaterial.value
  ? 'Thông báo'
  : canReadCost.value ? 'Thông báo phê duyệt chi' : 'Thông báo vật tư')

// Both sources merged newest-first. ISO timestamps with offsets are compared as instants.
const entries = computed<NotificationEntry[]>(() => {
  const merged: NotificationEntry[] = [
    ...notifications.value.map((notification): NotificationEntry => ({ source: 'cost', key: 'cost:' + notification.id, createdAt: notification.createdAt, notification })),
    ...materialNotifications.value.map((notification): NotificationEntry => ({ source: 'material', key: 'material:' + notification.id, createdAt: notification.createdAt, notification, text: appNotificationText(notification) })),
  ]
  return merged.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
})

const unreadCount = computed(() => {
  const cost = notifications.value.filter(n => n.deliveryState === 'available' && !n.readAt).length
  const material = materialNotifications.value.filter(n => !n.readAt).length
  return cost + material
})

function kindTitle(kind:WorkflowNotificationView['kind']):string {
 return {installment:'Quyết định đề nghị khoản chi',contract_adjustment:'Quyết định điều chỉnh hạn mức',refund:'Quyết định hoàn tiền',correction:'Quyết định hiệu chỉnh tiền chi'}[kind]
}
function formatDate(d: string): string {
  try {
    return new Date(d).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
  } catch { return d }
}

function clear() {
  tracker.invalidate(); ackTracker.invalidate(); materialTracker.invalidate()
  notifications.value = []; materialNotifications.value = []; isOpen.value = false; loading.value = false;ackKeys.clear();acknowledging.value=null
  materialAckKeys.clear(); openingMaterial.value = null
}

watch([() => store.activeCompanyId, () => getFingerprint()], () => {clear();if(import.meta.client&&canRead.value)void loadNotifications()}, {flush:'sync'})

async function loadNotifications() {
  if (!canRead.value) return
  const fp = getFingerprint()
  const token = tracker.start({ fp })
  loading.value = true
  try {
    // Each source is read independently so one failing source never hides the other.
    const [costResult, materialResult] = await Promise.allSettled([
      canReadCost.value ? repo.listNotifications() : Promise.resolve<WorkflowNotificationView[]>([]),
      canReadMaterial.value ? materialRepo.listNotifications() : Promise.resolve({ items: [] as AppNotificationView[] }),
    ])
    if (!token.isCurrent() || getFingerprint() !== fp) return
    notifications.value = costResult.status === 'fulfilled' ? costResult.value : []
    materialNotifications.value = materialResult.status === 'fulfilled' ? materialResult.value.items : []
  } finally {
    if (token.isCurrent() && getFingerprint() === fp) loading.value = false
  }
}

function togglePanel() {
  isOpen.value = !isOpen.value
  if (isOpen.value) loadNotifications()
}

async function markRead(n: WorkflowNotificationView) {
  if (!canReadCost.value || acknowledging.value || !notifications.value.some(value=>value.id===n.id) || n.deliveryState !== 'available' || n.readAt) return
  acknowledging.value=n.id
  if (!ackKeys.has(n.id)) ackKeys.set(n.id, crypto.randomUUID())
  const fp = getFingerprint()
  const token = ackTracker.start({ id: n.id, fp })
  try {
    await repo.markNotificationRead(n.id, { idempotencyKey: ackKeys.get(n.id)! })
    if (!token.isCurrent() || getFingerprint() !== fp) return
    n.readAt = new Date().toISOString()
  } catch { /* Keep the acknowledgement key for an uncertain response. */ }
  finally{if(token.isCurrent()&&getFingerprint()===fp)acknowledging.value=null}
}

async function openMaterial(n: AppNotificationView) {
  if (!canReadMaterial.value || openingMaterial.value) return
  openingMaterial.value = n.id
  const fp = getFingerprint()
  const token = materialTracker.start({ id: n.id, fp })
  try {
    if (!n.readAt) {
      if (!materialAckKeys.has(n.id)) materialAckKeys.set(n.id, crypto.randomUUID())
      try {
        await materialRepo.readNotification(n.id, { idempotencyKey: materialAckKeys.get(n.id)! })
        if (token.isCurrent() && getFingerprint() === fp) n.readAt = new Date().toISOString()
      } catch { /* Keep the acknowledgement key for an uncertain response; still open the target. */ }
    }
    if (!token.isCurrent() || getFingerprint() !== fp) return
    isOpen.value = false
    await navigateTo(n.linkPath)
  } finally {
    if (token.isCurrent() && getFingerprint() === fp) openingMaterial.value = null
  }
}

function onKeydown(e: KeyboardEvent) { if (e.key === 'Escape') isOpen.value = false }
function onClickOutside(e: MouseEvent) {
  if (bellRef.value && !bellRef.value.contains(e.target as Node)) isOpen.value = false
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  document.addEventListener('click', onClickOutside)
  if (canRead.value) loadNotifications()
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  document.removeEventListener('click', onClickOutside)
  tracker.invalidate()
  ackTracker.invalidate()
  materialTracker.invalidate()
})
</script>

<style scoped>
.cost-notification-bell { position: relative; display: inline-block; }
.bell-btn { position: relative; background: none; border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 10px; cursor: pointer; }
.badge { position: absolute; top: -6px; right: -6px; background: #dc2626; color: #fff; font-size: 11px; padding: 1px 5px; border-radius: 999px; }
.panel { position: absolute; right: 0; top: 110%; width: min(320px,calc(100vw - 32px)); background: #fff; border: 1px solid #cbd5e1; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); z-index: 100; max-height: 400px; display: flex; flex-direction: column; }
.panel-header { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
.link-btn { font-size: 12px; background: none; border: none; color: #2563eb; cursor: pointer; }
.list { list-style: none; margin: 0; padding: 0; overflow-y: auto; }
.item { padding: 8px 12px; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; gap: 8px; font-size: 12px; }
.item.unread { background: #f0f9ff; font-weight: 500; }
.item-content { display: flex; flex-direction: column; gap: 2px; }
.item-date { color: #64748b; font-size: 11px; }
.pending-tag { font-size: 10px; color: #d97706; }
.item-actions { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
.view-link { color: #2563eb; text-decoration: none; }
.item-open { display: flex; flex-direction: column; gap: 2px; width: 100%; text-align: left; background: none; border: none; padding: 0; font: inherit; color: inherit; cursor: pointer; }
.item-open:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
.ack-btn { font-size: 11px; padding: 2px 6px; border: 1px solid #cbd5e1; border-radius: 4px; background: #fff; cursor: pointer; }
.empty { padding: 16px; text-align: center; color: #64748b; font-size: 13px; }
</style>