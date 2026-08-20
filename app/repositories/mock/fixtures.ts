import { VQH_COMPANY_CONFIG } from '../../config/companies/vqh.company'
import type { ProjectStage, StageStatus } from '../../features/journey/journey.types'
import type { MockState } from './schemas'

const scope = { tenantId: 'tenant-vqh', companyId: 'company-vqh' }

const privateDetails = {
  dateOfBirth: null,
  gender: null,
  personalEmail: null,
  personalPhone: null,
  currentAddress: null,
  permanentAddress: null,
  taxCode: null,
  socialInsuranceNumber: null,
  emergencyContactName: null,
  emergencyContactPhone: null,
} as const

const roles = {
  employee: { id: '10000000-0000-4000-8000-000000000301', code: 'employee', name: 'Nhân viên', description: 'Company directory and assigned-work access', isPrivileged: false, isSystem: true },
  hrManager: { id: '10000000-0000-4000-8000-000000000302', code: 'hr_manager', name: 'Quản lý nhân sự', description: 'Employee records, private details, and account invitations', isPrivileged: false, isSystem: true },
  supplierSourcing: { id: '10000000-0000-4000-8000-000000000303', code: 'supplier_sourcing', name: 'Thu mua', description: 'Supplier and quotation sourcing', isPrivileged: false, isSystem: true },
  inventoryAuditor: { id: '10000000-0000-4000-8000-000000000304', code: 'inventory_auditor', name: 'Kiểm kê kho', description: 'Inventory and stock count audit', isPrivileged: false, isSystem: true },
  technicalStaff: { id: '10000000-0000-4000-8000-000000000305', code: 'technical_staff', name: 'Nhân viên kỹ thuật', description: 'Technical documents and assigned work', isPrivileged: false, isSystem: true },
  designer: { id: '10000000-0000-4000-8000-000000000306', code: 'designer', name: 'Nhân viên thiết kế', description: 'Drawings and assigned work', isPrivileged: false, isSystem: true },
  accountant: { id: '10000000-0000-4000-8000-000000000307', code: 'accountant', name: 'Kế toán', description: 'Accounting documents, suppliers, and inventory value', isPrivileged: false, isSystem: true },
} as const

export const CANONICAL_MOCK_EMPLOYEES: MockState['employees'] = [
  { ...scope, managerEmployeeId: null, id: '10000000-0000-4000-8000-000000000401', employeeCode: 'VQH-NHU', fullName: 'Như', workEmail: 'nhu@vqh.local', account: { userId: '10000000-0000-4000-8000-000000000101', email: 'nhu@vqh.local' }, department: { id: '10000000-0000-4000-8000-000000000202', code: 'HR', name: 'Phòng Nhân sự' }, position: null, hireDate: null, probationEndDate: null, employmentStatus: 'active', profileComplete: false, roles: [roles.employee, roles.hrManager, roles.supplierSourcing, roles.inventoryAuditor], privateDetails },
  { ...scope, managerEmployeeId: null, id: '10000000-0000-4000-8000-000000000402', employeeCode: 'VQH-LONG', fullName: 'Long', workEmail: 'long@vqh.local', account: { userId: '10000000-0000-4000-8000-000000000102', email: 'long@vqh.local' }, department: { id: '10000000-0000-4000-8000-000000000203', code: 'TECH', name: 'Phòng Kỹ thuật' }, position: null, hireDate: null, probationEndDate: null, employmentStatus: 'active', profileComplete: false, roles: [roles.employee, roles.technicalStaff], privateDetails },
  { ...scope, managerEmployeeId: null, id: '10000000-0000-4000-8000-000000000403', employeeCode: 'VQH-HIEU', fullName: 'Hiếu', workEmail: 'hieu@vqh.local', account: { userId: '10000000-0000-4000-8000-000000000103', email: 'hieu@vqh.local' }, department: { id: '10000000-0000-4000-8000-000000000203', code: 'TECH', name: 'Phòng Kỹ thuật' }, position: null, hireDate: null, probationEndDate: null, employmentStatus: 'active', profileComplete: false, roles: [roles.employee, roles.technicalStaff], privateDetails },
  { ...scope, managerEmployeeId: null, id: '10000000-0000-4000-8000-000000000404', employeeCode: 'VQH-Y', fullName: 'Y', workEmail: 'y@vqh.local', account: { userId: '10000000-0000-4000-8000-000000000104', email: 'y@vqh.local' }, department: { id: '10000000-0000-4000-8000-000000000207', code: 'ACCOUNTING', name: 'Phòng Kế toán' }, position: null, hireDate: null, probationEndDate: null, employmentStatus: 'active', profileComplete: false, roles: [roles.employee, roles.accountant], privateDetails },
  { ...scope, managerEmployeeId: null, id: '10000000-0000-4000-8000-000000000405', employeeCode: 'VQH-NHI', fullName: 'Nhi', workEmail: 'nhi@vqh.local', account: { userId: '10000000-0000-4000-8000-000000000105', email: 'nhi@vqh.local' }, department: { id: '10000000-0000-4000-8000-000000000204', code: 'DESIGN', name: 'Phòng Thiết kế' }, position: null, hireDate: null, probationEndDate: null, employmentStatus: 'active', profileComplete: false, roles: [roles.employee, roles.designer], privateDetails },
  { ...scope, managerEmployeeId: null, id: '10000000-0000-4000-8000-000000000406', employeeCode: 'VQH-HAU', fullName: 'Hậu', workEmail: 'hau@vqh.local', account: { userId: '10000000-0000-4000-8000-000000000106', email: 'hau@vqh.local' }, department: { id: '10000000-0000-4000-8000-000000000204', code: 'DESIGN', name: 'Phòng Thiết kế' }, position: null, hireDate: null, probationEndDate: null, employmentStatus: 'active', profileComplete: false, roles: [roles.employee, roles.designer], privateDetails },
]

