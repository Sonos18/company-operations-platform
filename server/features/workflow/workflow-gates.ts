import type { GateReport } from '../../../shared/schemas/workflow'

export type GateCheck = GateReport['checks'][number]
export type GateCheckStatus = GateCheck['status']

export function gateCheck(input: {
  code: string
  satisfied: boolean
  satisfiedMessage: string
  unsatisfiedMessage: string
  unsatisfiedStatus?: Exclude<GateCheckStatus, 'satisfied'>
  resourceRef?: string
}): GateCheck {
  return {
    code: input.code,
    status: input.satisfied ? 'satisfied' : (input.unsatisfiedStatus ?? 'missing'),
    message: input.satisfied ? input.satisfiedMessage : input.unsatisfiedMessage,
    ...(input.resourceRef === undefined ? {} : { resourceRef: input.resourceRef }),
  }
}

export function gateReport(checks: GateCheck[]): GateReport {
  return {
    satisfied: checks.every(check => check.status === 'satisfied'),
    checks,
  }
}
