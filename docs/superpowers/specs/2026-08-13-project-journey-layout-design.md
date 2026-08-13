# Project Journey Layout Design

## Goal

Simplify the project journey page by removing the horizontal stage rail and placing the complete three-card journey summary after the stage banner carousel.

## Approved Layout

The page content order will be:

1. Project breadcrumb, identity, and current-stage context.
2. Stage banner carousel with previous and next controls.
3. The existing three-card summary: completed stages, open steps, and missing records.
4. The existing focused-stage footer and supporting details.

## Component Changes

- Update `app/components/journey/ProjectJourneyCarousel.vue` only.
- Remove the `JourneyStageRail` import and rendered component.
- Move the existing `journey-summary` block from above the carousel to immediately below it.
- Preserve the summary markup, calculations, styling, and responsive behavior.
- Keep `JourneyStageRail.vue` in the repository because deleting an otherwise reusable component is outside this layout change.

## Behavior and Data Flow

`summarizeProjectJourney(project)` continues to supply all three summary values. Carousel state remains owned by `createJourneyState`, and users continue to focus stages through the previous and next buttons, swipe/drag gestures, and selectable stage cards. Removing the rail must not change the actual current stage, focused stage, initial carousel position, or return-to-current action.

## Accessibility and Responsive Behavior

The carousel's existing labels, live region, keyboard behavior, reduced-motion handling, and mobile layout remain unchanged. The removed rail must no longer appear in the accessibility tree. The three-card summary keeps its current desktop grid and mobile wrapping rules in its new position.

## Verification

- Add or update an end-to-end regression test before changing production code.
- Verify that `journey-stage-rail` is absent.
- Verify that `journey-summary` appears after `journey-carousel` in DOM order and still displays all three metrics.
- Keep coverage for carousel navigation boundaries by using the remaining previous and next controls.
- Run the focused journey E2E test, unit tests, typecheck, and lint after implementation.

## Out of Scope

- Changing journey summary calculations or labels.
- Redesigning the three summary cards.
- Deleting `JourneyStageRail.vue`.
- Changing project fixtures, stage data, or stage-detail routes.
