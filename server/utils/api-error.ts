import type { H3Event } from 'h3'
import { createError } from 'h3'
import type { ApiErrorBody, ApiErrorCode } from '../../shared/schemas/api-error'

export class AppApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message)
  }
}

export function toApiErrorBody(error: unknown, requestId: string): ApiErrorBody {
  if (error instanceof AppApiError) {
    return {
      error: {
        code: error.code,
        message: error.message,
        requestId,
        details: error.details,
      },
    }
  }

  return {
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Hệ thống gặp lỗi ngoài dự kiến.',
      requestId,
      details: {},
    },
  }
}

export async function runApiRoute<T>(
  event: H3Event,
  handler: () => Promise<T>,
): Promise<T> {
  try {
    return await handler()
  } catch (error) {
    const body = toApiErrorBody(error, event.context.requestId)
    throw createError({
      statusCode: error instanceof AppApiError ? error.statusCode : 500,
      statusMessage: body.error.code,
      data: body,
    })
  }
}
