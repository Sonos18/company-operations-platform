import { execFile } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { performance } from 'node:perf_hooks'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { stage01OperationalDetailSchema } from '../../../shared/schemas/stage01-operational'
import { B4_RESULTS_DIRECTORY, readB4AcceptanceState, type B4AcceptanceState } from './acceptance-state'

const execFileAsync = promisify(execFile)
const P3_RESPONSE_LIMIT_BYTES = 2 * 1024 * 1024
const P3_P95_LIMIT_MS = 2_000
const P3_MAX_LIMIT_MS = 3_000
const MEASURED_P3_READS = 20
const API_REQUEST_TIMEOUT_MS = 5_000

type ProfileKey = 'P1' | 'P2' | 'P3'

type ProfileExpectation = {
  key: ProfileKey
  opportunityId: string
  cycles: number
  contacts: number
}

type ProfileShape = {
  schemaValid: boolean
  opportunityId: string | null
  criteria: number | null
  cycles: number | null
  contacts: number | null
  criterionKeysPerCycle: boolean
  revisedEvaluationsPerCycle: boolean
  repeatedRecommendationsPerCycle: boolean
  clarificationReturnsPerCycle: boolean
}

type ProfileRead = {
  status: number | null
  sizeBytes: number
  latencyMs: number
  shape: ProfileShape
}

async function login(page: Page, state: B4AcceptanceState): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Email').fill(state.actors.decision.email)
  await page.getByLabel('Mật khẩu', { exact: true }).fill(state.actors.decision.password)
  await page.getByRole('button', { name: 'Đăng nhập' }).click()
  await expect(page).toHaveURL(/\/projects$/u)
}

async function readAccessToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => {
    const sessionEntry = Object.entries(localStorage)
      .find(([key]) => key.startsWith('sb-') && key.endsWith('-auth-token'))
    const serializedSession = sessionEntry?.[1]
    return serializedSession
      ? (JSON.parse(serializedSession) as { access_token?: unknown }).access_token
      : null
  })
  if (typeof token !== 'string' || token.length === 0) throw new Error('B4 browser session token is unavailable')
  return token
}

function inspectShape(body: unknown): ProfileShape {
  const parsed = stage01OperationalDetailSchema.safeParse(body)
  if (!parsed.success) {
    return {
      schemaValid: false,
      opportunityId: null,
      criteria: null,
      cycles: null,
      contacts: null,
      criterionKeysPerCycle: false,
      revisedEvaluationsPerCycle: false,
      repeatedRecommendationsPerCycle: false,
      clarificationReturnsPerCycle: false,
    }
  }

  const detail = parsed.data
  const cycles = detail.decisionCycles
  const criterionKeysPerCycle = cycles.every(cycle => new Set(cycle.evaluations.map(evaluation => evaluation.criterionKey)).size === 5)
  const revisedEvaluationsPerCycle = cycles.every(cycle => cycle.evaluations.some(evaluation => evaluation.revision >= 2))
  const repeatedRecommendationsPerCycle = cycles.every(cycle => cycle.recommendations.length >= 2)
  const clarificationReturnsPerCycle = cycles.every(cycle => cycle.clarificationReturns.length >= 1)

  return {
    schemaValid: true,
    opportunityId: detail.opportunity.id,
    criteria: detail.configuration.criteria.length,
    cycles: cycles.length,
    contacts: detail.relatedContacts.length,
    criterionKeysPerCycle,
    revisedEvaluationsPerCycle,
    repeatedRecommendationsPerCycle,
    clarificationReturnsPerCycle,
  }
}

