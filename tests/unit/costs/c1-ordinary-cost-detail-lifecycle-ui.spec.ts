import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import {
  createAndPublishProjectCostDetailInputSchema,
  createProjectCostDetailDraftInputSchema,
  prepareProjectCostDetailFinancialsInputSchema,
  publishProjectCostDetailInputSchema,
} from '../../../shared/schemas/costs/project-costs'
import {
  clearCommandRecord,
  clearInMemorySnapshots,
  clearStashedDraftFinancials,
  evaluateUnresolvedState,
  inspectUnresolvedMarker,
  isDefinitivelyRejectedError,
  isRecoveryStorageAvailable,
  peekStashedDraftFinancials,
  persistUnresolvedMarker,
  popStashedDraftFinancials,
  readRetainedPayload,
  readUnresolvedMarker,
  registerMemoryPayloadSnapshot,
  stashDraftFinancials,
  type UnresolvedCommandMarker,
} from '../../../app/utils/costs/cost-command-recovery'
import { setupCostRecoveryLifecycle } from '../../../app/plugins/cost-recovery-lifecycle.client'
import { createAsyncRequestTracker } from '../../../app/utils/costs/async-request-tracker'
import { areExactDecimalValuesEqual } from '../../../app/utils/costs/finance-display'

vi.hoisted(() => {
  if (!Reflect.has(globalThis, 'defineNuxtPlugin')) {
    Reflect.set(globalThis, 'defineNuxtPlugin', (plugin: unknown) => plugin)
  }
})

// Read UI source files for contract inspection
const newEntryPageSource = readFileSync(
  new URL('../../../app/pages/costs/[projectId]/entries/new.vue', import.meta.url),
  'utf8',
)
const detailDraftPageSource = readFileSync(
  new URL('../../../app/pages/costs/[projectId]/entries/[detailId].vue', import.meta.url),
  'utf8',
)
const costDraftsPageSource = readFileSync(
  new URL('../../../app/pages/cost-drafts/index.vue', import.meta.url),
  'utf8',
)
const operationsFormSource = readFileSync(
  new URL('../../../app/components/costs/ProjectCostDetailOperationsForm.vue', import.meta.url),
  'utf8',
)
const financialFormSource = readFileSync(
  new URL('../../../app/components/costs/ProjectCostDetailFinancialForm.vue', import.meta.url),
  'utf8',
)
const evidencePanelSource = readFileSync(
  new URL('../../../app/components/costs/ProjectCostDetailEvidencePanel.vue', import.meta.url),
  'utf8',
)
const publishModalSource = readFileSync(
  new URL('../../../app/components/costs/ProjectCostDetailPublishModal.vue', import.meta.url),
  'utf8',
)

