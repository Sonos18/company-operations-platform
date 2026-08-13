# Project Journey Stage Imagery Design

**Status:** Approved  
**Date:** 2026-08-13  
**Scope:** Stage imagery for the two existing mock projects on `/projects/:projectId`

## Context

The Project Journey currently reuses a small set of simple SVG illustrations across multiple stages. This makes neighboring cards difficult to distinguish and weakens the visual story of how a project moves from intake through delivery.

The approved direction is a cohesive, premium architectural photo-realistic story for both mock projects. Each project must look like one continuous real project, while each stage must be immediately recognizable from its activity and setting.

## Goals

- Give every existing mock stage a distinct, intuitive visual.
- Maintain visual continuity within each project and clear identity between projects.
- Improve both focused cards and neighboring carousel cards without changing journey behavior.
- Preserve readable overlays and useful crops at mobile, tablet, and desktop sizes.
- Use generated local assets with no external runtime dependency or licensing ambiguity.

## Non-goals

- No schema, repository contract, carousel, route, or workflow behavior changes.
- No redesign of the stage card or site-comparison component.
- No new image management service, CDN, upload flow, or runtime image-generation feature.
- No replacement of drawing files used by the separate drawing workspace unless a journey stage currently points at that file.

## Visual Direction

All assets use premium architectural photo-realism, natural daylight, warm neutral materials, restrained green accents, and editorial composition. Images contain no embedded text, logos, watermarks, or identifiable faces. Important activity and architectural subjects remain inside a center-safe area so `object-fit: cover` can crop them at different breakpoints.

Thảo Điền is a warm, contemporary tropical townhouse with timber, stone, greenery, and generous daylight. Vinhomes is a refined urban apartment with lighter finishes, compact proportions, and a city context. The two projects share photographic quality but remain visually distinct.

## Asset Set

### Thảo Điền

1. **Tiếp nhận yêu cầu:** client brief, material samples, moodboard, and architectural discussion at a table.
2. **Khảo sát hiện trạng:** unfinished townhouse interior with a surveyor using a laser measure.
3. **Thiết kế mặt bằng 2D:** top-down architectural plan, tracing paper, scale ruler, and designer workspace.
4. **Phối cảnh 3D & chốt phương án:** polished living-room visualization matching the townhouse identity.
5. **Hợp đồng & chuẩn bị thi công:** signed project documents, material samples, helmet, and organized preparation kit.
6. **Thi công & giám sát:** two matched views for the existing comparison UI: the approved design target and the same space under active construction.
7. **Nghiệm thu & bàn giao:** completed interior, inspection checklist, keys, and handover details.

This produces eight Thảo Điền images because stage 06 requires separate target and current-state media.

### Vinhomes

1. **Tiếp nhận yêu cầu:** apartment consultation with compact-space references and material samples.
2. **Khảo sát hiện trạng:** real apartment shell with measurement activity and visible city context.
3. **Thiết kế phương án:** refined apartment rendering and design board emphasizing storage and lighting.
4. **Thi công:** protected apartment interior with cabinetry or finish work in progress.

This produces four Vinhomes images, for twelve generated assets in total.

## Technical Integration

- Export every asset at `1600 × 900` as WebP, targeting no more than `400 KB` per file without visible compression artifacts.
- Store the assets under `public/mock/journey/` with these exact filenames:
  - `thao-dien-01-intake.webp`
  - `thao-dien-02-survey.webp`
  - `thao-dien-03-floor-plan.webp`
  - `thao-dien-04-design-approved.webp`
  - `thao-dien-05-preconstruction.webp`
  - `thao-dien-06-design-target.webp`
  - `thao-dien-06-site-current.webp`
  - `thao-dien-07-handover.webp`
  - `vinhomes-01-intake.webp`
  - `vinhomes-02-survey.webp`
  - `vinhomes-03-design.webp`
  - `vinhomes-04-construction.webp`
- Update `imageUrl` values in `app/repositories/mock/fixtures.ts` for all eleven stage records.
- For Thảo Điền stage 06, point `imageUrl` at `thao-dien-06-site-current.webp`; point the `design_target` media record at `thao-dien-06-design-target.webp`; and point existing `progress` and `evidence` media records at `thao-dien-06-site-current.webp`.
- Reuse `thao-dien-04-design-approved.webp` as the Thảo Điền project cover and `vinhomes-03-design.webp` as the Vinhomes project cover; do not generate separate cover-only assets.
- Keep existing SVG files when they are still referenced by drawing records or other mock data.
- No new production dependencies are required.

## Data Flow and Fallbacks

The existing flow remains unchanged: mock fixtures provide URLs, `JourneyStageCard` renders `stage.imageUrl`, and `useStageMedia` supplies comparison media to `SiteVisualComparison`. Existing alt text, loading skeleton, and media error alert remain authoritative. A missing generated file must be caught by verification rather than hidden by a new runtime fallback.

## Verification

- Add a focused automated check that every stage references an existing, loadable image and that stage visuals are distinct within each project.
- Confirm the construction comparison loads separate target and current images in the correct positions.
- Confirm project covers resolve after their URLs are updated.
- Run the existing unit, typecheck, lint, build, and journey E2E gates.
- Inspect both project journeys at 390px, 768px, and 1440px for meaningful crops, readable overlays, no broken images, no overflow, and no console errors.

## Acceptance Criteria

- Both mock projects have complete stage-specific visual coverage.
- The two projects are visually distinct, while each project remains internally coherent.
- Every stage can be recognized from the image without relying on embedded labels.
- Stage 06 comparison tells a credible target-versus-current construction story.
- Existing behavior, accessibility, and responsive layout remain unchanged.
