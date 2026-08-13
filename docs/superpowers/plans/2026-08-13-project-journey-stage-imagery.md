# Project Journey Stage Imagery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the reused mock SVG stage visuals with twelve coherent, photo-realistic local images covering every stage in both existing mock projects.

**Architecture:** Keep the existing `ProjectStage.imageUrl` and `ProjectMedia.url` data flow unchanged. Generate and optimize a project-consistent WebP asset set, verify the files with focused Vitest contracts, then update only the mock fixture URLs and protect the result with browser-level loading and uniqueness assertions.

**Tech Stack:** Nuxt 4, Vue 3, TypeScript, Vitest 4, Playwright 1.61, OpenAI image generation, bundled Node.js `sharp` image processing.

## Global Constraints

- Generate exactly twelve local assets: eight for Thảo Điền and four for Vinhomes.
- Export every asset at exactly `1600 × 900` in WebP format and no more than `400 KB` per file.
- Store all assets under `public/mock/journey/` using the exact filenames in the approved design.
- Use premium architectural photo-realism, natural daylight, warm neutral materials, restrained green accents, and editorial composition.
- Include no embedded text, logos, watermarks, or identifiable faces.
- Keep important subjects inside a center-safe area for `object-fit: cover` crops.
- Do not change schemas, repository contracts, routes, carousel behavior, stage-card behavior, or site-comparison behavior.
- Add no production dependency; use the Codex bundled `sharp` module only as a one-time asset-processing tool.
- Preserve existing SVG files that remain referenced by drawing records or other mock data.

---

### Task 1: Thảo Điền Stage Image Set

**Files:**
- Create: `tests/unit/journey/imagery-asset-contract.ts`
- Create: `tests/unit/journey/thao-dien-imagery-assets.spec.ts`
- Create: `public/mock/journey/thao-dien-01-intake.webp`
- Create: `public/mock/journey/thao-dien-02-survey.webp`
- Create: `public/mock/journey/thao-dien-03-floor-plan.webp`
- Create: `public/mock/journey/thao-dien-04-design-approved.webp`
- Create: `public/mock/journey/thao-dien-05-preconstruction.webp`
- Create: `public/mock/journey/thao-dien-06-design-target.webp`
- Create: `public/mock/journey/thao-dien-06-site-current.webp`
- Create: `public/mock/journey/thao-dien-07-handover.webp`

**Interfaces:**
- Consumes: the approved visual direction and exact asset constraints in `docs/superpowers/specs/2026-08-13-project-journey-stage-imagery-design.md`.
- Produces: `assertJourneyImageAsset(filename: string): void` for Task 2 and eight optimized Thảo Điền assets for Task 3.

- [ ] **Step 1: Write the shared asset contract and failing Thảo Điền test**

Create `tests/unit/journey/imagery-asset-contract.ts`:

```ts
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
```

Create `tests/unit/journey/thao-dien-imagery-assets.spec.ts`:

```ts
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
```

- [ ] **Step 2: Run the focused test and capture RED**

Run:

```powershell
pnpm vitest run tests/unit/journey/thao-dien-imagery-assets.spec.ts
```

Expected: FAIL because `public/mock/journey/thao-dien-01-intake.webp` and the other seven files do not exist.

- [ ] **Step 3: Generate the approved Thảo Điền anchor image**

Read the `imagegen` skill, then generate a new wide image for `thao-dien-04-design-approved-source.png` with this prompt:

```text
Wide 16:9 premium architectural photography, approved interior design visualization of a contemporary tropical townhouse living room in Thảo Điền, Ho Chi Minh City. Warm oak joinery, pale limestone, soft off-white upholstery, slim black metal details, abundant tropical greenery, generous daylight through full-height windows, refined Vietnamese contemporary design, editorial architecture magazine composition, realistic materials and camera optics. Keep the primary living space and furniture inside the central 70 percent for responsive cropping. No text, no logo, no watermark, no identifiable people.
```

