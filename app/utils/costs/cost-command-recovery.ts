/**
 * Cost Command Recovery & Idempotency Lifecycle
 *
 * Implements deterministic client-side idempotency tracking, pre-dispatch fail-closed
 * storage verification, minimal non-financial marker persistence, and safe recovery.
 */

export interface UnresolvedCommandMarker {
  companyId: string
  actorId: string
  operation: string
  targetId: string
  idempotencyKey: string
  timestamp: number
}

export type UnresolvedState =
  | 'none'
  | 'unresolved_with_payload'
  | 'unresolved_payload_lost'
  | 'unresolved_marker_corrupted'
  | 'unresolved_storage_unreadable'

export type MarkerInspectionResult =
  | { status: 'absent' }
  | { status: 'valid'; marker: UnresolvedCommandMarker }
  | { status: 'unreadable'; error: string }
  | { status: 'corrupted'; error: string }

// In-memory volatile store for immutable serialized request snapshots
const memoryCommandSnapshots = new Map<string, { idempotencyKey: string; payloadSnapshot: Record<string, unknown>; timestamp: number }>()

function buildScopeKey(companyId: string, actorId: string, operation: string, targetId: string): string {
  return `taskovia:unresolved:${companyId}:${actorId}:${operation}:${targetId}`
}

/**
 * Checks whether browser session storage is available, readable, and writable.
 * Fails closed if sessionStorage throws, is unreadable, or is blocked.
 * Note: sessionStorage is scoped to the current tab session only.
 */
export function isRecoveryStorageAvailable(): boolean {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return false
    const probeKey = '__taskovia_storage_probe__'
    window.sessionStorage.setItem(probeKey, '1')
    const val = window.sessionStorage.getItem(probeKey)
    window.sessionStorage.removeItem(probeKey)
    return val === '1'
  }
  catch {
    return false
  }
}

/**
 * Persists a minimal non-financial marker to sessionStorage.
 * Throws if storage is unavailable or write verification fails.
 */
export function persistUnresolvedMarker(marker: UnresolvedCommandMarker): void {
  if (!isRecoveryStorageAvailable()) {
    throw new Error('STORAGE_UNAVAILABLE')
  }
  try {
    const key = buildScopeKey(marker.companyId, marker.actorId, marker.operation, marker.targetId)
    window.sessionStorage.setItem(key, JSON.stringify(marker))
    const verified = window.sessionStorage.getItem(key)
    if (!verified) {
      throw new Error('STORAGE_WRITE_FAILED')
    }
  }
  catch (e) {
    if ((e as Error)?.message === 'STORAGE_WRITE_FAILED') {
      throw e
    }
    throw new Error('STORAGE_WRITE_FAILED', { cause: e })
  }
}

/**
 * Registers the in-memory immutable request snapshot.
 */
export function registerMemoryPayloadSnapshot(
  companyId: string,
  actorId: string,
  operation: string,
  targetId: string,
  idempotencyKey: string,
  payload: Record<string, unknown>,
): void {
  const key = buildScopeKey(companyId, actorId, operation, targetId)
  memoryCommandSnapshots.set(key, {
    idempotencyKey,
    payloadSnapshot: Object.freeze(JSON.parse(JSON.stringify(payload))),
    timestamp: Date.now(),
  })
}

/**
 * Clears both the in-memory snapshot and sessionStorage marker upon confirmed resolution
 * (either 2xx success or definitively rejected client-side / business error where no server mutation occurred).
 */
export function clearCommandRecord(companyId: string, actorId: string, operation: string, targetId: string): void {
  const key = buildScopeKey(companyId, actorId, operation, targetId)
  memoryCommandSnapshots.delete(key)
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.removeItem(key)
    }
  }
  catch {
    // Ignore storage clear errors on resolution
  }
}

/**
 * Deeply inspects the unresolved marker in sessionStorage, distinguishing
 * absent state from storage read failures (unreadable) or JSON/schema corruption (corrupted).
 */
export function inspectUnresolvedMarker(
  companyId: string,
  actorId: string,
  operation: string,
  targetId: string,
): MarkerInspectionResult {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    return { status: 'unreadable', error: 'Storage is not available in current environment' }
  }
  const key = buildScopeKey(companyId, actorId, operation, targetId)
  let raw: string | null
  try {
    raw = window.sessionStorage.getItem(key)
  }
  catch (e) {
    return { status: 'unreadable', error: (e as Error)?.message || 'Storage read threw an error' }
  }

  if (raw === null) {
    return { status: 'absent' }
  }

  try {
    const parsed = JSON.parse(raw)
    if (
      !parsed
      || typeof parsed !== 'object'
      || typeof parsed.companyId !== 'string'
      || !parsed.companyId
      || typeof parsed.actorId !== 'string'
      || !parsed.actorId
      || typeof parsed.operation !== 'string'
      || !parsed.operation
      || typeof parsed.targetId !== 'string'
      || !parsed.targetId
      || typeof parsed.idempotencyKey !== 'string'
      || !parsed.idempotencyKey
      || typeof parsed.timestamp !== 'number'
      || Number.isNaN(parsed.timestamp)
    ) {
      return { status: 'corrupted', error: 'Marker structure is invalid or missing required fields' }
    }
    return { status: 'valid', marker: parsed as UnresolvedCommandMarker }
  }
  catch (e) {
    return { status: 'corrupted', error: (e as Error)?.message || 'Marker payload contains invalid JSON' }
  }
}

