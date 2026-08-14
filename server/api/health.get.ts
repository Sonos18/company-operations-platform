export default defineEventHandler(event => ({
  status: 'ok' as const,
  requestId: event.context.requestId,
}))
