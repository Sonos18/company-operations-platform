# TASKOVIA Product Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make TASKOVIA the single active product identity while keeping company/tenant data, permissions, migrations, layout, and theme unchanged.

**Architecture:** Add one shared immutable product-brand constant consumed by Nuxt metadata and the app shell. Keep company context as a separate repository-derived value, and migrate only the browser prototype storage namespace from the legacy technical name to `taskovia` with validation and a safe fallback.

**Tech Stack:** Nuxt 4.3.1, Vue 3.5.28, TypeScript 5.9.3, Vitest 4.1.9, Playwright 1.61.1, Zod 4, pnpm 10.29.3, Node.js 24.x

## Global Constraints

- Product display name is exactly `TASKOVIA`; product monogram is exactly `TV`.
- Package name and storage namespace are exactly `taskovia`.
- Product tagline is exactly `Nền tảng vận hành đa công ty`.
- Product description is exactly `Nền tảng quản trị công việc và hành trình dự án cho nhiều công ty.`.
- VQH/Việt Quốc Huy remains tenant/company data and must not be renamed or written into product-brand constants.
- Do not modify Supabase migrations, tenant/company IDs, RLS, memberships, roles, business logic, layout, spacing, or color theme.
- Do not rename the workspace directory, remote repository, Supabase project, or Vercel project.
- Do not rewrite historical files under `docs/superpowers/specs` or `docs/superpowers/plans`.
- Do not add dependencies.
- Active application sources, package metadata, Nuxt config, and README must not contain `Taskora`.

---

## File Structure

- Create `shared/constants/product-brand.ts`: the runtime source of truth for product name, mark, tagline, description, and storage namespace.
- Modify `tests/e2e/app-shell-navigation.spec.ts`: verify runtime product metadata first, then product/company separation, collapsed header, and accessible brand link.
- Modify `package.json`: change only the package name.
- Modify `nuxt.config.ts`: consume the shared brand for document title and meta description.
- Modify `README.md`: replace the active product heading and opening product description.
- Create `tests/unit/repositories/state-store.spec.ts`: isolated tests for canonical storage, one-time migration, invalid data, failed writes, and reset cleanup.
- Modify `app/repositories/mock/state-store.ts`: use the TASKOVIA namespace and migrate valid legacy browser data.
- Modify `app/layouts/default.vue`: pass product identity and company context to the header as separate inputs.
- Modify `app/components/app/AppHeader.vue`: render TASKOVIA/TV as product identity and the active company as secondary context.

---

### Task 1: Establish the TASKOVIA brand contract and active metadata

**Files:**
- Create: `shared/constants/product-brand.ts`
- Modify: `tests/e2e/app-shell-navigation.spec.ts:1-5`
- Modify: `package.json:2`
- Modify: `nuxt.config.ts:1-27`
- Modify: `README.md:1-3`

**Interfaces:**
- Consumes: no prior task interfaces.
- Produces: `PRODUCT_BRAND` with readonly fields `name`, `mark`, `tagline`, `description`, and `storageNamespace`, all inferred as string literals.

- [ ] **Step 1: Write the failing runtime metadata test**

Add this test immediately after `test.use` in `tests/e2e/app-shell-navigation.spec.ts`:

```ts
test('publishes TASKOVIA product metadata', async ({ page }) => {
  await page.goto('/projects')

  await expect(page).toHaveTitle('TASKOVIA — Nền tảng vận hành đa công ty')
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    'Nền tảng quản trị công việc và hành trình dự án cho nhiều công ty.',
  )
})
```

The test catches a runtime regression where Nuxt serves the wrong product title or description. It does not inspect config source text.

- [ ] **Step 2: Run the metadata test to verify it fails**

Run:

```powershell
pnpm exec playwright test tests/e2e/app-shell-navigation.spec.ts --grep "publishes TASKOVIA product metadata"
```

Expected: FAIL because the browser receives the old title and VQH-specific meta description.

- [ ] **Step 3: Add the shared product-brand constant**

Create `shared/constants/product-brand.ts`:

```ts
export const PRODUCT_BRAND = {
  name: 'TASKOVIA',
  mark: 'TV',
  tagline: 'Nền tảng vận hành đa công ty',
  description: 'Nền tảng quản trị công việc và hành trình dự án cho nhiều công ty.',
  storageNamespace: 'taskovia',
} as const
```

