# Project Journey Creative Momentum Redesign

**Status:** Approved  
**Date:** 2026-08-12  
**Scope:** `/projects/:projectId` project journey only

## Context

The current project journey is functional but visually rigid. It uses a fixed-height dashboard, a hand-built three-card layout, separate focused and neighboring card implementations, and a vertical mobile fallback. The redesign must make the journey feel modern, intelligent, energetic, and inspiring without changing project workflow rules, repositories, routes, or stored data.

The application is Nuxt 4 with Vue 3, Tailwind CSS 4, and Nuxt UI 4. Official shadcn/ui components target React, so this redesign uses Nuxt UI primitives and applies the composition discipline associated with shadcn-style product interfaces: semantic tokens, accessible primitives, restrained nesting, consistent density, and designed non-happy states.

The approved visual direction is **Creative Momentum**.

## Goals

- Make the current stage and overall project progress immediately understandable.
- Create an energetic but professional visual identity suitable for a construction and design operations product.
- Add directional, responsive motion when browsing project stages.
- Use Nuxt UI primitives for common interface behavior and accessibility.
- Preserve the current repository contracts, routes, workflow semantics, and project data.
- Work well with mouse, keyboard, touch, screen readers, and reduced-motion preferences.
- Establish reusable theme tokens without redesigning unrelated screens in this iteration.

## Non-goals

- No backend, database, authentication, notification, or repository changes.
- No AI-generated project score, prediction, schedule trend, or other metric without a real data source.
- No redesign of the project list, My Work, stage workspace, drawings, header, or sidebar.
- No dark mode in this iteration.
- No automatic carousel playback.
- No broad application-shell refactor.
- Manus is not a runtime dependency and will not generate or own production source code.

## Visual System

### Palette

| Role | Value | Use |
| --- | --- | --- |
| Deep teal | `#103D38` | Primary actions, strong text, navigation emphasis |
| Fresh mint | `#2FD6A3` | Current stage, progress, positive state |
| Coral | `#FF7A63` | Energy accent, attention, selected highlights |
| Canvas | `#F2FCF8` | Journey page background |
| Surface | `#FFFFFF` | Cards and elevated content |
| Foreground | `#153A37` | Main text |
| Muted foreground | `#56706A` | Supporting text and metadata |
| Border | `#D5E9E3` | Separators and card outlines |

Coral is an accent, not a default text color. Coral-filled controls use deep-teal text rather than white so the contrast remains readable. Error and warning states retain dedicated semantic colors instead of reusing coral or mint.

The implementation will expose these values through Tailwind/Nuxt UI semantic tokens. Existing legacy variables remain available until other screens are migrated; this iteration only adopts the new tokens in journey components.

### Typography

- **Manrope Variable 700–800:** project titles, stage titles, prominent counts, and calls to action.
- **Be Vietnam Pro 400–600:** Vietnamese body copy, labels, controls, and supporting content.
- **JetBrains Mono Variable 500–600:** project codes, stage codes, dates, and compact operational metadata.

Manrope is added through `@fontsource-variable/manrope@5.3.0`. Be Vietnam Pro does not publish a Fontsource variable package, so it uses `@fontsource/be-vietnam-pro@5.3.0` with explicit 400, 500, and 600 weight imports. Existing fonts remain installed while unmigrated screens still reference them. The journey page must not synthesize unsupported weights.

### Shape, spacing, and elevation

- Use a comfortable page density with a `24px` desktop rhythm and `16px` mobile rhythm.
- Use a consistent `12–16px` surface radius, with pill radii reserved for badges.
- Prefer borders and one restrained shadow level over nested card stacks.
- Use Lucide icons at `16px` or `20px`.
- Keep touch targets at least `44px × 44px` on mobile.

## Information Architecture

The page is organized into four vertical layers.

### 1. Project header

The header contains:

- A Nuxt UI breadcrumb back to the project list.
- Project code, project name, and location.
- A badge naming the actual current stage.
- A “Return to current stage” action when the user is browsing another stage.

The header stays compact. It does not display invented health scores or week-over-week trends.

### 2. Project summary

Three compact summary cards use only values available in `ProjectDetail`:

- Completed stages: `completedStageCount / totalStageCount`.
- Open workflow steps: all project sub-stages whose status is neither `completed` nor `not_applicable`.
- Missing records: the sum of `missingRecordCount` across all project stages.

The cards use `UCard` and `UProgress`. They remain visible when a value is zero and use plain-language labels.

### 3. Journey rail and stage carousel

The journey rail is an ordered list of every stage. Each node shows its code and semantic state. Nodes are buttons so users can jump directly to a stage. State is communicated with text or icons as well as color.

