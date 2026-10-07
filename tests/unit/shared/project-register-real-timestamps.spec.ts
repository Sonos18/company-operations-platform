import { describe, expect, it } from 'vitest'
import { projectRegisterSchema } from '../../../shared/schemas/costs/master-data'

// Timestamp strings observed in canonical DEV project JSON during the real
// workflow-preparation failure. Preserve their offsets and microsecond precision.
const projects = [
  {
    id: '7e7e3904-d53b-4337-9360-22256887474a', code: 'EO-GIO', name: 'EO GIÓ',
    origin: 'legacy_import', operationalState: 'active', clientDisplayName: null,
    locationText: null, version: 1, createdAt: '2026-09-14T11:45:08.001438+00:00',
    updatedAt: '2026-09-20T10:17:25.280126+00:00',
  },
  {
    id: '22727545-1534-4c1a-9378-06969cb40f97', code: 'YONG-MEI', name: 'Yong Mei',
    origin: 'legacy_import', operationalState: 'completed', clientDisplayName: null,
    locationText: null, version: 1, createdAt: '2026-09-15T06:43:59.482554+00:00',
    updatedAt: '2026-09-20T10:17:25.280126+00:00',
  },
] as const

describe('Project Register real DEV timestamps', () => {
  it.each(projects)('reads $code without changing timestamp precision', project => {
    expect(projectRegisterSchema.parse(project)).toEqual(project)
  })
})