async function authenticatedGet(
  request: APIRequestContext,
  baseURL: string,
  token: string,
  path: string,
): Promise<ProfileRead> {
  const startedAt = performance.now()
  try {
    const response = await request.get(new URL(path, baseURL).toString(), {
      headers: { Authorization: `Bearer ${token}` },
      timeout: API_REQUEST_TIMEOUT_MS,
    })
    const responseBody = await response.body()
    let body: unknown = null
    try {
      body = JSON.parse(new TextDecoder().decode(responseBody))
    } catch {
      body = null
    }
    return {
      status: response.status(),
      sizeBytes: responseBody.byteLength,
      latencyMs: Math.round((performance.now() - startedAt) * 100) / 100,
      shape: inspectShape(body),
    }
  } catch {
    return {
      status: null,
      sizeBytes: 0,
      latencyMs: Math.round((performance.now() - startedAt) * 100) / 100,
      shape: inspectShape(null),
    }
  }
}

function nearestRankP95(latenciesMs: number[]): number {
  const sorted = [...latenciesMs].sort((left, right) => left - right)
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? 0
}

function profileReadFailure(profile: ProfileExpectation, read: ProfileRead): string | null {
  if (read.status !== 200) return `${profile.key} performance read did not return HTTP 200`
  if (!read.shape.schemaValid) return `${profile.key} performance response failed schema validation`
  if (read.shape.opportunityId !== profile.opportunityId) return `${profile.key} performance response returned the wrong opportunity`
  if (read.shape.criteria !== 5) return `${profile.key} performance profile does not contain five criteria`
  if (read.shape.cycles !== profile.cycles) return `${profile.key} performance profile has the wrong cycle count`
  if (read.shape.contacts !== profile.contacts) return `${profile.key} performance profile has the wrong contact count`
  if (!read.shape.criterionKeysPerCycle) return `${profile.key} performance profile does not contain five criterion keys per cycle`
  if (profile.key !== 'P1' && !read.shape.revisedEvaluationsPerCycle) return `${profile.key} performance profile is missing repeated evaluation history`
  if (profile.key === 'P3' && !read.shape.repeatedRecommendationsPerCycle) return 'P3 performance profile is missing repeated recommendation history'
  if (profile.key === 'P3' && !read.shape.clarificationReturnsPerCycle) return 'P3 performance profile is missing clarification history'
  return null
}

function profileMetrics(reads: ProfileRead[], warmupCount: number) {
  const measured = reads.slice(warmupCount)
  const latenciesMs = measured.map(read => read.latencyMs)
  return {
    status: reads.at(-1)?.status ?? null,
    statuses: reads.map(read => read.status),
    sizeBytes: measured.length > 0 ? Math.max(...measured.map(read => read.sizeBytes)) : null,
    latenciesMs,
    p95Ms: latenciesMs.length > 0 ? nearestRankP95(latenciesMs) : null,
    maxMs: latenciesMs.length > 0 ? Math.max(...latenciesMs) : null,
    shape: reads.at(-1)?.shape ?? null,
  }
}

async function persistPerformanceMetrics(
  cwd: string,
  state: B4AcceptanceState | null,
  codeSha: string | null,
  reads: Map<ProfileKey, ProfileRead[]>,
  warmup: Record<ProfileKey, number>,
): Promise<ReturnType<typeof buildPerformanceMetrics>> {
  const metrics = buildPerformanceMetrics(state, codeSha, reads, warmup)
  const resultsDirectory = resolve(cwd, B4_RESULTS_DIRECTORY)
  await mkdir(resultsDirectory, { recursive: true })
  await writeFile(resolve(resultsDirectory, 'performance.json'), `${JSON.stringify(metrics, null, 2)}\n`, 'utf8')
  return metrics
}

function buildPerformanceMetrics(
  state: B4AcceptanceState | null,
  codeSha: string | null,
  reads: Map<ProfileKey, ProfileRead[]>,
  warmup: Record<ProfileKey, number>,
) {
  const p3Reads = reads.get('P3') ?? []
  const p3Measured = p3Reads.slice(warmup.P3)
  return {
    codeSha,
    timestamp: new Date().toISOString(),
    runMarker: state?.runMarker ?? null,
    profileIds: {
      P1: state?.profiles.p1OpportunityId ?? null,
      P2: state?.profiles.p2OpportunityId ?? null,
      P3: state?.profiles.p3OpportunityId ?? null,
    },
    sampleCount: p3Measured.length,
    warmup,
    profiles: {
      P1: profileMetrics(reads.get('P1') ?? [], warmup.P1),
      P2: profileMetrics(reads.get('P2') ?? [], warmup.P2),
      P3: profileMetrics(p3Reads, warmup.P3),
    },
  }
}

