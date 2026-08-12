export type DrawingRelationship = 'supplement' | 'replacement' | 'derivation' | 'reference'

export interface DrawingFile {
  tenantId: string
  companyId: string
  id: string
  drawingGroupId: string
  stageId: string
  code: string
  category: string
  versionNumber: number
  originalFilename: string
  url: string
  uploadedAt: string
  uploadedByName: string
  effectiveFrom: string
  effectiveTo: string | null
  isCurrent: boolean
  customerApproved: boolean
  parentFileId: string | null
  relationship: DrawingRelationship | null
}

export type AddDrawingVersionInput = Pick<
  DrawingFile,
  'drawingGroupId' | 'stageId' | 'code' | 'category' | 'originalFilename' | 'url' | 'parentFileId' | 'relationship'
>