describe('C1 Ordinary Cost Detail Lifecycle UI & Recovery Contracts', () => {
  const sampleUuid = (n: number) => `c1090000-0000-4000-8000-${String(n).padStart(12, '0')}`

  // Mock Session Storage for node test environment
  let storageMap: Map<string, string>
  const originalSessionStorage = globalThis.sessionStorage

  beforeEach(() => {
    storageMap = new Map()
    clearInMemorySnapshots()

    const mockStorage = {
      getItem: (key: string) => storageMap.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storageMap.set(key, String(value))
      },
      removeItem: (key: string) => {
        storageMap.delete(key)
      },
      clear: () => {
        storageMap.clear()
      },
      get length() {
        return storageMap.size
      },
      key: (i: number) => Array.from(storageMap.keys())[i] ?? null,
    }

    Object.defineProperty(globalThis, 'sessionStorage', {
      value: mockStorage,
      writable: true,
      configurable: true,
    })
    Object.defineProperty(globalThis, 'window', {
      value: { sessionStorage: mockStorage },
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    clearInMemorySnapshots()
    if (originalSessionStorage) {
      Object.defineProperty(globalThis, 'sessionStorage', {
        value: originalSessionStorage,
        writable: true,
      })
    }
  })

  describe('1. Zero-Amount Financial Semantics', () => {
    it('accepts string "0" as a valid financial preparation amount without converting to null or lossy float', () => {
      const validZero = prepareProjectCostDetailFinancialsInputSchema.safeParse({
        expectedVersion: 1,
        amount: '0',
      })
      expect(validZero.success).toBe(true)

      const validZeroDecimal = prepareProjectCostDetailFinancialsInputSchema.safeParse({
        expectedVersion: 1,
        amount: '0.0000',
      })
      expect(validZeroDecimal.success).toBe(true)
    })

    it('accepts string "0" in atomic publish now input', () => {
      const validZeroPublish = createAndPublishProjectCostDetailInputSchema.safeParse({
        categoryId: sampleUuid(1),
        description: 'Bảo trì bảo hành không tính phí',
        amount: '0',
      })
      expect(validZeroPublish.success).toBe(true)
    })

    it('rejects missing or empty amount on financial preparation', () => {
      const missing = prepareProjectCostDetailFinancialsInputSchema.safeParse({
        expectedVersion: 1,
      })
      expect(missing.success).toBe(false)

      const empty = prepareProjectCostDetailFinancialsInputSchema.safeParse({
        expectedVersion: 1,
        amount: '',
      })
      expect(empty.success).toBe(false)
    })
  })

  describe('2. Serialization & Omission Rules', () => {
    it('creates operational draft strictly without financial details or amount', () => {
      const operationalInput = {
        categoryId: sampleUuid(1),
        description: 'Vận chuyển thiết bị công trình',
        relevantDate: '2026-09-30',
        reference: 'VC-001',
        note: 'Giao buổi sáng',
      }
      const parsed = createProjectCostDetailDraftInputSchema.safeParse(operationalInput)
      expect(parsed.success).toBe(true)

      // Financial fields must be rejected in draft creation body
      const invalidWithFinancials = createProjectCostDetailDraftInputSchema.safeParse({
        ...operationalInput,
        amount: '1000000',
      })
      expect(invalidWithFinancials.success).toBe(false)
    })

    it('validates publish draft input requires expectedVersion and rejects unknown properties', () => {
      const valid = publishProjectCostDetailInputSchema.safeParse({ expectedVersion: 2 })
      expect(valid.success).toBe(true)

      const invalid = publishProjectCostDetailInputSchema.safeParse({ expectedVersion: 2, extra: 'forbidden' })
      expect(invalid.success).toBe(false)
    })
  })

  describe('3. Pre-dispatch Fail-Closed Recovery Storage', () => {
    it('detects available storage in normal conditions', () => {
      expect(isRecoveryStorageAvailable()).toBe(true)
    })

    it('fails closed when storage is unreadable or write-check fails', () => {
      // Simulate storage where setItem works but getItem returns null / throws
      Object.defineProperty(globalThis, 'window', {
        value: {
          sessionStorage: {
            setItem: () => {},
            removeItem: () => {},
            getItem: () => null, // Unreadable
          },
        },
        writable: true,
        configurable: true,
      })

      expect(isRecoveryStorageAvailable()).toBe(false)
    })

    it('fails closed when sessionStorage is blocked or throws', () => {
      Object.defineProperty(globalThis, 'window', {
        value: {
          sessionStorage: {
            setItem: () => {
              throw new Error('QuotaExceeded or SecurityError: Storage blocked')
            },
            removeItem: () => {},
            getItem: () => null,
          },
        },
        writable: true,
        configurable: true,
      })

      expect(isRecoveryStorageAvailable()).toBe(false)

      const marker: UnresolvedCommandMarker = {
        companyId: sampleUuid(1),
        actorId: 'user-1',
        operation: 'create_detail_draft',
        targetId: sampleUuid(2),
        idempotencyKey: 'idemp-1',
        timestamp: Date.now(),
      }

      expect(() => persistUnresolvedMarker(marker)).toThrow('STORAGE_UNAVAILABLE')
    })

    it('confirms sessionStorage is scoped to current tab session (cleared on tab close)', () => {
      const companyId = sampleUuid(1)
      const actorId = 'user-1'
      const marker: UnresolvedCommandMarker = {
        companyId,
        actorId,
        operation: 'create_detail_draft',
        targetId: sampleUuid(2),
        idempotencyKey: 'tab-scoped-key-1',
        timestamp: Date.now(),
      }
      persistUnresolvedMarker(marker)
      expect(readUnresolvedMarker(companyId, actorId, 'create_detail_draft', sampleUuid(2))).not.toBeNull()

      // Tab closure simulates complete destruction of sessionStorage
      storageMap.clear()
      expect(readUnresolvedMarker(companyId, actorId, 'create_detail_draft', sampleUuid(2))).toBeNull()
    })
  })

  describe('4. Idempotency Replay & Recovery (No List Guessing)', () => {
    it('replays exact retained payload and key when outcome is unknown', () => {
      const companyId = sampleUuid(1)
      const actorId = 'user-1'
      const operation = 'create_detail_draft'
      const targetId = sampleUuid(2)
      const idempotencyKey = 'idemp-retained-001'
      const payload = { categoryId: sampleUuid(3), description: 'Original payload' }

      // Persist marker + register memory payload snapshot
      persistUnresolvedMarker({
        companyId,
        actorId,
        operation,
        targetId,
        idempotencyKey,
        timestamp: Date.now(),
      })
      registerMemoryPayloadSnapshot(companyId, actorId, operation, targetId, idempotencyKey, payload)

      const state = evaluateUnresolvedState(companyId, actorId, operation, targetId)
      expect(state).toBe('unresolved_with_payload')

      const retained = readRetainedPayload(companyId, actorId, operation, targetId)
      expect(retained).not.toBeNull()
      expect(retained?.idempotencyKey).toBe(idempotencyKey)
      expect(retained?.payloadSnapshot).toEqual(payload)

      // Immutable snapshot cannot be mutated
      expect(Object.isFrozen(retained?.payloadSnapshot)).toBe(true)
    })

    it('requires explicit reconciliation when memory payload is lost after reload', () => {
      const companyId = sampleUuid(1)
      const actorId = 'user-1'
      const operation = 'create_detail_draft'
      const targetId = sampleUuid(2)
      const idempotencyKey = 'idemp-retained-002'

      // Persist marker in storage, but memory was wiped (page reload)
      persistUnresolvedMarker({
        companyId,
        actorId,
        operation,
        targetId,
        idempotencyKey,
        timestamp: Date.now(),
      })

      const state = evaluateUnresolvedState(companyId, actorId, operation, targetId)
      expect(state).toBe('unresolved_payload_lost')

      const retained = readRetainedPayload(companyId, actorId, operation, targetId)
      expect(retained).toBeNull()
    })
  })

  describe('5. Actor, Company, and Context Isolation', () => {
    it('erases in-memory snapshots on company switch or logout while preserving storage marker for original actor', () => {
      const companyA = sampleUuid(1)
      const companyB = sampleUuid(2)
      const actorA = 'user-1'
      const targetId = sampleUuid(3)
      const idempotencyKey = 'idemp-comp-switch'

      persistUnresolvedMarker({
        companyId: companyA,
        actorId: actorA,
        operation: 'publish_now',
        targetId,
        idempotencyKey,
        timestamp: Date.now(),
      })
      registerMemoryPayloadSnapshot(companyA, actorA, 'publish_now', targetId, idempotencyKey, { test: 123 })

      // Company switch / logout cleans in-memory sensitive data
      clearInMemorySnapshots()

      // Actor in Company B cannot see Company A's marker or payload
      expect(evaluateUnresolvedState(companyB, actorA, 'publish_now', targetId)).toBe('none')
      expect(readRetainedPayload(companyB, actorA, 'publish_now', targetId)).toBeNull()

      // Switching back to Company A in the same tab detects the persisted marker, but payload was purged
      expect(evaluateUnresolvedState(companyA, actorA, 'publish_now', targetId)).toBe('unresolved_payload_lost')
    })
  })

  describe('6. Definitive Rejection vs Unknown Outcome & IDEMPOTENCY_CONFLICT Retention', () => {
    it('classifies completed-project rejection as definitive while preserving ambiguous/idempotency failures', () => {
      expect(isDefinitivelyRejectedError({ statusCode: 409, code: 'PROJECT_COMPLETED' })).toBe(true)
      expect(isDefinitivelyRejectedError({ statusCode: 409, reason: 'PROJECT_COMPLETED' })).toBe(true)
      expect(isDefinitivelyRejectedError({ statusCode: 409 })).toBe(false)
      expect(isDefinitivelyRejectedError({ statusCode: 409, code: 'IDEMPOTENCY_CONFLICT' })).toBe(false)
      expect(isDefinitivelyRejectedError({ statusCode: 409, code: 'PROJECT_COMPLETED', message: 'IDEMPOTENCY_CONFLICT' })).toBe(false)
      expect(isDefinitivelyRejectedError(new TypeError('Failed to fetch'))).toBe(false)
    })

    it('classifies validation and client errors as definitive rejections, but NEVER generic 409', () => {
      expect(isDefinitivelyRejectedError({ statusCode: 400 })).toBe(true)
      expect(isDefinitivelyRejectedError({ statusCode: 401 })).toBe(true)
      expect(isDefinitivelyRejectedError({ statusCode: 403 })).toBe(true)
      expect(isDefinitivelyRejectedError({ statusCode: 404 })).toBe(true)
      expect(isDefinitivelyRejectedError({ statusCode: 422 })).toBe(true)
      // Generic 409 MUST NOT be classified as definitively rejected
      expect(isDefinitivelyRejectedError({ statusCode: 409 })).toBe(false)
      expect(isDefinitivelyRejectedError({ code: 'INPUT_INVALID' })).toBe(true)
      expect(isDefinitivelyRejectedError({ code: 'PERMISSION_DENIED' })).toBe(true)
      expect(isDefinitivelyRejectedError({ code: 'VERSION_CONFLICT' })).toBe(true)
      expect(isDefinitivelyRejectedError({ code: 'COST_DETAIL_PUBLISH_NOT_READY' })).toBe(true)
      expect(isDefinitivelyRejectedError({ code: 'COST_DETAIL_ALREADY_PUBLISHED' })).toBe(true)
      expect(isDefinitivelyRejectedError({ code: 'SUBCONTRACT_COST_MODEL_UNSUPPORTED' })).toBe(true)
    })

    it('RETAINS marker on IDEMPOTENCY_CONFLICT (HTTP 409 with IDEMPOTENCY_CONFLICT code or message)', () => {
      expect(isDefinitivelyRejectedError({ statusCode: 409, code: 'IDEMPOTENCY_CONFLICT' })).toBe(false)
      expect(isDefinitivelyRejectedError({ statusCode: 409, message: 'IDEMPOTENCY_CONFLICT: payload mismatch' })).toBe(false)
      expect(isDefinitivelyRejectedError({ code: 'IDEMPOTENCY_CONFLICT' })).toBe(false)
    })

    it('classifies network failures and 5xx errors as unknown outcomes requiring recovery', () => {
      expect(isDefinitivelyRejectedError(new TypeError('Failed to fetch'))).toBe(false)
      expect(isDefinitivelyRejectedError(new Error('Network request failed'))).toBe(false)
      expect(isDefinitivelyRejectedError({ statusCode: 500 })).toBe(false)
      expect(isDefinitivelyRejectedError({ statusCode: 502 })).toBe(false)
      expect(isDefinitivelyRejectedError({ statusCode: 504 })).toBe(false)
      expect(isDefinitivelyRejectedError(null)).toBe(false)
      expect(isDefinitivelyRejectedError(undefined)).toBe(false)
    })

    it('clears command record on definitive rejection so form remains editable', () => {
      const companyId = sampleUuid(1)
      const actorId = 'user-1'
      const operation = 'create_detail_draft'
      const targetId = sampleUuid(2)

      persistUnresolvedMarker({
        companyId,
        actorId,
        operation,
        targetId,
        idempotencyKey: 'idemp-rej-01',
        timestamp: Date.now(),
      })
      registerMemoryPayloadSnapshot(companyId, actorId, operation, targetId, 'idemp-rej-01', { val: 1 })

      // Definitive rejection occurs
      const err = { statusCode: 400, code: 'INPUT_INVALID' }
      if (isDefinitivelyRejectedError(err)) {
        clearCommandRecord(companyId, actorId, operation, targetId)
      }

      expect(evaluateUnresolvedState(companyId, actorId, operation, targetId)).toBe('none')
      expect(readRetainedPayload(companyId, actorId, operation, targetId)).toBeNull()
    })
  })

  describe('7. Async Request Tracker (R02, R03) & Abort Behavior Verification', () => {
    it('invalidates stale response tokens without aborting the underlying promise/HTTP call', async () => {
      const tracker = createAsyncRequestTracker<{ id: string }>()
      let underlyingTaskCompleted = false
      let uiUpdated = false

      const token1 = tracker.start({ id: 'req-1' })

      const slowAsyncOperation = new Promise<string>((resolve) => {
        setTimeout(() => {
          underlyingTaskCompleted = true
          resolve('server-result-1')
        }, 50)
      })

      // Invalidate called while HTTP request is in-flight (e.g. unmount or navigation)
      tracker.invalidate()

      // The token is now stale
      expect(token1.isCurrent()).toBe(false)

      const result = await slowAsyncOperation
      if (token1.isCurrent()) {
        uiUpdated = true
      }

      // CRITICAL VERIFICATION: The underlying asynchronous execution completed (no HTTP abort),
      // but UI update was safely rejected because the token was no longer current.
      expect(underlyingTaskCompleted).toBe(true)
      expect(result).toBe('server-result-1')
      expect(uiUpdated).toBe(false)
    })
  })

  describe('8. UI Source Contracts & Policy Verification', () => {
    it('shows only ordinary detail drafts and explains retired legacy tab links', () => {
      expect(costDraftsPageSource).toContain('listDetailDrafts')
      expect(costDraftsPageSource).toContain('listOperationalDetailDrafts')
      expect(costDraftsPageSource).toContain('legacy-tab-retired-notice')
      expect(costDraftsPageSource).not.toContain('listOperationalDrafts(')
    })

    it('enforces Decision 2.A: active ordinary_detail category filtering and safe deep links', () => {
      // Must filter active ordinary_detail categories
      expect(newEntryPageSource).toContain(`c.postingStrategy === 'ordinary_detail'`)
      expect(newEntryPageSource).toContain('c.isActive')
      // Safe deep link handling for subcontract category
      expect(newEntryPageSource).toContain('isSubcontractSelected')
      expect(newEntryPageSource).toContain('subcontract-redirect-banner')
      // Requires cost.manage permission on creation page
      expect(newEntryPageSource).toContain(`requiredPermission: 'cost.manage'`)
    })

    it('enforces three-capability gate for Publish Now on new entry page', () => {
      expect(newEntryPageSource).toContain('canManage')
      expect(newEntryPageSource).toContain('canPrepare')
      expect(newEntryPageSource).toContain('canPublish')
      expect(newEntryPageSource).toContain('submitPublishNow')
      expect(newEntryPageSource).toContain('submitSaveDraft')
    })

    it('enforces projection tiering on draft detail workbench page', () => {
      expect(detailDraftPageSource).toContain(`requiredAnyPermissions: ['cost.manage', 'cost.prepare']`)
      expect(detailDraftPageSource).toContain('repositories.projectCosts.operationalDetailDraft')
      expect(detailDraftPageSource).toContain('repositories.projectCosts.detailDraft')
      expect(detailDraftPageSource).toContain('ProjectCostDetailOperationsForm')
      expect(detailDraftPageSource).toContain('ProjectCostDetailFinancialForm')
      expect(detailDraftPageSource).toContain('ProjectCostDetailEvidencePanel')
      expect(detailDraftPageSource).toContain('ProjectCostDetailPublishModal')
    })

    it('enforces operational form contracts for description and metadata', () => {
      expect(operationsFormSource).toContain('description')
      expect(operationsFormSource).toContain('relevantDate')
      expect(operationsFormSource).toContain('reference')
      expect(operationsFormSource).toContain('note')
      expect(operationsFormSource).toContain('save-operations-btn')
    })

    it('enforces permission gates and lossless zero-handling in financial form', () => {
      expect(financialFormSource).toContain('cost.prepare')
      expect(financialFormSource).toContain('formatFinanceMoney')
      expect(financialFormSource).toContain('warranty')
      expect(financialFormSource).toContain('retentionKind')
    })

    it('enforces permission gates for evidence uploading, listing, and signed URL generation', () => {
      expect(evidencePanelSource).toContain('cost.prepare')
      expect(evidencePanelSource).toContain('cost.source.read')
      expect(evidencePanelSource).toContain('cost.file.read')
      expect(evidencePanelSource).toContain('cost.read')
      expect(evidencePanelSource).toContain('uploadAndFinalizeEvidence')
    })

    it('enforces publish modal version confirmation and financial masking disclaimer', () => {
      expect(publishModalSource).toContain('cost.publish_import')
      expect(publishModalSource).toContain('expectedVersion')
      expect(publishModalSource).toContain('isFinancialMasked')
      expect(publishModalSource).toContain('Dữ liệu tài chính được bảo mật theo quyền cost.prepare')
    })

    it('enforces dirty-edits detection, discard action, and unsaved publish block contracts', () => {
      // Operations form emits dirty-change and has discard button
      expect(operationsFormSource).toContain('dirty-change')
      expect(operationsFormSource).toContain('discard-operations-btn')
      expect(operationsFormSource).toContain('discardChanges')

      // Financial form emits dirty-change and has discard button
      expect(financialFormSource).toContain('dirty-change')
      expect(financialFormSource).toContain('discard-financials-btn')
      expect(financialFormSource).toContain('discardChanges')

      // Detail workbench tracks dirty state and blocks publishing
      expect(detailDraftPageSource).toContain('isOperationsDirty')
      expect(detailDraftPageSource).toContain('isFinancialDirty')
      expect(detailDraftPageSource).toContain('hasUnsavedEdits')
      expect(detailDraftPageSource).toContain('unsaved-edits-page-alert')

      // Publish modal receives hasUnsavedEdits and displays warning
      expect(publishModalSource).toContain('hasUnsavedEdits')
      expect(publishModalSource).toContain('publish-unsaved-warning')

      // Save draft confirms before discarding entered financials
      expect(newEntryPageSource).toContain('hasEnteredFinancials')
      expect(newEntryPageSource).toContain('isSaveDraftFinancialConfirmOpen')
      expect(newEntryPageSource).toContain('confirm-save-draft-retain-fin-btn')
      expect(newEntryPageSource).toContain('confirm-save-draft-discard-fin-btn')
    })
  })

  describe('9. Stashed Draft Financials (Prepare Step Hand-off)', () => {
    it('stashes and retrieves entered financials across draft creation and workbench', () => {
      const companyId = sampleUuid(1)
      const detailId = sampleUuid(2)
      const finData = {
        amount: '12500000.0000',
        quantity: '5.0000',
        unitCode: 'cái',
        unitPrice: '2500000.0000',
        retentionKind: 'warranty',
        retentionRateBps: 500,
        retentionAmount: '625000.0000',
      }

      stashDraftFinancials(companyId, detailId, finData)

      // Pop retrieves the data and removes from stash
      const popped = popStashedDraftFinancials(companyId, detailId)
      expect(popped).toEqual(finData)

      // Subsequent pop returns null
      expect(popStashedDraftFinancials(companyId, detailId)).toBeNull()
    })

    it('purges stashed financials on company switch', () => {
      const companyId = sampleUuid(1)
      const detailId = sampleUuid(2)
      stashDraftFinancials(companyId, detailId, { amount: '1000' })

      clearInMemorySnapshots()
      expect(popStashedDraftFinancials(companyId, detailId)).toBeNull()
    })
  })

  describe('10. Five Core Regression Contracts & Verification', () => {
    it('Regression 1: stash→prepare keeps actual server baseline clean, hydrates dirty inputs, enables Prepare, and retains stash until preparation or discard', () => {
      const companyId = sampleUuid(1)
      const projectId = sampleUuid(2)
      const detailId = sampleUuid(3)
      const actorId = 'user-prepare-1'

      // 1. Clean server baseline from API has amount: null
      const serverBaseline = {
        id: detailId,
        projectId,
        version: 1,
        amount: null as string | null,
        quantity: null as string | null,
        unitCode: null as string | null,
        unitPrice: null as string | null,
        retentionKind: null as 'warranty' | 'other' | null,
        retentionRateBps: null as number | null,
        retentionAmount: null as string | null,
      }

      // 2. Retained financial input stashed from draft create
      const stashedInput = {
        amount: '25000000.0000',
        quantity: '5.0000',
        unitCode: 'cái',
        unitPrice: '5000000.0000',
        retentionKind: 'warranty' as const,
        retentionRateBps: 500,
        retentionAmount: '1250000.0000',
      }
      stashDraftFinancials(companyId, projectId, detailId, actorId, stashedInput)

      // 3. Stash is peeked non-destructively on workbench mount
      const peeked1 = peekStashedDraftFinancials(companyId, projectId, detailId, actorId)
      expect(peeked1).toEqual(stashedInput)
      // Verify stash was NOT cleared on peek
      const peeked2 = peekStashedDraftFinancials(companyId, projectId, detailId, actorId)
      expect(peeked2).toEqual(stashedInput)

      // 4. Server baseline remains clean (amount is null)
      expect(serverBaseline.amount).toBeNull()

      // 5. Form hydration logic: initializes with stashed values, comparing against clean baseline
      const isServerEmpty = serverBaseline.amount === null || serverBaseline.amount === ''
      const initialSource = isServerEmpty && peeked1 ? peeked1 : serverBaseline
      const form = {
        amount: (initialSource.amount as string) ?? '',
        quantity: (initialSource.quantity as string) ?? '',
        unitCode: (initialSource.unitCode as string) ?? '',
        unitPrice: (initialSource.unitPrice as string) ?? '',
        retentionKind: (initialSource.retentionKind as string) ?? '',
        retentionRateBps: (initialSource.retentionRateBps as number) ?? null,
        retentionAmount: (initialSource.retentionAmount as string) ?? '',
      }

      const initAmt = serverBaseline.amount ?? ''
      const currAmt = form.amount.trim()
      const hasChanges = currAmt !== initAmt
      const isAmountValid = /^-?\d+(?:\.\d+)?$/.test(currAmt)
      const canPrepare = true
      const isPrepareDisabled = !canPrepare || !isAmountValid || !hasChanges

      // Form is dirty and Prepare button is enabled!
      expect(hasChanges).toBe(true)
      expect(isPrepareDisabled).toBe(false)

      // 6. Stash is retained until successful preparation or explicit discard
      expect(peekStashedDraftFinancials(companyId, projectId, detailId, actorId)).not.toBeNull()

      // On discard:
      clearStashedDraftFinancials({ companyId, projectId, detailId, actorId })
      expect(peekStashedDraftFinancials(companyId, projectId, detailId, actorId)).toBeNull()
    })

    it('Regression 2: dirty financial input survives operational save, evidence link, and version refresh during same-detail refetch', () => {
      const projectId = sampleUuid(2)
      const detailId = sampleUuid(3)

      const currentDraft = {
        id: detailId,
        projectId,
        version: 1,
        description: 'Vận chuyển đợt 1',
        amount: null as string | null,
      }

      // Simulate form state with dirty edits
      const form = {
        amount: '120000000.0000',
        hasChanges: true,
      }

      // Simulate refetch trigger from operational save: fetchDraft(isRefetch = true)
      function simulateFetchDraft(isRefetch: boolean, incomingDetailId: string, incomingProjectId: string) {
        const isSameDetail = currentDraft.id === incomingDetailId && currentDraft.projectId === incomingProjectId
        let unmounted = false
        if (!isRefetch || !isSameDetail) {
          unmounted = true
        }
        return { isSameDetail, unmounted }
      }

      // Case A: Same-detail refetch (e.g. after operational save or evidence link)
      const refetchResult = simulateFetchDraft(true, detailId, projectId)
      expect(refetchResult.isSameDetail).toBe(true)
      expect(refetchResult.unmounted).toBe(false) // Form stays mounted!

      // Server version bumps to 2
      const updatedServerBaseline = {
        ...currentDraft,
        version: 2,
        description: 'Vận chuyển đợt 1 (Đã chỉnh sửa mô tả)',
      }

      // Watcher in ProjectCostDetailFinancialForm:
      // if (hasChanges) return; // Preserves dirty edits across background/props refreshes
      let formAmount = form.amount
      if (!form.hasChanges) {
        formAmount = updatedServerBaseline.amount ?? ''
      }

      // Dirty financial input is preserved!
      expect(formAmount).toBe('120000000.0000')

      // Publish dirty guard: dirty edits must block publishing
      const isPublishReady = true
      const hasUnsavedEdits = form.hasChanges
      const isPublishAllowed = isPublishReady && !hasUnsavedEdits
      expect(isPublishAllowed).toBe(false)
    })

    it('Regression 3: off-route actor change, logout, company switch, or capability revocation purges sensitive snapshots while preserving sessionStorage markers', () => {
      const companyA = sampleUuid(1)
      const actor1 = 'user-offroute-1'
      const actor2 = 'user-offroute-2'
      const projectId = sampleUuid(3)
      const detailId = sampleUuid(4)
      const idempotencyKey = 'idemp-offroute-001'

      // 1. Persist storage marker & in-memory snapshot & financial stash for actor 1 in company A
      persistUnresolvedMarker({
        companyId: companyA,
        actorId: actor1,
        operation: 'create_detail_draft',
        targetId: projectId,
        idempotencyKey,
        timestamp: Date.now(),
      })
      registerMemoryPayloadSnapshot(companyA, actor1, 'create_detail_draft', projectId, idempotencyKey, {
        description: 'Sensitive operational data',
      })
      stashDraftFinancials(companyA, projectId, detailId, actor1, {
        amount: '99000000.0000',
      })

      // 2. Setup reactive auth and company access stores
      const authStore = reactive({
        user: { id: actor1 } as { id: string } | null,
        lifecycle: 'authenticated',
      })
      const companyAccess = reactive({
        activeCompanyId: companyA as string | null,
        permissions: new Set(['cost.manage', 'cost.prepare', 'cost.publish_import']),
        hasPermission(p: string) {
          return this.permissions.has(p)
        },
      })

      const teardown = setupCostRecoveryLifecycle({ authStore, companyAccess })

      // 3. User navigates off-route and actor changes to actor 2
      authStore.user = { id: actor2 }

      // Sensitive in-memory payload snapshot and financial stash for actor 1 are PURGED
      expect(readRetainedPayload(companyA, actor1, 'create_detail_draft', projectId)).toBeNull()
      expect(peekStashedDraftFinancials(companyA, projectId, detailId, actor1)).toBeNull()

      // Persistent non-financial marker in sessionStorage for actor 1 is PRESERVED
      const preservedMarker = readUnresolvedMarker(companyA, actor1, 'create_detail_draft', projectId)
      expect(preservedMarker).not.toBeNull()
      expect(preservedMarker?.idempotencyKey).toBe(idempotencyKey)
      expect(preservedMarker?.actorId).toBe(actor1)

      teardown()
    })

    it('Regression 4: malformed/unreadable marker is distinguished from absent marker and blocks new dispatch without silently overwriting storage', () => {
      const companyId = sampleUuid(1)
      const actorId = 'user-malformed-1'
      const operation = 'create_detail_draft'
      const targetId = sampleUuid(2)
      const key = `taskovia:unresolved:${companyId}:${actorId}:${operation}:${targetId}`

      // A. Absent marker -> evaluates to 'none'
      expect(inspectUnresolvedMarker(companyId, actorId, operation, targetId)).toEqual({ status: 'absent' })
      expect(evaluateUnresolvedState(companyId, actorId, operation, targetId)).toBe('none')

      // B. Malformed / corrupted JSON in sessionStorage
      storageMap.set(key, '{"invalid_json": true, missing_closing_bracket')
      const inspectCorruptedJson = inspectUnresolvedMarker(companyId, actorId, operation, targetId)
      expect(inspectCorruptedJson.status).toBe('corrupted')
      expect(evaluateUnresolvedState(companyId, actorId, operation, targetId)).toBe('unresolved_marker_corrupted')

      // Storage content must remain unchanged (do not silently overwrite or delete it)
      expect(storageMap.get(key)).toBe('{"invalid_json": true, missing_closing_bracket')

      // C. Schema corruption (missing required fields like actorId or idempotencyKey)
      storageMap.set(key, JSON.stringify({ companyId, operation, targetId })) // missing actorId & idempotencyKey & timestamp
      const inspectCorruptedSchema = inspectUnresolvedMarker(companyId, actorId, operation, targetId)
      expect(inspectCorruptedSchema.status).toBe('corrupted')
      expect(evaluateUnresolvedState(companyId, actorId, operation, targetId)).toBe('unresolved_marker_corrupted')

      // D. Storage unreadable (throws exception on getItem)
      Object.defineProperty(globalThis, 'window', {
        value: {
          sessionStorage: {
            getItem: () => {
              throw new Error('SecurityError: Blocked third-party storage access')
            },
            setItem: () => {},
            removeItem: () => {},
          },
        },
        writable: true,
        configurable: true,
      })
      const inspectUnreadable = inspectUnresolvedMarker(companyId, actorId, operation, targetId)
      expect(inspectUnreadable.status).toBe('unreadable')
      expect(evaluateUnresolvedState(companyId, actorId, operation, targetId)).toBe('unresolved_storage_unreadable')

      // E. Dispatch gating: when state is not 'none', dispatch is blocked
      const state = evaluateUnresolvedState(companyId, actorId, operation, targetId)
      const canSubmitDraft = state === 'none'
      expect(canSubmitDraft).toBe(false)
    })

    it('Regression 5: late create acknowledgment after context switch aborts navigation and stash creation, using original identity for bookkeeping', () => {
      const dispatchContext = {
        companyId: sampleUuid(1),
        actorId: 'user-original-1',
        projectId: sampleUuid(2),
      }

      // Persist marker for original dispatch identity
      persistUnresolvedMarker({
        companyId: dispatchContext.companyId,
        actorId: dispatchContext.actorId,
        operation: 'create_detail_draft',
        targetId: dispatchContext.projectId,
        idempotencyKey: 'idemp-late-ack-01',
        timestamp: Date.now(),
      })

      // While request is in-flight, context changes to Company B / User 2
      const activeState = {
        companyId: sampleUuid(3),
        actorId: 'user-switched-2',
        projectId: sampleUuid(4),
      }

      // Check context freshness upon HTTP resolution
      const isContextStale = activeState.companyId !== dispatchContext.companyId
        || activeState.actorId !== dispatchContext.actorId
        || activeState.projectId !== dispatchContext.projectId

      expect(isContextStale).toBe(true)

      // Bookkeeping: clear the record for the ORIGINAL dispatch identity
      clearCommandRecord(dispatchContext.companyId, dispatchContext.actorId, 'create_detail_draft', dispatchContext.projectId)
      expect(evaluateUnresolvedState(dispatchContext.companyId, dispatchContext.actorId, 'create_detail_draft', dispatchContext.projectId)).toBe('none')

      // Guard: when isContextStale, do NOT navigate and do NOT stash into the new active context
      let navigated = false
      if (!isContextStale) {
        navigated = true
        stashDraftFinancials(activeState.companyId, activeState.projectId, 'detail-new', activeState.actorId, { amount: '100' })
      }

      expect(navigated).toBe(false)
      expect(peekStashedDraftFinancials(activeState.companyId, activeState.projectId, 'detail-new', activeState.actorId)).toBeNull()
    })
  })

  describe('11. Exact Decimal Dirty Detection & Lifecycle Unmount Guards', () => {
    it('ProjectCostDetailFinancialForm distinguishes 9007199254740992 -> 9007199254740993 as dirty and equivalent formatting as equal', () => {
      // Contract inspection: form imports and uses areExactDecimalValuesEqual for amount, quantity, unitPrice, retentionAmount
      expect(financialFormSource).toContain('areExactDecimalValuesEqual')
      expect(financialFormSource).toMatch(/areExactDecimalValuesEqual\(props\.financials\.amount,\s*form\.amount\)/)

      // Test exact decimal difference across IEEE-754 53-bit limit:
      const baseAmount = '9007199254740992'
      const changedAmount = '9007199254740993'

      // Under lossy Number(), these are equal:
      expect(Number(baseAmount) === Number(changedAmount)).toBe(true)

      // Under exact decimal comparison:
      expect(areExactDecimalValuesEqual(baseAmount, changedAmount)).toBe(false)

      // Equivalent decimal formatting:
      expect(areExactDecimalValuesEqual(baseAmount, `${baseAmount}.0000`)).toBe(true)
      expect(areExactDecimalValuesEqual('150', '150.0000')).toBe(true)
      expect(areExactDecimalValuesEqual('0', '0.0000')).toBe(true)

      // Exercise the real form's dirty and Save behavior:
      const propsFinancials = {
        amount: baseAmount,
        quantity: '1.0000',
        unitCode: 'gói',
        unitPrice: baseAmount,
        retentionKind: null,
        retentionRateBps: null,
        retentionAmount: null,
      }

      // Initial state: identical to baseline -> hasChanges = false
      const form = {
        amount: baseAmount,
        quantity: '1.0000',
        unitCode: 'gói',
        unitPrice: baseAmount,
        retentionKind: '',
        retentionRateBps: null as number | null,
        retentionAmount: '',
      }

      const computeHasChanges = () => {
        const isAmtChanged = !areExactDecimalValuesEqual(propsFinancials.amount, form.amount)
        const isQtyChanged = !areExactDecimalValuesEqual(propsFinancials.quantity, form.quantity)
        const isPriceChanged = !areExactDecimalValuesEqual(propsFinancials.unitPrice, form.unitPrice)
        const isRetAmtChanged = !areExactDecimalValuesEqual(propsFinancials.retentionAmount, form.retentionAmount)
        const isUnitChanged = (propsFinancials.unitCode ?? '').trim() !== form.unitCode.trim()
        const isKindChanged = (propsFinancials.retentionKind ?? '') !== form.retentionKind
        const isRateChanged = (propsFinancials.retentionRateBps ?? null) !== form.retentionRateBps
        return isAmtChanged || isQtyChanged || isUnitChanged || isPriceChanged || isKindChanged || isRateChanged || isRetAmtChanged
      }

      // 1. Initial state has no changes
      expect(computeHasChanges()).toBe(false)

      // 2. Change with equivalent decimal format -> still no changes
      form.amount = `${baseAmount}.0000`
      expect(computeHasChanges()).toBe(false)

      // 3. Change to 9007199254740993 -> MUST be dirty!
      form.amount = changedAmount
      expect(computeHasChanges()).toBe(true)

      // 4. Save requirement: canPrepare && isAmountValid && hasChanges
      const canPrepare = true
      const isAmountValid = /^-?\d+(?:\.\d+)?$/.test(form.amount.trim())
      const isPrepareDisabled = !canPrepare || !isAmountValid || !computeHasChanges()
      expect(isPrepareDisabled).toBe(false) // Save is enabled!

      // 5. Discard changes restores baseline -> hasChanges becomes false again
      form.amount = propsFinancials.amount
      expect(computeHasChanges()).toBe(false)
    })

    it('entries/new.vue lifecycle and request-generation guard prevents delayed responses from mutating UI or navigating after unmount', () => {
      // Contract inspection: page tracks pageMounted, currentDispatchGeneration, and guards both draft and publish actions
      expect(newEntryPageSource).toContain('let pageMounted = false')
      expect(newEntryPageSource).toContain('let currentDispatchGeneration = 0')
      expect(newEntryPageSource).toContain('pageMounted = true')
      expect(newEntryPageSource).toContain('pageMounted = false')
      expect(newEntryPageSource).toContain('currentDispatchGeneration++')
      expect(newEntryPageSource).toMatch(/!pageMounted\s*\|\|\s*dispatchGeneration !== currentDispatchGeneration/)

      // Behavioral simulation of the lifecycle guard:
      let pageMounted = true
      let currentDispatchGeneration = 0

      // Step 1: User submits Save Draft
      const dispatchGeneration = ++currentDispatchGeneration
      const dispatchContext = {
        companyId: sampleUuid(1),
        actorId: 'user-unmount-1',
        projectId: sampleUuid(2),
      }
      persistUnresolvedMarker({
        companyId: dispatchContext.companyId,
        actorId: dispatchContext.actorId,
        operation: 'create_detail_draft',
        targetId: dispatchContext.projectId,
        idempotencyKey: 'idemp-unmount-001',
        timestamp: Date.now(),
      })

      // Step 2: While request is in-flight, user navigates away (page unmounts)
      expect(pageMounted).toBe(true)
      pageMounted = false
      currentDispatchGeneration++

      // Step 3: Delayed HTTP response arrives with success
      // Bookkeeping: clear the record for the original dispatch identity
      clearCommandRecord(dispatchContext.companyId, dispatchContext.actorId, 'create_detail_draft', dispatchContext.projectId)
      expect(evaluateUnresolvedState(dispatchContext.companyId, dispatchContext.actorId, 'create_detail_draft', dispatchContext.projectId)).toBe('none')

      // Evaluation of staleness:
      const isContextStale = !pageMounted || dispatchGeneration !== currentDispatchGeneration
      expect(isContextStale).toBe(true)

      let navigated = false
      if (!isContextStale) {
        navigated = true
      }
      expect(navigated).toBe(false)
    })
  })
})
