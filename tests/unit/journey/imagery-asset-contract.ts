import { existsSync, readFileSync } from 'node:fs'
import { expect } from 'vitest'

const MAX_ASSET_BYTES = 400 * 1024

export function assertJourneyImageAsset(filename: string): void {
  const assetUrl = new URL(`../../../public/mock/journey/${filename}`, import.meta.url)
  expect(existsSync(assetUrl), `${filename} should exist`).toBe(true)

  const asset = readFileSync(assetUrl)
  expect(asset.subarray(0, 4).toString('ascii'), `${filename} should start with RIFF`).toBe('RIFF')
  expect(asset.subarray(8, 12).toString('ascii'), `${filename} should be WebP`).toBe('WEBP')
  expect(asset.byteLength, `${filename} should be at most 400 KB`).toBeLessThanOrEqual(MAX_ASSET_BYTES)
}
