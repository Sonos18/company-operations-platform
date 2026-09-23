import type { ClientError } from '../../errors/client-error'

export type CostsUiErrorState =
  | 'module'
  | 'permission'
  | 'not_found'
  | 'empty'
  | 'validation_error'
  | 'aborted'
  | 'error'

/**
 * Maps API errors to the appropriate Costs UI state.
 *
 * Requirements (R05):
 * 1. MODULE_DISABLED reason checked first (since it is returned with code=PERMISSION_DENIED).
 * 2. PERMISSION_DENIED / authorization errors mapped to 'permission'.
 * 3. RESOURCE_NOT_FOUND mapped to 'not_found'.
 * 4. VALIDATION errors mapped to 'validation_error'.
 * 5. Cancellation / abort errors mapped to 'aborted' without showing server errors.
 * 6. Fallback to generic 'error'.
 */
export function mapCostsApiError(
  err: unknown,
  _context?: 'directory' | 'project' | 'category' | 'ledger',
): CostsUiErrorState {
  if (!err) return 'error'

  // Cancellation / Aborted requests are not user-visible server errors
  if (err instanceof DOMException && err.name === 'AbortError') {
    return 'aborted'
  }
  if (
    typeof err === 'object'
    && err !== null
    && 'name' in err
    && (err as { name: string }).name === 'AbortError'
  ) {
    return 'aborted'
  }

  const candidate = (typeof err === 'object' && err !== null)
    ? (err as Partial<ClientError> & { statusCode?: number; status?: number })
    : null

  if (candidate) {
    // 1. MODULE_DISABLED reason must be checked FIRST before general code
    if (candidate.reason === 'MODULE_DISABLED') {
      return 'module'
    }
    // 2. Missing permissions / wrong company
    if (
      candidate.code === 'PERMISSION_DENIED'
      || candidate.code === 'COMPANY_FORBIDDEN'
      || candidate.kind === 'authorization'
      || candidate.statusCode === 403
      || candidate.status === 403
    ) {
      return 'permission'
    }
    // 3. Resource not found
    if (
      candidate.code === 'RESOURCE_NOT_FOUND'
      || candidate.statusCode === 404
      || candidate.status === 404
    ) {
      return 'not_found'
    }
    // 4. Validation error
    if (
      candidate.code === 'INPUT_INVALID'
      || candidate.code === 'VALIDATION_FAILED'
      || candidate.kind === 'validation'
      || candidate.statusCode === 400
      || candidate.status === 400
    ) {
      return 'validation_error'
    }
  }

  return 'error'
}
