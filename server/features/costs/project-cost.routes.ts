/* eslint-disable @typescript-eslint/no-explicit-any */
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const fail = () => { throw Object.assign(new Error('INPUT_INVALID'), { statusCode: 400, code: 'INPUT_INVALID' }) }
export function createProjectCostRoutes({ service, context }: any) { return { async create(event: any, companyId: string, body: unknown) { if (!uuid.test(companyId)) fail(); const key = event?.headers?.['idempotency-key'] ?? event?.headers?.get?.('Idempotency-Key'); if (typeof key !== 'string' || !uuid.test(key)) fail(); return service.create(await context(event, companyId), body, key) } } }