Save the returned source image outside the repository at `%TEMP%\company-operations-journey-imagery\thao-dien-04-design-approved-source.png`. Inspect it with the local image viewer before using it as a reference. Reject and regenerate it if the architecture is not credible, the room lacks a clear central focal point, or prohibited text/faces appear.

- [ ] **Step 4: Generate the other seven Thảo Điền source images from the anchor**

Use `thao-dien-04-design-approved-source.png` as `referenced_image_paths` for the intake, survey, floor-plan, preconstruction, design-target, and handover calls below. After inspecting the design-target result, use `thao-dien-06-design-target-source.png` as the reference for the site-current call so the two comparison images preserve the same camera position. Preserve the same townhouse architecture, window positions, timber tone, stone palette, and daylight character.

| Output source filename | Exact edit prompt |
| --- | --- |
| `thao-dien-01-intake-source.png` | `Transform the referenced project into an architectural client-intake scene: close editorial view of the same townhouse project represented by a physical material board, wood and stone samples, tablet with abstract moodboard shapes, notebook and hands discussing at a table. Faces must be out of frame. Keep the visual story centered, photorealistic, no readable text, logo or watermark.` |
| `thao-dien-02-survey-source.png` | `Show the same townhouse living space before renovation, safely unfinished and empty, with a surveyor seen only from behind using a laser distance meter and measuring tape. Preserve recognizable windows and room proportions from the reference. Center the measurement activity, photorealistic, no readable text, logo or watermark.` |
| `thao-dien-03-floor-plan-source.png` | `Create a top-down photorealistic architect workspace for this same townhouse: clean 2D floor plan linework without readable labels, tracing paper, scale ruler, pencil, timber and stone samples matching the reference. Keep the floor plan centered and visually dominant, no readable text, logo, watermark or face.` |
| `thao-dien-05-preconstruction-source.png` | `Create a photorealistic preconstruction preparation scene for the same townhouse: organized contract pages with no readable text, approved material samples matching the reference, white safety helmet, measuring tools and neatly packed site documentation on a table. Center-safe editorial composition, no logo, watermark or identifiable face.` |
| `thao-dien-06-design-target-source.png` | `Create a matched approved design-target photograph of the same Thảo Điền living room, preserving the reference camera position and architecture but presenting a clean finalized target view suited to a before-versus-current comparison. Photorealistic, central focal area, no people, text, logo or watermark.` |
| `thao-dien-06-site-current-source.png` | `Using the referenced approved room, recreate the exact same camera position and architecture during active interior construction: unfinished ceiling frame and electrical conduits, protected floor, partially installed oak joinery, organized tools, safe clean site. The final design must still be spatially recognizable. Photorealistic, no workers' faces, text, logo or watermark.` |
| `thao-dien-07-handover-source.png` | `Show the same townhouse fully completed and immaculate at handover: finished warm oak and limestone living room, subtle inspection checklist with no readable text, keys and presentation folder in the foreground, bright natural daylight. Keep the completed room central, photorealistic, no logo, watermark or identifiable face.` |

Inspect each source image before continuing. The stage activity must be understandable without a caption, and all images must clearly belong to the same project.

- [ ] **Step 5: Encode the eight sources to exact WebP assets**

Create `public/mock/journey/`, then run this one-time PowerShell processing block using the bundled `sharp` module. The block center-crops to `1600 × 900`, reduces quality until the file fits within `400 KB`, and writes only the required WebP outputs.