function makeStage(input: {
  id: string
  code: string
  name: string
  purpose: string
  status: StageStatus
  ownerDepartment: string
  imageUrl: string
  visualKind?: ProjectStage['visualKind']
  missing?: number
}): ProjectStage {
  const completed = input.status === 'completed' ? 3 : input.status === 'active' ? 1 : 0
  return {
    ...scope,
    ...input,
    visualKind: input.visualKind ?? 'record',
    completedCount: completed,
    totalCount: 3,
    dueAt: input.status === 'active' ? '2026-08-25T17:00:00+07:00' : null,
    lastActivityAt: '2026-08-12T09:30:00+07:00',
    requiredRecordCount: 3,
    missingRecordCount: input.missing ?? (input.status === 'active' ? 1 : 0),
    subStages: [
      { id: `${input.id}-01`, code: `${input.code}.1`, name: 'Chuẩn bị đầu vào', status: completed > 0 ? 'completed' : 'upcoming', ownerName: 'Người phụ trách' },
      { id: `${input.id}-02`, code: `${input.code}.2`, name: 'Thực hiện và kiểm tra', status: input.status === 'active' ? 'active' : input.status, ownerName: input.ownerDepartment },
      { id: `${input.id}-03`, code: `${input.code}.3`, name: 'Lưu hồ sơ kết quả', status: input.status === 'completed' ? 'completed' : 'upcoming', ownerName: 'Điều phối dự án' },
    ],
    records: [
      { id: `${input.id}-record-01`, label: 'Biên bản đầu vào', kind: 'form', status: input.status === 'upcoming' ? 'draft' : 'ready' },
      { id: `${input.id}-record-02`, label: 'Hồ sơ kết quả giai đoạn', kind: 'document', status: input.missing ? 'missing' : input.status === 'upcoming' ? 'draft' : 'ready' },
      { id: `${input.id}-record-03`, label: 'Minh chứng xác nhận', kind: 'evidence', status: input.status === 'completed' ? 'ready' : 'draft' },
    ],
    activities: [
      { id: `${input.id}-activity-01`, at: '2026-08-12T09:30:00+07:00', actorName: 'Anh Long', description: 'Cập nhật người phụ trách và mốc dự kiến.' },
      { id: `${input.id}-activity-02`, at: '2026-08-11T16:15:00+07:00', actorName: 'Chị Nhi', description: 'Bổ sung hồ sơ tham chiếu cho giai đoạn.' },
    ],
  }
}

