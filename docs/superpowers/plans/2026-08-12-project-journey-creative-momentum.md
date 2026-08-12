# Project Journey Creative Momentum Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the project journey as a responsive Creative Momentum experience using Nuxt UI, synchronized stage navigation, and accessible directional animation.

**Architecture:** Keep `ProjectDetail` and `createJourneyState` as the domain and interaction sources of truth. Add a pure presenter for summary calculations, a focused stage rail, and one stage-card component, then let Nuxt UI’s Embla-based `UCarousel` own swipe and track movement while `focusedStageId` synchronizes the rail, cards, footer, and live announcement.

**Tech Stack:** Nuxt 4.3.1, Vue 3.5.28, TypeScript 5.9, Nuxt UI 4.4.0, Tailwind CSS 4.1, Fontsource 5.3.0, Vitest 4.1.9, Playwright 1.61.1, axe-core.

## Global Constraints

- Limit redesign scope to `/projects/:projectId`; do not redesign the app shell or other feature pages.
- Do not change repository contracts, domain types, mock fixture schemas, route shapes, or workflow mutation behavior.
- Do not display AI scores, trends, predictions, or any metric unavailable from `ProjectDetail`.
- Use `#103D38` deep teal, `#2FD6A3` fresh mint, `#FF7A63` coral, `#F2FCF8` canvas, `#FFFFFF` surface, `#153A37` foreground, `#56706A` muted foreground, and `#D5E9E3` border.
- Use Manrope 700–800 for display text, Be Vietnam Pro 400–600 for Vietnamese UI copy, and JetBrains Mono 500–600 for operational metadata.
- Use `@fontsource-variable/manrope@5.3.0` and `@fontsource/be-vietnam-pro@5.3.0`; keep existing fonts while unmigrated screens reference them.
- Use Nuxt UI primitives whenever a matching card, badge, progress, button, alert, skeleton, empty, accordion, breadcrumb, or carousel primitive exists.
- Keep `focusedStageId` as the single source of truth; browsing must never mutate `actualCurrentStageId`.
- Carousel motion is `360ms cubic-bezier(0.16, 1, 0.3, 1)`; focused scale is `1.015`; neighbor scale is `0.94` with `0.68` opacity; content fade is `200ms`.
- Disable nonessential scale, lift, smooth scrolling, and transition duration under `prefers-reduced-motion: reduce`.
- Do not autoplay the carousel.
- Keep mobile touch targets at least `44px × 44px` and use natural document height.

---

## File Map

| File | Responsibility |
| --- | --- |
| `app/app.config.ts` | Nuxt UI Creative Momentum semantic color aliases |
| `app/app.vue` | Vietnamese Nuxt UI locale provider |
| `app/assets/css/main.css` | Font imports, palette scales, and journey semantic variables |
| `app/features/journey/journey.presenter.ts` | Pure labels and project journey summary derivation |
| `app/components/journey/JourneyStageRail.vue` | Ordered, direct stage navigation |
| `app/components/journey/JourneyStageCard.vue` | Unified focused/neighbor card and focused-media loading |
| `app/components/journey/ProjectJourneyCarousel.vue` | Header, summary, carousel synchronization, live region, and controls |
| `app/components/journey/JourneyFooter.vue` | Desktop context cards and mobile accordion |
| `app/pages/projects/[projectId]/index.vue` | Pending, success, no-stage, and not-found page states |
| `tests/unit/journey/journey-presenter.spec.ts` | Pure summary and label coverage |
| `tests/unit/journey/project-journey.spec.ts` | Journey state boundary coverage |
| `tests/e2e/project-journey.spec.ts` | Desktop navigation, synchronization, footer, and reduced-motion behavior |
| `tests/e2e/mobile.spec.ts` | Mobile carousel, touch-safe layout, and overflow behavior |
| `tests/e2e/accessibility.spec.ts` | Serious and critical accessibility regression coverage |

`StageCardFocused.vue` and `StageCardNeighbor.vue` are removed after `JourneyStageCard.vue` replaces both consumers.

---

### Task 1: Establish the Creative Momentum theme and Vietnamese Nuxt UI locale

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `app/app.config.ts`
- Modify: `app/app.vue`
- Modify: `app/assets/css/main.css`

**Interfaces:**
- Consumes: Nuxt UI’s semantic `primary`, `secondary`, `success`, `warning`, `error`, and `neutral` color aliases.
- Produces: `creative`, `coral`, and `mint` Tailwind palettes; `.creative-momentum` journey tokens; Vietnamese Nuxt UI messages through `<UApp :locale="vi">`.

- [ ] **Step 1: Install exact font packages**

Run:

```bash
pnpm add @fontsource-variable/manrope@5.3.0 @fontsource/be-vietnam-pro@5.3.0
```

Expected: `package.json` and `pnpm-lock.yaml` add both packages without changing Nuxt, Vue, Nuxt UI, or Tailwind versions.

- [ ] **Step 2: Create the Nuxt UI color configuration**

Create `app/app.config.ts`:

```ts
export default defineAppConfig({
  ui: {
    colors: {
      primary: 'creative',
      secondary: 'coral',
      success: 'mint',
      warning: 'amber',
      error: 'red',
      neutral: 'stone',
    },
  },
})
```

- [ ] **Step 3: Configure the built-in Vietnamese locale**

Replace `app/app.vue` with:

```vue
<script setup lang="ts">
import { vi } from '@nuxt/ui/locale'
</script>

<template>
  <UApp :locale="vi">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
```

- [ ] **Step 4: Add fonts, palette scales, and scoped journey tokens**

At the top of `app/assets/css/main.css`, preserve existing imports and add:

```css
@import '@fontsource-variable/manrope/wght.css';
@import '@fontsource/be-vietnam-pro/400.css';
@import '@fontsource/be-vietnam-pro/500.css';
@import '@fontsource/be-vietnam-pro/600.css';
```

After the Tailwind and Nuxt UI imports, add:

```css
@theme {
  --color-creative-50: #f2fcf8;
  --color-creative-100: #d9f4ec;
  --color-creative-200: #b7e6d9;
  --color-creative-300: #80cdbb;
  --color-creative-400: #4aab96;
  --color-creative-500: #103d38;
  --color-creative-600: #0e3733;
  --color-creative-700: #0c302c;
  --color-creative-800: #092724;
  --color-creative-900: #071f1d;
  --color-creative-950: #041311;

  --color-mint-50: #ecfff9;
  --color-mint-100: #cff8ec;
  --color-mint-200: #a2eed9;
  --color-mint-300: #6fe3c4;
  --color-mint-400: #2fd6a3;
  --color-mint-500: #20b98a;
  --color-mint-600: #168f6b;
  --color-mint-700: #147258;
  --color-mint-800: #135b49;
  --color-mint-900: #114b3d;
  --color-mint-950: #072b23;

  --color-coral-50: #fff4f1;
  --color-coral-100: #ffe4de;
  --color-coral-200: #ffc9be;
  --color-coral-300: #ffa493;
  --color-coral-400: #ff8b73;
  --color-coral-500: #ff7a63;
  --color-coral-600: #e85f49;
  --color-coral-700: #c74a38;
  --color-coral-800: #a43e31;
  --color-coral-900: #87372e;
  --color-coral-950: #491914;

  --font-journey-display: 'Manrope Variable', sans-serif;
  --font-journey-body: 'Be Vietnam Pro', sans-serif;
  --font-journey-mono: 'JetBrains Mono Variable', monospace;
}

.creative-momentum {
  --journey-canvas: #f2fcf8;
  --journey-surface: #ffffff;
  --journey-foreground: #153a37;
  --journey-muted: #56706a;
  --journey-border: #d5e9e3;
  --journey-primary: #103d38;
  --journey-mint: #2fd6a3;
  --journey-coral: #ff7a63;
  --journey-radius: 14px;
  --journey-motion: 360ms cubic-bezier(0.16, 1, 0.3, 1);
  color: var(--journey-foreground);
  font-family: var(--font-journey-body);
}

.creative-momentum h1,
.creative-momentum h2,
.creative-momentum h3,
.creative-momentum h4 {
  font-family: var(--font-journey-display);
}

.creative-momentum :focus-visible {
  outline-color: var(--journey-coral);
}
```

- [ ] **Step 5: Verify configuration and production bundling**

Run:

```bash
pnpm typecheck
pnpm build
```

Expected: both commands exit `0`; build output includes no unresolved font CSS or unknown Nuxt UI color errors.

- [ ] **Step 6: Commit the theme foundation**

```bash
git add package.json pnpm-lock.yaml app/app.config.ts app/app.vue app/assets/css/main.css
git commit -m "feat: add creative momentum journey theme"
```

---

### Task 2: Add pure journey presentation and summary calculations

**Files:**
- Create: `app/features/journey/journey.presenter.ts`
- Create: `tests/unit/journey/journey-presenter.spec.ts`
- Modify: `tests/unit/journey/project-journey.spec.ts`

**Interfaces:**
- Consumes: `ProjectDetail`, `ProjectStage`, and `StageStatus` from existing feature types.
- Produces: `JourneySummary`, `summarizeProjectJourney(project)`, `stageStatusLabel`, and `getStageProgress(stage)`.

- [ ] **Step 1: Write failing presenter tests**

Create `tests/unit/journey/journey-presenter.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { ProjectStage } from '../../../app/features/journey/journey.types'
import type { ProjectDetail } from '../../../app/features/projects/project.types'
import {
  getStageProgress,
  stageStatusLabel,
  summarizeProjectJourney,
} from '../../../app/features/journey/journey.presenter'

function makeStage(status: ProjectStage['status'], missingRecordCount: number): ProjectStage {
  return {
    tenantId: 'tenant-vqh',
    companyId: 'company-vqh',
    id: `stage-${status}`,
    code: '01',
    name: 'Giai đoạn mẫu',
    purpose: 'Kiểm tra trình bày hành trình.',
    status,
    completedCount: status === 'completed' ? 2 : 1,
    totalCount: 2,
    ownerDepartment: 'Điều phối dự án',
    dueAt: null,
    lastActivityAt: '2026-08-12T09:30:00+07:00',
    requiredRecordCount: 2,
    missingRecordCount,
    visualKind: 'record',
    imageUrl: '/mock/thao-dien-cover.svg',
    subStages: [
      { id: 'done', code: '01.1', name: 'Đã xong', status: 'completed', ownerName: 'Anh Long' },
      { id: 'open', code: '01.2', name: 'Đang mở', status: 'active', ownerName: 'Chị Nhi' },
      { id: 'skip', code: '01.3', name: 'Không áp dụng', status: 'not_applicable', ownerName: 'Chị Nhi' },
    ],
    records: [],
    activities: [],
  }
}

describe('journey presenter', () => {
  it('summarizes only existing project workflow data', () => {
    const stages = [makeStage('completed', 0), makeStage('active', 2)]
    const project = {
      completedStageCount: 1,
      totalStageCount: 2,
      stages,
    } as ProjectDetail

    expect(summarizeProjectJourney(project)).toEqual({
      completedStages: 1,
      totalStages: 2,
      openSteps: 2,
      missingRecords: 2,
    })
  })

  it('returns a safe percentage for empty and populated stages', () => {
    expect(getStageProgress({ completedCount: 1, totalCount: 2 } as ProjectStage)).toBe(50)
    expect(getStageProgress({ completedCount: 0, totalCount: 0 } as ProjectStage)).toBe(0)
  })

  it('provides Vietnamese labels for every stage state', () => {
    expect(stageStatusLabel).toEqual({
      completed: 'Đã hoàn thành',
      active: 'Đang thực hiện',
      upcoming: 'Sắp thực hiện',
      incomplete: 'Chưa đầy đủ',
      not_applicable: 'Không áp dụng',
    })
  })
})
```