```powershell
$sourceRoot = Join-Path $env:TEMP 'company-operations-journey-imagery'
$runtimeNode = 'C:\Users\NGUYEN HONG SON\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$env:NODE_PATH = 'C:\Users\NGUYEN HONG SON\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
New-Item -ItemType Directory -Force -Path 'public\mock\journey' | Out-Null
$inputs = @(
  (Join-Path $sourceRoot 'thao-dien-01-intake-source.png'),
  (Join-Path $sourceRoot 'thao-dien-02-survey-source.png'),
  (Join-Path $sourceRoot 'thao-dien-03-floor-plan-source.png'),
  (Join-Path $sourceRoot 'thao-dien-04-design-approved-source.png'),
  (Join-Path $sourceRoot 'thao-dien-05-preconstruction-source.png'),
  (Join-Path $sourceRoot 'thao-dien-06-design-target-source.png'),
  (Join-Path $sourceRoot 'thao-dien-06-site-current-source.png'),
  (Join-Path $sourceRoot 'thao-dien-07-handover-source.png')
)
@'
const { writeFileSync } = require('node:fs')
const path = require('node:path')
const sharp = require('sharp')
const maximumBytes = 400 * 1024

async function encode(input) {
  const output = path.join('public', 'mock', 'journey', path.basename(input).replace('-source.png', '.webp'))
  let encoded
  for (let quality = 82; quality >= 66; quality -= 4) {
    encoded = await sharp(input)
      .resize(1600, 900, { fit: 'cover', position: 'centre' })
      .webp({ quality, effort: 6, smartSubsample: true })
      .toBuffer()
    if (encoded.byteLength <= maximumBytes) break
  }
  if (!encoded || encoded.byteLength > maximumBytes) throw new Error(`Cannot fit ${input} within 400 KB`)
  writeFileSync(output, encoded)
}

Promise.all(process.argv.slice(2).map(encode)).catch((error) => {
  console.error(error)
  process.exitCode = 1
})
'@ | & $runtimeNode - @inputs
```

- [ ] **Step 6: Run GREEN checks and inspect the optimized assets**

Run:

```powershell
pnpm vitest run tests/unit/journey/thao-dien-imagery-assets.spec.ts
```

Expected: PASS, 8/8 cases.

Inspect all eight final `.webp` files with the local image viewer. Confirm there is no distorted geometry, unreadable pseudo-text, visible watermark, identifiable face, or accidental stage mismatch. Regenerate the affected source and rerun Steps 5–6 if any final asset fails this visual gate.

- [ ] **Step 7: Commit the Thảo Điền asset set**

```powershell
git add tests/unit/journey/imagery-asset-contract.ts tests/unit/journey/thao-dien-imagery-assets.spec.ts public/mock/journey/thao-dien-*.webp
git commit -m "feat: add Thao Dien journey imagery"
```

---

### Task 2: Vinhomes Stage Image Set

**Files:**
- Create: `tests/unit/journey/vinhomes-imagery-assets.spec.ts`
- Create: `public/mock/journey/vinhomes-01-intake.webp`
- Create: `public/mock/journey/vinhomes-02-survey.webp`
- Create: `public/mock/journey/vinhomes-03-design.webp`
- Create: `public/mock/journey/vinhomes-04-construction.webp`

**Interfaces:**
- Consumes: `assertJourneyImageAsset(filename: string): void` from Task 1.
- Produces: four optimized Vinhomes assets for the fixture mapping in Task 3.

- [ ] **Step 1: Write the failing Vinhomes asset test**

Create `tests/unit/journey/vinhomes-imagery-assets.spec.ts`:

```ts
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
```

- [ ] **Step 2: Run the focused test and capture RED**

Run:

```powershell
pnpm vitest run tests/unit/journey/vinhomes-imagery-assets.spec.ts
```

Expected: FAIL because the four Vinhomes WebP files do not exist.

- [ ] **Step 3: Generate the Vinhomes anchor image**

Generate a new image and save it as `%TEMP%\company-operations-journey-imagery\vinhomes-03-design-source.png`:

```text
Wide 16:9 premium architectural photography, approved interior design visualization of a refined urban apartment at Vinhomes Central Park in Ho Chi Minh City. Compact open-plan living and dining space, pale oak built-in storage, warm white stone, soft grey textiles, intelligent concealed lighting, full-height city window, elegant practical Vietnamese apartment design, editorial architecture magazine composition, realistic materials and camera optics. Keep the main room and storage solution inside the central 70 percent for responsive cropping. No text, no logo, no watermark, no identifiable people.
```