/**
 * Reads any existing unresolved marker for the given scope from sessionStorage.
 * Treats unreadable storage or malformed content as not returning a valid marker.
 */
export function readUnresolvedMarker(
  companyId: string,
  actorId: string,
  operation: string,
  targetId: string,
): UnresolvedCommandMarker | null {
  const result = inspectUnresolvedMarker(companyId, actorId, operation, targetId)
  return result.status === 'valid' ? result.marker : null
}

/**
 * Reads the retained in-memory snapshot if available.
 */
export function readRetainedPayload(
  companyId: string,
  actorId: string,
  operation: string,
  targetId: string,
): { idempotencyKey: string; payloadSnapshot: Record<string, unknown> } | null {
  const key = buildScopeKey(companyId, actorId, operation, targetId)
  const item = memoryCommandSnapshots.get(key)
  if (!item) return null
  return { idempotencyKey: item.idempotencyKey, payloadSnapshot: item.payloadSnapshot }
}

/**
 * Evaluates the unresolved recovery state for a given operation.
 * Distinguishes absent markers from corrupted or unreadable storage.
 */
export function evaluateUnresolvedState(
  companyId: string,
  actorId: string,
  operation: string,
  targetId: string,
): UnresolvedState {
  const inspection = inspectUnresolvedMarker(companyId, actorId, operation, targetId)
  if (inspection.status === 'absent') {
    return 'none'
  }
  if (inspection.status === 'unreadable') {
    return 'unresolved_storage_unreadable'
  }
  if (inspection.status === 'corrupted') {
    return 'unresolved_marker_corrupted'
  }

  const memory = readRetainedPayload(companyId, actorId, operation, targetId)
  if (memory && memory.idempotencyKey === inspection.marker.idempotencyKey) {
    return 'unresolved_with_payload'
  }
  return 'unresolved_payload_lost'
}

/**
 * Determines whether an error response from the server is a definitive rejection
 * (i.e. server definitely did not commit the mutation, so form remains editable without locking)
 * versus an unknown outcome (network drop, timeout, server crash mid-flight) or an IDEMPOTENCY_CONFLICT.
 *
 * NOTE: IDEMPOTENCY_CONFLICT (HTTP 409) indicates the key was seen by the server; it must NOT be cleared.
 * HTTP 409 responses are NEVER blanket-classified as safe to clear.
 */
export function isDefinitivelyRejectedError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const errorObj = err as { statusCode?: number; status?: number; code?: string; reason?: string; message?: string }
  const status = errorObj.statusCode || errorObj.status
  const code = errorObj.code || errorObj.reason
  const message = typeof errorObj.message === 'string' ? errorObj.message : ''

  // 1. Explicitly check for IDEMPOTENCY_CONFLICT -> MUST RETAIN MARKER, NOT DEFINITIVELY REJECTED
  if (code === 'IDEMPOTENCY_CONFLICT' || message.includes('IDEMPOTENCY_CONFLICT')) {
    return false
  }

  // 2. Specific known business / version conflict rejections where server definitely did not mutate
  if (code === 'PROJECT_COMPLETED' || code === 'VERSION_CONFLICT') return true
  if (code === 'COST_DETAIL_PUBLISH_NOT_READY' || code === 'COST_PUBLISH_NOT_READY') return true
  if (code === 'COST_DETAIL_NOT_DRAFT' || code === 'COST_DETAIL_ALREADY_PUBLISHED' || code === 'COST_DETAIL_NOT_PUBLISHED' || code === 'COST_NOT_DRAFT' || code === 'COST_ALREADY_PUBLISHED') return true
  if (code === 'SUBCONTRACT_COST_MODEL_UNSUPPORTED') return true
  if (code === 'FINANCIAL_DETAILS_REQUIRED' || code === 'FILE_TOO_LARGE' || code === 'FILE_TYPE_UNSUPPORTED' || code === 'EVIDENCE_UPLOAD_MISMATCH') return true
  if (code === 'INPUT_INVALID' || code === 'VALIDATION_ERROR') return true
  if (code === 'PERMISSION_DENIED' || code === 'COMPANY_FORBIDDEN' || code === 'UNAUTHENTICATED') return true
  if (code === 'RESOURCE_NOT_FOUND' || code === 'NOT_FOUND') return true

  // 3. Definite client validation & authorization HTTP statuses (Notice: 409 is deliberately excluded to prevent clearing on idempotency conflict)
  if (status === 400 || status === 401 || status === 403 || status === 404 || status === 422) return true

  return false
}

