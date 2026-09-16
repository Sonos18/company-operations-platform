import { describe, expect, it, vi } from 'vitest'
import { createProjectCostRoutes } from '../../../server/features/costs/project-cost.routes'

describe('Project Cost routes', () => {
  it('rejects a missing create idempotency key before service invocation', async () => {
    const service = { create: vi.fn() }
    const routes = createProjectCostRoutes({ service: service as never, context: vi.fn() as never })
    await expect(routes.create({} as never, 'c1010000-0000-4000-8000-000000000020', {})).rejects.toMatchObject({ statusCode: 400, code: 'INPUT_INVALID' })
    expect(service.create).not.toHaveBeenCalled()
  })
})