Below the rail, `UCarousel` provides swipe and track motion. All stages are rendered with a unified `JourneyStageCard` component:

- The focused card is largest, fully opaque, and exposes purpose, counts, owner, and the “Open stage” action.
- Immediate neighbors remain recognizable but use reduced scale and opacity.
- More distant items stay in the carousel track but do not compete visually.
- The actual current stage and the currently browsed stage remain distinct states.

The focused card continues to show the existing visual media or construction comparison when the stage supports it.

### 4. Context footer

The footer keeps the existing three information groups for the focused stage:

- Issues requiring attention.
- Open workflow steps.
- Nearest milestone and latest activity.

Desktop and tablet show three lightweight `UCard` panels. Mobile uses a compact Nuxt UI accordion so the carousel remains the primary surface.

## Component Architecture

### `ProjectJourneyCarousel.vue`

The page-level journey orchestrator:

- Creates the journey state from project stage IDs and `currentStageId`.
- Computes project summary values.
- Synchronizes the focused stage with the carousel index.
- Composes the header, summary, rail, carousel, live announcement, and footer.
- Owns previous, next, return-to-current, and keyboard actions.

It does not fetch or mutate project workflow data.

### `JourneyStageRail.vue`

A focused navigation component:

- Receives stages, focused stage ID, and actual current stage ID.
- Emits a stage selection.
- Renders an ordered, horizontally scrollable stage list.
- Keeps the focused node visible when selection changes.

### `JourneyStageCard.vue`

Replaces `StageCardFocused.vue` and `StageCardNeighbor.vue`:

- Receives one `ProjectStage`, focus/current flags, and project ID.
- Uses focus state to select its information density and visual treatment.
- Loads stage media only when the card is focused and needs a construction comparison.
- Uses `UCard`, `UBadge`, `UProgress`, and `UButton` for standard surfaces and actions.
- Keeps card identity stable while the carousel moves so animation does not remount unnecessary content.

### `JourneyFooter.vue`

Retains its domain responsibility while moving its surfaces to Nuxt UI components. It receives only the focused stage and derives its three panels from that stage.

### Theme configuration

- `app/app.config.ts` defines relevant Nuxt UI defaults and semantic color aliases.
- `app/assets/css/main.css` defines Creative Momentum tokens, font imports, focus treatment, and reduced-motion rules.
- Journey component styles consume semantic classes and tokens rather than new ad hoc hex values.

## Data and State Flow

```text
Project repository
      |
      v
ProjectDetail page data
      |
      v
ProjectJourneyCarousel
      |
      +--> derived summary counts
      |
      +--> createJourneyState(stage IDs, actual current stage ID)
                  |
                  v
           focusedStageId <--> carousel index
                  |
                  +--> JourneyStageRail
                  +--> JourneyStageCard states
                  +--> JourneyFooter
                  +--> screen-reader announcement
```

`focusedStageId` remains the single source of truth. A rail click, neighboring-card click, arrow button, keyboard event, or carousel swipe updates it through `focusStage`. A focus change scrolls the carousel to the matching index. Synchronization guards prevent a programmatic scroll from creating an update loop.

The actual current stage never changes during browsing. Returning to it calls the existing `returnToCurrent` action.

Media loading is scoped to the focused card. A request sequence guard or keyed async state prevents a slower response for a previous stage from overwriting the newly focused card.

## Interaction and Motion

### Stage transition

- Carousel translation: `360ms` using `cubic-bezier(0.16, 1, 0.3, 1)`.
- Focused card: translate upward `4px` and scale to `1.015`.
- Neighbor cards: scale to `0.94` and use `0.68` opacity.
- Supporting content fade: `200ms`.
- Motion direction follows navigation direction.
- No continuous glow, parallax, or decorative loop.

Nuxt UI’s Embla-based carousel owns track movement. CSS focus classes add scale, opacity, and elevation; a second competing transform animation is not introduced.

### Inputs

- Previous and next buttons.
- Clickable rail nodes.
- Clickable neighboring cards.
- Left and right arrow keys while the journey region is focused.
- Touch swipe and trackpad drag.
- “Return to current stage” action.

The carousel stops at the first and last stage. Disabled controls remain understandable and do not shift layout.

### Reduced motion

Under `prefers-reduced-motion: reduce`:

- Remove scale and lift effects.
- Reduce carousel and fade durations to near-instant.
- Preserve focus, state, and content updates.

## Responsive Behavior

### Desktop, `>= 1200px`

