import { describe, expect, it } from 'vitest'
import { mapStage01RpcError } from '../../../server/features/stage01/stage01-errors'

describe('Stage 01 configuration database errors', () => {
  // Defect caught: a duplicate configuration draft leaked through as an internal error rather than the stable conflict contract.
  it('maps configuration draft conflicts to their approved stable API errors', () => {
    expect(() => mapStage01RpcError(
      { code: 'P0001', message: 'STAGE01_CONFIG_DRAFT_EXISTS' },
      'Không thể tạo configuration draft.',
    )).toThrow(expect.objectContaining({
      statusCode: 409,
      code: 'STAGE01_CONFIG_DRAFT_EXISTS',
    }))

    expect(() => mapStage01RpcError(
      { code: 'P0001', message: 'STAGE01_CONFIG_DRAFT_NOT_FOUND' },
      'Không thể đọc configuration draft.',
    )).toThrow(expect.objectContaining({
      statusCode: 404,
      code: 'STAGE01_CONFIG_DRAFT_NOT_FOUND',
    }))
  })

  it.each([
    ['AUTH_REQUIRED', 401, 'AUTH_REQUIRED'],
    ['COMPANY_FORBIDDEN', 403, 'COMPANY_FORBIDDEN'],
    ['PERMISSION_DENIED', 403, 'PERMISSION_DENIED'],
    ['VERSION_CONFLICT', 409, 'VERSION_CONFLICT'],
    ['STAGE01_DEFINITION_CONFIG_UNAVAILABLE', 409, 'STAGE01_DEFINITION_CONFIG_UNAVAILABLE'],
    ['STAGE01_DEFINITION_CONFIG_INVALID', 409, 'STAGE01_DEFINITION_CONFIG_INVALID'],
    ['unknown_failure', 500, 'INTERNAL_ERROR'],
  ])('maps %s to the stable %i/%s contract', (databaseCode, statusCode, apiCode) => {
    expect(() => mapStage01RpcError(
      { code: 'P0001', message: databaseCode },
      'Không thể thực hiện configuration command.',
    )).toThrow(expect.objectContaining({ statusCode, code: apiCode }))
  })
})