Inspect the anchor before using it as a reference. It must be visually distinct from the tropical Thảo Điền townhouse and must read as a compact high-rise apartment.

- [ ] **Step 4: Generate the other three Vinhomes source images from the anchor**

Use `vinhomes-03-design-source.png` as `referenced_image_paths` for every call.

| Output source filename | Exact edit prompt |
| --- | --- |
| `vinhomes-01-intake-source.png` | `Transform the referenced apartment project into a client-intake scene: compact-space references, pale oak and grey material samples, tablet with abstract moodboard shapes, notebook and hands reviewing the plan at a table. Keep the city-apartment identity, faces out of frame, centered editorial photography, no readable text, logo or watermark.` |
| `vinhomes-02-survey-source.png` | `Show the same high-rise apartment before renovation: mostly empty interior, recognizable full-height city window, surveyor seen only from behind using a laser measure, building-protection details and measured wall corners. Center the survey activity, photorealistic, no readable text, logo or watermark.` |
| `vinhomes-04-construction-source.png` | `Show the same apartment during controlled interior construction: protected floor and lift-access path, pale oak cabinetry being installed, concealed-lighting channels, organized tools and clean high-rise site conditions. Preserve the reference room proportions and city window. Photorealistic, no worker faces, readable text, logo or watermark.` |

Inspect all three source images and confirm continuity with the Vinhomes anchor.

- [ ] **Step 5: Encode the four Vinhomes sources**

Run this complete processing block:

```powershell
$sourceRoot = Join-Path $env:TEMP 'company-operations-journey-imagery'
$runtimeNode = 'C:\Users\NGUYEN HONG SON\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$env:NODE_PATH = 'C:\Users\NGUYEN HONG SON\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
New-Item -ItemType Directory -Force -Path 'public\mock\journey' | Out-Null
$inputs = @(
  (Join-Path $sourceRoot 'vinhomes-01-intake-source.png'),
  (Join-Path $sourceRoot 'vinhomes-02-survey-source.png'),
  (Join-Path $sourceRoot 'vinhomes-03-design-source.png'),
  (Join-Path $sourceRoot 'vinhomes-04-construction-source.png')
)
@'
const { writeFileSync } = require('node:fs')
const path = require('node:path')
const sharp = require('sharp')
const maximumBytes = 400 * 1024

async function encode(input) {
  const output = path.join('public', 'mock', 'journey', path.basename(input).replace('-source.png', '.webp'))
  let encoded
  for (let quality = 82; quality >= 66; quality -= 4) {
    encoded = await sharp(input)
      .resize(1600, 900, { fit: 'cover', position: 'centre' })
      .webp({ quality, effort: 6, smartSubsample: true })
      .toBuffer()
    if (encoded.byteLength <= maximumBytes) break
  }
  if (!encoded || encoded.byteLength > maximumBytes) throw new Error(`Cannot fit ${input} within 400 KB`)
  writeFileSync(output, encoded)
}

Promise.all(process.argv.slice(2).map(encode)).catch((error) => {
  console.error(error)
  process.exitCode = 1
})
'@ | & $runtimeNode - @inputs
```

Expected outputs: the four exact Vinhomes WebP filenames listed in this task.

- [ ] **Step 6: Run GREEN checks and inspect the final Vinhomes assets**

Run:

```powershell
pnpm vitest run tests/unit/journey/vinhomes-imagery-assets.spec.ts
```

Expected: PASS, 4/4 cases.

Inspect the final four WebPs. Regenerate any image that looks like the Thảo Điền townhouse, contains pseudo-text or a face, or does not communicate its assigned stage.

- [ ] **Step 7: Commit the Vinhomes asset set**

