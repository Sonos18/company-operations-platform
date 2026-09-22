import { describe, expect, it } from 'vitest'
import { ClientError } from '../../../app/errors/client-error'
import { mapCostsApiError } from '../../../app/utils/costs/costs-error-mapper'

describe('costs-error-mapper', () => {
  it('maps MODULE_DISABLED reason to "module" even when code is PERMISSION_DENIED (R05)', () => {
    const err = new ClientError({
      kind: 'authorization',
      code: 'PERMISSION_DENIED',
      reason: 'MODULE_DISABLED',
      message: 'Module is disabled',
      retryable: false,
    })
    expect(mapCostsApiError(err)).toBe('module')
  })

  it('maps plain PERMISSION_DENIED without MODULE_DISABLED reason to "permission"', () => {
    const err = new ClientError({
      kind: 'authorization',
      code: 'PERMISSION_DENIED',
      message: 'You do not have permission',
      retryable: false,
    })
    expect(mapCostsApiError(err)).toBe('permission')
  })

  it('maps authorization kind to "permission"', () => {
    const err = new ClientError({
      kind: 'authorization',
      code: 'COMPANY_FORBIDDEN',
      message: 'Wrong company or tenant',
      retryable: false,
    })
    expect(mapCostsApiError(err)).toBe('permission')
  })

  it('maps RESOURCE_NOT_FOUND to "not_found"', () => {
    const err = new ClientError({
      kind: 'api',
      code: 'RESOURCE_NOT_FOUND',
      message: 'Project not found',
      retryable: false,
    })
    expect(mapCostsApiError(err)).toBe('not_found')
  })

  it('maps validation errors to "validation_error"', () => {
    const err = new ClientError({
      kind: 'validation',
      code: 'INPUT_INVALID',
      message: 'Invalid date range',
      retryable: false,
    })
    expect(mapCostsApiError(err)).toBe('validation_error')
  })

  it('maps AbortError / cancellation to "aborted" rather than a server error', () => {
    const abortErr = new DOMException('The user aborted a request.', 'AbortError')
    expect(mapCostsApiError(abortErr)).toBe('aborted')

    const mockAbort = { name: 'AbortError', message: 'aborted' }
    expect(mapCostsApiError(mockAbort)).toBe('aborted')
  })

  it('falls back to "error" for generic errors', () => {
    expect(mapCostsApiError(new Error('Network crash'))).toBe('error')
    expect(mapCostsApiError('Unknown string error')).toBe('error')
    expect(mapCostsApiError(null)).toBe('error')
  })
})