- [ ] **Step 4: Wire TASKOVIA into package metadata and Nuxt metadata**

In `package.json`, change only the package name:

```json
"name": "taskovia"
```

At the top of `nuxt.config.ts`, import the contract:

```ts
import { PRODUCT_BRAND } from './shared/constants/product-brand'
```

Replace the current title and description entries with:

```ts
title: `${PRODUCT_BRAND.name} — ${PRODUCT_BRAND.tagline}`,
meta: [
  {
    name: "description",
    content: PRODUCT_BRAND.description,
  },
  { name: "theme-color", content: "#1A3C2B" },
],
```

Do not change `theme-color` or any other Nuxt setting.

- [ ] **Step 5: Update only the active README identity**

Replace the README heading and opening paragraph with:

```markdown
# TASKOVIA

TASKOVIA là nền tảng quản trị vận hành đa công ty. Cấu hình tenant/company đầu tiên dành cho Việt Quốc Huy (VQH), nhưng domain và repository đã tách theo `tenantId`/`companyId` để tiếp tục phát triển theo mô hình hybrid.
```

Keep the remaining VQH deployment, bootstrap, and company-context documentation unchanged.

- [ ] **Step 6: Run the runtime metadata and related configuration tests**

Run:

```powershell
pnpm exec playwright test tests/e2e/app-shell-navigation.spec.ts --grep "publishes TASKOVIA product metadata"
pnpm vitest run tests/unit/config/supabase-environment.spec.ts tests/unit/config/supabase-cloud-dev-docs.spec.ts
```

Expected: PASS. The browser proves the runtime metadata, while existing Supabase tests confirm the rename did not disturb environment or VQH deployment documentation.

- [ ] **Step 7: Audit package and README artifacts without adding source-inspection tests**

Run:

```powershell
$packageName = (Get-Content -Raw -LiteralPath 'package.json' | ConvertFrom-Json).name
if ($packageName -ne 'taskovia') { throw "Expected package name taskovia, got $packageName" }
$readmeHeading = Get-Content -LiteralPath 'README.md' -First 1
if ($readmeHeading -ne '# TASKOVIA') { throw "Expected README heading # TASKOVIA, got $readmeHeading" }
```

Expected: no output and exit code 0. These are release artifact checks, not persistent change-detector tests.

- [ ] **Step 8: Commit the brand contract**

```powershell
$taskoviaRoot = (Get-Location).Path
git -c "safe.directory=$taskoviaRoot" add shared/constants/product-brand.ts tests/e2e/app-shell-navigation.spec.ts package.json nuxt.config.ts README.md
git -c "safe.directory=$taskoviaRoot" commit -m "feat: establish Taskovia product identity"
```

---

### Task 2: Migrate prototype browser storage to the TASKOVIA namespace

**Files:**
- Create: `tests/unit/repositories/state-store.spec.ts`
- Modify: `app/repositories/mock/state-store.ts:1-51`

**Interfaces:**
- Consumes: `PRODUCT_BRAND.storageNamespace` from Task 1 and `validateMockState(input: unknown): MockState` from `app/repositories/mock/schemas.ts`.
- Produces: `MOCK_STORAGE_KEY`, `LEGACY_MOCK_STORAGE_KEY`, `StorageLike`, and `BrowserStateStore(storage?: StorageLike)` while preserving the existing `StateStore` interface.

- [ ] **Step 1: Write the failing storage migration tests**

