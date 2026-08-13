# Project Journey Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the horizontal project-stage rail and render the existing three-card journey summary immediately after the stage banner carousel.

**Architecture:** Keep the current `ProjectJourneyCarousel.vue` ownership of project, carousel, and summary state. Make a template-only layout change plus the now-unused import removal; preserve presenter data flow and carousel behavior. Protect the requested DOM order and remaining navigation with Playwright regression coverage.

**Tech Stack:** Nuxt 4.3.1, Vue 3.5.28, Nuxt UI 4.4.0, TypeScript 5.9.3, Playwright 1.61.1, pnpm 10.29.3

## Global Constraints

- Do not change journey summary calculations, labels, or responsive card styling.
- Do not delete `app/components/journey/JourneyStageRail.vue`.
- Preserve previous/next controls, swipe/drag selection, selectable stage cards, current-stage context, live-region copy, and reduced-motion behavior.
- Keep the change scoped to the project journey component, its E2E regression coverage, and this plan.

---

### Task 1: Reorder the Project Journey Layout

**Files:**
- Modify: `tests/e2e/project-journey.spec.ts:7-36`
- Modify: `app/components/journey/ProjectJourneyCarousel.vue:1-124`
- Verify: `tests/unit/journey/journey-presenter.spec.ts`

**Interfaces:**
- Consumes: `summarizeProjectJourney(project: ProjectDetail)` and the existing `createJourneyState(stageIds, currentStageId)` return value.
- Produces: a `project-journey` DOM where `journey-stage-rail` is absent and `journey-summary` follows `journey-carousel`; no new runtime interface.

- [x] **Step 1: Write the failing layout regression and replace rail-dependent navigation coverage**

Add a dedicated E2E test before the existing workflow-state test to assert the requested content, absence, and DOM order:

```ts
test('places the complete summary after the stage banners without a stage rail', async ({ page }) => {
  const summary = page.getByTestId('journey-summary')
  const metrics = summary.locator(':scope > [data-slot="root"]')

  await expect(page.getByTestId('journey-stage-card')).toHaveCount(7)
  await expect(page.getByTestId('journey-stage-rail')).toHaveCount(0)
  await expect(metrics).toHaveCount(3)
  await expect(metrics.nth(0)).toContainText('5/7')
  await expect(metrics.nth(0)).toContainText('giai đoạn hoàn tất')
  await expect(metrics.nth(1)).toContainText('5')
  await expect(metrics.nth(1)).toContainText('bước đang mở')
  await expect(metrics.nth(2)).toContainText('1')
  await expect(metrics.nth(2)).toContainText('hồ sơ còn thiếu')

  const summaryFollowsCarousel = await page.getByTestId('project-journey').evaluate((journey) => {
    const carousel = journey.querySelector('[data-testid="journey-carousel"]')
    const summaryElement = journey.querySelector('[data-testid="journey-summary"]')
    if (!carousel || !summaryElement) return false

    return Boolean(carousel.compareDocumentPosition(summaryElement) & Node.DOCUMENT_POSITION_FOLLOWING)
  })
  expect(summaryFollowsCarousel).toBe(true)
})
```

Keep the existing workflow-state test for the current stage, then replace the rail-dependent boundary test with remaining controls:

```ts
test('supports previous and next navigation at journey boundaries', async ({ page }) => {
  const carousel = page.getByTestId('journey-carousel')
  const focused = page.locator('[data-testid="journey-stage-card"][data-focused="true"]')
  const previous = page.getByRole('button', { name: 'Giai đoạn trước' })
  const next = page.getByRole('button', { name: 'Giai đoạn sau' })

  for (let index = 0; index < 5; index += 1) await previous.click()
  await expect(focused).toContainText('Tiếp nhận yêu cầu')
  await expect(previous).toBeDisabled()

  await carousel.focus()
  await page.keyboard.press('ArrowRight')
  await expect(focused).toContainText('Khảo sát hiện trạng')

  for (let index = 0; index < 5; index += 1) await next.click()
  await expect(focused).toContainText('Nghiệm thu & bàn giao')
  await expect(next).toBeDisabled()
})
```

- [x] **Step 2: Run the new layout test and verify RED**

Run:

```bash
pnpm exec playwright test tests/e2e/project-journey.spec.ts --grep "places the complete summary"
```

Expected: FAIL because `journey-stage-rail` has count 1, and the summary precedes the carousel.

- [x] **Step 3: Implement the minimal component change**

In `ProjectJourneyCarousel.vue`, remove:

```ts
import JourneyStageRail from './JourneyStageRail.vue'
```

Delete the rendered `<JourneyStageRail ... />` block. Move the existing summary block without altering its markup:

```vue
<div class="journey-summary" data-testid="journey-summary">
  <UCard><strong>{{ summary.completedStages }}/{{ summary.totalStages }}</strong><span>giai đoạn hoàn tất</span><UProgress :model-value="summary.completedStages" :max="summary.totalStages" /></UCard>
  <UCard><strong>{{ summary.openSteps }}</strong><span>bước đang mở</span></UCard>
  <UCard><strong>{{ summary.missingRecords }}</strong><span>hồ sơ còn thiếu</span></UCard>
</div>
```

Place it immediately after the closing `</div>` of `.carousel-shell` and before the `aria-live` paragraph.

- [x] **Step 4: Run the focused E2E file and verify GREEN**

Run:

```bash
pnpm exec playwright test tests/e2e/project-journey.spec.ts
```

Expected: all project journey E2E tests PASS, including layout order, summary metrics, previous/next boundaries, stage-card selection, footer updates, responsive containment, not-found state, reduced motion, and project imagery.

- [x] **Step 5: Run the full verification suite**

Run:

```bash
pnpm test:unit
pnpm typecheck
pnpm lint
pnpm test:e2e
pnpm build
```

Expected: every command exits 0 with no test failures, type errors, lint errors, or build errors.

- [x] **Step 6: Review the final diff against the approved design**

Run:

```bash
git diff --check
git diff -- app/components/journey/ProjectJourneyCarousel.vue tests/e2e/project-journey.spec.ts docs/superpowers/plans/2026-08-13-project-journey-layout.md
```

Confirm the diff removes only the rail render/import, relocates the unchanged summary block, updates rail-dependent tests to use remaining controls, and leaves unrelated untracked files untouched.

- [x] **Step 7: Commit the implementation**

Run:

```bash
git add app/components/journey/ProjectJourneyCarousel.vue tests/e2e/project-journey.spec.ts docs/superpowers/plans/2026-08-13-project-journey-layout.md
git commit -m "fix: simplify project journey layout"
```