Append to `tests/unit/journey/project-journey.spec.ts`:

```ts
it('ignores an unknown stage id', () => {
  const state = createJourneyState(['survey', 'design'], 'survey')
  state.focusStage('missing')
  expect(state.focusedStageId.value).toBe('survey')
})
```

- [ ] **Step 2: Run the tests and verify the presenter is missing**

Run:

```bash
pnpm vitest run tests/unit/journey/journey-presenter.spec.ts tests/unit/journey/project-journey.spec.ts
```

Expected: FAIL because `journey.presenter.ts` does not exist.

- [ ] **Step 3: Implement the pure presenter**

Create `app/features/journey/journey.presenter.ts`:

```ts
import type { ProjectStage, StageStatus } from './journey.types'
import type { ProjectDetail } from '../projects/project.types'

export interface JourneySummary {
  completedStages: number
  totalStages: number
  openSteps: number
  missingRecords: number
}

export const stageStatusLabel: Record<StageStatus, string> = {
  completed: 'Đã hoàn thành',
  active: 'Đang thực hiện',
  upcoming: 'Sắp thực hiện',
  incomplete: 'Chưa đầy đủ',
  not_applicable: 'Không áp dụng',
}

export function summarizeProjectJourney(project: ProjectDetail): JourneySummary {
  return {
    completedStages: project.completedStageCount,
    totalStages: project.totalStageCount,
    openSteps: project.stages.flatMap(stage => stage.subStages)
      .filter(step => step.status !== 'completed' && step.status !== 'not_applicable').length,
    missingRecords: project.stages.reduce((total, stage) => total + stage.missingRecordCount, 0),
  }
}

export function getStageProgress(stage: ProjectStage): number {
  if (stage.totalCount <= 0) return 0
  return Math.round(stage.completedCount / stage.totalCount * 100)
}
```

- [ ] **Step 4: Run presenter and state tests**

Run:

```bash
pnpm vitest run tests/unit/journey/journey-presenter.spec.ts tests/unit/journey/project-journey.spec.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit the presentation layer**

```bash
git add app/features/journey/journey.presenter.ts tests/unit/journey/journey-presenter.spec.ts tests/unit/journey/project-journey.spec.ts
git commit -m "feat: derive project journey presentation data"
```

---

### Task 3: Add direct stage navigation with `JourneyStageRail`

**Files:**
- Create: `app/components/journey/JourneyStageRail.vue`
- Modify: `app/components/journey/ProjectJourneyCarousel.vue`
- Modify: `tests/e2e/project-journey.spec.ts`

**Interfaces:**
- Consumes: `stages: ProjectStage[]`, `focusedStageId: string`, `actualCurrentStageId: string`.
- Produces: `select(stageId: string)` and `data-testid="journey-stage-rail"`.

- [ ] **Step 1: Add a failing rail navigation test**

Add to `tests/e2e/project-journey.spec.ts`:

```ts
test('jumps directly to a stage from the journey rail', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/projects/project-thao-dien')

  const rail = page.getByTestId('journey-stage-rail')
  await expect(rail).toBeVisible()
  await rail.getByRole('button', { name: 'Xem giai đoạn 04: Phối cảnh 3D & chốt phương án' }).click()

  await expect(page.getByTestId('stage-focused')).toContainText('Phối cảnh 3D & chốt phương án')
  await expect(rail.getByRole('button', { name: 'Xem giai đoạn 04: Phối cảnh 3D & chốt phương án' })).toHaveAttribute('aria-current', 'step')
})
```

- [ ] **Step 2: Run the focused E2E test and verify it fails**

Run:

```bash
pnpm playwright test tests/e2e/project-journey.spec.ts --grep "jumps directly"
```

Expected: FAIL because the rail test ID does not exist.

- [ ] **Step 3: Create the rail component**

Create `app/components/journey/JourneyStageRail.vue` with this public structure:

```vue
<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { stageStatusLabel } from '../../features/journey/journey.presenter'
import type { ProjectStage } from '../../features/journey/journey.types'

const props = defineProps<{
  stages: ProjectStage[]
  focusedStageId: string
  actualCurrentStageId: string
}>()

const emit = defineEmits<{ select: [stageId: string] }>()
const rail = ref<HTMLOListElement | null>(null)

