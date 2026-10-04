import { employeeDetailSchema, employeeInvitationInputSchema } from '../../../shared/schemas/employees'
import type { EmployeeInvitationInput } from '../../../shared/schemas/employees'
import { buildAuthCallbackUrl } from '../../../shared/utils/app-url'
import type { PreparedEmployeeInvitation } from '../../../shared/schemas/employee-invitations'
import { AppApiError } from '../../utils/api-error'
import type { EmployeeRepository } from './employee.repository'
import type { EmployeeServiceContext } from './employee.service'
import type { ManualInvitationAuth } from './manual-invitation-auth'
export function requireInvitationPermission(context: EmployeeServiceContext): void {
  if (!context.permissions.includes('account.invite') || !context.permissions.includes('employee.create')) {
    throw new AppApiError(403, 'PERMISSION_DENIED', 'Bạn không có quyền mời nhân viên.')
  }
}
function failed(): never { throw new AppApiError(502, 'ACCOUNT_INVITE_FAILED', 'Không thể chuẩn bị lời mời. Vui lòng thử lại sau.') }
function incomplete(): never { throw new AppApiError(409, 'ONBOARDING_INCOMPLETE', 'Hồ sơ chưa hoàn tất. Chưa có lời mời để gửi; hãy thử lại cùng thông tin.') }
function profileConflict(): never {
  throw new AppApiError(409, 'EMPLOYEE_EMAIL_CONFLICT', 'Thông tin lời mời không khớp hồ sơ đang lưu. Hãy cập nhật hồ sơ nhân viên trước, rồi tạo lại lời mời với thông tin đã lưu.')
}
export interface InvitationEmployeeProfile {
  employeeCode: string
  workEmail: string
  fullName: string
  departmentId: string
  positionId: string | null
  hireDate: string | null
  employmentStatus: string
}
function matchesProfile(employee: InvitationEmployeeProfile, input: EmployeeInvitationInput): boolean {
  return employee.employeeCode === input.employeeCode && employee.workEmail === input.workEmail
    && employee.fullName === input.fullName && employee.departmentId === input.departmentId
    && employee.positionId === (input.positionId ?? null) && employee.hireDate === (input.hireDate ?? null)
    && employee.employmentStatus !== 'terminated'
}
const preparingEmails = new Set<string>()
interface ManualInvitationRepository extends Pick<EmployeeRepository, 'completeEmployeeOnboarding'> {
  findInvitationEmployee(companyId: string, userId: string): Promise<InvitationEmployeeProfile | null>
}
export function createManualEmployeeInvitationService(
  repository: ManualInvitationRepository,
  auth: ManualInvitationAuth,
  appUrl: string,
) {
  return {
    async prepare(context: EmployeeServiceContext, rawInput: EmployeeInvitationInput): Promise<PreparedEmployeeInvitation> {
      requireInvitationPermission(context)
      const input = employeeInvitationInputSchema.parse(rawInput)
      const callback = buildAuthCallbackUrl(appUrl)
      if (preparingEmails.has(input.workEmail)) incomplete()
      preparingEmails.add(input.workEmail)
      try {
        const identity = await auth.inspect(input.workEmail, context)
        if (identity.kind === 'active' || identity.kind === 'foreign') {
          throw new AppApiError(409, 'EMPLOYEE_EMAIL_CONFLICT', 'Email đã có tài khoản hoặc lời mời không thuộc công ty này. Không thể cấp link qua form mời.')
        }
        if (identity.kind === 'failed') failed()
        if (identity.kind === 'pending') {
          const existing = await repository.findInvitationEmployee(context.companyId, identity.userId)
          if (existing && !matchesProfile(existing, input)) profileConflict()
        }
        let generated
        try { generated = await auth.generate(input.workEmail, context, identity) } catch { return failed() }
        try {
          const employee = employeeDetailSchema.safeParse(await repository.completeEmployeeOnboarding(context.companyId, generated.userId, input))
          if (!employee.success || employee.data.workEmail !== input.workEmail || employee.data.account?.userId !== generated.userId
            || employee.data.employeeCode !== input.employeeCode || employee.data.employmentStatus === 'terminated') incomplete()
          if (!matchesProfile({
            ...employee.data,
            departmentId: employee.data.department.id,
            positionId: employee.data.position?.id ?? null,
          }, input)) profileConflict()
        } catch (error) {
          if (error instanceof AppApiError && ['EMPLOYEE_EMAIL_CONFLICT', 'ONBOARDING_INCOMPLETE', 'PERMISSION_DENIED'].includes(error.code)) throw error
          return incomplete()
        }
        // Auth and profile may change during onboarding; validate both again before release.
        try { await auth.assertPending(generated.userId, input.workEmail, context) } catch { return failed() }
        let persisted: InvitationEmployeeProfile | null
        try { persisted = await repository.findInvitationEmployee(context.companyId, generated.userId) } catch { return incomplete() }
        if (!persisted) incomplete()
        if (!matchesProfile(persisted, input)) profileConflict()
        const link = new URL(callback)
        link.search = new URLSearchParams({ token_hash: generated.tokenHash, type: 'invite' }).toString()
        return {
          status: 'prepared',
          recipient: persisted.workEmail,
          subject: 'Lời mời tham gia Taskovia',
          body: [
            'Chào ' + persisted.fullName + ',',
            '',
            'Bạn được mời tham gia Taskovia. Mở liên kết bên dưới để tự đặt mật khẩu từ 8 đến 72 ký tự:',
            link.toString(),
            '',
            'Liên kết chỉ dùng một lần. Nếu liên kết đã hết hạn hoặc đã được sử dụng, hãy liên hệ HR để kiểm tra lời mời.',
            'Sau khi đặt mật khẩu, bạn có thể đăng nhập bằng email này.',
            '',
            'Nếu bạn không mong đợi lời mời này, vui lòng bỏ qua email.',
          ].join('\n'),
        }
      } finally { preparingEmails.delete(input.workEmail) }
    },
  }
}