- The focused card occupies roughly 56–60% of the carousel viewport.
- Both immediate neighbors remain visible.
- Summary cards form one row.
- Footer panels form three columns.

### Tablet, `768–1199px`

- The focused card occupies roughly 70–76%.
- One or both neighbors appear as partial previews.
- Summary cards remain in one row when space permits.
- Footer uses a two-column wrap, with the milestone panel spanning both columns.

### Mobile, `< 768px`

- One dominant card is shown per snap with a small neighboring peek where space allows.
- The rail scrolls horizontally and keeps the focused node in view.
- Summary cards use a compact horizontal scroll or two-row grid without truncating labels.
- Footer content becomes an accordion.
- Swipe is primary, but previous/next buttons and direct rail selection remain available.
- The page uses natural document height; it does not lock to the viewport.

## Loading, Empty, and Error States

- While the project is pending, show a page-level `USkeleton` matching the header, summary, and focused card rather than a premature not-found state.
- Show the not-found state only after loading completes with a null project.
- If a project contains no stages, show a `UEmpty`-style message and a route back to the project list; do not render carousel controls.
- While focused-stage media loads, preserve the card layout with a visual skeleton.
- If media loading fails, show an inline `UAlert` in the visual region. Stage metadata and navigation continue working.
- Empty footer groups show concise empty copy rather than blank cards.

## Accessibility

- The carousel region has an accessible name and keyboard instructions.
- Every navigation control has a specific Vietnamese label.
- A polite live region announces the newly focused stage and whether it is the actual current stage.
- Rail semantics use an ordered list with buttons; focus is visible and never relies on color alone.
- Stage images use contextual alternative text. Decorative imagery uses empty alternative text when the adjacent card title already supplies the same information.
- Focus rings use a high-contrast theme token.
- Text and interactive states meet WCAG AA contrast targets.
- Touch targets meet the mobile minimum size.
- Axe must report no serious or critical violations on the project journey route.

## Testing Strategy

### Unit tests

Extend journey state coverage for:

- Initial focus on the actual current stage.
- Previous and next boundary clamping.
- Direct focus by valid ID.
- Ignoring an unknown ID.
- Returning to the actual current stage.

### End-to-end tests

Replace brittle fixed-pixel assertions with behavior-based checks:

- The actual current stage is focused on entry.
- Previous/next buttons, rail clicks, and keyboard input focus the correct stage.
- Browsing does not change the actual current stage.
- “Return to current stage” restores focus.
- The footer updates with the focused stage.
- First/last controls are disabled at the correct boundaries.
- Mobile shows the carousel, supports touch-compatible navigation, and no longer falls back to the old vertical stage list.
- No horizontal page overflow occurs at representative phone, tablet, laptop, and desktop widths.
- Reduced-motion mode removes nonessential transforms.

### Regression verification

Run:

```bash
pnpm test:unit
pnpm test:e2e
pnpm typecheck
pnpm lint
pnpm build
```

The existing stage-detail route and project-state behavior must remain unchanged.

## Implementation File Scope

Implementation changes are limited to:

- `package.json` and `pnpm-lock.yaml`
- `app/app.config.ts` (new)
- `app/app.vue`
- `app/assets/css/main.css`
- `app/pages/projects/[projectId]/index.vue`
- `app/components/journey/ProjectJourneyCarousel.vue`
- `app/components/journey/JourneyStageRail.vue` (new)
- `app/components/journey/JourneyStageCard.vue` (new)
- `app/components/journey/JourneyFooter.vue`
- `app/components/journey/StageCardFocused.vue` (removed after replacement)
- `app/components/journey/StageCardNeighbor.vue` (removed after replacement)
- Journey unit and Playwright specifications

`app/composables/useProjectJourney.ts` remains unchanged because its existing focus, previous, next, and return-to-current interface is sufficient for carousel synchronization.

No repository contract, fixture schema, route shape, or domain type change is expected.

## Acceptance Criteria

1. The journey page visibly follows the approved Creative Momentum palette and typography.
2. All common controls and surfaces use Nuxt UI primitives where an appropriate primitive exists.
3. The actual current stage is centered on initial load.
4. Rail, buttons, keyboard, click, and swipe keep one synchronized focused stage.
5. Stage transitions are directional, responsive, and disabled appropriately for reduced motion.
6. The project summary contains only values derived from existing `ProjectDetail` data.
7. Browsing never mutates project workflow state.
8. Loading, no-stage, media-error, and empty-footer states have designed treatments.
9. Mobile uses natural page height and an accessible swipeable journey rather than the old vertical-only fallback.
10. Unit, end-to-end, accessibility, typecheck, lint, and build verification pass.
