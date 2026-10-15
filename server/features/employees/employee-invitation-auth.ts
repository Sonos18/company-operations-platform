export type EmployeeOffboardingAuthResult =
  | { kind: 'disabled' }
  | { kind: 'failed' }

export interface EmployeeOffboardingAuthAdmin {
  disableUser(userId: string): Promise<EmployeeOffboardingAuthResult>
}
