# Collapsible App Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add independently collapsible desktop header and left-sidebar rails that release space to the main content while preserving mobile navigation and accessibility.

**Architecture:** The shared Nuxt layout owns `headerCollapsed` and `sidebarCollapsed` state, exposes the effective shell dimensions through CSS custom properties, and passes state into presentational navigation components. `AppHeader` and `AppSidebar` emit toggle events; the header, sidebar, and main content all consume the same dimension variables so their geometry cannot drift.

**Tech Stack:** Nuxt 4.3.1, Vue 3.5, TypeScript 5.9, scoped CSS, Nuxt UI icons, Playwright 1.61, axe-core.

## Global Constraints

- Desktop/tablet collapse behavior applies at viewport widths of `768px` and above.
- Header dimensions are exactly `64px` expanded and `44px` collapsed.
- Sidebar dimensions are exactly `224px` expanded and `64px` collapsed.
- Shell geometry transitions last exactly `200ms` and are disabled by `prefers-reduced-motion: reduce`.
- Header and sidebar state are independent, start expanded on a new page load, and are not persisted.
- The existing mobile header and bottom navigation remain unchanged below `768px`.
- Toggle targets are at least `44px` square and expose Vietnamese action labels, `aria-expanded`, and `aria-controls`.
- Icon-only sidebar links retain accessible names and use their Vietnamese label as the native `title`.
- Add no runtime or development dependencies.

---

## File Structure

- Create `tests/e2e/app-shell-navigation.spec.ts`: focused geometry, independence, keyboard, reduced-motion, and mobile-regression coverage for the shared shell.
- Modify `app/layouts/default.vue`: own collapse state, pass component interfaces, set shell state attributes, and resize main-content padding.
- Modify `app/components/app/AppHeader.vue`: render the accessible header toggle and compact-header presentation.
- Modify `app/components/app/AppSidebar.vue`: render the accessible sidebar toggle, compact icon rail, and icon-link titles.
- Keep `app/assets/css/main.css` unchanged: existing expanded `--header-height` and `--sidebar-width` remain the global source tokens.

---

### Task 1: Collapsible Header Rail

**Files:**
- Create: `tests/e2e/app-shell-navigation.spec.ts`
- Modify: `app/layouts/default.vue:1-21`
- Modify: `app/components/app/AppHeader.vue:1-116`

**Interfaces:**
- Consumes: existing `companyName: string` and `shortName: string` header props.
- Produces: `AppHeader` prop `collapsed: boolean`, event `toggle: []`, `data-testid="app-header"`, `data-testid="app-main"`, `--shell-header-height`, and `--shell-sidebar-width`.

- [ ] **Step 1: Write the failing desktop header test**

Create `tests/e2e/app-shell-navigation.spec.ts` with:

```ts
import { expect, test } from '@playwright/test'

test.use({ viewport: { width: 1280, height: 900 } })

test('collapses the header and releases content height', async ({ page }) => {
  await page.goto('/projects')

  const header = page.getByTestId('app-header')
  const main = page.getByTestId('app-main')
  const toggle = page.getByRole('button', { name: 'Thu gọn thanh điều hướng phía trên' })

  await expect.poll(async () => (await header.boundingBox())?.height).toBe(64)
  await expect.poll(async () => main.evaluate(element => Number.parseFloat(getComputedStyle(element).paddingTop))).toBe(88)
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')

  await toggle.click()

  await expect.poll(async () => (await header.boundingBox())?.height).toBe(44)
  await expect.poll(async () => main.evaluate(element => Number.parseFloat(getComputedStyle(element).paddingTop))).toBe(68)
  await expect(page.getByRole('button', { name: 'Mở rộng thanh điều hướng phía trên' })).toHaveAttribute('aria-expanded', 'false')
  await expect(header.getByText('Việt Quốc Huy', { exact: true })).toBeHidden()

})

test('expands the header back to its original geometry', async ({ page }) => {
  await page.goto('/projects')

  const header = page.getByTestId('app-header')
  const main = page.getByTestId('app-main')

  await page.getByRole('button', { name: 'Thu gọn thanh điều hướng phía trên' }).click()
  await page.getByRole('button', { name: 'Mở rộng thanh điều hướng phía trên' }).click()

  await expect.poll(async () => (await header.boundingBox())?.height).toBe(64)
  await expect.poll(async () => main.evaluate(element => Number.parseFloat(getComputedStyle(element).paddingTop))).toBe(88)
})
```

- [ ] **Step 2: Run the focused test and verify the red state**

Run:

```bash
pnpm exec playwright test tests/e2e/app-shell-navigation.spec.ts --grep "header"
```

