import { readFile } from 'node:fs/promises'

const endpoint = 'https://api.typesafe.ai/v1/systemone'

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

function fail(message) {
  console.error(message)
  process.exitCode = 1
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length !== 1) {
    throw new Error('Usage: node scripts/run-typesafe-jev.mjs <request.json>')
  }

  const apiKey = process.env.TYPESAFE_API_KEY?.trim()
  if (!apiKey) throw new Error('TYPESAFE_API_KEY is required')

  let source
  try {
    source = await readFile(args[0], 'utf8')
  } catch (error) {
    throw new Error(`Cannot read TypeSafe request file: ${errorMessage(error)}`, { cause: error })
  }

  let request
  try {
    request = JSON.parse(source)
  } catch (error) {
    throw new Error(`Invalid TypeSafe request JSON: ${errorMessage(error)}`, { cause: error })
  }
  if (!request || Array.isArray(request) || typeof request !== 'object') {
    throw new Error('Invalid TypeSafe request JSON: top-level value must be an object')
  }
  if (request.model === undefined) request.model = 'jev-latest'
  if (typeof request.model !== 'string' || request.model.trim() === '') {
    throw new Error('Invalid TypeSafe request JSON: model must be a non-empty string')
  }

  let response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(30_000),
    })
  } catch (error) {
    throw new Error(`TypeSafe network request failed: ${errorMessage(error)}`, { cause: error })
  }

  const body = await response.text()
  if (!response.ok) {
    let detail = body
    try {
      const parsed = JSON.parse(body)
      detail = parsed?.error?.message ?? parsed?.message ?? parsed?.error ?? body
    } catch {
      // Keep the response text when the error is not JSON.
    }
    const safeDetail = String(detail).replaceAll(apiKey, '[REDACTED]').trim()
    throw new Error(`TypeSafe request failed with HTTP ${response.status}${safeDetail ? `: ${safeDetail}` : ''}`)
  }

  let result
  try {
    result = JSON.parse(body)
  } catch (error) {
    throw new Error(`TypeSafe returned invalid JSON: ${errorMessage(error)}`, { cause: error })
  }
  process.stdout.write(`${JSON.stringify(result)}\n`)
}

main().catch(error => fail(errorMessage(error)))