const thaoDienStages: ProjectStage[] = [
  makeStage({ id: 'stage-intake', code: '01', name: 'Tiếp nhận yêu cầu', purpose: 'Ghi nhận nhu cầu, phạm vi và kỳ vọng ban đầu của khách hàng.', status: 'completed', ownerDepartment: 'Ban lãnh đạo', imageUrl: '/mock/journey/thao-dien-01-intake.webp' }),
  makeStage({ id: 'stage-survey', code: '02', name: 'Khảo sát hiện trạng', purpose: 'Đo đạc, ghi nhận điều kiện công trình và các ràng buộc thực tế.', status: 'completed', ownerDepartment: 'Thi công – Hiện trường', imageUrl: '/mock/journey/thao-dien-02-survey.webp' }),
  makeStage({ id: 'stage-design-2d', code: '03', name: 'Thiết kế mặt bằng 2D', purpose: 'Chốt công năng, luồng sử dụng và mặt bằng bố trí.', status: 'completed', ownerDepartment: 'Thiết kế – Kỹ thuật', imageUrl: '/mock/journey/thao-dien-03-floor-plan.webp', visualKind: 'drawing' }),
  makeStage({ id: 'stage-design-3d', code: '04', name: 'Phối cảnh 3D & chốt phương án', purpose: 'Phát triển hình ảnh không gian và lưu mốc phương án khách hàng đã chốt.', status: 'completed', ownerDepartment: 'Thiết kế – Kỹ thuật', imageUrl: '/mock/journey/thao-dien-04-design-approved.webp', visualKind: 'drawing' }),
  makeStage({ id: 'stage-contract', code: '05', name: 'Hợp đồng & chuẩn bị thi công', purpose: 'Hoàn thiện phạm vi, hồ sơ thương mại và điều kiện triển khai.', status: 'completed', ownerDepartment: 'Kế toán – Tài chính', imageUrl: '/mock/journey/thao-dien-05-preconstruction.webp' }),
  makeStage({ id: 'stage-construction', code: '06', name: 'Thi công & giám sát', purpose: 'Theo dõi hiện trạng, chất lượng, công việc và hồ sơ tại công trình.', status: 'active', ownerDepartment: 'Thi công – Hiện trường', imageUrl: '/mock/journey/thao-dien-06-site-current.webp', visualKind: 'construction_comparison', missing: 1 }),
  makeStage({ id: 'stage-handover', code: '07', name: 'Nghiệm thu & bàn giao', purpose: 'Hoàn tất kiểm tra, khắc phục, nghiệm thu và bàn giao hồ sơ.', status: 'upcoming', ownerDepartment: 'Kiểm soát chất lượng', imageUrl: '/mock/journey/thao-dien-07-handover.webp' }),
]

const vinhomesStages: ProjectStage[] = [
  makeStage({ id: 'vh-stage-intake', code: '01', name: 'Tiếp nhận yêu cầu', purpose: 'Ghi nhận yêu cầu cải tạo căn hộ.', status: 'completed', ownerDepartment: 'Ban lãnh đạo', imageUrl: '/mock/journey/vinhomes-01-intake.webp' }),
  makeStage({ id: 'vh-stage-survey', code: '02', name: 'Khảo sát hiện trạng', purpose: 'Đo đạc căn hộ và quy định tòa nhà.', status: 'completed', ownerDepartment: 'Thi công – Hiện trường', imageUrl: '/mock/journey/vinhomes-02-survey.webp' }),
  makeStage({ id: 'vh-stage-design', code: '03', name: 'Thiết kế phương án', purpose: 'Phát triển và chốt phương án thiết kế.', status: 'active', ownerDepartment: 'Thiết kế – Kỹ thuật', imageUrl: '/mock/journey/vinhomes-03-design.webp', visualKind: 'drawing', missing: 1 }),
  makeStage({ id: 'vh-stage-construction', code: '04', name: 'Thi công', purpose: 'Triển khai thi công sau khi đủ điều kiện.', status: 'upcoming', ownerDepartment: 'Thi công – Hiện trường', imageUrl: '/mock/journey/vinhomes-04-construction.webp' }),
]