async function readLocalCodeSha(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' })
    const sha = String(stdout).trim()
    return sha.length > 0 ? sha : null
  } catch {
    return null
  }
}

test.describe.configure({ mode: 'serial' })
test.setTimeout(180_000)

test('B4 performance measures P1/P2/P3 through authenticated local Nitro reads', async ({ page, request }) => {
  const cwd = process.cwd()
  const reads = new Map<ProfileKey, ProfileRead[]>([['P1', []], ['P2', []], ['P3', []]])
  const warmup: Record<ProfileKey, number> = { P1: 0, P2: 0, P3: 0 }
  let state: B4AcceptanceState | null = null
  let codeSha: string | null = null
  const persist = async () => {
    return persistPerformanceMetrics(cwd, state, codeSha, reads, warmup)
  }

  try {
    codeSha = await readLocalCodeSha(cwd)
    state = await readB4AcceptanceState(cwd)
    await persist()
    const baseURL = test.info().project.use.baseURL
    if (typeof baseURL !== 'string' || baseURL.length === 0) throw new Error('B4 Playwright baseURL is unavailable')

    await login(page, state)
    const token = await readAccessToken(page)
    const profiles: ProfileExpectation[] = [
      { key: 'P1', opportunityId: state.profiles.p1OpportunityId, cycles: 1, contacts: 2 },
      { key: 'P2', opportunityId: state.profiles.p2OpportunityId, cycles: 5, contacts: 10 },
      { key: 'P3', opportunityId: state.profiles.p3OpportunityId, cycles: 20, contacts: 20 },
    ]

    for (const profile of profiles) {
      const path = `/api/companies/${state.companyId}/opportunities/${profile.opportunityId}/stage-01`
      const warmupRead = await authenticatedGet(request, baseURL, token, path)
      reads.get(profile.key)!.push(warmupRead)
      warmup[profile.key] += 1
      await persist()
      const warmupFailure = profileReadFailure(profile, warmupRead)
      if (warmupFailure) throw new Error(warmupFailure)

      const measuredReads = profile.key === 'P3' ? MEASURED_P3_READS : 1
      for (let index = 0; index < measuredReads; index += 1) {
        const measured = await authenticatedGet(request, baseURL, token, path)
        reads.get(profile.key)!.push(measured)
        await persist()
        const measuredFailure = profileReadFailure(profile, measured)
        if (measuredFailure) throw new Error(measuredFailure)
      }
    }
    const metrics = await persist()
    const p3Metric = metrics.profiles.P3
    expect(metrics.sampleCount, 'P3 measured sample count').toBe(MEASURED_P3_READS)
    expect(p3Metric.sizeBytes, 'P3 uncompressed JSON bytes').not.toBeNull()
    expect(p3Metric.p95Ms, 'P3 nearest-rank p95 latency').not.toBeNull()
    expect(p3Metric.maxMs, 'P3 maximum latency').not.toBeNull()
    expect(p3Metric.sizeBytes, 'P3 uncompressed JSON bytes').toBeLessThanOrEqual(P3_RESPONSE_LIMIT_BYTES)
    expect(p3Metric.p95Ms, 'P3 nearest-rank p95 latency').toBeLessThanOrEqual(P3_P95_LIMIT_MS)
    expect(p3Metric.maxMs, 'P3 maximum latency').toBeLessThanOrEqual(P3_MAX_LIMIT_MS)
  } finally {
    await persist().catch(() => undefined)
  }
})