Create `tests/unit/repositories/state-store.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { INITIAL_MOCK_STATE } from '../../../app/repositories/mock/fixtures'
import {
  BrowserStateStore,
  type StorageLike,
} from '../../../app/repositories/mock/state-store'

const CANONICAL_KEY = 'taskovia:tenant-vqh:company-vqh:prototype:v1'
const LEGACY_KEY = 'company-operations-platform:tenant-vqh:company-vqh:prototype:v1'

class TestStorage implements StorageLike {
  private readonly values = new Map<string, string>()

  constructor(initial: Record<string, string> = {}, private readonly failOnSetKey?: string) {
    for (const [key, value] of Object.entries(initial)) this.values.set(key, value)
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    if (key === this.failOnSetKey) throw new Error('storage write failed')
    this.values.set(key, value)
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }
}

const serializedState = JSON.stringify(INITIAL_MOCK_STATE)

describe('BrowserStateStore TASKOVIA namespace', () => {
  it('writes new state under the TASKOVIA namespace', () => {
    const storage = new TestStorage()

    new BrowserStateStore(storage).write(INITIAL_MOCK_STATE)

    expect(JSON.parse(storage.getItem(CANONICAL_KEY)!)).toEqual(INITIAL_MOCK_STATE)
    expect(storage.getItem(LEGACY_KEY)).toBeNull()
  })

  it('prefers canonical data when both keys exist', () => {
    const canonical = structuredClone(INITIAL_MOCK_STATE)
    canonical.companies[0]!.name = 'Canonical company'
    const storage = new TestStorage({
      [CANONICAL_KEY]: JSON.stringify(canonical),
      [LEGACY_KEY]: serializedState,
    })

    const state = new BrowserStateStore(storage).read()

    expect(state?.companies[0]?.name).toBe('Canonical company')
    expect(storage.getItem(LEGACY_KEY)).toBe(serializedState)
  })

  it('migrates valid legacy data and removes the old key after writing', () => {
    const storage = new TestStorage({ [LEGACY_KEY]: serializedState })

    const state = new BrowserStateStore(storage).read()

    expect(state).toEqual(INITIAL_MOCK_STATE)
    expect(JSON.parse(storage.getItem(CANONICAL_KEY)!)).toEqual(INITIAL_MOCK_STATE)
    expect(storage.getItem(LEGACY_KEY)).toBeNull()
  })

  it('removes invalid legacy data and returns no state', () => {
    const storage = new TestStorage({ [LEGACY_KEY]: '{"projects":"invalid"}' })

    expect(new BrowserStateStore(storage).read()).toBeNull()
    expect(storage.getItem(LEGACY_KEY)).toBeNull()
    expect(storage.getItem(CANONICAL_KEY)).toBeNull()
  })

  it('keeps valid legacy data when the canonical write fails', () => {
    const storage = new TestStorage(
      { [LEGACY_KEY]: serializedState },
      CANONICAL_KEY,
    )

    expect(new BrowserStateStore(storage).read()).toEqual(INITIAL_MOCK_STATE)
    expect(storage.getItem(LEGACY_KEY)).toBe(serializedState)
    expect(storage.getItem(CANONICAL_KEY)).toBeNull()
  })

  it('clears canonical and legacy data together', () => {
    const storage = new TestStorage({
      [CANONICAL_KEY]: serializedState,
      [LEGACY_KEY]: serializedState,
    })

    new BrowserStateStore(storage).clear()

    expect(storage.getItem(CANONICAL_KEY)).toBeNull()
    expect(storage.getItem(LEGACY_KEY)).toBeNull()
  })
})
```

- [ ] **Step 2: Run the storage test to verify it fails**

Run:

```powershell
pnpm vitest run tests/unit/repositories/state-store.spec.ts
```

Expected: FAIL because `LEGACY_MOCK_STORAGE_KEY`, `StorageLike`, dependency injection, validation, and migration behavior do not exist yet.

- [ ] **Step 3: Implement the canonical key and safe one-time migration**

Replace `app/repositories/mock/state-store.ts` with:

```ts
import { PRODUCT_BRAND } from '../../../shared/constants/product-brand'
import { validateMockState } from './schemas'
import type { MockState } from './schemas'

export const MOCK_STORAGE_KEY = `${PRODUCT_BRAND.storageNamespace}:tenant-vqh:company-vqh:prototype:v1`
export const LEGACY_MOCK_STORAGE_KEY = 'company-operations-platform:tenant-vqh:company-vqh:prototype:v1'

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface StateStore {
  read(): MockState | null
  write(state: MockState): void
  clear(): void
}

export class MemoryStateStore implements StateStore {
  private state: MockState | null = null

  read(): MockState | null {
    return this.state ? structuredClone(this.state) : null
  }

  write(state: MockState): void {
    this.state = structuredClone(state)
  }

  clear(): void {
    this.state = null
  }
}

export class BrowserStateStore implements StateStore {
  constructor(private readonly storage: StorageLike = localStorage) {}

  private readAt(key: string): MockState | null {
    const serialized = this.storage.getItem(key)
    if (!serialized) return null
    try {
      return validateMockState(JSON.parse(serialized))
    } catch {
      this.storage.removeItem(key)
      return null
    }
  }

  read(): MockState | null {
    const current = this.readAt(MOCK_STORAGE_KEY)
    if (current) return current

    const legacy = this.readAt(LEGACY_MOCK_STORAGE_KEY)
    if (!legacy) return null

    try {
      this.storage.setItem(MOCK_STORAGE_KEY, JSON.stringify(legacy))
      this.storage.removeItem(LEGACY_MOCK_STORAGE_KEY)
    } catch {
      return legacy
    }
    return legacy
  }

  write(state: MockState): void {
    this.storage.setItem(MOCK_STORAGE_KEY, JSON.stringify(state))
  }

  clear(): void {
    this.storage.removeItem(MOCK_STORAGE_KEY)
    this.storage.removeItem(LEGACY_MOCK_STORAGE_KEY)
  }
}
```

- [ ] **Step 4: Run focused storage and repository tests**

Run:

```powershell
pnpm vitest run tests/unit/repositories/state-store.spec.ts tests/unit/repositories/mock-repositories.spec.ts
```

Expected: PASS. The new tests prove the migration boundary; the existing tests prove repository behavior and company isolation are unchanged.

- [ ] **Step 5: Commit the storage migration**

```powershell
$taskoviaRoot = (Get-Location).Path
git -c "safe.directory=$taskoviaRoot" add app/repositories/mock/state-store.ts tests/unit/repositories/state-store.spec.ts
git -c "safe.directory=$taskoviaRoot" commit -m "feat: migrate prototype storage to Taskovia"
```

---

### Task 3: Separate TASKOVIA product identity from active company context

**Files:**
- Modify: `tests/e2e/app-shell-navigation.spec.ts:1-31`
- Modify: `app/layouts/default.vue:1-25`
- Modify: `app/components/app/AppHeader.vue:1-50`

**Interfaces:**
- Consumes: `PRODUCT_BRAND.name` and `PRODUCT_BRAND.mark` from Task 1; `CompanyRepository.getConfig()` from the existing repository contract.
- Produces: `AppHeader` props `{ productName: string; productMark: string; companyName: string; collapsed: boolean }` and accessible brand link name `${productName} — Về danh sách dự án`.

- [ ] **Step 1: Add the failing product/company separation E2E assertions**

Add this test after the metadata test from Task 1 in `tests/e2e/app-shell-navigation.spec.ts`:

```ts
test('keeps TASKOVIA identity separate from company context', async ({ page }) => {
  await page.goto('/projects')

  const header = page.getByTestId('app-header')
  await expect(header.getByText('TASKOVIA', { exact: true })).toBeVisible()
  await expect(header.getByText('TV', { exact: true })).toBeVisible()
  await expect(header.getByText('Việt Quốc Huy', { exact: true })).toBeVisible()
  await expect(header.getByRole('link', { name: 'TASKOVIA — Về danh sách dự án' })).toBeVisible()
})
```

In the existing `collapses the header and releases content height` test, add these locators before the first geometry assertion:

```ts
const productName = header.getByText('TASKOVIA', { exact: true })
const productMark = header.getByText('TV', { exact: true })
const companyName = header.getByText('Việt Quốc Huy', { exact: true })
const brandLink = header.getByRole('link', { name: 'TASKOVIA — Về danh sách dự án' })
```

Replace its final company-only visibility assertion with:

```ts
await expect(productName).toBeHidden()
await expect(companyName).toBeHidden()
await expect(productMark).toBeVisible()
await expect(brandLink).toBeVisible()
```

- [ ] **Step 2: Run the app-shell E2E file to verify it fails**

Run:

```powershell
pnpm exec playwright test tests/e2e/app-shell-navigation.spec.ts
```

Expected: FAIL because the current header brands itself from the company short name, renders `VQH`, and uses the old accessible label.

- [ ] **Step 3: Pass product and company inputs separately from the layout**

Add this import at the top of `app/layouts/default.vue`:

```ts
import { PRODUCT_BRAND } from '../../shared/constants/product-brand'
```

Replace the current `AppHeader` props with:

