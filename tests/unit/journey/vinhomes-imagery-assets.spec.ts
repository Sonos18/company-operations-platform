import { describe, it } from 'vitest'
import { assertJourneyImageAsset } from './imagery-asset-contract'

const vinhomesAssets = [
  'vinhomes-01-intake.webp',
  'vinhomes-02-survey.webp',
  'vinhomes-03-design.webp',
  'vinhomes-04-construction.webp',
] as const

describe('Vinhomes journey imagery assets', () => {
  it.each(vinhomesAssets)('%s is an optimized WebP asset', (filename) => {
    assertJourneyImageAsset(filename)
  })
})
