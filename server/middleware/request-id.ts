import { getHeader, setResponseHeader } from 'h3'
import { ensureRequestId } from '../utils/request-id'

export default defineEventHandler((event) => {
  const requestId = ensureRequestId(getHeader(event, 'x-request-id'))
  event.context.requestId = requestId
  setResponseHeader(event, 'x-request-id', requestId)
})
