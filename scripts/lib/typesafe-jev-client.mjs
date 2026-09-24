const endpoint = 'https://api.typesafe.ai/v1/systemone'
const retryableStatuses = new Set([429, 529])

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

function sanitizeDetail(detail, apiKey) {
  return String(detail ?? '')
    .replaceAll(apiKey, '[REDACTED]')
    .trim()
}

function retryDelayMs(response, attempt) {
  const retryAfter = response.headers.get('retry-after')?.trim()
  if (retryAfter) {
    const seconds = Number(retryAfter)
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1_000, 5_000)

    const dateMs = Date.parse(retryAfter)
    if (Number.isFinite(dateMs)) return Math.min(Math.max(dateMs - Date.now(), 0), 5_000)
  }
  return Math.min(250 * 2 ** attempt, 2_000)
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function evaluateTypeSafe(request, options = {}) {
  const apiKey = (options.apiKey ?? process.env.TYPESAFE_API_KEY)?.trim()
  if (!apiKey) throw new Error('TYPESAFE_API_KEY is required')
  if (!request || Array.isArray(request) || typeof request !== 'object') {
    throw new Error('Invalid TypeSafe request: top-level value must be an object')
  }

  const payload = { ...request }
  if (payload.model === undefined) payload.model = 'jev-latest'
  if (typeof payload.model !== 'string' || payload.model.trim() === '') {
    throw new Error('Invalid TypeSafe request: model must be a non-empty string')
  }

  const timeoutMs = options.timeoutMs ?? 30_000
  const maxRetries = options.maxRetries ?? 2
  const startedAt = performance.now()

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    let response
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (error) {
      throw new Error(`TypeSafe network request failed: ${errorMessage(error)}`, { cause: error })
    }

    const body = await response.text()
    if (response.ok) {
      let result
      try {
        result = JSON.parse(body)
      } catch (error) {
        throw new Error(`TypeSafe returned invalid JSON: ${errorMessage(error)}`, { cause: error })
      }

      return {
        result,
        elapsedMs: Math.round((performance.now() - startedAt) * 100) / 100,
        attempts: attempt + 1,
      }
    }

    if (retryableStatuses.has(response.status) && attempt < maxRetries) {
      await sleep(retryDelayMs(response, attempt))
      continue
    }

    let detail = body
    try {
      const parsed = JSON.parse(body)
      detail = parsed?.error?.message ?? parsed?.message ?? parsed?.error ?? body
    } catch {
      // Keep the response text when the error is not JSON.
    }
    const safeDetail = sanitizeDetail(detail, apiKey)
    throw new Error(`TypeSafe request failed with HTTP ${response.status}${safeDetail ? `: ${safeDetail}` : ''}`)
  }

  throw new Error('TypeSafe request failed after retries')
}
