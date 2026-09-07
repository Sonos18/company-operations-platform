import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { CANONICAL_DEV_PROJECT_REF } from '../../../scripts/assert-cloud-dev-target.mjs'
import { runSupabaseDevMode } from '../../../scripts/run-supabase-dev.mjs'
import { STAGE01_CONCURRENCY_SCENARIOS, runStage01CloudDevConcurrency } from '../../../scripts/run-stage01-cloud-dev-concurrency.mjs'

const worktrees: string[] = []
const root = resolve(import.meta.dirname, '../../..')
const oldVqhProjectRef = ['ykrurrum', 'qlsxnqfqunjc'].join('')
const stage01SqlInventory = [
  'stage01_schema.test.sql',
  'stage01_definition.test.sql',
  'stage01_bootstrap.test.sql',
  'stage01_security.test.sql',
  'stage01_history.test.sql',
  'stage01_commands.test.sql',
  'stage01_flows.test.sql',
  'stage01_config_schema.test.sql',
  'stage01_config_security.test.sql',
  'stage01_config_commands.test.sql',
  'stage01_opportunity_create_options_security.test.sql',
  'stage01_b4_acceptance.test.sql',
  'opportunity_decision_authority.test.sql',
]

const stage01ConfigPermissionMetadata = [
  "('stage01.config.read', 'stage01', 'Read Stage 01 configuration', 'Read published Stage 01 configuration and active drafts')",
  "('stage01.config.update', 'stage01', 'Update Stage 01 configuration', 'Create, update, and discard Stage 01 configuration drafts')",
  "('stage01.config.publish', 'stage01', 'Publish Stage 01 configuration', 'Publish immutable Stage 01 configuration snapshots')",
]

type FinalDecisionDefinition = {
  body: string
  dollarQuoteTag: string
  end: number
  nextStatementStartsOutsideBody: boolean
  start: number
  statementTerminated: boolean
}

function skipSqlQuotedText(source: string, offset: number, quote: "'" | '"'): number {
  let cursor = offset + 1
  while (cursor < source.length) {
    if (source[cursor] === quote) {
      if (source[cursor + 1] === quote) cursor += 2
      else return cursor + 1
    }
    else cursor += 1
  }
  throw new Error(`Unterminated ${quote} quoted SQL text`)
}

function dollarQuoteTagAt(source: string, offset: number): string | undefined {
  return source.slice(offset).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/u)?.[0]
}

function skipDollarQuotedText(source: string, offset: number, tag: string): number {
  const closingOffset = source.indexOf(tag, offset + tag.length)
  if (closingOffset === -1) throw new Error(`Unterminated ${tag} quoted SQL text`)
  return closingOffset + tag.length
}

function findDollarQuoteClose(source: string, bodyStart: number, tag: string): number {
  for (let cursor = bodyStart; cursor < source.length;) {
    if (source.startsWith(tag, cursor)) return cursor
    if (source[cursor] === "'" || source[cursor] === '"') {
      cursor = skipSqlQuotedText(source, cursor, source[cursor] as "'" | '"')
    }
    else if (dollarQuoteTagAt(source, cursor)) {
      const nestedTag = dollarQuoteTagAt(source, cursor)!
      cursor = skipDollarQuotedText(source, cursor, nestedTag)
    }
    else if (source.startsWith('--', cursor)) {
      const lineEnd = source.indexOf('\n', cursor + 2)
      cursor = lineEnd === -1 ? source.length : lineEnd + 1
    }
    else if (source.startsWith('/*', cursor)) {
      const commentEnd = source.indexOf('*/', cursor + 2)
      if (commentEnd === -1) throw new Error('Unterminated SQL block comment')
      cursor = commentEnd + 2
    }
    else cursor += 1
  }
  throw new Error(`Unterminated ${tag} function body`)
}

