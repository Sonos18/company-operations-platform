import { describe, expect, it } from 'vitest'
import {
  DEFAULT_JEV_ROUTER_MODEL,
  buildJevRouterRequest,
  findBlockedSensitiveStatePaths,
  hashRouterState,
  summarizeJevRouterResponse,
} from '../../../scripts/jev-router-core.mjs'

describe('Jev router shadow core', () => {
  it('builds a pinned, multi-question shadow routing request', () => {
    const state = {
      request: 'Review the open UI pull request and identify the next safe action.',
      repository: { branch: 'feat/example' },
    }

    const request = buildJevRouterRequest(state)

    expect(request.model).toBe(DEFAULT_JEV_ROUTER_MODEL)
    expect(request.state).toEqual(state)
    expect(request.questions.task_mode.type).toBe('choice')
    expect(request.questions.task_mode.criteria.other).toContain('does not fit')
    expect(request.questions.reasoning_depth.type).toBe('choice')
    expect(request.questions.evidence_insufficient.type).toBe('noul')
    expect(request.questions.needs_frontend.type).toBe('noul')
    expect(request.questions.needs_backend.type).toBe('noul')
    expect(request.questions.needs_database.type).toBe('noul')
    expect(request.questions.needs_security.type).toBe('noul')
    expect(request.questions.needs_testing.type).toBe('noul')
    expect(request.questions.needs_git.type).toBe('noul')
    expect(request.questions.needs_docs.type).toBe('noul')
  })

  it('requires a non-empty request', () => {
    expect(() => buildJevRouterRequest({ request: '   ' })).toThrow(
      'Router state must include a non-empty string field `request`',
    )
  })

  it('blocks obvious secret-bearing fields before they can be sent to TypeSafe', () => {
    const state = {
      request: 'Review this task.',
      auth: { api_key: 'must-not-leave-the-process' },
    }

    expect(findBlockedSensitiveStatePaths(state)).toEqual(['$.auth.api_key'])
    expect(() => buildJevRouterRequest(state)).toThrow('Router state contains blocked sensitive data')
  })

  it('blocks bearer-token values nested inside arrays', () => {
    const state = {
      request: 'Review this task.',
      evidence: ['safe', 'Bearer must-not-leave-the-process'],
    }

    expect(findBlockedSensitiveStatePaths(state)).toEqual(['$.evidence[1]'])
    expect(() => buildJevRouterRequest(state)).toThrow('Router state contains blocked sensitive data')
  })

  it('blocks generic token-bearing credential keys while allowing usage counters', () => {
    const state = {
      request: 'Review this task.',
      token: 'root-token',
      auth: {
        session_token: 'session-token',
        githubToken: 'github-token',
      },
    }

    expect(findBlockedSensitiveStatePaths(state)).toEqual([
      '$.token',
      '$.auth.session_token',
      '$.auth.githubToken',
    ])
    expect(() => buildJevRouterRequest(state)).toThrow('Router state contains blocked sensitive data')
  })

  it('does not mistake token usage counters for credentials', () => {
    const state = {
      request: 'Review the telemetry shape.',
      usage: { input_tokens: 500, output_tokens: 40 },
    }

    expect(findBlockedSensitiveStatePaths(state)).toEqual([])
    expect(() => buildJevRouterRequest(state)).not.toThrow()
  })

  it('rejects unexpectedly large router state instead of silently sending it', () => {
    expect(() => buildJevRouterRequest({ request: 'x'.repeat(24_100) })).toThrow(
      'Router state is too large for the compact shadow contract',
    )
  })

  it('hashes semantically identical object key order the same way', () => {
    const a = { request: 'Inspect', evidence: { beta: 2, alpha: 1 } }
    const b = { evidence: { alpha: 1, beta: 2 }, request: 'Inspect' }

    expect(hashRouterState(a)).toBe(hashRouterState(b))
  })

  it('summarizes TypeSafe answers without storing the raw state', () => {
    const response = {
      model: 'jev-1.13.0',
      usage: { input_tokens: 500, output_tokens: 40 },
      answers: {
        task_mode: {
          type: 'choice',
          choice: 'review',
          confidence: 0.91,
          probabilities: { review: 0.91, inspect: 0.09 },
        },
        reasoning_depth: {
          type: 'choice',
          choice: 'focused',
          confidence: 0.82,
          probabilities: { routine: 0.08, focused: 0.82, deep: 0.1 },
        },
        evidence_insufficient: { type: 'noul', noul: 0.18 },
        needs_frontend: { type: 'noul', noul: 0.96 },
        needs_backend: { type: 'noul', noul: 0.15 },
        needs_database: { type: 'noul', noul: 0.05 },
        needs_security: { type: 'noul', noul: 0.44 },
        needs_testing: { type: 'noul', noul: 0.87 },
        needs_git: { type: 'noul', noul: 0.98 },
        needs_docs: { type: 'noul', noul: 0.12 },
      },
    }

    const summary = summarizeJevRouterResponse(response, {
      stateSha256: 'abc123',
      elapsedMs: 123.45,
    })

    expect(summary.mode).toBe('shadow')
    expect(summary.authority).toBe('advisory_only')
    expect(summary.routing.taskMode.value).toBe('review')
    expect(summary.routing.contextSignals.frontend).toBe(0.96)
    expect(summary.usage.input_tokens).toBe(500)
    expect(summary).not.toHaveProperty('state')
  })
})
