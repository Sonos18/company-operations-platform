# Collapsible App Navigation Design

**Date:** 2026-08-13
**Status:** Approved for implementation

## Goal

Allow the desktop and tablet application header and left sidebar to collapse independently into compact rails so the main content can use more horizontal and vertical space. The controls must remain easy to discover, keyboard accessible, and consistent with the existing application shell.

## Scope

This change affects only the shared application shell:

- `app/layouts/default.vue`
- `app/components/app/AppHeader.vue`
- `app/components/app/AppSidebar.vue`
- shell-focused Playwright coverage

The mobile bottom navigation, routes, repository layer, page content, and business workflow remain unchanged. Collapse preferences are session-local UI state and are not persisted across a full page reload.

## Interaction Design

The header and sidebar each receive their own toggle. They can be expanded or collapsed in any combination.

### Header

- Expanded height remains `64px` through the existing `--header-height` token.
- Collapsed height is `44px`.
- The compact rail keeps a reduced brand mark and the header toggle visible.
- Company copy, prototype status, reset action, notification action, and avatar are hidden while collapsed.
- Expanding restores the complete header without reloading the page or changing the route.

### Sidebar

- Expanded width remains `224px` through the existing `--sidebar-width` token.
- Collapsed width is `64px`.
- Navigation icons, active state, and the sidebar toggle remain visible.
- The workspace label, link text, and experimental-data note are visually hidden while collapsed.
- Each icon-only link keeps an accessible name and exposes its visible label through the native `title` attribute.

### Content Area

The main content padding follows the current shell dimensions. Collapsing the header reduces its top offset; collapsing the sidebar reduces its left offset. Changes are independent, so the content gains only the space released by the rail that was toggled.

The size and padding transition lasts `200ms`. Under `prefers-reduced-motion: reduce`, the shell changes state without nonessential animation.

### Responsive Behavior

At widths below `768px`, the existing mobile contract remains authoritative:

- the desktop sidebar stays hidden;
- the bottom mobile navigation remains visible;
- the header uses its current mobile presentation and height;
- desktop collapse controls are hidden;
- desktop collapse state does not alter mobile spacing.

Returning to a desktop viewport restores the current in-memory desktop collapse state.

## Architecture

`app/layouts/default.vue` owns two boolean refs:

- `headerCollapsed`
- `sidebarCollapsed`

The layout passes the corresponding value into each navigation component and handles a toggle event from that component. This keeps cross-component layout state in the one component that owns all three affected regions: header, sidebar, and main content.

The root `.app-shell` exposes effective shell dimensions with these inherited CSS custom properties:

- `--shell-header-height`
- `--shell-sidebar-width`

The `data-header-collapsed` and `data-sidebar-collapsed` attributes on `.app-shell` switch those properties between expanded and compact values. `AppHeader`, `AppSidebar`, and `.app-main` consume the same properties, preventing visual size and content padding from drifting apart.

`AppHeader` and `AppSidebar` remain presentational components. Each accepts a `collapsed` prop and emits a `toggle` event; neither component reaches into the DOM or modifies global styles directly.

## Accessibility

- Toggle controls are semantic `button` elements with a minimum `44px` pointer target.
- Each toggle has a Vietnamese accessible label that describes the next action.
- `aria-expanded` reflects the current state and `aria-controls` references the controlled navigation region.
- Sidebar links retain their accessible names when visible text is hidden.
- Focus indicators remain visible in both expanded and compact states.
- Collapsing a rail does not move focus or announce unrelated content.
- Existing axe-core coverage must continue to report no serious or critical violations.

## State and Failure Behavior

Collapse state is synchronous and local to the layout. There is no network request, persistence operation, or loading state. A new page load starts with both rails expanded. Route navigation inside the running Nuxt application preserves the current state because the shared layout remains mounted.

If CSS transitions are unavailable, the shell still reaches the correct final dimensions. Missing company configuration continues to use the existing fallback labels and does not affect collapse behavior.

## Verification

Playwright coverage will verify:

1. Both navigation regions start expanded on desktop.
2. Collapsing the sidebar produces the compact width and releases the corresponding main-content space.
3. Collapsing the header produces the compact height and releases the corresponding main-content space.
4. Header and sidebar states operate independently.
5. Icon-only sidebar links remain accessible and navigable by keyboard.
6. Re-expanding restores the original shell dimensions and visible content.
7. The mobile header and bottom navigation remain unchanged and the page has no horizontal overflow.
8. Core pages retain their existing accessibility baseline.

Implementation verification includes the focused Playwright test, existing mobile and accessibility tests, Nuxt type checking, linting, and the production build.

## Out of Scope

- Persisting collapse preferences in local storage or a backend
- Automatically collapsing based on page type
- Resizable or draggable navigation rails
- Redesigning header actions or navigation information architecture
- Changing the mobile bottom navigation
