import { previewXlsx } from './xlsx-preview.service'

export function createFilePreviewService() {
  return { preview(bytes: Buffer, query: Record<string, unknown>) { return previewXlsx(bytes, query) } }
}