function extractFinalDecisionDefinitions(source: string): FinalDecisionDefinition[] {
  const marker = /create or replace function private\.record_opportunity_decision_final_decision\(/giu
  return [...source.matchAll(marker)].map(match => {
    const start = match.index!
    const headerEnd = source.indexOf('\n', start)
    const header = source.slice(start, headerEnd === -1 ? source.length : headerEnd + 300)
    const dollarQuoteTag = header.match(/\bas\s+(\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$)/iu)?.[1]
    if (!dollarQuoteTag) throw new Error('Final Decision function is missing an opening dollar quote')
    const bodyStart = source.indexOf(dollarQuoteTag, start) + dollarQuoteTag.length
    const end = findDollarQuoteClose(source, bodyStart, dollarQuoteTag)
    const statementEnd = end + dollarQuoteTag.length
    const nextStatement = source.slice(statementEnd + 1).trimStart()
    return {
      body: source.slice(bodyStart, end), dollarQuoteTag, end, start,
      statementTerminated: source[statementEnd] === ';',
      nextStatementStartsOutsideBody: /^(?:create|alter|revoke|grant|--)/iu.test(nextStatement),
    }
  })
}

function auditPlpgsqlStructure(body: string): { controlStack: string[], parentheses: number } {
  const tokens: string[] = []
  for (let cursor = 0; cursor < body.length;) {
    if (body[cursor] === "'" || body[cursor] === '"') cursor = skipSqlQuotedText(body, cursor, body[cursor] as "'" | '"')
    else if (dollarQuoteTagAt(body, cursor)) {
      const tag = dollarQuoteTagAt(body, cursor)!
      cursor = skipDollarQuotedText(body, cursor, tag)
    }
    else if (body.startsWith('--', cursor)) {
      const lineEnd = body.indexOf('\n', cursor + 2)
      cursor = lineEnd === -1 ? body.length : lineEnd + 1
    }
    else if (body.startsWith('/*', cursor)) {
      const commentEnd = body.indexOf('*/', cursor + 2)
      if (commentEnd === -1) throw new Error('Unterminated SQL block comment')
      cursor = commentEnd + 2
    }
    else if (/[A-Za-z_]/u.test(body[cursor]!)) {
      const word = body.slice(cursor).match(/^[A-Za-z_][A-Za-z0-9_]*/u)![0].toLowerCase()
      tokens.push(word)
      cursor += word.length
    }
    else if (body[cursor] === '(' || body[cursor] === ')') {
      tokens.push(body[cursor]!)
      cursor += 1
    }
    else cursor += 1
  }

  const controlStack: string[] = []
  let parentheses = 0
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (token === '(') parentheses += 1
    else if (token === ')') parentheses -= 1
    else if (token === 'begin') controlStack.push('BEGIN')
    else if (token === 'if') controlStack.push('IF')
    else if (token === 'case') controlStack.push('CASE')
    else if (token === 'loop') controlStack.push('LOOP')
    else if (token === 'end') {
      const expected = tokens[index + 1] === 'if' ? 'IF' : tokens[index + 1] === 'loop' ? 'LOOP' : undefined
      if (expected) index += 1
      const actual = controlStack.pop()
      if (actual !== (expected ?? actual)) throw new Error(`Expected END ${actual ?? 'without opener'}, found END ${expected ?? ''}`.trim())
    }
  }
  return { controlStack, parentheses }
}

function hasUnparenthesizedCaseEqualityInIf(body: string): boolean {
  return /\bif\b[^;]*?=\s*case\b[\s\S]*?\bend\s+then\b/iu.test(body)
}

function makeWorktree({ linked = true }: { linked?: boolean } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'taskovia-cloud-dev-runner-'))
  worktrees.push(root)
  mkdirSync(join(root, 'supabase/.temp'), { recursive: true })
  if (linked) writeFileSync(join(root, 'supabase/.temp/project-ref'), `${CANONICAL_DEV_PROJECT_REF}\n`)
  writeFileSync(
    join(root, '.env.local'),
    `NUXT_PUBLIC_SUPABASE_URL=https://${CANONICAL_DEV_PROJECT_REF}.supabase.co\nNUXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_test-key\n`,
  )
  writeFileSync(join(root, '.supabase.dev.env.local'), 'SUPABASE_DEV_ACCESS_TOKEN=dedicated-dev-pat\n')
  return root
}

