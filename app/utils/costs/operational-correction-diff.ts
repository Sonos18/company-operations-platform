export type ProjectCostWorkStatus = 'unknown' | 'in_progress' | 'accepted'

export interface CanonicalOperationalSnapshot {
  description?: string
  workStatus?: ProjectCostWorkStatus
  businessReference?: string | null
  relevantDate?: string | null
}

export interface FormOperationalState {
  description: string
  workStatus?: ProjectCostWorkStatus
  businessReference: string
  relevantDate: string
}

export interface OperationalChanges {
  description?: string
  workStatus?: ProjectCostWorkStatus
  businessReference?: string | null
  relevantDate?: string | null
}

/**
 * Computes PATCH-like operational changes between a canonical snapshot and form state.
 *
 * Rules:
 * - Unchanged fields are strictly omitted.
 * - If a field is not present in the canonical snapshot, it is not editable and never emitted.
 * - Explicit clearing of a field that previously had a non-null value produces `null`.
 * - Leaving an already-null/empty field untouched does NOT produce `null`; it is omitted.
 * - Intentional changes produce the new trimmed/selected value.
 */
export function diffOperationalCorrection(
  snapshot: CanonicalOperationalSnapshot | null | undefined,
  form: FormOperationalState,
): OperationalChanges {
  if (!snapshot) {
    return {}
  }

  const changes: OperationalChanges = {}

  // 1. Description (required non-empty string in backend schema)
  if (snapshot.description !== undefined) {
    const prev = snapshot.description.trim()
    const next = form.description.trim()
    if (next.length > 0 && next !== prev) {
      changes.description = next
    }
  }

  // 2. Work status (enum)
  if (snapshot.workStatus !== undefined) {
    if (form.workStatus !== undefined && form.workStatus !== snapshot.workStatus) {
      changes.workStatus = form.workStatus
    }
  }

  // 3. Business reference (nullable string)
  if (snapshot.businessReference !== undefined) {
    const prev = snapshot.businessReference ? snapshot.businessReference.trim() : null
    const nextTrimmed = form.businessReference.trim()
    const next = nextTrimmed.length > 0 ? nextTrimmed : null

    if (prev === null) {
      if (next !== null) {
        changes.businessReference = next
      }
    }
    else {
      if (next === null) {
        // Intentionally cleared
        changes.businessReference = null
      }
      else if (next !== prev) {
        changes.businessReference = next
      }
    }
  }

  // 4. Relevant date (nullable date string YYYY-MM-DD)
  if (snapshot.relevantDate !== undefined) {
    const prev = snapshot.relevantDate ? snapshot.relevantDate.trim() : null
    const nextTrimmed = form.relevantDate.trim()
    const next = nextTrimmed.length > 0 ? nextTrimmed : null

    if (prev === null) {
      if (next !== null) {
        changes.relevantDate = next
      }
    }
    else {
      if (next === null) {
        // Intentionally cleared
        changes.relevantDate = null
      }
      else if (next !== prev) {
        changes.relevantDate = next
      }
    }
  }

  return changes
}
