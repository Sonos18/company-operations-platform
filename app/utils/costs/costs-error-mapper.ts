import { ClientError } from '../../errors/client-error'

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

  if (err instanceof ClientError) {
    // 1. MODULE_DISABLED reason must be checked FIRST before general code
    if (err.reason === 'MODULE_DISABLED') {
      return 'module'
    }
    // 2. Missing permissions / wrong company
    if (err.code === 'PERMISSION_DENIED' || err.kind === 'authorization') {
      return 'permission'
    }
    // 3. Resource not found
    if (err.code === 'RESOURCE_NOT_FOUND') {
      return 'not_found'
    }
    // 4. Validation error
    if (
      err.code === 'INPUT_INVALID'
      || err.code === 'VALIDATION_FAILED'
      || err.kind === 'validation'
    ) {
      return 'validation_error'
    }
  }

  return 'error'
}