afterEach(() => {
  for (const root of worktrees.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('Cloud DEV fixed-mode runner', () => {
  it('ships a fixed two-session same-request authority replay scenario', async () => {
    expect(STAGE01_CONCURRENCY_SCENARIOS).toContainEqual(expect.objectContaining({
      name: 'authority-assignment-replay',
      outcome: 'same_request_replay',
    }))
    const calls: string[] = []
    await runStage01CloudDevConcurrency({
      scenarios: STAGE01_CONCURRENCY_SCENARIOS.filter(scenario => scenario.name === 'authority-assignment-replay'),
      runOperation: async (scenario, phase) => {
        calls.push(`${scenario}/${phase}`)
        return { ok: true }
      },
    })
    expect(calls).toEqual([
      'authority-assignment-replay/cleanup', 'authority-assignment-replay/setup',
      'authority-assignment-replay/actor_a', 'authority-assignment-replay/actor_b',
      'authority-assignment-replay/assert', 'authority-assignment-replay/cleanup',
    ])
    for (const phase of ['setup', 'actor_a', 'actor_b', 'assert', 'cleanup']) {
      expect(existsSync(resolve(root, 'supabase/tests/database/stage01_concurrency/authority-assignment-replay', `${phase}.sql`))).toBe(true)
    }
  })

  it('ships every allowlisted Stage 01 SQL verification file', () => {
    for (const filename of stage01SqlInventory) {
      expect(existsSync(resolve(root, 'supabase/tests/database', filename))).toBe(true)
    }
  })

  it('closes the Final Decision override branch before continuing its Amendment 25 migration function', () => {
    const migration = readFileSync(resolve(root, 'supabase/migrations/20260904050924_opportunity_decision_authority_slice1.sql'), 'utf8')
    const definitions = extractFinalDecisionDefinitions(migration)

    expect(definitions).toHaveLength(2)
    for (const definition of definitions) {
      expect(definition.dollarQuoteTag).toBe('$$')
      expect(definition.statementTerminated).toBe(true)
      expect(definition.nextStatementStartsOutsideBody).toBe(true)
      expect(auditPlpgsqlStructure(definition.body)).toEqual({ controlStack: [], parentheses: 0 })
      expect(hasUnparenthesizedCaseEqualityInIf(definition.body)).toBe(false)
      expect(definition.body).toMatch(/\bif\b[^;]*?=\s*\(\s*case\b[\s\S]*?\bend\s*\)\s*then\b/iu)
      expect(definition.body).toContain("elsif nullif(btrim(target_input ->> 'overrideRationale'),'') is null then raise exception using errcode = 'P0001', message = 'STAGE01_OVERRIDE_RATIONALE_REQUIRED'; end if;\n  update public.stage01_decision_cycles")
    }
  })

  it('rejects an unparenthesized CASE equality in an IF while accepting the PostgreSQL-safe form', () => {
    expect(hasUnparenthesizedCaseEqualityInIf("if lhs = case value when 'a' then 'b' else 'c' end then null; end if;")).toBe(true)
    expect(hasUnparenthesizedCaseEqualityInIf("if lhs = (case value when 'a' then 'b' else 'c' end) then null; end if;")).toBe(false)
  })

  it('ignores nested dollar-quoted text while auditing PL/pgSQL control structure', () => {
    expect(auditPlpgsqlStructure('begin perform $quoted$ if begin end $quoted$; end;'))
      .toEqual({ controlStack: [], parentheses: 0 })
  })

  it('maps only the dedicated DEV PAT to the guarded child environment', () => {
    const root = makeWorktree()
    let childEnvironment: NodeJS.ProcessEnv | undefined
    let childArgs: string[] | undefined

    runSupabaseDevMode('status', {
      cwd: root,
      env: {
        LOCALAPPDATA: 'C:\\Users\\developer\\AppData\\Local',
        SUPABASE_ACCESS_TOKEN: 'ambient-token',
        SUPABASE_CLI_BINARY_OVERRIDE: 'untrusted-supabase-binary.exe',
        SUPABASE_DB_PASSWORD: 'ambient-password',
      },
      spawn(_command, args, options) {
        childArgs = args
        childEnvironment = options.env
        return { status: 0 }
      },
    })

    expect(childArgs?.slice(-3)).toEqual(['migration', 'list', '--linked'])
    expect(childEnvironment?.SUPABASE_HOME).toBe('C:\\Users\\developer\\AppData\\Local\\SupabaseCLI\\taskovia-dev')
    expect(childEnvironment?.SUPABASE_ACCESS_TOKEN).toBe('dedicated-dev-pat')
    expect(childEnvironment).not.toHaveProperty('SUPABASE_CLI_BINARY_OVERRIDE')
    expect(childEnvironment).not.toHaveProperty('SUPABASE_DB_PASSWORD')
    expect(childEnvironment).not.toHaveProperty('SUPABASE_DEV_ACCESS_TOKEN')
  })

  it('fails before spawning when the dedicated DEV PAT file is missing, ambiguous, or empty', () => {
    const root = makeWorktree()
    rmSync(join(root, '.supabase.dev.env.local'))
    let spawnCalls = 0
    const spawn = () => {
      spawnCalls += 1
      return { status: 0 }
    }

    expect(() => runSupabaseDevMode('status', { cwd: root, spawn })).toThrow('Dedicated Supabase DEV PAT file is missing')
    writeFileSync(join(root, '.supabase.dev.env.local'), 'SUPABASE_DEV_ACCESS_TOKEN=first\nSUPABASE_DEV_ACCESS_TOKEN=second\n')
    expect(() => runSupabaseDevMode('status', { cwd: root, spawn })).toThrow('SUPABASE_DEV_ACCESS_TOKEN must be assigned exactly once')
    writeFileSync(join(root, '.supabase.dev.env.local'), 'SUPABASE_DEV_ACCESS_TOKEN=\n')
    expect(() => runSupabaseDevMode('status', { cwd: root, spawn })).toThrow('SUPABASE_DEV_ACCESS_TOKEN is missing or empty')
    expect(spawnCalls).toBe(0)
  })

  it('checks access to the exact DEV ref without printing a project list', () => {
    const root = makeWorktree()
    let childArgs: string[] | undefined

    expect(() => runSupabaseDevMode('auth-check', {
      cwd: root,
      spawn(_command, args) {
        childArgs = args
        return {
          status: 0,
          stdout: JSON.stringify({ message: 'projects available', projects: [{ ref: CANONICAL_DEV_PROJECT_REF }] }),
        }
      },
    })).not.toThrow()

    expect(childArgs?.slice(-4)).toEqual(['projects', 'list', '--output-format', 'json'])
  })

  it('checks PAT visibility before a fresh checkout has link state', () => {
    const root = makeWorktree({ linked: false })

    expect(() => runSupabaseDevMode('auth-check', {
      cwd: root,
      spawn: () => ({
        status: 0,
        stdout: JSON.stringify({ message: 'projects available', projects: [{ ref: CANONICAL_DEV_PROJECT_REF }] }),
      }),
    })).not.toThrow()
  })

  it('links a fresh checkout to the fixed canonical ref and verifies the resulting link state', () => {
    const root = makeWorktree({ linked: false })

    expect(() => runSupabaseDevMode('link', {
      cwd: root,
      spawn(_command, args) {
        expect(args.slice(-3)).toEqual(['link', '--project-ref', CANONICAL_DEV_PROJECT_REF])
        writeFileSync(join(root, 'supabase/.temp/project-ref'), `${CANONICAL_DEV_PROJECT_REF}\n`)
        return { status: 0 }
      },
    })).not.toThrow()
  })

  it('uses the shared canonical project constant for the link command', () => {
    const runner = readFileSync(new URL('../../../scripts/run-supabase-dev.mjs', import.meta.url), 'utf8')

    expect(runner).toContain("link: ['link', '--project-ref', CANONICAL_DEV_PROJECT_REF]")
    expect(runner).not.toContain(oldVqhProjectRef)
  })

  it('fails closed when a successful link process does not create canonical link state', () => {
    const root = makeWorktree({ linked: false })
    let spawnCalls = 0

    expect(() => runSupabaseDevMode('link', {
      cwd: root,
      spawn() {
        spawnCalls += 1
        return { status: 0 }
      },
    })).toThrow('Supabase CLI link state is missing')
    expect(spawnCalls).toBe(1)
  })

  it('rejects a PAT that cannot see the canonical DEV project before returning', () => {
    const root = makeWorktree()

    expect(() => runSupabaseDevMode('auth-check', {
      cwd: root,
      spawn: () => ({ status: 0, stdout: JSON.stringify({ message: 'projects available', projects: [{ ref: 'other-project-ref' }] }) }),
    })).toThrow('Dedicated Supabase DEV PAT cannot access the canonical project')
  })

  it('rejects malformed or missing CLI project envelopes without exposing them', () => {
    const root = makeWorktree()

    expect(() => runSupabaseDevMode('auth-check', {
      cwd: root,
      spawn: () => ({ status: 0, stdout: JSON.stringify({ message: 'projects available' }) }),
    })).toThrow('Supabase DEV auth check returned invalid project data')
  })

  it('rejects arbitrary and destructive modes before spawning a child', () => {
    let spawnCalls = 0
    const spawn = () => {
      spawnCalls += 1
      return { status: 0 }
    }

    expect(() => runSupabaseDevMode('db reset --linked', { spawn })).toThrow('Unsupported Cloud DEV operation')
    expect(() => runSupabaseDevMode('seed', { spawn })).toThrow('Unsupported Cloud DEV operation')
    expect(spawnCalls).toBe(0)
  })

  it('sends a metadata-complete canonical catalog check through the linked CLI query argument', () => {
    const root = makeWorktree()
    let childArgs: string[] | undefined

    runSupabaseDevMode('canonical-check', {
      cwd: root,
      spawn(_command, args) {
        childArgs = args
        return { status: 0 }
      },
    })

    expect(childArgs?.slice(1, 4)).toEqual(['db', 'query', '--linked'])
    const sql = childArgs?.[4] ?? ''
    expect(sql).toContain('expected_departments')
    expect(sql).toContain("'Ban lãnh đạo'")
    expect(sql).toContain('department.name is distinct from expected.name')
    expect(sql).toContain('department.is_active is distinct from true')
    expect(sql).toContain('expected_roles')
    expect(sql).toContain("'Complete explicit company permission set'")
    expect(sql).toContain("('opportunity.read', 'opportunity', 'Read opportunities'")
    expect(sql).toContain("('stage01.reactivate', 'stage01', 'Reactivate Stage 01'")
    expect(stage01ConfigPermissionMetadata.every(metadata => sql.includes(metadata))).toBe(true)
    for (const metadata of stage01ConfigPermissionMetadata) {
      expect(sql.split(metadata)).toHaveLength(4)
    }
    expect(sql).toContain('role.is_privileged is distinct from expected.is_privileged')
    expect(sql).toContain('role.is_system is distinct from true')
    expect(sql).toContain('role.is_active is distinct from true')
    expect(sql).toContain('expected_role_permissions')
    expect(sql).toContain("union all select 'company_admin', code from all_expected_permissions")
    expect(sql).toContain('select code from public.permissions except select code from all_expected_permissions')
    expect(sql).toContain('select code from all_expected_permissions except select code from public.permissions')
    expect(sql).toContain('select role_code, permission_code from expected_role_permissions except select role_code, permission_code from actual_role_permissions')
    expect(sql).toContain('select role_code, permission_code from actual_role_permissions except select role_code, permission_code from expected_role_permissions')
    const explicitRolePermissions = sql.slice(
      sql.indexOf('explicit_role_permissions(role_code, permission_code) as (values'),
      sql.indexOf('expected_role_permissions(role_code, permission_code) as ('),
    )
    expect(explicitRolePermissions).not.toContain('stage01.config.')
    expect(sql).toContain('company_role_assignments')
  })

  it('runs a fixed, target-guarded read-only pgTAP diagnostic through the dedicated PAT runner', () => {
    const root = makeWorktree()
    let childArgs: string[] | undefined
    let childEnvironment: NodeJS.ProcessEnv | undefined

    expect(() => runSupabaseDevMode('stage01-pgtap-diagnostic', {
      cwd: root,
      env: {
        LOCALAPPDATA: 'C:\\Users\\developer\\AppData\\Local',
        SUPABASE_ACCESS_TOKEN: 'ambient-token',
        SUPABASE_DB_PASSWORD: 'ambient-password',
      },
      spawn(_command, args, options) {
        childArgs = args
        childEnvironment = options.env
        return { status: 0 }
      },
    })).not.toThrow()

    expect(childArgs?.slice(1, 4)).toEqual(['db', 'query', '--linked'])
    const sql = childArgs?.[4] ?? ''
    expect(sql).toContain("where e.extname = 'pgtap'")
    expect(sql).toContain("current_setting('search_path') as search_path")
    expect(sql).toContain("to_regprocedure('plan(integer)')::text as unqualified_plan")
    expect(sql).toContain("format('%I.plan(integer)'")
    expect(sql).not.toMatch(/\b(?:insert|update|delete|merge|truncate|create|alter|drop|grant|revoke|call|do|set|reset|copy)\b/iu)
    expect(childEnvironment?.SUPABASE_ACCESS_TOKEN).toBe('dedicated-dev-pat')
    expect(childEnvironment).not.toHaveProperty('SUPABASE_DB_PASSWORD')
  })

  it('rejects supplied SQL, file paths, and extra arguments for the fixed pgTAP diagnostic', () => {
    const root = makeWorktree()
    let spawnCalls = 0
    const spawn = () => {
      spawnCalls += 1
      return { status: 0 }
    }

    expect(() => runSupabaseDevMode('stage01-pgtap-diagnostic', {
      cwd: root,
      extraArgs: ['select current_user'],
      spawn,
    })).toThrow('Unsupported Cloud DEV operation')
    expect(() => runSupabaseDevMode('stage01-pgtap-diagnostic --file operator.sql', {
      cwd: root,
      spawn,
    })).toThrow('Unsupported Cloud DEV operation')
    expect(spawnCalls).toBe(0)
  })

  it('requires the canonical Cloud DEV target guard before running the fixed pgTAP diagnostic', () => {
    const root = makeWorktree({ linked: false })
    let spawnCalls = 0

    expect(() => runSupabaseDevMode('stage01-pgtap-diagnostic', {
      cwd: root,
      spawn() {
        spawnCalls += 1
        return { status: 0 }
      },
    })).toThrow('Supabase CLI link state is missing')
    expect(spawnCalls).toBe(0)
  })

  it('exposes the fixed pgTAP diagnostic through its dedicated package command', () => {
    const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))

    expect(packageJson.scripts['db:dev:stage01:pgtap-diagnostic'])
      .toBe('node scripts/run-supabase-dev.mjs stage01-pgtap-diagnostic')
  })

  it('executes the complete fixed Stage 01 inventory exactly once, including B1 configuration verification files', () => {
    const root = makeWorktree()
    const testDirectory = join(root, 'supabase/tests/database')
    mkdirSync(testDirectory, { recursive: true })
    for (const filename of stage01SqlInventory) {
      writeFileSync(join(testDirectory, filename), "begin;\nselect 'PASS';\nrollback;\n")
    }
    const queriedFiles: string[] = []

    runSupabaseDevMode('stage01-test', {
      cwd: root,
      spawn(_command, args) {
        queriedFiles.push(args[5] ?? '')
        return { status: 0 }
      },
    })

    expect(queriedFiles).toEqual(stage01SqlInventory.map(filename => join(testDirectory, filename)))
  })

  it.each([
    ['stage01_config_schema.test.sql', "begin;\nselect 'unsafe';\ncommit;\n", 'Stage 01 SQL verification must end with rollback'],
    ['stage01_config_security.test.sql', "begin;\nmigration repair --status;\nrollback;\n", 'Stage 01 SQL contains a forbidden Cloud DEV operation'],
    ['stage01_config_commands.test.sql', "select 'unsafe';\nrollback;\n", 'Stage 01 SQL verification must start with begin'],
  ])('rejects unsafe B1 Stage 01 verification fixture %s before Cloud DEV access', (filename, sql, error) => {
    const root = makeWorktree()
    const testDirectory = join(root, 'supabase/tests/database')
    mkdirSync(testDirectory, { recursive: true })
    writeFileSync(join(testDirectory, filename), sql)
    let spawnCalls = 0

    expect(() => runSupabaseDevMode('stage01-test', {
      cwd: root,
      spawn() {
        spawnCalls += 1
        return { status: 0 }
      },
    })).toThrow(error)
    expect(spawnCalls).toBe(0)
  })

  it('executes only allowlisted transaction-wrapped Stage 01 SQL files', () => {
    const root = makeWorktree()
    const testDirectory = join(root, 'supabase/tests/database')
    mkdirSync(testDirectory, { recursive: true })
    writeFileSync(
      join(testDirectory, 'stage01_schema.test.sql'),
      "begin;\nselect 'PASS';\nrollback;\n",
    )
    const calls: string[][] = []

    runSupabaseDevMode('stage01-test', {
      cwd: root,
      spawn(_command, args) {
        calls.push(args)
        return { status: 0 }
      },
    })

    expect(calls).toHaveLength(1)
    expect(calls[0]?.slice(1, 5)).toEqual(['db', 'query', '--linked', '--file'])
    expect(calls[0]?.[5]).toBe(join(root, 'supabase/tests/database/stage01_schema.test.sql'))
  })

  it('fails before Cloud DEV access when an allowlisted Stage 01 SQL file can retain fixtures', () => {
    const root = makeWorktree()
    const testDirectory = join(root, 'supabase/tests/database')
    mkdirSync(testDirectory, { recursive: true })
    writeFileSync(join(testDirectory, 'stage01_schema.test.sql'), "begin;\nselect 'unsafe';\ncommit;\n")
    let spawnCalls = 0

    expect(() => runSupabaseDevMode('stage01-test', {
      cwd: root,
      spawn() {
        spawnCalls += 1
        return { status: 0 }
      },
    })).toThrow('Stage 01 SQL verification must end with rollback')
    expect(spawnCalls).toBe(0)
  })

  it('does not discover arbitrary Stage 01-looking SQL files outside the fixed inventory', () => {
    const root = makeWorktree()
    const testDirectory = join(root, 'supabase/tests/database')
    mkdirSync(testDirectory, { recursive: true })
    writeFileSync(join(testDirectory, 'stage01_schema.test.sql'), "begin;\nselect 'PASS';\nrollback;\n")
    writeFileSync(join(testDirectory, 'stage01_operator_supplied.test.sql'), "begin;\ndrop schema public cascade;\nrollback;\n")
    const queriedFiles: string[] = []

    runSupabaseDevMode('stage01-test', {
      cwd: root,
      spawn(_command, args) {
        queriedFiles.push(args[5] ?? '')
        return { status: 0 }
      },
    })

    expect(queriedFiles).toEqual([join(root, 'supabase/tests/database/stage01_schema.test.sql')])
  })

  it('does not expose obsolete per-actor CLI modes after the Management API harness owns concurrency', () => {
    let spawnCalls = 0

    expect(() => runSupabaseDevMode('stage01-concurrency-actor-a', {
      spawn() {
        spawnCalls += 1
        return { status: 0 }
      },
    })).toThrow('Unsupported Cloud DEV operation')
    expect(spawnCalls).toBe(0)
  })

  it('leaves generated types byte-identical when type generation fails or is implausible', () => {
    const root = makeWorktree()
    const target = join(root, 'shared/types/database.types.ts')
    mkdirSync(join(root, 'shared/types/database.types.ts', '..'), { recursive: true })
    writeFileSync(target, 'existing generated types\n')

    expect(() => runSupabaseDevMode('types', { cwd: root, spawn: () => ({ status: 1, stdout: 'failure' }) })).toThrow()
    expect(readFileSync(target, 'utf8')).toBe('existing generated types\n')
    expect(() => runSupabaseDevMode('types', { cwd: root, spawn: () => ({ status: 0, stdout: 'not types' }) })).toThrow()
    expect(readFileSync(target, 'utf8')).toBe('existing generated types\n')
  })
})