Expected: FAIL because the header toggle and `app-header`/`app-main` test IDs do not exist.

- [ ] **Step 3: Add layout-owned header state and shell dimension variables**

In `app/layouts/default.vue`, add the state after the existing company query:

```ts
const headerCollapsed = ref(false)
```

Update the shell template contract:

```vue
<div
  class="app-shell"
  :data-header-collapsed="headerCollapsed || undefined"
>
  <AppHeader
    :company-name="company?.displayName ?? 'Đang tải công ty'"
    :short-name="company?.shortName ?? 'Nền tảng vận hành'"
    :collapsed="headerCollapsed"
    @toggle="headerCollapsed = !headerCollapsed"
  />
  <AppSidebar />
  <main class="app-main" data-testid="app-main">
    <slot />
  </main>
</div>
```

Replace the layout styles with the shared geometry contract:

```css
.app-shell {
  --shell-header-height: var(--header-height);
  --shell-sidebar-width: var(--sidebar-width);
}

.app-shell[data-header-collapsed='true'] {
  --shell-header-height: 44px;
}

.app-main {
  min-height: 100vh;
  padding: calc(var(--shell-header-height) + 24px) 24px 32px calc(var(--shell-sidebar-width) + 24px);
  transition: padding 200ms ease;
}

@media (max-width: 767px) {
  .app-shell[data-header-collapsed='true'] {
    --shell-header-height: var(--header-height);
  }

  .app-main {
    padding: calc(var(--shell-header-height) + 16px) 14px 86px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .app-main { transition: none; }
}
```

- [ ] **Step 4: Add the accessible header toggle and compact presentation**

Extend the `AppHeader` interface:

```ts
const props = defineProps<{
  companyName: string
  shortName: string
  collapsed: boolean
}>()

const emit = defineEmits<{
  toggle: []
}>()
```

Replace the header template with the complete state and test contract:

```vue
<header
  id="app-header"
  class="app-header"
  :class="{ 'app-header--collapsed': collapsed }"
  data-testid="app-header"
>
  <div class="app-header__primary">
    <NuxtLink to="/projects" class="brand" aria-label="Về danh sách dự án">
      <span class="brand__mark" aria-hidden="true">{{ brandMark }}</span>
      <span class="brand__copy">
        <strong>{{ shortName }}</strong>
        <small>{{ companyName }}</small>
      </span>
    </NuxtLink>
    <button
      class="navigation-toggle"
      type="button"
      aria-controls="app-header"
      :aria-expanded="!collapsed"
      :aria-label="collapsed ? 'Mở rộng thanh điều hướng phía trên' : 'Thu gọn thanh điều hướng phía trên'"
      @click="emit('toggle')"
    >
      <UIcon :name="collapsed ? 'i-lucide-panel-top-open' : 'i-lucide-panel-top-close'" aria-hidden="true" />
    </button>
  </div>

  <div class="app-header__context">
    <span class="prototype-pill"><span /> Prototype nội bộ</span>
    <button class="reset-action" type="button" :disabled="resetting" aria-label="Khôi phục dữ liệu mẫu" @click="resetPrototype">
      <UIcon name="i-lucide-rotate-ccw" aria-hidden="true" />
      <span>{{ resetting ? 'Đang khôi phục' : 'Khôi phục dữ liệu mẫu' }}</span>
    </button>
    <button class="header-action" type="button" aria-label="Mở thông báo">
      <UIcon name="i-lucide-bell" aria-hidden="true" />
    </button>
    <span class="avatar" aria-label="Người dùng thử">NH</span>
  </div>
</header>
```

Add these rules to the scoped header styles while keeping all existing visual rules:

```css
.app-header {
  height: var(--shell-header-height);
  transition: height 200ms ease, padding 200ms ease;
}

.app-header__primary {
  display: flex;
  align-items: center;
  gap: 10px;
}

.navigation-toggle {
  display: grid;
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
  place-items: center;
  border: 1px solid #d6d8d1;
  border-radius: var(--radius-md);
  background: white;
  color: var(--forest);
  cursor: pointer;
}

.navigation-toggle :deep(svg) {
  width: 19px;
  height: 19px;
}

.app-header--collapsed {
  padding-inline: 10px;
}

.app-header--collapsed .brand__copy,
.app-header--collapsed .app-header__context {
  display: none;
}

.app-header--collapsed .brand__mark {
  width: 32px;
  height: 32px;
}

@media (max-width: 767px) {
  .navigation-toggle { display: none; }
  .app-header--collapsed { padding: 0 14px; }
  .app-header--collapsed .brand__copy { display: grid; }
  .app-header--collapsed .app-header__context { display: flex; }
  .app-header--collapsed .brand__mark { width: 38px; height: 38px; }
}

@media (prefers-reduced-motion: reduce) {
  .app-header { transition: none; }
}
```

