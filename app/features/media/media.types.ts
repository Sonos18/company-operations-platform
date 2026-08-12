export interface ProjectMedia {
  tenantId: string
  companyId: string
  id: string
  stageId: string
  kind: 'design_target' | 'progress' | 'evidence'
  url: string
  description: string
  workArea: string
  capturedAt: string
  photographerName: string
  retainsOriginal: boolean
}
