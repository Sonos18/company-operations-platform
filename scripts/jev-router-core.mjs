import { createHash } from 'node:crypto'

export const JEV_ROUTER_SCHEMA_VERSION = 1
export const DEFAULT_JEV_ROUTER_MODEL = 'jev-1.13.0'
export const MAX_JEV_ROUTER_STATE_BYTES = 24_000

const blockedSensitiveKeys = new Set([
  'password',
  'passwd',
  'secret',
  'api_key',
  'apikey',
  'authorization',
  'cookie',
  'credentials',
  'credential',
  'access_token',
  'accesstoken',
  'refresh_token',
  'refreshtoken',
  'id_token',
  'idtoken',
  'bearer_token',
  'bearertoken',
  'private_key',
  'privatekey',
  'client_secret',
  'clientsecret',
])

const blockedSensitiveValuePatterns = [
  /^Bearer\s+\S+/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
]

function normalizedSensitiveKey(key) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replaceAll('-', '_')
}

function isBlockedSensitiveKey(key) {
  const normalized = normalizedSensitiveKey(key)
  return blockedSensitiveKeys.has(normalized) || normalized.split('_').includes('token')
}

export function findBlockedSensitiveStatePaths(value, path = '$', found = []) {
  if (typeof value === 'string') {
    if (blockedSensitiveValuePatterns.some(pattern => pattern.test(value.trim()))) found.push(path)
    return found
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      findBlockedSensitiveStatePaths(value[index], `${path}[${index}]`, found)
    }
    return found
  }

  if (!value || typeof value !== 'object') return found

  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`
    if (isBlockedSensitiveKey(key)) {
      found.push(childPath)
      continue
    }
    if (typeof child === 'string' && blockedSensitiveValuePatterns.some(pattern => pattern.test(child.trim()))) {
      found.push(childPath)
      continue
    }
    findBlockedSensitiveStatePaths(child, childPath, found)
  }
  return found
}

const domainQuestions = {
  frontend: 'Does this task require frontend or browser UI context to make progress?',
  backend: 'Does this task require backend API, server, or application-service context to make progress?',
  database: 'Does this task require database schema, migration, SQL, RLS, or data-model context to make progress?',
  security: 'Does this task require authentication, authorization, permission, tenant-isolation, secret-handling, or other security context to make progress?',
  testing: 'Does this task require test, verification, CI, lint, typecheck, or build context to make progress?',
  git: 'Does this task require Git, GitHub, branch, commit, pull-request, review, or merge context to make progress?',
  docs: 'Does this task require project documentation, specification, or runbook context to make progress?',
}

function noulQuestion(instructions) {
  return {
    type: 'noul',
    instructions,
    criteria: {
      true: 'The context is materially relevant to the current task.',
      false: 'The task can progress correctly without loading that context.',
    },
  }
}

export function validateRouterState(state) {
  if (!state || Array.isArray(state) || typeof state !== 'object') {
    throw new Error('Router state must be a JSON object')
  }
  if (typeof state.request !== 'string' || state.request.trim() === '') {
    throw new Error('Router state must include a non-empty string field `request`')
  }

  const stateBytes = Buffer.byteLength(canonicalJson(state), 'utf8')
  if (stateBytes > MAX_JEV_ROUTER_STATE_BYTES) {
    throw new Error(`Router state is too large for the compact shadow contract: ${stateBytes} bytes > ${MAX_JEV_ROUTER_STATE_BYTES}`)
  }

  const blockedPaths = findBlockedSensitiveStatePaths(state)
  if (blockedPaths.length > 0) {
    const preview = blockedPaths.slice(0, 5).join(', ')
    const suffix = blockedPaths.length > 5 ? ` (+${blockedPaths.length - 5} more)` : ''
    throw new Error(`Router state contains blocked sensitive data at: ${preview}${suffix}`)
  }
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export function hashRouterState(state) {
  return createHash('sha256').update(canonicalJson(state)).digest('hex')
}

export function buildJevRouterRequest(state, model = DEFAULT_JEV_ROUTER_MODEL) {
  validateRouterState(state)

  const questions = {
    task_mode: {
      type: 'choice',
      instructions: 'What is the primary mode of work requested by `request` given the rest of the state?',
      criteria: {
        inspect: 'Read or investigate first; no implementation is yet justified.',
        implement: 'Create or modify source, tests, configuration, or scripts.',
        debug: 'Diagnose and fix a concrete failure or unexpected behavior.',
        review: 'Evaluate an existing change, pull request, diff, or implementation for defects or risks.',
        verify: 'Run or interpret checks that establish whether existing work passes defined conditions.',
        document: 'The primary deliverable is technical documentation or an implementation plan.',
        other: 'The primary work does not fit the listed modes; use this instead of forcing an unrelated mode.',
      },
    },
    reasoning_depth: {
      type: 'choice',
      instructions: 'How much deliberate reasoning is warranted before the next meaningful action?',
      criteria: {
        routine: 'The task is bounded, low ambiguity, and mostly mechanical after reading the relevant context.',
        focused: 'The task needs targeted reasoning across a few interacting facts or files.',
        deep: 'The task involves architecture, security, data integrity, ambiguous requirements, or multiple strongly interacting constraints.',
      },
    },
    evidence_insufficient: {
      type: 'noul',
      instructions: 'Is the supplied state missing material evidence needed to choose the next safe work mode or context domains?',
      criteria: {
        true: 'Important evidence is absent, so routing should be treated cautiously and more inspection is warranted.',
        false: 'The state contains enough evidence for a useful advisory routing decision.',
      },
    },
  }

  for (const [domain, instructions] of Object.entries(domainQuestions)) {
    questions[`needs_${domain}`] = noulQuestion(instructions)
  }

  return {
    state,
    model,
    questions,
  }
}

function requireAnswer(answers, id, expectedType) {
  const answer = answers?.[id]
  if (!answer || answer.type !== expectedType) {
    throw new Error(`TypeSafe response is missing ${expectedType} answer \`${id}\``)
  }
  return answer
}

export function summarizeJevRouterResponse(response, metadata) {
  if (!response || Array.isArray(response) || typeof response !== 'object') {
    throw new Error('Invalid TypeSafe router response')
  }

  const taskMode = requireAnswer(response.answers, 'task_mode', 'choice')
  const reasoningDepth = requireAnswer(response.answers, 'reasoning_depth', 'choice')
  const evidenceInsufficient = requireAnswer(response.answers, 'evidence_insufficient', 'noul')
  const contextSignals = {}

  for (const domain of Object.keys(domainQuestions)) {
    const answer = requireAnswer(response.answers, `needs_${domain}`, 'noul')
    contextSignals[domain] = answer.noul
  }

  return {
    schemaVersion: JEV_ROUTER_SCHEMA_VERSION,
    mode: 'shadow',
    authority: 'advisory_only',
    stateSha256: metadata.stateSha256,
    model: response.model,
    elapsedMs: metadata.elapsedMs,
    attempts: metadata.attempts ?? 1,
    usage: response.usage,
    routing: {
      taskMode: {
        value: taskMode.choice,
        confidence: taskMode.confidence,
        probabilities: taskMode.probabilities,
      },
      reasoningDepth: {
        value: reasoningDepth.choice,
        confidence: reasoningDepth.confidence,
        probabilities: reasoningDepth.probabilities,
      },
      evidenceInsufficient: evidenceInsufficient.noul,
      contextSignals,
    },
  }
}