- [ ] **Step 5: Run the focused test and verify the green state**

Run:

```bash
pnpm exec playwright test tests/e2e/app-shell-navigation.spec.ts --grep "collapses and expands the header"
```

Expected: PASS.

- [ ] **Step 6: Commit the header rail**

```bash
git add tests/e2e/app-shell-navigation.spec.ts app/layouts/default.vue app/components/app/AppHeader.vue
git commit -m "feat: add collapsible application header"
```

---

### Task 2: Collapsible Sidebar Icon Rail

**Files:**
- Modify: `tests/e2e/app-shell-navigation.spec.ts`
- Modify: `app/layouts/default.vue:1-43`
- Modify: `app/components/app/AppSidebar.vue:1-75`

**Interfaces:**
- Consumes: Task 1's `.app-shell`, `--shell-header-height`, `--shell-sidebar-width`, and `data-testid="app-main"`.
- Produces: `AppSidebar` prop `collapsed: boolean`, event `toggle: []`, `data-testid="app-sidebar"`, and `data-sidebar-collapsed` on `.app-shell`.

- [ ] **Step 1: Add the failing sidebar geometry and independence test**

Append to `tests/e2e/app-shell-navigation.spec.ts`:

```ts
test('collapses the sidebar without changing compact header geometry', async ({ page }) => {
  await page.goto('/projects')

  const header = page.getByTestId('app-header')
  const sidebar = page.getByTestId('app-sidebar')
  const main = page.getByTestId('app-main')

  await page.getByRole('button', { name: 'Thu gọn thanh điều hướng phía trên' }).click()
  await expect.poll(async () => (await header.boundingBox())?.height).toBe(44)

  await expect.poll(async () => (await sidebar.boundingBox())?.width).toBe(224)
  await expect.poll(async () => main.evaluate(element => Number.parseFloat(getComputedStyle(element).paddingLeft))).toBe(248)

  await page.getByRole('button', { name: 'Thu gọn thanh điều hướng bên trái' }).click()

  await expect.poll(async () => (await sidebar.boundingBox())?.width).toBe(64)
  await expect.poll(async () => main.evaluate(element => Number.parseFloat(getComputedStyle(element).paddingLeft))).toBe(88)
  await expect.poll(async () => (await header.boundingBox())?.height).toBe(44)

})

test('keeps icon-only sidebar links accessible', async ({ page }) => {
  await page.goto('/projects')
  await page.getByRole('button', { name: 'Thu gọn thanh điều hướng bên trái' }).click()

  const projectsLink = page.getByRole('link', { name: 'Dự án', exact: true })
  await expect(projectsLink).toBeVisible()
  await expect(projectsLink).toHaveAttribute('title', 'Dự án')
})

test('expands the sidebar back to its original geometry', async ({ page }) => {
  await page.goto('/projects')

  const sidebar = page.getByTestId('app-sidebar')
  const main = page.getByTestId('app-main')

  await page.getByRole('button', { name: 'Thu gọn thanh điều hướng bên trái' }).click()
  await page.getByRole('button', { name: 'Mở rộng thanh điều hướng bên trái' }).click()
  await expect.poll(async () => (await sidebar.boundingBox())?.width).toBe(224)
  await expect.poll(async () => main.evaluate(element => Number.parseFloat(getComputedStyle(element).paddingLeft))).toBe(248)
})
```

- [ ] **Step 2: Run the sidebar test and verify the red state**

Run:

```bash
pnpm exec playwright test tests/e2e/app-shell-navigation.spec.ts --grep "sidebar"
```

Expected: FAIL because the sidebar toggle and `app-sidebar` test ID do not exist.

- [ ] **Step 3: Wire sidebar state into the shared layout**

Add the state beside `headerCollapsed`:

```ts
const sidebarCollapsed = ref(false)
```

Add the sidebar state attribute and component interface:

```vue
<div
  class="app-shell"
  :data-header-collapsed="headerCollapsed || undefined"
  :data-sidebar-collapsed="sidebarCollapsed || undefined"
>
  <AppHeader
    :company-name="company?.displayName ?? 'Đang tải công ty'"
    :short-name="company?.shortName ?? 'Nền tảng vận hành'"
    :collapsed="headerCollapsed"
    @toggle="headerCollapsed = !headerCollapsed"
  />
  <AppSidebar
    :collapsed="sidebarCollapsed"
    @toggle="sidebarCollapsed = !sidebarCollapsed"
  />
  <main class="app-main" data-testid="app-main">
    <slot />
  </main>
</div>
```

