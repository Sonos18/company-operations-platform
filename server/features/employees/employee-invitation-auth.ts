export type EmployeeInvitationAuthResult =
  | { kind: 'invited', userId: string }
  | { kind: 'existing' }
  | { kind: 'failed' }

export type EmployeeInvitationUserLookup =
  | { kind: 'found', userId: string }
  | { kind: 'not_found' }
  | { kind: 'failed' }

export interface EmployeeInvitationAuthAdmin {
  inviteUser(email: string): Promise<EmployeeInvitationAuthResult>
  findUserByEmail(email: string): Promise<EmployeeInvitationUserLookup>
}