export const INITIAL_MOCK_STATE: MockState = {
  tenants: [
    { id: 'tenant-vqh', name: 'Việt Quốc Huy', deploymentMode: 'shared' },
    { id: 'tenant-isolation-test', name: 'Tenant kiểm thử cách ly', deploymentMode: 'shared' },
  ],
  companies: [
    { ...scope, code: 'VQH', name: VQH_COMPANY_CONFIG.displayName },
    { tenantId: 'tenant-isolation-test', companyId: 'company-isolation-test', code: 'ISO', name: 'Công ty kiểm thử cách ly' },
  ],
  companyConfigs: [
    VQH_COMPANY_CONFIG,
    { tenantId: 'tenant-isolation-test', companyId: 'company-isolation-test', displayName: 'Công ty kiểm thử cách ly', shortName: 'Công ty kiểm thử cách ly', brand: { logoUrl: null, primaryColor: '#000000', accentColor: '#ffffff' }, departments: [], terminology: {}, workflowTemplateIds: [] },
  ],
  tenantMemberships: [{ userId: 'user-vqh-demo', tenantId: 'tenant-vqh', roles: ['tenant_member'] }],
  companyMemberships: [{ ...scope, userId: 'user-vqh-demo', roles: ['project_member'] }],
  employees: CANONICAL_MOCK_EMPLOYEES,
  projects: [
    {
      ...scope,
      id: 'project-thao-dien', code: 'VQH-2607', name: 'Nhà phố Thảo Điền', clientName: 'Anh Minh & chị Hà',
      location: 'Thảo Điền, TP. Thủ Đức', coverUrl: '/mock/journey/thao-dien-04-design-approved.webp', currentStageId: 'stage-construction', currentStageName: 'Thi công & giám sát',
      completedStageCount: 5, totalStageCount: 7, ownerDepartments: ['Thiết kế – Kỹ thuật', 'Thi công – Hiện trường'], lastActivityAt: '2026-08-12T09:30:00+07:00',
      workflowSnapshot: { ...scope, templateId: 'workflow-design-build-v1', version: 1, enforcementMode: 'advisory', applicabilityNote: 'Prototype minh họa — điều kiện chỉ hướng dẫn, không khóa giai đoạn.' },
      stages: thaoDienStages,
    },
    {
      ...scope,
      id: 'project-vinhomes', code: 'VQH-2608', name: 'Căn hộ Vinhomes Central Park', clientName: 'Chị Phương',
      location: 'Bình Thạnh, TP.HCM', coverUrl: '/mock/journey/vinhomes-03-design.webp', currentStageId: 'vh-stage-design', currentStageName: 'Thiết kế phương án',
      completedStageCount: 2, totalStageCount: 4, ownerDepartments: ['Thiết kế – Kỹ thuật'], lastActivityAt: '2026-08-11T14:20:00+07:00',
      workflowSnapshot: { ...scope, templateId: 'workflow-design-build-v2', version: 2, enforcementMode: 'advisory', applicabilityNote: 'Dự án cải tạo căn hộ — không áp dụng bước thiết kế kết cấu.' },
      stages: vinhomesStages,
    },
    {
      tenantId: 'tenant-isolation-test', companyId: 'company-isolation-test', id: 'project-other-company-leak-test', code: 'ISO-001', name: 'Dự án không được rò', clientName: 'Khách thử', location: 'Ẩn', coverUrl: '/mock/vinhomes-cover.svg', currentStageId: 'other-stage', currentStageName: 'Ẩn', completedStageCount: 0, totalStageCount: 1, ownerDepartments: [], lastActivityAt: '2026-08-01T00:00:00Z',
      workflowSnapshot: { tenantId: 'tenant-isolation-test', companyId: 'company-isolation-test', templateId: 'other', version: 1, enforcementMode: 'advisory', applicabilityNote: '' }, stages: [],
    },
  ],
  drawings: [
    { ...scope, id: 'drawing-livingroom-v1', drawingGroupId: 'drawing-group-livingroom', stageId: 'stage-design-3d', code: 'PC-NT-01', category: 'Phối cảnh nội thất', versionNumber: 1, originalFilename: 'phoi-canh-phong-khach-v1.pdf', url: '/mock/drawing-livingroom-v1.svg', uploadedAt: '2026-07-11T10:00:00+07:00', uploadedByName: 'Chị Nhi', effectiveFrom: '2026-07-11T10:00:00+07:00', effectiveTo: null, isCurrent: true, customerApproved: true, parentFileId: null, relationship: null },
    { ...scope, id: 'drawing-livingroom-v2', drawingGroupId: 'drawing-group-livingroom', stageId: 'stage-design-3d', code: 'PC-NT-01', category: 'Phối cảnh nội thất', versionNumber: 2, originalFilename: 'phoi-canh-phong-khach-v2.pdf', url: '/mock/drawing-livingroom-v2.svg', uploadedAt: '2026-07-18T15:30:00+07:00', uploadedByName: 'Chị Nhi', effectiveFrom: '2026-07-18T15:30:00+07:00', effectiveTo: null, isCurrent: false, customerApproved: false, parentFileId: null, relationship: 'replacement' },
    { ...scope, id: 'drawing-lighting-supplement', drawingGroupId: 'drawing-group-livingroom', stageId: 'stage-design-3d', code: 'PC-NT-01-BS', category: 'Chi tiết bổ sung', versionNumber: 3, originalFilename: 'bo-sung-chieu-sang.pdf', url: '/mock/drawing-livingroom-v2.svg', uploadedAt: '2026-07-21T09:00:00+07:00', uploadedByName: 'Anh Long', effectiveFrom: '2026-07-21T09:00:00+07:00', effectiveTo: null, isCurrent: false, customerApproved: false, parentFileId: 'drawing-livingroom-v1', relationship: 'supplement' },
  ],
  media: [
    { ...scope, id: 'media-design-target', stageId: 'stage-construction', kind: 'design_target', url: '/mock/journey/thao-dien-06-design-target.webp', description: 'Phòng khách theo phương án khách hàng đã chốt', workArea: 'Tầng trệt · Phòng khách', capturedAt: '2026-07-18T15:30:00+07:00', photographerName: 'Chị Nhi', retainsOriginal: true },
    { ...scope, id: 'media-site-older', stageId: 'stage-construction', kind: 'progress', url: '/mock/journey/thao-dien-06-site-current.webp', description: 'Hoàn thiện hệ khung trần', workArea: 'Tầng trệt · Phòng khách', capturedAt: '2026-08-10T16:10:00+07:00', photographerName: 'Anh Long', retainsOriginal: false },
    { ...scope, id: 'media-site-current', stageId: 'stage-construction', kind: 'progress', url: '/mock/journey/thao-dien-06-site-current.webp', description: 'Cập nhật thi công trần và hệ điện', workArea: 'Tầng trệt · Phòng khách', capturedAt: '2026-08-12T08:15:00+07:00', photographerName: 'Anh Hiếu', retainsOriginal: false },
    { ...scope, id: 'media-evidence', stageId: 'stage-construction', kind: 'evidence', url: '/mock/journey/thao-dien-06-site-current.webp', description: 'Ảnh hồ sơ nghiệm thu hệ điện âm trần', workArea: 'Tầng trệt · Phòng khách', capturedAt: '2026-08-11T14:00:00+07:00', photographerName: 'Anh Hiếu', retainsOriginal: true },
  ],
  tasks: [
    { ...scope, id: 'task-01', projectId: 'project-thao-dien', projectName: 'Nhà phố Thảo Điền', stageId: 'stage-construction', stageName: 'Thi công & giám sát', title: 'Bổ sung ảnh hệ điện âm trần', ownerName: 'Anh Hiếu', status: 'open', priority: 'high', dueAt: '2026-08-11T17:00:00+07:00', assignmentSource: 'director', relatedRecordLabel: 'Nhật ký công trình' },
    { ...scope, id: 'task-02', projectId: 'project-thao-dien', projectName: 'Nhà phố Thảo Điền', stageId: 'stage-construction', stageName: 'Thi công & giám sát', title: 'Đối chiếu vật tư trần thạch cao', ownerName: 'Anh Long', status: 'in_progress', priority: 'high', dueAt: '2026-08-12T16:00:00+07:00', assignmentSource: 'self_proposed', relatedRecordLabel: 'Phiếu vật tư' },
    { ...scope, id: 'task-03', projectId: 'project-thao-dien', projectName: 'Nhà phố Thảo Điền', stageId: 'stage-construction', stageName: 'Thi công & giám sát', title: 'Xác nhận lịch đội sơn', ownerName: 'Anh Hiếu', status: 'open', priority: 'medium', dueAt: '2026-08-12T18:00:00+07:00', assignmentSource: 'director', relatedRecordLabel: null },
    { ...scope, id: 'task-04', projectId: 'project-thao-dien', projectName: 'Nhà phố Thảo Điền', stageId: 'stage-construction', stageName: 'Thi công & giám sát', title: 'Chờ khách xác nhận màu gỗ', ownerName: 'Chị Nhi', status: 'waiting', priority: 'medium', dueAt: null, assignmentSource: 'self_proposed', relatedRecordLabel: 'Mẫu vật liệu' },
    { ...scope, id: 'task-05', projectId: 'project-thao-dien', projectName: 'Nhà phố Thảo Điền', stageId: 'stage-handover', stageName: 'Nghiệm thu & bàn giao', title: 'Chuẩn bị checklist nghiệm thu', ownerName: 'Anh Long', status: 'open', priority: 'medium', dueAt: '2026-08-15T17:00:00+07:00', assignmentSource: 'director', relatedRecordLabel: 'Checklist nghiệm thu' },
    { ...scope, id: 'task-06', projectId: 'project-thao-dien', projectName: 'Nhà phố Thảo Điền', stageId: 'stage-construction', stageName: 'Thi công & giám sát', title: 'Cập nhật báo cáo tuần', ownerName: 'Anh Hiếu', status: 'open', priority: 'low', dueAt: '2026-08-14T16:00:00+07:00', assignmentSource: 'self_proposed', relatedRecordLabel: 'Báo cáo tuần' },
    { ...scope, id: 'task-07', projectId: 'project-vinhomes', projectName: 'Căn hộ Vinhomes Central Park', stageId: 'vh-stage-design', stageName: 'Thiết kế phương án', title: 'Hoàn thiện moodboard phòng ngủ', ownerName: 'Chị Nhi', status: 'open', priority: 'high', dueAt: '2026-08-10T17:00:00+07:00', assignmentSource: 'director', relatedRecordLabel: 'Moodboard v2' },
    { ...scope, id: 'task-08', projectId: 'project-vinhomes', projectName: 'Căn hộ Vinhomes Central Park', stageId: 'vh-stage-design', stageName: 'Thiết kế phương án', title: 'Kiểm tra kích thước tủ bếp', ownerName: 'Anh Long', status: 'open', priority: 'medium', dueAt: '2026-08-12T15:00:00+07:00', assignmentSource: 'self_proposed', relatedRecordLabel: 'Mặt bằng bếp' },
    { ...scope, id: 'task-09', projectId: 'project-vinhomes', projectName: 'Căn hộ Vinhomes Central Park', stageId: 'vh-stage-design', stageName: 'Thiết kế phương án', title: 'Chờ ban quản lý duyệt giờ khảo sát', ownerName: 'Anh Hiếu', status: 'waiting', priority: 'high', dueAt: null, assignmentSource: 'director', relatedRecordLabel: null },
    { ...scope, id: 'task-10', projectId: 'project-vinhomes', projectName: 'Căn hộ Vinhomes Central Park', stageId: 'vh-stage-design', stageName: 'Thiết kế phương án', title: 'Gửi lại phương án ánh sáng', ownerName: 'Chị Nhi', status: 'open', priority: 'medium', dueAt: '2026-08-16T17:00:00+07:00', assignmentSource: 'director', relatedRecordLabel: 'Phối cảnh v3' },
    { ...scope, id: 'task-11', projectId: 'project-vinhomes', projectName: 'Căn hộ Vinhomes Central Park', stageId: 'vh-stage-design', stageName: 'Thiết kế phương án', title: 'Rà soát danh mục thiết bị', ownerName: 'Anh Long', status: 'in_progress', priority: 'low', dueAt: '2026-08-18T17:00:00+07:00', assignmentSource: 'self_proposed', relatedRecordLabel: 'Danh mục thiết bị' },
    { ...scope, id: 'task-12', projectId: 'project-thao-dien', projectName: 'Nhà phố Thảo Điền', stageId: 'stage-construction', stageName: 'Thi công & giám sát', title: 'Lưu biên bản họp công trường', ownerName: 'Anh Long', status: 'done', priority: 'low', dueAt: '2026-08-09T12:00:00+07:00', assignmentSource: 'director', relatedRecordLabel: 'Biên bản họp' },
    { tenantId: 'tenant-isolation-test', companyId: 'company-isolation-test', id: 'task-other-company', projectId: 'project-other-company-leak-test', projectName: 'Dự án không được rò', stageId: 'other-stage', stageName: 'Ẩn', title: 'Không được thấy', ownerName: 'Ẩn', status: 'open', priority: 'high', dueAt: null, assignmentSource: 'director', relatedRecordLabel: null },
  ],
}