Add the desktop and mobile variable overrides:

```css
.app-shell[data-sidebar-collapsed='true'] {
  --shell-sidebar-width: 64px;
}

@media (max-width: 767px) {
  .app-shell[data-sidebar-collapsed='true'] {
    --shell-sidebar-width: var(--sidebar-width);
  }
}
```

- [ ] **Step 4: Add the sidebar toggle, icon-only labels, and compact styles**

At the start of `AppSidebar.vue`, define the component interface:

```ts
const props = defineProps<{
  collapsed: boolean
}>()

const emit = defineEmits<{
  toggle: []
}>()
```

Replace the component template with the complete desktop and mobile structure:

```vue
<aside
  id="app-sidebar"
  class="app-sidebar"
  :class="{ 'app-sidebar--collapsed': props.collapsed }"
  aria-label="Điều hướng chính"
  data-testid="app-sidebar"
>
  <div class="sidebar-main">
    <button
      class="sidebar-toggle"
      type="button"
      aria-controls="app-sidebar"
      :aria-expanded="!props.collapsed"
      :aria-label="props.collapsed ? 'Mở rộng thanh điều hướng bên trái' : 'Thu gọn thanh điều hướng bên trái'"
      @click="emit('toggle')"
    >
      <UIcon :name="props.collapsed ? 'i-lucide-panel-left-open' : 'i-lucide-panel-left-close'" aria-hidden="true" />
    </button>

    <nav class="sidebar-nav">
      <p class="eyebrow sidebar-label">Không gian làm việc</p>
      <NuxtLink
        v-for="link in links"
        :key="link.to"
        :to="link.to"
        class="sidebar-link"
        :class="{ 'sidebar-link--active': isActive(link.to) }"
        :title="props.collapsed ? link.label : undefined"
      >
        <UIcon :name="link.icon" aria-hidden="true" />
        <span :class="{ 'sr-only': props.collapsed }">{{ link.label }}</span>
      </NuxtLink>
    </nav>
  </div>

  <div class="sidebar-note">
    <UIcon name="i-lucide-flask-conical" aria-hidden="true" />
    <div>
      <strong>Dữ liệu thử nghiệm</strong>
      <span>Mọi thao tác đều có thể khôi phục.</span>
    </div>
  </div>
</aside>

<nav class="mobile-nav" aria-label="Điều hướng chính trên điện thoại">
  <NuxtLink
    v-for="link in links"
    :key="link.to"
    :to="link.to"
    :class="{ active: isActive(link.to) }"
  >
    <UIcon :name="link.icon" aria-hidden="true" />
    <span>{{ link.label }}</span>
  </NuxtLink>
</nav>
```

Update the desktop sidebar geometry and add compact rules:

```css
.app-sidebar {
  inset: var(--shell-header-height) auto 0 0;
  width: var(--shell-sidebar-width);
  transition: width 200ms ease, top 200ms ease, padding 200ms ease;
}

.sidebar-main {
  display: grid;
  gap: 12px;
}

.sidebar-toggle {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border: 1px solid #d6d8d1;
  border-radius: var(--radius-md);
  background: var(--paper-raised);
  color: var(--forest);
  cursor: pointer;
}

.sidebar-toggle :deep(svg) {
  width: 19px;
  height: 19px;
}

.app-sidebar--collapsed {
  padding-inline: 10px;
}

.app-sidebar--collapsed .sidebar-toggle {
  margin-inline: auto;
}

.app-sidebar--collapsed .sidebar-label,
.app-sidebar--collapsed .sidebar-note {
  display: none;
}

.app-sidebar--collapsed .sidebar-link {
  justify-content: center;
  padding-inline: 0;
}

@media (max-width: 767px) {
  .sidebar-toggle { display: none; }
}

@media (prefers-reduced-motion: reduce) {
  .app-sidebar { transition: none; }
}
```

- [ ] **Step 5: Run all shell navigation tests**

Run:

```bash
pnpm exec playwright test tests/e2e/app-shell-navigation.spec.ts
```

Expected: 5 tests PASS.

- [ ] **Step 6: Commit the sidebar rail**

```bash
git add tests/e2e/app-shell-navigation.spec.ts app/layouts/default.vue app/components/app/AppSidebar.vue
git commit -m "feat: add collapsible sidebar rail"
```

---

### Task 3: Keyboard, Reduced-Motion, Mobile, and Regression Verification

**Files:**
- Modify: `tests/e2e/app-shell-navigation.spec.ts`