```powershell
git add tests/unit/journey/vinhomes-imagery-assets.spec.ts public/mock/journey/vinhomes-*.webp
git commit -m "feat: add Vinhomes journey imagery"
```

---

### Task 3: Fixture Wiring and Browser Verification

**Files:**
- Create: `tests/unit/journey/journey-imagery-fixtures.spec.ts`
- Create/Delete: `.playwright.journey-imagery.config.ts` (temporary verification config; never commit)
- Modify: `app/repositories/mock/fixtures.ts:46-60,82-109`
- Modify: `tests/e2e/project-journey.spec.ts`
- Modify: `tests/e2e/project-list.spec.ts`

**Interfaces:**
- Consumes: all twelve WebP URLs produced by Tasks 1–2 and the existing `INITIAL_MOCK_STATE` export.
- Produces: complete fixture coverage for both project journeys and regression tests proving every production-facing image resolves at the required dimensions.

- [ ] **Step 1: Write the failing fixture mapping test**

Create `tests/unit/journey/journey-imagery-fixtures.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { INITIAL_MOCK_STATE } from '../../../app/repositories/mock/fixtures'

describe('journey imagery fixture mapping', () => {
  it('maps every Thảo Điền stage and media record to the approved imagery', () => {
    const project = INITIAL_MOCK_STATE.projects.find(item => item.id === 'project-thao-dien')

    expect(project?.coverUrl).toBe('/mock/journey/thao-dien-04-design-approved.webp')
    expect(project?.stages.map(stage => [stage.id, stage.imageUrl])).toEqual([
      ['stage-intake', '/mock/journey/thao-dien-01-intake.webp'],
      ['stage-survey', '/mock/journey/thao-dien-02-survey.webp'],
      ['stage-design-2d', '/mock/journey/thao-dien-03-floor-plan.webp'],
      ['stage-design-3d', '/mock/journey/thao-dien-04-design-approved.webp'],
      ['stage-contract', '/mock/journey/thao-dien-05-preconstruction.webp'],
      ['stage-construction', '/mock/journey/thao-dien-06-site-current.webp'],
      ['stage-handover', '/mock/journey/thao-dien-07-handover.webp'],
    ])
    expect(INITIAL_MOCK_STATE.media.map(item => [item.id, item.url])).toEqual([
      ['media-design-target', '/mock/journey/thao-dien-06-design-target.webp'],
      ['media-site-older', '/mock/journey/thao-dien-06-site-current.webp'],
      ['media-site-current', '/mock/journey/thao-dien-06-site-current.webp'],
      ['media-evidence', '/mock/journey/thao-dien-06-site-current.webp'],
    ])
  })

  it('maps every Vinhomes stage to the approved imagery', () => {
    const project = INITIAL_MOCK_STATE.projects.find(item => item.id === 'project-vinhomes')

    expect(project?.coverUrl).toBe('/mock/journey/vinhomes-03-design.webp')
    expect(project?.stages.map(stage => [stage.id, stage.imageUrl])).toEqual([
      ['vh-stage-intake', '/mock/journey/vinhomes-01-intake.webp'],
      ['vh-stage-survey', '/mock/journey/vinhomes-02-survey.webp'],
      ['vh-stage-design', '/mock/journey/vinhomes-03-design.webp'],
      ['vh-stage-construction', '/mock/journey/vinhomes-04-construction.webp'],
    ])
  })
})
```

- [ ] **Step 2: Add browser tests for complete image loading and project covers**

Append to `tests/e2e/project-journey.spec.ts`:

```ts
for (const project of [
  { id: 'project-thao-dien', stageCount: 7, visualCount: 8 },
  { id: 'project-vinhomes', stageCount: 4, visualCount: 4 },
] as const) {
  test(`loads distinct optimized imagery for ${project.id}`, async ({ page }) => {
    await page.goto(`/projects/${project.id}`)
    await expect(page.getByTestId('journey-stage-card')).toHaveCount(project.stageCount)

    const visuals = page.getByTestId('journey-carousel').locator('img')
    await expect(visuals).toHaveCount(project.visualCount)
    const loaded = await visuals.evaluateAll(images => images.map((image) => {
      const element = image as HTMLImageElement
      return {
        complete: element.complete,
        width: element.naturalWidth,
        height: element.naturalHeight,
        pathname: new URL(element.currentSrc).pathname,
      }
    }))

    expect(loaded.every(image => image.complete)).toBe(true)
    expect(loaded.every(image => image.width === 1600 && image.height === 900)).toBe(true)
    expect(new Set(loaded.map(image => image.pathname)).size).toBe(project.visualCount)
    expect(loaded.every(image => image.pathname.startsWith('/mock/journey/'))).toBe(true)
  })
}
```

Append to `tests/e2e/project-list.spec.ts`:

```ts
test('loads the approved project cover imagery', async ({ page }) => {
  await page.goto('/projects')

  const expectedCovers = [
    '/mock/journey/thao-dien-04-design-approved.webp',
    '/mock/journey/vinhomes-03-design.webp',
  ]
  const covers = page.locator('.project-card__visual img')
  await expect(covers).toHaveCount(2)
  const loaded = await covers.evaluateAll(images => images.map((image) => {
    const element = image as HTMLImageElement
    return {
      complete: element.complete,
      width: element.naturalWidth,
      height: element.naturalHeight,
      pathname: new URL(element.currentSrc).pathname,
    }
  }))

  expect(loaded.map(image => image.pathname)).toEqual(expectedCovers)
  expect(loaded.every(image => image.complete && image.width === 1600 && image.height === 900)).toBe(true)
})
```

