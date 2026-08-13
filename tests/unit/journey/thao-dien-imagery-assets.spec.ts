import { describe, it } from 'vitest'
import { assertJourneyImageAsset } from './imagery-asset-contract'

const thaoDienAssets = [
  'thao-dien-01-intake.webp',
  'thao-dien-02-survey.webp',
  'thao-dien-03-floor-plan.webp',
  'thao-dien-04-design-approved.webp',
  'thao-dien-05-preconstruction.webp',
  'thao-dien-06-design-target.webp',
  'thao-dien-06-site-current.webp',
  'thao-dien-07-handover.webp',
] as const

describe('Thảo Điền journey imagery assets', () => {
  it.each(thaoDienAssets)('%s is an optimized WebP asset', (filename) => {
    assertJourneyImageAsset(filename)
  })
})