// In-memory volatile store for retaining entered financials between draft creation and prepare step
// Key: `${companyId}:${projectId}:${detailId}:${actorId}`
const pendingDraftFinancials = new Map<string, Record<string, unknown>>()

function buildStashKey(companyId: string, projectId: string, detailId: string, actorId: string): string {
  return `${companyId}:${projectId}:${detailId}:${actorId}`
}

export function stashDraftFinancials(
  companyId: string,
  projectIdOrDetailId: string,
  detailIdOrFinancials: string | Record<string, unknown>,
  actorIdOrUndefined?: string,
  financialsOrUndefined?: Record<string, unknown>,
): void {
  if (typeof detailIdOrFinancials === 'object' && detailIdOrFinancials !== null) {
    // 3-arg call: (companyId, detailId, financials)
    const key = `${companyId}:any:${projectIdOrDetailId}:any`
    pendingDraftFinancials.set(key, Object.freeze(JSON.parse(JSON.stringify(detailIdOrFinancials))))
    return
  }
  const projectId = projectIdOrDetailId
  const detailId = detailIdOrFinancials
  const actorId = actorIdOrUndefined ?? 'anonymous'
  const financials = financialsOrUndefined ?? {}
  const key = buildStashKey(companyId, projectId, detailId, actorId)
  pendingDraftFinancials.set(key, Object.freeze(JSON.parse(JSON.stringify(financials))))
}

export function peekStashedDraftFinancials(
  companyId: string,
  projectIdOrDetailId: string,
  detailIdOrUndefined?: string,
  actorIdOrUndefined?: string,
): Record<string, unknown> | null {
  if (!detailIdOrUndefined) {
    // 2-arg call: (companyId, detailId)
    const detailId = projectIdOrDetailId
    for (const [k, v] of pendingDraftFinancials.entries()) {
      if (k.startsWith(`${companyId}:`) && k.includes(`:${detailId}:`)) {
        return v
      }
    }
    return null
  }
  const projectId = projectIdOrDetailId
  const detailId = detailIdOrUndefined
  const actorId = actorIdOrUndefined ?? 'anonymous'
  const key = buildStashKey(companyId, projectId, detailId, actorId)
  const item = pendingDraftFinancials.get(key)
  if (item) return item

  for (const [k, v] of pendingDraftFinancials.entries()) {
    const [c, p, d, a] = k.split(':')
    if (c === companyId && d === detailId) {
      if ((p === 'any' || p === projectId) && (a === 'any' || a === actorId)) {
        return v
      }
    }
  }
  return null
}

export function popStashedDraftFinancials(
  companyId: string,
  projectIdOrDetailId: string,
  detailIdOrUndefined?: string,
  actorIdOrUndefined?: string,
): Record<string, unknown> | null {
  const item = peekStashedDraftFinancials(companyId, projectIdOrDetailId, detailIdOrUndefined, actorIdOrUndefined)
  if (item) {
    const detailId = detailIdOrUndefined ?? projectIdOrDetailId
    clearStashedDraftFinancials({ companyId, detailId })
    return item
  }
  return null
}

export function clearStashedDraftFinancials(
  filter?: { companyId?: string; projectId?: string; detailId?: string; actorId?: string },
): void {
  if (!filter) {
    pendingDraftFinancials.clear()
    return
  }
  for (const key of pendingDraftFinancials.keys()) {
    const [cId, pId, dId, aId] = key.split(':')
    if (filter.companyId && cId !== filter.companyId) continue
    if (filter.projectId && pId !== 'any' && pId !== filter.projectId) continue
    if (filter.detailId && dId !== filter.detailId) continue
    if (filter.actorId && aId !== 'any' && aId !== filter.actorId) continue
    pendingDraftFinancials.delete(key)
  }
}

/**
 * Purges sensitive in-memory command snapshots on context change (company switch, logout, capability loss).
 * Retains the persistent marker in sessionStorage scoped to its original company and actor.
 */
export function clearInMemorySnapshots(filter?: { companyId?: string; actorId?: string; projectId?: string }): void {
  if (!filter || (!filter.companyId && !filter.actorId && !filter.projectId)) {
    memoryCommandSnapshots.clear()
    pendingDraftFinancials.clear()
    return
  }

  for (const [key] of memoryCommandSnapshots.entries()) {
    const parts = key.split(':')
    const cId = parts[2]
    const aId = parts[3]
    const tId = parts[5]

    const matchCompany = !filter.companyId || cId === filter.companyId
    const matchActor = !filter.actorId || aId === filter.actorId
    const matchProject = !filter.projectId || tId === filter.projectId

    if (matchCompany && matchActor && matchProject) {
      memoryCommandSnapshots.delete(key)
    }
  }

  clearStashedDraftFinancials(filter)
}
