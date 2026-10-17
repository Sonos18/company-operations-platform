import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')
const migrationPath = 'supabase/migrations/20261017090100_c1_material_proposal_notifications.sql'
const pgtapPath = 'supabase/tests/database/c1/c1_material_proposal_notifications.test.sql'
const normalize = (text: string) => text.replace(/\s+/gu, ' ').trim().toLowerCase()
const read = (path: string) => (existsSync(resolve(root, path)) ? readFileSync(resolve(root, path), 'utf8') : '')

const eventKinds = [
  'material.order.created', 'material.contract.recorded', 'material.contract.amended',
  'material.installment.due_soon', 'material.installment.overdue',
  'material.payment.submitted', 'material.payment.returned', 'material.payment.paid', 'material.payment.approved',
  'material.proposal.submitted', 'material.proposal.approved', 'material.proposal.returned',
]
const sourceTypes = ['material_order', 'material_contract', 'material_installment', 'material_payment_request', 'material_proposal']

const helperSignatures = [
  'private.c1_material_user_display_name(uuid,uuid,uuid)',
  'private.c1_material_user_can_read_proposal(uuid,uuid,uuid,uuid)',
  'private.c1_material_summary_payload(jsonb)',
  'private.c1_material_proposal_notification_payload(uuid,bigint,uuid)',
  'private.c1_material_notify_proposal_submitted()',
  'private.c1_material_notify_proposal_decided()',
  'private.c1_material_label_app_notification()',
  'private.c1_material_notify_order_created()',
]

// The quoted values inside a "check (column in (...))" clause, in order.
function checkedValues(sql: string, constraint: string): string[] {
  const start = sql.indexOf(`add constraint ${constraint} check (`)
  if (start < 0) return []
  const clause = sql.slice(start, sql.indexOf('))', start))
  return [...clause.matchAll(/'([^']+)'/gu)].map(([, value]) => value!)
}

function functionBody(sql: string, header: string): string {
  const start = sql.indexOf(header)
  return start < 0 ? '' : sql.slice(start, sql.indexOf('$$;', start))
}