**Interfaces:**
- Consumes: both toggle accessible names, both `aria-expanded` values, both shell test IDs, and the existing `.mobile-nav` navigation.
- Produces: complete regression coverage for the specification with no new production interface.

- [ ] **Step 1: Add focused keyboard and reduced-motion tests**

Append:

```ts
test('toggles the header from the keyboard', async ({ page }) => {
  await page.goto('/projects')

  const headerToggle = page.getByRole('button', { name: 'Thu gọn thanh điều hướng phía trên' })
  await headerToggle.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Mở rộng thanh điều hướng phía trên' })).toHaveAttribute('aria-expanded', 'false')
})

test('toggles the sidebar from the keyboard', async ({ page }) => {
  await page.goto('/projects')

  const sidebarToggle = page.getByRole('button', { name: 'Thu gọn thanh điều hướng bên trái' })
  await sidebarToggle.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Mở rộng thanh điều hướng bên trái' })).toHaveAttribute('aria-expanded', 'false')
})

test('removes shell transitions when reduced motion is requested', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/projects')

  await expect.poll(async () => page.getByTestId('app-header').evaluate(element => getComputedStyle(element).transitionDuration)).toBe('0s')
  await expect.poll(async () => page.getByTestId('app-sidebar').evaluate(element => getComputedStyle(element).transitionDuration)).toBe('0s')
  await expect.poll(async () => page.getByTestId('app-main').evaluate(element => getComputedStyle(element).transitionDuration)).toBe('0s')
})
```

- [ ] **Step 2: Add the mobile contract test**

Append:

```ts
test('preserves the mobile header and bottom navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/projects')

  await expect(page.getByRole('button', { name: /thanh điều hướng phía trên/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /thanh điều hướng bên trái/ })).toHaveCount(0)
  await expect(page.locator('.mobile-nav')).toBeVisible()
  await expect.poll(async () => (await page.getByTestId('app-header').boundingBox())?.height).toBe(64)
})

test('avoids horizontal overflow on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/projects')

  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }))
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport)
})
```

- [ ] **Step 3: Add focused route-lifetime and reload-reset tests**

Append:

```ts
test('keeps compact state during client navigation', async ({ page }) => {
  await page.goto('/projects')

  await page.getByRole('button', { name: 'Thu gọn thanh điều hướng phía trên' }).click()
  await page.getByRole('button', { name: 'Thu gọn thanh điều hướng bên trái' }).click()
  await page.getByRole('link', { name: 'Công việc của tôi' }).click()

  await expect(page).toHaveURL(/\/my-work$/)
  await expect(page.getByRole('button', { name: 'Mở rộng thanh điều hướng phía trên' })).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByRole('button', { name: 'Mở rộng thanh điều hướng bên trái' })).toHaveAttribute('aria-expanded', 'false')
})

test('resets compact state after a full reload', async ({ page }) => {
  await page.goto('/projects')

  await page.getByRole('button', { name: 'Thu gọn thanh điều hướng phía trên' }).click()
  await page.getByRole('button', { name: 'Thu gọn thanh điều hướng bên trái' }).click()

  await page.reload()

  await expect(page.getByRole('button', { name: 'Thu gọn thanh điều hướng phía trên' })).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('button', { name: 'Thu gọn thanh điều hướng bên trái' })).toHaveAttribute('aria-expanded', 'true')
})
```

- [ ] **Step 4: Run the new tests and close only concrete gaps**

Run:

```bash
pnpm exec playwright test tests/e2e/app-shell-navigation.spec.ts
```

Expected: 13 tests PASS because Tasks 1 and 2 already define `transition: none` under reduced motion, hide both desktop toggles below `768px`, reset the mobile header height, keep layout-local state during client navigation, and initialize both refs to `false` after a reload.

- [ ] **Step 5: Run focused mobile and accessibility regressions**

Run:

```bash
pnpm exec playwright test tests/e2e/mobile.spec.ts tests/e2e/accessibility.spec.ts tests/e2e/app-shell-navigation.spec.ts
```

Expected: all focused E2E tests PASS with no serious or critical axe-core violations.

- [ ] **Step 6: Run the complete project verification suite**

Run each command separately and require exit code `0`:

```bash
pnpm test:unit
pnpm test:e2e
pnpm typecheck
pnpm lint
pnpm build
```

Expected: every command PASS. Treat any failure introduced by the shell changes as part of this task; report unrelated pre-existing failures with their exact command and error.

- [ ] **Step 7: Commit verification coverage and final refinements**

```bash
git add tests/e2e/app-shell-navigation.spec.ts
git commit -m "test: verify collapsible navigation behavior"
```