Create the temporary root-level `.playwright.journey-imagery.config.ts` using `apply_patch` so all browser tests run against this checkout on private port `3183` without disturbing the user's server on port `3000`:

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL: 'http://127.0.0.1:3183',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm dev --host 127.0.0.1 --port 3183',
    url: 'http://127.0.0.1:3183',
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
```

- [ ] **Step 3: Run focused tests and capture RED against the old fixture URLs**

Run:

```powershell
pnpm vitest run tests/unit/journey/journey-imagery-fixtures.spec.ts
pnpm exec playwright test --config .playwright.journey-imagery.config.ts tests/e2e/project-journey.spec.ts tests/e2e/project-list.spec.ts
```

Expected: the unit test fails because fixture URLs still point at `/mock/*.svg`; the new E2E assertions fail because the loaded visual paths, counts, uniqueness, or dimensions do not match the approved asset contract.

- [ ] **Step 4: Apply the minimal fixture URL mapping**

In `app/repositories/mock/fixtures.ts`, replace only the URL values in these exact records. Do not modify any other field.

| Record | Field | New value |
| --- | --- | --- |
| `stage-intake` | `imageUrl` | `/mock/journey/thao-dien-01-intake.webp` |
| `stage-survey` | `imageUrl` | `/mock/journey/thao-dien-02-survey.webp` |
| `stage-design-2d` | `imageUrl` | `/mock/journey/thao-dien-03-floor-plan.webp` |
| `stage-design-3d` | `imageUrl` | `/mock/journey/thao-dien-04-design-approved.webp` |
| `stage-contract` | `imageUrl` | `/mock/journey/thao-dien-05-preconstruction.webp` |
| `stage-construction` | `imageUrl` | `/mock/journey/thao-dien-06-site-current.webp` |
| `stage-handover` | `imageUrl` | `/mock/journey/thao-dien-07-handover.webp` |
| `vh-stage-intake` | `imageUrl` | `/mock/journey/vinhomes-01-intake.webp` |
| `vh-stage-survey` | `imageUrl` | `/mock/journey/vinhomes-02-survey.webp` |
| `vh-stage-design` | `imageUrl` | `/mock/journey/vinhomes-03-design.webp` |
| `vh-stage-construction` | `imageUrl` | `/mock/journey/vinhomes-04-construction.webp` |
| `project-thao-dien` | `coverUrl` | `/mock/journey/thao-dien-04-design-approved.webp` |
| `project-vinhomes` | `coverUrl` | `/mock/journey/vinhomes-03-design.webp` |
| `media-design-target` | `url` | `/mock/journey/thao-dien-06-design-target.webp` |
| `media-site-older` | `url` | `/mock/journey/thao-dien-06-site-current.webp` |
| `media-site-current` | `url` | `/mock/journey/thao-dien-06-site-current.webp` |
| `media-evidence` | `url` | `/mock/journey/thao-dien-06-site-current.webp` |

- [ ] **Step 5: Run focused GREEN tests**

Run:

```powershell
pnpm vitest run tests/unit/journey/thao-dien-imagery-assets.spec.ts tests/unit/journey/vinhomes-imagery-assets.spec.ts tests/unit/journey/journey-imagery-fixtures.spec.ts
pnpm exec playwright test --config .playwright.journey-imagery.config.ts tests/e2e/project-journey.spec.ts tests/e2e/project-list.spec.ts
```

Expected: all focused unit cases and both E2E files PASS. The construction comparison must contribute two distinct image paths for Thảo Điền.

- [ ] **Step 6: Inspect both projects at the approved breakpoints**

Use a private dev-server port if implementation runs in a worktree; do not reuse the user's `127.0.0.1:3000` server from another checkout. Inspect these six combinations in a real browser:

- `/projects/project-thao-dien` at `390 × 844`, `768 × 1024`, and `1440 × 900`.
- `/projects/project-vinhomes` at `390 × 844`, `768 × 1024`, and `1440 × 900`.

At each viewport, browse every stage via the rail or carousel controls. Confirm meaningful crops, readable card overlays, correct project continuity, no broken images, no horizontal overflow, no overlay error, and no console error. Specifically inspect the two-pane Thảo Điền construction comparison and the project cards on `/projects`.

- [ ] **Step 7: Run the complete verification gates**

Run:

```powershell
pnpm test:unit
pnpm typecheck
pnpm lint
pnpm build
pnpm exec playwright test --config .playwright.journey-imagery.config.ts
git diff --check
git status --short
```

Expected: unit, typecheck, lint, build, and E2E all exit `0`; `git diff --check` prints nothing. Before the commit and cleanup steps, `git status --short` shows the intended fixture/tests, the temporary `.playwright.journey-imagery.config.ts`, and any pre-existing user-owned `.playwright-mcp/` or active UI-review log files.

- [ ] **Step 8: Commit fixture wiring and regression coverage**

```powershell
git add app/repositories/mock/fixtures.ts tests/unit/journey/journey-imagery-fixtures.spec.ts tests/e2e/project-journey.spec.ts tests/e2e/project-list.spec.ts
git commit -m "feat: wire project journey stage imagery"
```

- [ ] **Step 9: Clean the generated source directory safely**

Delete `.playwright.journey-imagery.config.ts` with `apply_patch`. Then resolve `%TEMP%\company-operations-journey-imagery`, verify that it is below `[System.IO.Path]::GetTempPath()` and is not the temp root itself, and remove only that exact directory. Do not remove the committed WebP assets.

```powershell
$sourceRoot = [System.IO.Path]::GetFullPath((Join-Path $env:TEMP 'company-operations-journey-imagery'))
$tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
if ($sourceRoot.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase) -and $sourceRoot -ne $tempRoot) {
  Remove-Item -LiteralPath $sourceRoot -Recurse -Force
} else {
  throw "Refusing to remove unexpected path: $sourceRoot"
}
git status --short
```

Expected final status: no temporary Playwright config or generated source directory remains. Only pre-existing user-owned `.playwright-mcp/` and active UI-review log files may remain untracked.
