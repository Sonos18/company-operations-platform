import type { CompanyConfig } from '../../features/companies/company.types'

export const VQH_COMPANY_CONFIG: CompanyConfig = {
  tenantId: 'tenant-vqh',
  companyId: 'company-vqh',
  displayName: 'Công ty TNHH Thiết kế Xây dựng Việt Quốc Huy',
  shortName: 'Việt Quốc Huy',
  brand: {
    logoUrl: null,
    primaryColor: '#1A3C2B',
    accentColor: '#FF8C69',
  },
  departments: [
    { code: 'BLD', name: 'Ban lãnh đạo' },
    { code: 'TECH', name: 'Phòng Kỹ thuật' },
    { code: 'DESIGN', name: 'Phòng Thiết kế' },
    { code: 'TCO', name: 'Thi công – Hiện trường' },
    { code: 'VTU', name: 'Vật tư – Mua hàng' },
    { code: 'KE', name: 'Kế toán – Tài chính' },
  ],
  terminology: {
    project: 'Dự án',
    stage: 'Giai đoạn',
    drawing: 'Bản vẽ',
    task: 'Công việc',
  },
  workflowTemplateIds: ['workflow-design-build-v1', 'workflow-design-build-v2'],
}