describe('C1 material proposal notifications and order labels', () => {
  const sql = normalize(read(migrationPath))

  it('is pinned to lock 62 with the standard header and footer', () => {
    expect(existsSync(resolve(root, migrationPath))).toBe(true)
    expect(sql.startsWith("set local lock_timeout = '5s'; set local statement_timeout = '90s'; select pg_catalog.pg_advisory_xact_lock(71842, 62);")).toBe(true)
    expect(sql.endsWith("notify pgrst, 'reload schema';")).toBe(true)
    expect(sql).not.toMatch(/\btruncate\b/u)
    expect(sql).not.toMatch(/\bdelete from\b/u)
    expect(sql).not.toMatch(/\bdrop table\b/u)
    // 71843 belongs to proposal numbering (20261017090000).
    expect(sql).not.toContain('71843')
    // The five wrapped read functions are not touched again.
    for (const name of ['proposal_json', 'order_json', 'read_contract', 'finance_facts', 'finance_inbox_facts']) {
      expect(sql).not.toContain(`function private.c1_material_${name}(`)
      expect(sql).not.toContain(`c1_material_${name}_core`)
    }
  })

  it('widens the notification event and source checks', () => {
    expect(sql).toContain('drop constraint app_notifications_event_kind_check')
    expect(sql).toContain('drop constraint app_notifications_source_type_check')
    expect(checkedValues(sql, 'app_notifications_event_kind_check')).toEqual(eventKinds)
    expect(checkedValues(sql, 'app_notifications_source_type_check')).toEqual(sourceTypes)
  })

  it('notifies on proposal submit and decision through row triggers', () => {
    expect(sql).toContain('create trigger material_proposal_submitted_notify after insert on public.material_proposal_revisions for each row execute function private.c1_material_notify_proposal_submitted();')
    expect(sql).toContain('create trigger material_proposal_decided_notify after insert on public.material_proposal_decisions for each row execute function private.c1_material_notify_proposal_decided();')

    const submitted = functionBody(sql, 'create function private.c1_material_notify_proposal_submitted()')
    expect(submitted).toContain("'material.proposal.decide'")
    expect(submitted).toContain('private.c1_material_user_can_read_proposal(')
    expect(submitted).toContain('private.c1_material_notify_users(')
    expect(submitted).toContain("'material.proposal.submitted', 'material_proposal'")
    expect(submitted).toContain("':sub:'")

    const decided = functionBody(sql, 'create function private.c1_material_notify_proposal_decided()')
    expect(decided).toContain('private.c1_material_user_can_read_proposal(')
    expect(decided).toContain('private.c1_material_notify_users(')
    expect(decided).toContain("'material.proposal.approved'")
    expect(decided).toContain("'material.proposal.returned'")
    expect(decided).toContain("'reason'")

    // Recipients are checked by their own permissions, never by the acting session.
    const canRead = functionBody(sql, 'create function private.c1_material_user_can_read_proposal(')
    expect(canRead).toContain('private.c1_workflow_user_has_permission(')
    expect(canRead).not.toContain('auth.uid()')

    const displayName = functionBody(sql, 'create function private.c1_material_user_display_name(')
    expect(displayName).toContain('from public.employees')
    expect(displayName).toContain('from auth.users')
  })

  it('labels finance notifications with their order before insert, leaving proposals and existing keys alone', () => {
    expect(sql).toContain('create trigger app_notifications_order_label before insert on public.app_notifications for each row execute function private.c1_material_label_app_notification();')
    const label = functionBody(sql, 'create function private.c1_material_label_app_notification()')
    expect(label).toContain('private.c1_material_order_label(')
    expect(label).toContain('|| new.payload')
    expect(label).toContain("'material_installment'")
    expect(label).toContain("split_part(new.dedupe_key, ':', 2)")
  })

  it('moves the order-created notification to a deferred constraint trigger with an order summary', () => {
    expect(sql).toContain('drop trigger material_order_created_notify on public.material_orders;')
    expect(sql).toContain('create or replace function private.c1_material_notify_order_created()')
    expect(sql).toContain('create constraint trigger material_order_created_notify after insert on public.material_orders deferrable initially deferred for each row execute function private.c1_material_notify_order_created();')
    const orderCreated = functionBody(sql, 'create or replace function private.c1_material_notify_order_created()')
    expect(orderCreated).toContain('private.c1_material_order_summary(new.id)')
    expect(sql.indexOf('drop trigger material_order_created_notify')).toBeLessThan(sql.indexOf('create constraint trigger material_order_created_notify'))
  })

  it('keeps every new or replaced private function revoked from all API roles', () => {
    const revoke = sql.slice(sql.lastIndexOf('revoke all on function'))
    for (const signature of helperSignatures) expect(revoke).toContain(signature)
    expect(revoke).toContain('from public, anon, authenticated, service_role;')
  })

  it('adds a rollback-only pgTAP file with the c136 prefix, registered in the runner', () => {
    const pgtap = read(pgtapPath)
    expect(pgtap).toMatch(/^begin;/u)
    expect(pgtap.replace(/\r\n?/gu, '\n').trim()).toMatch(/select \* from finish\(true\);\nrollback;$/u)
    const ids = [...pgtap.matchAll(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu)].map(([id]) => id)
    expect(ids.length).toBeGreaterThan(0)
    expect(ids.every(id => id.startsWith('c136'))).toBe(true)
    expect(pgtap).toContain('set constraints all immediate;')
    for (const kind of ['material.proposal.submitted', 'material.proposal.approved', 'material.proposal.returned', 'material.order.created', 'material.contract.recorded']) {
      expect(pgtap).toContain(`'${kind}'`)
    }
    expect(read('scripts/run-c1-cloud-dev-tests.mjs')).toContain("'c1_material_proposal_notifications.test.sql': 'c136'")
  })

  it('keeps older pgTAP files on immediate order-created notifications from their first order on', () => {
    // File -> the statement that creates its first order.
    const firstOrder: Record<string, string> = {
      'supabase/tests/database/c1/c1_material_finance_foundation.test.sql': 'insert into public.material_orders(',
      'supabase/tests/database/c1/c1_material_finance_reads.test.sql': 'insert into public.material_orders(',
      'supabase/tests/database/c1/c1_material_order_inline_supplier.test.sql': "insert into inline_ids(name,value) select 'unchanged'",
    }
    for (const [path, anchor] of Object.entries(firstOrder)) {
      const text = read(path)
      const immediate = text.indexOf('set constraints all immediate;')
      expect(immediate, path).toBeGreaterThan(0)
      expect(text.indexOf(anchor), path).toBeGreaterThan(immediate)
    }
  })
})