```vue
<AppHeader
  :product-name="PRODUCT_BRAND.name"
  :product-mark="PRODUCT_BRAND.mark"
  :company-name="company?.displayName ?? 'Đang tải công ty'"
  :collapsed="headerCollapsed"
  @toggle="headerCollapsed = !headerCollapsed"
/>
```

Do not change repository loading, layout state, sidebar state, spacing, or shell CSS.

- [ ] **Step 4: Render TASKOVIA as product identity in AppHeader**

Replace the prop declaration and remove the computed company-derived `brandMark` in `app/components/app/AppHeader.vue`:

```ts
defineProps<{
  productName: string
  productMark: string
  companyName: string
  collapsed: boolean
}>()
```

Replace the brand link opening tag and brand copy with:

```vue
<NuxtLink
  to="/projects"
  class="brand"
  :aria-label="`${productName} — Về danh sách dự án`"
>
  <span class="brand__mark" aria-hidden="true">{{ productMark }}</span>
  <span class="brand__copy">
    <strong>{{ productName }}</strong>
    <small>{{ companyName }}</small>
  </span>
</NuxtLink>
```

Keep the rest of the template and all component CSS unchanged.

- [ ] **Step 5: Run app-shell and accessibility E2E tests**

Run:

```powershell
pnpm exec playwright test tests/e2e/app-shell-navigation.spec.ts tests/e2e/accessibility.spec.ts tests/e2e/mobile.spec.ts
```

Expected: PASS at desktop, 768px, and mobile widths; the accessible brand name remains available when the header is collapsed; axe reports no serious or critical violations.

- [ ] **Step 6: Commit the app-shell identity change**

```powershell
$taskoviaRoot = (Get-Location).Path
git -c "safe.directory=$taskoviaRoot" add app/layouts/default.vue app/components/app/AppHeader.vue tests/e2e/app-shell-navigation.spec.ts
git -c "safe.directory=$taskoviaRoot" commit -m "feat: show Taskovia as the product brand"
```

---

### Task 4: Run the full rename regression gate

**Files:**
- Verify only; no file changes expected.

**Interfaces:**
- Consumes: all deliverables from Tasks 1-3.
- Produces: verified TASKOVIA identity with unchanged company isolation, application behavior, and database migration history.

- [ ] **Step 1: Run the complete application verification command**

Run:

```powershell
pnpm verify:app
```

Expected: unit tests, typecheck, lint, and production build all PASS.

- [ ] **Step 2: Run the complete browser regression suite**

Run:

```powershell
pnpm test:e2e
```

Expected: all Playwright tests PASS, including project pages, reset behavior, desktop/mobile shell behavior, and accessibility.

- [ ] **Step 3: Audit active product-name surfaces**

Run:

```powershell
rg -n -i 'taskora' app server shared package.json nuxt.config.ts README.md
rg -n 'Company Operations Platform' app server shared package.json nuxt.config.ts README.md
```

Expected: both commands print no matches and exit with code 1, which is the normal ripgrep result for no matches.

Run:

```powershell
rg -n 'TASKOVIA|taskovia' shared/constants/product-brand.ts package.json nuxt.config.ts README.md app/layouts/default.vue tests/e2e/app-shell-navigation.spec.ts
```

Expected: matches show the canonical constant, technical package name, metadata wiring, README identity, layout consumption, and contract tests.

- [ ] **Step 4: Confirm company data and Supabase migrations were preserved**

Run:

```powershell
$taskoviaRoot = (Get-Location).Path
rg -n 'tenant-vqh|company-vqh|Việt Quốc Huy|VQH' app/config app/repositories/mock/fixtures.ts supabase tests/unit/server tests/unit/config/prototype-config.spec.ts
git -c "safe.directory=$taskoviaRoot" diff --name-only 6706e9f..HEAD -- supabase/migrations
```

Expected: the first command still finds the established VQH tenant/company fixtures and tests. The Git command prints no migration filenames.

- [ ] **Step 5: Confirm the implementation history and clean worktree**

Run:

```powershell
$taskoviaRoot = (Get-Location).Path
git -c "safe.directory=$taskoviaRoot" log -3 --oneline
git -c "safe.directory=$taskoviaRoot" status --short
```

Expected: the three implementation commits are visible in order and `git status --short` prints nothing.