watch(
  () => props.focusedStageId,
  async (stageId) => {
    await nextTick()
    rail.value?.querySelector<HTMLElement>(`[data-stage-id="${stageId}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'center' })
  },
  { immediate: true },
)
</script>

<template>
  <ol ref="rail" class="journey-stage-rail" data-testid="journey-stage-rail" aria-label="Các giai đoạn của dự án">
    <li v-for="stage in stages" :key="stage.id" :class="`is-${stage.status}`">
      <UButton
        :data-stage-id="stage.id"
        :aria-current="stage.id === focusedStageId ? 'step' : undefined"
        :aria-label="`Xem giai đoạn ${stage.code}: ${stage.name}`"
        color="neutral"
        variant="ghost"
        @click="emit('select', stage.id)"
      >
        <span class="rail-node" aria-hidden="true">
          <UIcon :name="stage.status === 'completed' ? 'i-lucide-check' : 'i-lucide-circle'" />
        </span>
        <span class="rail-copy">
          <small>Giai đoạn {{ stage.code }}</small>
          <strong>{{ stage.name }}</strong>
          <em>{{ stage.id === actualCurrentStageId ? 'Hiện tại' : stageStatusLabel[stage.status] }}</em>
        </span>
      </UButton>
    </li>
  </ol>
</template>
```

Add scoped styles with these exact behavior rules:

```css
.journey-stage-rail { display: flex; padding: 0 4px 10px; margin: 0; overflow-x: auto; list-style: none; scroll-snap-type: x proximity; }
.journey-stage-rail li { position: relative; flex: 1 0 132px; scroll-snap-align: center; }
.journey-stage-rail li::after { position: absolute; z-index: 0; top: 21px; left: 50%; width: 100%; height: 2px; background: var(--journey-border); content: ''; }
.journey-stage-rail li:last-child::after { display: none; }
.journey-stage-rail button { position: relative; z-index: 1; display: grid; justify-items: center; width: 100%; min-height: 76px; gap: 6px; color: var(--journey-muted); text-align: center; }
.rail-node { display: grid; width: 34px; height: 34px; place-items: center; border: 3px solid var(--journey-canvas); border-radius: 50%; background: var(--journey-surface); box-shadow: 0 0 0 1px var(--journey-border); }
.rail-copy { display: grid; max-width: 140px; gap: 2px; }
.rail-copy small,.rail-copy em { font-family: var(--font-journey-mono); font-size: .58rem; font-style: normal; }
.rail-copy strong { overflow: hidden; font-size: .72rem; text-overflow: ellipsis; white-space: nowrap; }
.journey-stage-rail button[aria-current='step'] { color: var(--journey-primary); }
.journey-stage-rail button[aria-current='step'] .rail-node { background: var(--journey-mint); box-shadow: 0 0 0 1px var(--journey-primary); }
.journey-stage-rail .is-completed::after { background: var(--journey-mint); }
```

- [ ] **Step 4: Wire the rail into the existing orchestrator**

Import `JourneyStageRail` in `ProjectJourneyCarousel.vue`, place it between the header and current carousel track, and wire:

```vue
<JourneyStageRail
  :stages="project.stages"
  :focused-stage-id="focusedStage.id"
  :actual-current-stage-id="actualStage.id"
  @select="journey.focusStage"
/>
```

Do not change the current three-card track in this task.

- [ ] **Step 5: Run the rail test and existing journey tests**

Run:

```bash
pnpm playwright test tests/e2e/project-journey.spec.ts
pnpm typecheck
```

Expected: project journey tests PASS and typecheck exits `0`.

- [ ] **Step 6: Commit direct stage navigation**

```bash
git add app/components/journey/JourneyStageRail.vue app/components/journey/ProjectJourneyCarousel.vue tests/e2e/project-journey.spec.ts
git commit -m "feat: add project journey stage rail"
```

---

### Task 4: Replace focused and neighbor cards with one Nuxt UI stage card

**Files:**
- Create: `app/components/journey/JourneyStageCard.vue`
- Modify: `app/components/journey/ProjectJourneyCarousel.vue`
- Delete: `app/components/journey/StageCardFocused.vue`
- Delete: `app/components/journey/StageCardNeighbor.vue`
- Modify: `tests/e2e/project-journey.spec.ts`

**Interfaces:**
- Consumes: `stage: ProjectStage`, `projectId: string`, `focused: boolean`, `actualCurrent: boolean`.
- Produces: `focus(stageId: string)`, `data-testid="journey-stage-card"`, `data-focused`, media loading/error containment, and the existing stage-detail route.

- [ ] **Step 1: Add a failing unified-card test**

Add to `tests/e2e/project-journey.spec.ts`:

```ts
test('uses one stage-card contract for focused and neighboring stages', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/projects/project-thao-dien')

  const cards = page.getByTestId('journey-stage-card')
  await expect(cards).toHaveCount(3)
  await expect(cards.filter({ hasText: 'Thi công & giám sát' })).toHaveAttribute('data-focused', 'true')

  await cards.filter({ hasText: 'Hợp đồng & chuẩn bị thi công' }).getByRole('button', { name: /Xem giai đoạn/ }).click()
  await expect(cards.filter({ hasText: 'Hợp đồng & chuẩn bị thi công' })).toHaveAttribute('data-focused', 'true')
})
```

- [ ] **Step 2: Run the unified-card test and verify it fails**

Run:

```bash
pnpm playwright test tests/e2e/project-journey.spec.ts --grep "one stage-card contract"
```

Expected: FAIL because `journey-stage-card` does not exist.

- [ ] **Step 3: Create `JourneyStageCard.vue`**

Use the following script contract and request guard:

```vue
<script setup lang="ts">
import type { ProjectMedia } from '../../features/media/media.types'
import { getStageProgress, stageStatusLabel } from '../../features/journey/journey.presenter'
import type { ProjectStage } from '../../features/journey/journey.types'
import SiteVisualComparison from '../media/SiteVisualComparison.vue'

const props = defineProps<{
  stage: ProjectStage
  projectId: string
  focused: boolean
  actualCurrent: boolean
}>()

const emit = defineEmits<{ focus: [stageId: string] }>()
const repositories = useRepositories()
const media = ref<ProjectMedia[]>([])
const mediaPending = ref(false)
const mediaError = ref('')
let mediaRequest = 0

watch(
  [() => props.focused, () => props.stage.id],
  async ([focused]) => {
    const request = ++mediaRequest
    media.value = []
    mediaError.value = ''
    if (!focused || props.stage.visualKind !== 'construction_comparison') return

    mediaPending.value = true
    try {
      const result = await repositories.media.listByStage(props.stage.id)
      if (request === mediaRequest) media.value = result
    } catch {
      if (request === mediaRequest) mediaError.value = 'Không thể tải hình ảnh của giai đoạn này.'
    } finally {
      if (request === mediaRequest) mediaPending.value = false
    }
  },
  { immediate: true },
)
</script>
```

Use a `UCard` root with `data-testid="journey-stage-card"` and `:data-focused="focused"`. The template must implement these two exclusive bodies:

```vue
<template>
  <UCard class="journey-stage-card" :class="{ 'is-focused': focused }" data-testid="journey-stage-card" :data-focused="String(focused)">
    <template v-if="focused">
      <div class="stage-visual">
        <USkeleton v-if="mediaPending" class="size-full rounded-none" />
        <UAlert v-else-if="mediaError" color="error" variant="subtle" icon="i-lucide-image-off" :description="mediaError" />
        <SiteVisualComparison v-else-if="stage.visualKind === 'construction_comparison'" :media="media" compact />
        <img v-else :src="stage.imageUrl" :alt="`Minh họa giai đoạn ${stage.name}`">
      </div>

      <div class="stage-card-copy">
        <div class="stage-card-topline">
          <span>Giai đoạn {{ stage.code }}</span>
          <UBadge :color="actualCurrent ? 'success' : 'secondary'" variant="subtle">
            {{ actualCurrent ? 'Hiện tại' : 'Đang xem lại' }}
          </UBadge>
        </div>
        <h2>{{ stage.name }}</h2>
        <p>{{ stage.purpose }}</p>
        <UProgress :model-value="getStageProgress(stage)" size="sm" color="success" />
        <div class="stage-meta">
          <span>{{ stage.completedCount }}/{{ stage.totalCount }} bước</span>
          <span>{{ stage.missingRecordCount }} hồ sơ còn thiếu</span>
          <span>{{ stage.ownerDepartment }}</span>
        </div>
        <UButton :to="`/projects/${projectId}/stages/${stage.id}`" trailing-icon="i-lucide-arrow-right">
          Mở không gian giai đoạn
        </UButton>
      </div>
    </template>

    <button v-else type="button" class="neighbor-trigger" :aria-label="`Xem giai đoạn ${stage.code}: ${stage.name}`" @click="emit('focus', stage.id)">
      <img :src="stage.imageUrl" alt="">
      <span class="neighbor-scrim" />
      <span class="neighbor-copy">
        <small>{{ stageStatusLabel[stage.status] }}</small>
        <strong>{{ stage.code }} · {{ stage.name }}</strong>
        <span>{{ stage.completedCount }}/{{ stage.totalCount }} bước</span>
      </span>
    </button>
  </UCard>
</template>
```

Add scoped styles that preserve a stable root height, make the focused card a two-row visual/content layout, give neighbors one full-card trigger, and apply only `opacity`, `transform`, and `box-shadow` transitions. Use `transform: translateY(-4px) scale(1.015)` for `.is-focused` and `transform: scale(.94); opacity: .68` for neighbor cards.

- [ ] **Step 4: Replace both existing card consumers**

In the current manual track, render `JourneyStageCard` for previous, focused, and next stages. Emit `focus` directly to `journey.focusStage`. Preserve `data-testid="stage-focused"` temporarily on the focused wrapper so pre-carousel tests continue to pass.

- [ ] **Step 5: Remove superseded card files**

Delete:

```text
app/components/journey/StageCardFocused.vue
app/components/journey/StageCardNeighbor.vue
```

Verify no imports remain:

```bash
rg "StageCardFocused|StageCardNeighbor" app tests
```

Expected: no matches.

- [ ] **Step 6: Run card, journey, type, and lint checks**

Run:

```bash
pnpm playwright test tests/e2e/project-journey.spec.ts
pnpm typecheck
pnpm lint
```

Expected: all commands exit `0`.

- [ ] **Step 7: Commit the unified card**

```bash
git add app/components/journey/ProjectJourneyCarousel.vue app/components/journey/JourneyStageCard.vue app/components/journey/StageCardFocused.vue app/components/journey/StageCardNeighbor.vue tests/e2e/project-journey.spec.ts
git commit -m "refactor: unify project journey stage cards"
```

---

### Task 5: Rebuild the orchestrator around Nuxt UI Carousel and responsive motion

**Files:**
- Modify: `app/components/journey/ProjectJourneyCarousel.vue`
- Modify: `app/components/journey/JourneyStageCard.vue`
- Modify: `app/components/journey/JourneyStageRail.vue`
- Modify: `tests/e2e/project-journey.spec.ts`
- Modify: `tests/e2e/mobile.spec.ts`

**Interfaces:**
- Consumes: `summarizeProjectJourney`, `createJourneyState`, `JourneyStageRail`, `JourneyStageCard`, and `UCarousel`’s `select(index)` event plus exposed `emblaApi.scrollTo(index)`.
- Produces: `data-testid="project-journey"`, `data-testid="journey-carousel"`, synchronized focus, project summary, previous/next controls, and a polite live announcement.

- [ ] **Step 1: Replace fixed-pixel E2E assertions with behavior tests**

Rewrite `tests/e2e/project-journey.spec.ts` so it contains these behaviors:

```ts
import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/projects/project-thao-dien')
})

test('centers the actual current stage and preserves workflow state while browsing', async ({ page }) => {
  const focused = page.locator('[data-testid="journey-stage-card"][data-focused="true"]')
  await expect(page.getByTestId('journey-stage-card')).toHaveCount(7)
  await expect(focused).toContainText('Thi công & giám sát')
  await expect(page.getByTestId('journey-summary')).toContainText('5/7')

  await page.getByRole('button', { name: 'Giai đoạn trước' }).click()
  await expect(focused).toContainText('Hợp đồng & chuẩn bị thi công')
  await expect(page.getByText('Giai đoạn hiện tại: Thi công & giám sát').first()).toBeVisible()

  await page.getByRole('button', { name: 'Quay về giai đoạn hiện tại' }).click()
  await expect(focused).toContainText('Thi công & giám sát')
})

test('supports direct rail and keyboard navigation at journey boundaries', async ({ page }) => {
  const carousel = page.getByTestId('journey-carousel')
  const focused = page.locator('[data-testid="journey-stage-card"][data-focused="true"]')

  await page.getByTestId('journey-stage-rail').getByRole('button', { name: 'Xem giai đoạn 01: Tiếp nhận yêu cầu' }).click()
  await expect(focused).toContainText('Tiếp nhận yêu cầu')
  await expect(page.getByRole('button', { name: 'Giai đoạn trước' })).toBeDisabled()

  await carousel.focus()
  await page.keyboard.press('ArrowRight')
  await expect(focused).toContainText('Khảo sát hiện trạng')

  await page.getByTestId('journey-stage-rail').getByRole('button', { name: 'Xem giai đoạn 07: Nghiệm thu & bàn giao' }).click()
  await expect(page.getByRole('button', { name: 'Giai đoạn sau' })).toBeDisabled()
})
```

Replace the old mobile test with:

```ts
import { expect, test } from '@playwright/test'

test.use({ viewport: { width: 390, height: 844 } })

test('uses a swipeable journey without horizontal page overflow', async ({ page }) => {
  await page.goto('/projects/project-thao-dien')

  await expect(page.getByTestId('journey-carousel')).toBeVisible()
  await expect(page.getByTestId('mobile-stage-list')).toHaveCount(0)
  await expect(page.locator('[data-testid="journey-stage-card"][data-focused="true"]')).toContainText('Thi công & giám sát')

  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }))
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport)

  const carouselViewport = page.getByTestId('journey-carousel').locator('[data-slot="viewport"]')
  const box = await carouselViewport.boundingBox()
  expect(box).not.toBeNull()
  await page.mouse.move(box!.x + box!.width * .75, box!.y + box!.height * .5)
  await page.mouse.down()
  await page.mouse.move(box!.x + box!.width * .25, box!.y + box!.height * .5, { steps: 8 })
  await page.mouse.up()
  await expect(page.locator('[data-testid="journey-stage-card"][data-focused="true"]')).toContainText('Nghiệm thu & bàn giao')
})
```

- [ ] **Step 2: Run journey and mobile tests to verify the new contract fails**

Run:

```bash
pnpm playwright test tests/e2e/project-journey.spec.ts tests/e2e/mobile.spec.ts
```

Expected: FAIL because the current orchestrator lacks the summary, UCarousel contract, and mobile carousel.

- [ ] **Step 3: Rebuild the orchestrator script around one focus source**

Use this synchronization shape in `ProjectJourneyCarousel.vue`:

```ts
import { summarizeProjectJourney } from '../../features/journey/journey.presenter'

interface JourneyCarouselRef {
  emblaApi?: {
    selectedScrollSnap: () => number
    scrollTo: (index: number) => void
  }
}

const props = defineProps<{ project: ProjectDetail }>()
const journey = createJourneyState(props.project.stages.map(stage => stage.id), props.project.currentStageId)
const carousel = ref<JourneyCarouselRef | null>(null)
const reducedMotion = ref(false)
let reducedMotionQuery: MediaQueryList | null = null

const focusedIndex = computed(() => props.project.stages.findIndex(stage => stage.id === journey.focusedStageId.value))
const focusedStage = computed(() => props.project.stages[focusedIndex.value] ?? props.project.stages[0]!)
const actualStage = computed(() => props.project.stages.find(stage => stage.id === props.project.currentStageId)!)
const actualStageIndex = computed(() => props.project.stages.findIndex(stage => stage.id === props.project.currentStageId))
const summary = computed(() => summarizeProjectJourney(props.project))

function syncReducedMotion() {
  reducedMotion.value = reducedMotionQuery?.matches ?? false
}

onMounted(() => {
  reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  syncReducedMotion()
  reducedMotionQuery.addEventListener('change', syncReducedMotion)
})

onBeforeUnmount(() => {
  reducedMotionQuery?.removeEventListener('change', syncReducedMotion)
})

function selectStage(stageId: string) {
  journey.focusStage(stageId)
}

function handleCarouselSelect(index: number) {
  const stage = props.project.stages[index]
  if (stage && stage.id !== journey.focusedStageId.value) journey.focusStage(stage.id)
}

watch(focusedIndex, (index) => {
  if (index >= 0 && carousel.value?.emblaApi?.selectedScrollSnap() !== index) {
    carousel.value?.emblaApi?.scrollTo(index)
  }
})
```

Do not extend `createJourneyState`; its current interface is sufficient.

- [ ] **Step 4: Build the Nuxt UI header, summary, carousel, and controls**

The rebuilt template must use:

```vue
<section class="creative-momentum project-journey" data-testid="project-journey">
  <header class="journey-header">
    <UBreadcrumb :items="[{ label: 'Dự án', to: '/projects' }, { label: project.name }]" />
    <div class="journey-heading">
      <div>
        <p class="journey-code">{{ project.code }} · {{ project.location }}</p>
        <h1>{{ project.name }}</h1>
      </div>
      <div class="actual-stage-context">
        <UBadge color="success" variant="subtle">Giai đoạn hiện tại: {{ actualStage.name }}</UBadge>
        <UButton v-if="focusedStage.id !== actualStage.id" color="neutral" variant="ghost" @click="journey.returnToCurrent">
          Quay về giai đoạn hiện tại
        </UButton>
      </div>
    </div>
  </header>

  <div class="journey-summary" data-testid="journey-summary">
    <UCard><strong>{{ summary.completedStages }}/{{ summary.totalStages }}</strong><span>giai đoạn hoàn tất</span><UProgress :model-value="summary.completedStages" :max="summary.totalStages" /></UCard>
    <UCard><strong>{{ summary.openSteps }}</strong><span>bước đang mở</span></UCard>
    <UCard><strong>{{ summary.missingRecords }}</strong><span>hồ sơ còn thiếu</span></UCard>
  </div>

  <JourneyStageRail
    :stages="project.stages"
    :focused-stage-id="focusedStage.id"
    :actual-current-stage-id="actualStage.id"
    @select="selectStage"
  />

  <div class="carousel-shell">
    <UButton icon="i-lucide-chevron-left" aria-label="Giai đoạn trước" :disabled="focusedIndex === 0" @click="journey.focusPrevious" />
    <UCarousel
      ref="carousel"
      data-testid="journey-carousel"
      :items="project.stages"
      :start-index="actualStageIndex"
      :loop="false"
      :duration="reducedMotion ? 0 : 28"
      align="center"
      :ui="{
        container: 'items-stretch -ms-3',
        item: 'ps-3 basis-[92%] md:basis-[74%] xl:basis-[58%]',
      }"
      aria-label="Hành trình các giai đoạn dự án"
      @select="handleCarouselSelect"
    >
      <template #default="{ item: stage }">
        <JourneyStageCard
          :stage="stage"
          :project-id="project.id"
          :focused="stage.id === focusedStage.id"
          :actual-current="stage.id === actualStage.id"
          @focus="selectStage"
        />
      </template>
    </UCarousel>
    <UButton icon="i-lucide-chevron-right" aria-label="Giai đoạn sau" :disabled="focusedIndex === project.stages.length - 1" @click="journey.focusNext" />
  </div>

  <p class="sr-only" aria-live="polite">
    Đang xem giai đoạn {{ focusedStage.code }}: {{ focusedStage.name }}{{ focusedStage.id === actualStage.id ? ', đây là giai đoạn hiện tại' : '' }}.
  </p>

  <JourneyFooter :stage="focusedStage" />
</section>
```

Use `UCarousel`’s native keyboard handler; remove the old `handleKeyboard`, desktop manual track, and mobile vertical list.

- [ ] **Step 5: Apply the approved responsive layout and motion**

In scoped styles:

- Remove fixed `height`, `min-height: 610px`, and `overflow: hidden` from the page root.
- Set `.project-journey` to `display: grid`, `gap: 20px`, `max-width: 1480px`, `margin: 0 auto`, `padding: 20px`, `background: var(--journey-canvas)`, and `border-radius: var(--journey-radius)`.
- Set `.journey-summary` to three columns on desktop and a two-row layout below `640px`.
- Set `.carousel-shell` to `grid-template-columns: 48px minmax(0, 1fr) 48px` on desktop and `44px minmax(0, 1fr) 44px` on mobile.
- Style `[data-focused='true']` with `translateY(-4px) scale(1.015)`, full opacity, and one restrained shadow.
- Style `[data-focused='false']` with `scale(.94)` and `opacity: .68`.
- Use `transition: transform var(--journey-motion), opacity 200ms ease, box-shadow var(--journey-motion)`.
- Under `prefers-reduced-motion: reduce`, set `scroll-behavior: auto`, `transform: none`, `transition-duration: .01ms`, and `animation-duration: .01ms` for rail and card motion targets.

- [ ] **Step 6: Run responsive journey tests**

Run:

```bash
pnpm playwright test tests/e2e/project-journey.spec.ts tests/e2e/mobile.spec.ts
pnpm typecheck
pnpm lint
```

Expected: all tests and checks PASS.

- [ ] **Step 7: Commit the carousel rebuild**

```bash
git add app/components/journey/ProjectJourneyCarousel.vue app/components/journey/JourneyStageCard.vue app/components/journey/JourneyStageRail.vue tests/e2e/project-journey.spec.ts tests/e2e/mobile.spec.ts
git commit -m "feat: rebuild project journey carousel"
```

---

### Task 6: Finish footer, page states, accessibility, and reduced-motion coverage

**Files:**
- Modify: `app/components/journey/JourneyFooter.vue`
- Modify: `app/components/journey/JourneyStageCard.vue`
- Modify: `app/pages/projects/[projectId]/index.vue`
- Modify: `tests/e2e/project-journey.spec.ts`
- Modify: `tests/e2e/accessibility.spec.ts`

**Interfaces:**
- Consumes: focused `ProjectStage`, Nuxt AsyncData `status`, and Nuxt UI `UCard`, `UAccordion`, `USkeleton`, `UAlert`, and `UEmpty`.
- Produces: `data-testid="journey-footer"`, `data-testid="journey-loading"`, `data-testid="journey-empty"`, resilient focused-media state, and measurable reduced-motion behavior.

- [ ] **Step 1: Add failing footer, not-found, and reduced-motion tests**

Append to `tests/e2e/project-journey.spec.ts`:

```ts
test('updates contextual footer content with the focused stage', async ({ page }) => {
  const footer = page.getByTestId('journey-footer')
  await expect(footer).toContainText('Thi công & giám sát')

  await page.getByRole('button', { name: 'Giai đoạn trước' }).click()
  await expect(footer).toContainText('Hợp đồng & chuẩn bị thi công')
})

test('shows a designed not-found state after an unknown project resolves', async ({ page }) => {
  await page.goto('/projects/project-does-not-exist')
  await expect(page.getByTestId('journey-not-found')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Quay lại danh sách dự án' })).toBeVisible()
})

test('removes nonessential card motion when reduced motion is requested', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/projects/project-thao-dien')

  const durations = await page.locator('[data-testid="journey-stage-card"]').first().evaluate((element) =>
    getComputedStyle(element).transitionDuration.split(',').map(value => Number.parseFloat(value)),
  )
  expect(durations.every(duration => duration <= 0.01)).toBe(true)
})
```

Keep the existing axe loop over `/projects/project-thao-dien`; do not exclude carousel or color-contrast rules.

- [ ] **Step 2: Run the new tests and verify the contracts fail**

Run:

```bash
pnpm playwright test tests/e2e/project-journey.spec.ts --grep "contextual footer|not-found|reduced motion"
```

Expected: at least the new not-found test ID and footer content assertions FAIL.

- [ ] **Step 3: Rebuild `JourneyFooter.vue` with one derived panel model**

Define this internal interface and computed model:

```ts
interface FooterEntry {
  title: string
  description: string
}

interface FooterPanel {
  value: 'attention' | 'open' | 'milestone'
  label: string
  icon: string
  entries: FooterEntry[]
  empty: string
}

const panels = computed<FooterPanel[]>(() => [
  {
    value: 'attention',
    label: 'Vấn đề cần chú ý',
    icon: 'i-lucide-circle-alert',
    entries: props.stage.missingRecordCount
      ? [{ title: `${props.stage.missingRecordCount} hồ sơ chưa đủ`, description: 'Điều kiện hướng dẫn, không khóa giai đoạn.' }]
      : [],
    empty: 'Không có hồ sơ cần chú ý.',
  },
  {
    value: 'open',
    label: 'Công việc đang mở',
    icon: 'i-lucide-list-checks',
    entries: props.stage.subStages
      .filter(step => step.status !== 'completed' && step.status !== 'not_applicable')
      .map(step => ({ title: step.name, description: step.ownerName })),
    empty: 'Không có bước đang mở.',
  },
  {
    value: 'milestone',
    label: 'Mốc gần nhất',
    icon: 'i-lucide-calendar-clock',
    entries: [{
      title: props.stage.dueAt ? new Intl.DateTimeFormat('vi-VN').format(new Date(props.stage.dueAt)) : 'Chưa đặt hạn',
      description: props.stage.name,
    }],
    empty: 'Chưa có mốc thời gian.',
  },
])
```

Render the same model twice: desktop `UCard` panels in `.journey-footer__desktop`, and a mobile `UAccordion :items="panels" type="multiple"` in `.journey-footer__mobile`. The root keeps `data-testid="journey-footer"` and includes a visually hidden `{{ stage.name }}` so the footer-stage update is announced and testable without duplicating visible headings.

- [ ] **Step 4: Add explicit pending, empty, and not-found page states**

Change the page AsyncData destructure to include status:

```ts
const { data: project, status } = await useAsyncData(
  () => `project-${projectId.value}`,
  () => repositories.projects.getById(projectId.value),
  { watch: [projectId] },
)
```

Use this branch order in the template:

```vue
<template>
  <section v-if="status === 'pending'" class="journey-loading" data-testid="journey-loading" aria-label="Đang tải hành trình dự án">
    <USkeleton class="h-24 w-full" />
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-3"><USkeleton v-for="index in 3" :key="index" class="h-24" /></div>
    <USkeleton class="h-[420px] w-full" />
  </section>

  <ProjectJourneyCarousel v-else-if="project?.stages.length" :project="project" />

  <UEmpty
    v-else-if="project"
    data-testid="journey-empty"
    icon="i-lucide-route-off"
    title="Dự án chưa có hành trình"
    description="Hãy cấu hình các giai đoạn trước khi theo dõi tiến độ dự án."
    :actions="[{ label: 'Quay lại danh sách dự án', to: '/projects', icon: 'i-lucide-arrow-left' }]"
  />

  <UEmpty
    v-else
    data-testid="journey-not-found"
    icon="i-lucide-folder-search"
    title="Không tìm thấy dự án"
    description="Dự án không tồn tại hoặc bạn không có quyền xem."
    :actions="[{ label: 'Quay lại danh sách dự án', to: '/projects', icon: 'i-lucide-arrow-left' }]"
  />
</template>
```

- [ ] **Step 5: Verify accessibility and focused-media containment**

Confirm `JourneyStageCard.vue` has all of the following:

- The focused stage image has contextual alternative text.
- Neighbor card images use `alt=""` because the button name supplies the accessible name.
- Media failure uses inline `UAlert` and does not remove the stage title or open-stage action.
- Card transforms never remove a visible focus ring.
- Color is accompanied by icon or text for current, completed, upcoming, incomplete, and not-applicable states.

- [ ] **Step 6: Run journey, accessibility, and mobile verification**

Run:

```bash
pnpm playwright test tests/e2e/project-journey.spec.ts tests/e2e/mobile.spec.ts tests/e2e/accessibility.spec.ts
pnpm typecheck
pnpm lint
```

Expected: all tests and checks PASS; axe reports no serious or critical violations.

- [ ] **Step 7: Commit states and accessibility**

```bash
git add app/components/journey/JourneyFooter.vue app/components/journey/JourneyStageCard.vue app/pages/projects/[projectId]/index.vue tests/e2e/project-journey.spec.ts tests/e2e/accessibility.spec.ts
git commit -m "feat: finish accessible project journey states"
```

---

### Task 7: Perform full regression and visual verification

**Files:**
- Modify only files with defects found by this verification task.

**Interfaces:**
- Consumes: the completed Creative Momentum journey implementation.
- Produces: a clean worktree with all automated checks passing and verified desktop/tablet/mobile behavior.

- [ ] **Step 1: Run the complete unit suite**

Run:

```bash
pnpm test:unit
```

Expected: all unit tests PASS.

- [ ] **Step 2: Run the complete Playwright suite**

Run:

```bash
pnpm test:e2e
```

Expected: all project, mobile, accessibility, reset, drawings, media, stage workspace, and My Work tests PASS.

- [ ] **Step 3: Run static and production checks**

Run:

```bash
pnpm typecheck
pnpm lint
pnpm build
```

Expected: all commands exit `0` with no TypeScript, ESLint, or build error.

- [ ] **Step 4: Inspect the implementation in a real browser**

Start the app:

```bash
pnpm dev --host 127.0.0.1 --port 3000
```

Open `/projects/project-thao-dien` and verify at `390×844`, `768×1024`, `1280×720`, and `1440×900`:

- Creative Momentum colors and fonts match the approved direction.
- Initial focus is “Thi công & giám sát”.
- Rail click, neighboring card, arrow button, keyboard arrow, and swipe update the same focus.
- “Return to current stage” restores stage 06.
- Cards do not clip and the page has no horizontal overflow.
- Footer uses accordion on mobile and cards on larger layouts.
- Focus rings remain visible.
- Reduced-motion emulation removes scale and lift.
- Other routes retain their previous layout and behavior.

- [ ] **Step 5: Review the final diff for scope and accidental generated files**

Run:

```bash
git status --short
git diff --check
git diff --stat b7468ff..HEAD
```

Expected: no `.nuxt`, `.output`, test artifacts, `.superpowers`, or unrelated feature files are tracked; `git diff --check` reports no errors.

- [ ] **Step 6: Commit only verification fixes when needed**

If verification required source changes, stage the exact changed source/test files and commit:

```bash
git commit -m "fix: resolve project journey verification issues"
```

If no fixes were needed, do not create an empty commit.
