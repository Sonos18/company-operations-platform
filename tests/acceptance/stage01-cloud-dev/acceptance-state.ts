import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export const B4_RESULTS_DIRECTORY = 'test-results/b4-stage01'
export const B4_SECRET_STATE_PATH = `${B4_RESULTS_DIRECTORY}/acceptance-state.json`
export const B4_EVIDENCE_PATH = `${B4_RESULTS_DIRECTORY}/acceptance-evidence.json`

export interface B4ActorCredential {
  userId: string
  employeeId: string
  email: string
  password: string
}

export interface B4AcceptanceState {
  runMarker: string
  tenantId: string
  companyId: string
  companyCode: 'VQH_STAGE01_ACCEPTANCE'
  acceptanceSnapshotId: string
  actors: {
    reader: B4ActorCredential
    operator: B4ActorCredential
    decision: B4ActorCredential
  }
  profiles: {
    p1OpportunityId: string
    p2OpportunityId: string
    p3OpportunityId: string
  }
}

export interface B4AcceptanceEvidence {
  runMarker: string
  tenantId: string
  companyId: string
  companyCode: 'VQH_STAGE01_ACCEPTANCE'
  acceptanceSnapshotId: string
  profileOpportunityIds: string[]
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} is invalid`)
  return value as Record<string, unknown>
}

function requiredString(value: unknown, label: string) {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} is invalid`)
  return value
}

function readActor(value: unknown, label: string): B4ActorCredential {
  const actor = asRecord(value, label)
  return {
    userId: requiredString(actor.userId, `${label}.userId`),
    employeeId: requiredString(actor.employeeId, `${label}.employeeId`),
    email: requiredString(actor.email, `${label}.email`),
    password: requiredString(actor.password, `${label}.password`),
  }
}

export function parseB4AcceptanceState(value: unknown): B4AcceptanceState {
  const state = asRecord(value, 'B4 acceptance state')
  const actors = asRecord(state.actors, 'B4 acceptance actors')
  const profiles = asRecord(state.profiles, 'B4 acceptance profiles')
  if (state.companyCode !== 'VQH_STAGE01_ACCEPTANCE') throw new Error('B4 acceptance state company code is invalid')

  return {
    runMarker: requiredString(state.runMarker, 'B4 acceptance runMarker'),
    tenantId: requiredString(state.tenantId, 'B4 acceptance tenantId'),
    companyId: requiredString(state.companyId, 'B4 acceptance companyId'),
    companyCode: 'VQH_STAGE01_ACCEPTANCE',
    acceptanceSnapshotId: requiredString(state.acceptanceSnapshotId, 'B4 acceptance snapshot'),
    actors: {
      reader: readActor(actors.reader, 'B4 acceptance reader'),
      operator: readActor(actors.operator, 'B4 acceptance operator'),
      decision: readActor(actors.decision, 'B4 acceptance decision'),
    },
    profiles: {
      p1OpportunityId: requiredString(profiles.p1OpportunityId, 'B4 acceptance P1 profile'),
      p2OpportunityId: requiredString(profiles.p2OpportunityId, 'B4 acceptance P2 profile'),
      p3OpportunityId: requiredString(profiles.p3OpportunityId, 'B4 acceptance P3 profile'),
    },
  }
}

export async function readB4AcceptanceState(cwd = process.cwd()) {
  return parseB4AcceptanceState(JSON.parse(await readFile(resolve(cwd, B4_SECRET_STATE_PATH), 'utf8')))
}

export function toB4AcceptanceEvidence(state: B4AcceptanceState): B4AcceptanceEvidence {
  return {
    runMarker: state.runMarker,
    tenantId: state.tenantId,
    companyId: state.companyId,
    companyCode: state.companyCode,
    acceptanceSnapshotId: state.acceptanceSnapshotId,
    profileOpportunityIds: [state.profiles.p1OpportunityId, state.profiles.p2OpportunityId, state.profiles.p3OpportunityId],
  }
}

export async function readB4AcceptanceEvidence(cwd = process.cwd()): Promise<B4AcceptanceEvidence> {
  const evidence = asRecord(JSON.parse(await readFile(resolve(cwd, B4_EVIDENCE_PATH), 'utf8')), 'B4 acceptance evidence')
  if (evidence.companyCode !== 'VQH_STAGE01_ACCEPTANCE' || !Array.isArray(evidence.profileOpportunityIds)) {
    throw new Error('B4 acceptance evidence is invalid')
  }
  return {
    runMarker: requiredString(evidence.runMarker, 'B4 evidence runMarker'),
    tenantId: requiredString(evidence.tenantId, 'B4 evidence tenantId'),
    companyId: requiredString(evidence.companyId, 'B4 evidence companyId'),
    companyCode: 'VQH_STAGE01_ACCEPTANCE',
    acceptanceSnapshotId: requiredString(evidence.acceptanceSnapshotId, 'B4 evidence snapshot'),
    profileOpportunityIds: evidence.profileOpportunityIds.map((value, index) => requiredString(value, `B4 evidence profile ${index}`)),
  }
}
