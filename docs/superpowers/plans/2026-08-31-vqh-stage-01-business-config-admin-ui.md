# VQH Stage 01 Business Configuration Admin UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the B2 administrative UI at `/settings/stage-01` so authorized VQH administrators can inspect published Stage 01 configuration, create/resume/edit/save/discard/publish a business configuration draft, and inspect system-owned configuration without changing the existing B1/B1.5 backend contracts.

**Architecture:** Keep all persistence behind the existing `Stage01ConfigRepository`. Add a dedicated settings page with focused leaf components and a small editor/orchestration composable. Published configuration remains read-only; only draft `taxonomies` and `criteria` are locally editable. Shell integration exposes a permission-aware admin link without turning configuration into a primary workspace item. Unsaved-change protection is shared with the shell so company switching and route navigation cannot silently discard local edits.

**Tech Stack:** Nuxt 4.3.1, Vue 3.5.28, TypeScript 5.9.3, Nuxt UI 4.4.0, Zod 4, Vitest 4.1.9, Playwright 1.61.1.

**Spec:** `docs/superpowers/specs/2026-08-31-vqh-stage-01-business-config-admin-ui-design.md`

## Global Constraints

- Execution source code baseline is `main@154cc8cdfb46e0953ea1958f49aedf378e894dd1` plus the approved design/plan documentation branch commits.
- Reuse the existing `Stage01ConfigRepository`: `get`, `createDraft`, `updateDraft`, `discardDraft`, `publishDraft`.
- Do not add or rename Stage 01 config HTTP endpoints or public RPCs.
- Do not add a database migration or directly read/write `workflow_taxonomy_values` from B2.
- Route is exactly `/settings/stage-01`.
- Page access requires `stage01.config.read`.
- Draft mutation UI requires `stage01.config.update`; publish UI requires `stage01.config.publish`.
- Do not infer permissions from role names or special-case `company_admin` in the frontend.
- Published configuration is immutable/read-only in B2.
- Editable business data is only `taxonomies` and `criteria`.
- `nodes`, `dependencies`, `dimensions`, `capabilities`, and `gates` are system-owned and read-only.
- Do not expose editable raw JSON or editable `semanticKey`.
- Published taxonomy `code` and published criterion `key` are stable identities and are not inline-editable.
- Publish is disabled while local draft edits are unsaved; preferred flow is save first, then publish.
- `VERSION_CONFLICT` never auto-overwrites; user must reload canonical state.
- `STAGE01_DEFINITION_CONFIG_UNAVAILABLE` is a blocking setup state; B2 does not implement bootstrap of the first definition.
- Preserve local dirty input after network/server/validation failure.
- Warn before route leave, company switch, or canonical reload when local changes are dirty.
- Do not add B2 to the three-item primary mobile workspace navigation.
- User-facing copy is Vietnamese; technical codes may remain English identifiers.
- Do not modify Decision Runtime tables, completion baseline storage, Stage 02 behavior, or Workflow Engine architecture.
- No Cloud DEV or production mutation is required by B2.
- Follow repository TDD requirements and run fresh verification before completion.

---

## File Structure

### New application files

- `app/pages/settings/stage-01.vue` — page container; route meta, initial load, permission-derived presentation, action/error orchestration.
- `app/features/stage01-config/stage01-config-editor.ts` — pure editable-state helpers, labels/options, published identity lookup, update-input construction, dirty comparison.
- `app/composables/useStage01ConfigAdmin.ts` — repository-backed draft lifecycle state and mutation orchestration.
- `app/composables/useUnsavedChangesGuard.ts` — shared dirty-state registration and browser/in-app leave confirmation.
- `app/components/stage01-config/Stage01ConfigStatus.vue` — published/draft metadata and top-level status.
- `app/components/stage01-config/Stage01TaxonomyEditor.vue` — structured editor for the 12 approved taxonomy groups.
- `app/components/stage01-config/Stage01CriteriaEditor.vue` — structured criteria editor.
- `app/components/stage01-config/Stage01SystemConfigViewer.vue` — read-only system configuration summary.
- `app/components/stage01-config/Stage01ConfigActionBar.vue` — Save / reset local / discard / publish actions and dirty state.
- `app/components/stage01-config/Stage01ConfigConfirmDialog.vue` — reusable explicit confirmation dialog for discard/publish.

### Existing application files to modify

- `app/components/app/navigation-permissions.ts` — add a separate admin/settings link collection without changing primary workspace links.
- `app/components/app/AppHeader.vue` — render permission-aware `Cấu hình` entry in the header/admin context.
- `app/layouts/default.vue` — consult unsaved-change guard before company switching.

### New/modified tests

- `tests/unit/auth/navigation-permissions.spec.ts` — admin link permission filtering.
- `tests/unit/stage01-config/stage01-config-editor.spec.ts` — pure editor state, identity, dirty comparison and update input.
- `tests/unit/stage01-config/stage01-config-admin.spec.ts` — lifecycle orchestration using a fake `Stage01ConfigRepository`.
- `tests/unit/stage01-config/unsaved-changes.spec.ts` — leave-confirmation policy helper behavior.
- `tests/e2e/fixtures/stage01-config.ts` — deterministic intercepted B1 config API state.
- `tests/e2e/stage01-config-admin.spec.ts` — rendered B2 behavior, permissions, save/discard/publish/conflict, responsive/accessibility-critical interactions.
- `tests/e2e/app-shell-navigation.spec.ts` — settings entry shell integration where useful.

---

### Task 1: Add the permission-aware administrative navigation entry

**Files:**
- Modify: `app/components/app/navigation-permissions.ts`
- Modify: `app/components/app/AppHeader.vue`
- Modify: `tests/unit/auth/navigation-permissions.spec.ts`
- Modify: `tests/e2e/app-shell-navigation.spec.ts`

**Interfaces:**
- Consumes: existing `NavigationLink`, `NavigationPermissionAccess`, `filterNavigationLinks`, `CompanyAccessStore` permission access.
- Produces: `canonicalAdminLinks: readonly NavigationLink[]` containing `/settings/stage-01` guarded by `stage01.config.read`.

- [ ] **Step 1: Write the failing unit test for the separate admin link collection**

Add assertions equivalent to:

```ts
import {
  canonicalAdminLinks,
  canonicalNavigationLinks,
  filterNavigationLinks,
} from '../../../app/components/app/navigation-permissions'

it('keeps Stage 01 configuration out of workspace navigation and exposes it only with config read permission', () => {
  expect(canonicalNavigationLinks.map(link => link.to)).not.toContain('/settings/stage-01')
  expect(filterNavigationLinks(canonicalAdminLinks, accessFor([]))).toEqual([])
  expect(filterNavigationLinks(canonicalAdminLinks, accessFor(['stage01.config.read'])).map(link => link.to))
    .toEqual(['/settings/stage-01'])
})
```

- [ ] **Step 2: Run the unit test and verify the missing export fails**

Run:

```bash
pnpm test:unit -- tests/unit/auth/navigation-permissions.spec.ts
```

Expected: FAIL because `canonicalAdminLinks` does not exist.

- [ ] **Step 3: Add the admin link collection without changing primary workspace links**

Implement in `navigation-permissions.ts`:

```ts
export const canonicalAdminLinks: readonly NavigationLink[] = [
  {
    to: '/settings/stage-01',
    label: 'Cấu hình',
    icon: 'i-lucide-settings-2',
    requiredPermission: 'stage01.config.read',
  },
]
```

Do not append this item to `canonicalNavigationLinks`.

- [ ] **Step 4: Render the admin link in `AppHeader.vue`**

Use the same permission source as the sidebar:

```ts
import { canonicalAdminLinks, filterNavigationLinks } from './navigation-permissions'

const companyAccessStore = useNuxtApp().$companyAccessStore
const visibleAdminLinks = computed(() => filterNavigationLinks(canonicalAdminLinks, companyAccessStore))
```

Render each visible admin link as an accessible `NuxtLink` in the header context with the icon and label `Cấu hình`. The link must remain reachable on mobile without adding it to `.mobile-nav`. In the collapsed desktop header, follow the existing compact-header rules: it may become icon-only, but it must retain an accessible name/title.

- [ ] **Step 5: Add shell E2E assertions**

Extend `tests/e2e/app-shell-navigation.spec.ts` to verify the default authenticated fixture (all permissions) sees a `Cấu hình` link to `/settings/stage-01`, and a fixture with `stage01.config.read` removed does not.

Use the mutable `authState.sessionCompanies[0].permissions` before navigation for the denied case.

- [ ] **Step 6: Run focused tests**

```bash
pnpm test:unit -- tests/unit/auth/navigation-permissions.spec.ts
pnpm exec playwright test tests/e2e/app-shell-navigation.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/components/app/navigation-permissions.ts app/components/app/AppHeader.vue tests/unit/auth/navigation-permissions.spec.ts tests/e2e/app-shell-navigation.spec.ts
git commit -m "feat(stage01): expose config admin navigation"
```

---

### Task 2: Create the pure Stage 01 configuration editor state model

**Files:**
- Create: `app/features/stage01-config/stage01-config-editor.ts`
- Create: `tests/unit/stage01-config/stage01-config-editor.spec.ts`

**Interfaces:**
- Consumes: `Stage01BusinessTaxonomies`, `Stage01Criteria`, `Stage01ConfigDraft`, `Stage01PublishedConfig`, `UpdateStage01ConfigDraftInput` from `shared/schemas/stage01-config`.
- Produces:
  - `Stage01ConfigEditableState`
  - `cloneEditableConfig(...)`
  - `isEditableConfigEqual(...)`
  - `buildStage01ConfigUpdateInput(...)`
  - `publishedTaxonomyCodes(...)`
  - `publishedCriterionKeys(...)`
  - friendly taxonomy/dimension/criticality/applicability option metadata used by the editors.

- [ ] **Step 1: Write failing pure-unit tests**

Cover these exact behaviors:

```ts
it('clones only editable business fields from a draft', () => {
  const editable = cloneEditableConfig(draftFixture)
  expect(editable).toEqual({ taxonomies: draftFixture.taxonomies, criteria: draftFixture.criteria })
  expect(editable.taxonomies).not.toBe(draftFixture.taxonomies)
  expect(editable.criteria).not.toBe(draftFixture.criteria)
})

it('derives dirty state from editable content, not object identity', () => {
  const left = cloneEditableConfig(draftFixture)
  const right = cloneEditableConfig(draftFixture)
  expect(isEditableConfigEqual(left, right)).toBe(true)
  right.taxonomies.priority[0]!.label = 'Ưu tiên mới'
  expect(isEditableConfigEqual(left, right)).toBe(false)
})

it('builds the exact B1 update contract', () => {
  expect(buildStage01ConfigUpdateInput(4, editableFixture)).toEqual({
    expectedDraftVersion: 4,
    taxonomies: editableFixture.taxonomies,
    criteria: editableFixture.criteria,
  })
})

it('indexes published taxonomy codes and criterion keys as stable identities', () => {
  expect(publishedTaxonomyCodes(publishedFixture).customer_type.has('individual')).toBe(true)
  expect(publishedCriterionKeys(publishedFixture).has('customer_need')).toBe(true)
})
```

- [ ] **Step 2: Run the new unit test and verify it fails**

```bash
pnpm test:unit -- tests/unit/stage01-config/stage01-config-editor.spec.ts
```

Expected: FAIL because the feature module does not exist.

- [ ] **Step 3: Implement the pure editor helper module**

Define:

```ts
export interface Stage01ConfigEditableState {
  taxonomies: Stage01BusinessTaxonomies
  criteria: Stage01Criteria
}
```

Use `structuredClone` plus the existing Zod schemas to produce validated independent copies. Compare dirty state by deterministic JSON serialization of the parsed editable contract; do not use a manually toggled dirty boolean as the source of truth.

`buildStage01ConfigUpdateInput` must parse through `updateStage01ConfigDraftInputSchema` before returning.

Also export display metadata for all 12 taxonomy keys and the existing enum options, for example:

```ts
export const stage01TaxonomyLabels = {
  customer_type: 'Loại khách hàng',
  contact_relationship: 'Quan hệ liên hệ',
  scope: 'Phạm vi nhu cầu',
  lead_source: 'Nguồn khách hàng',
  referrer_type: 'Loại người giới thiệu',
  engagement_status: 'Trạng thái tương tác',
  invalid_reason: 'Lý do không hợp lệ',
  budget_status: 'Trạng thái ngân sách',
  timeline_status: 'Trạng thái thời gian',
  priority: 'Mức ưu tiên',
  intake_channel: 'Kênh tiếp nhận',
  blocker_category: 'Nhóm vướng mắc',
} satisfies Record<Stage01BusinessTaxonomyKey, string>
```

- [ ] **Step 4: Run focused test**

```bash
pnpm test:unit -- tests/unit/stage01-config/stage01-config-editor.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/features/stage01-config/stage01-config-editor.ts tests/unit/stage01-config/stage01-config-editor.spec.ts
git commit -m "feat(stage01): add config editor state model"
```

---

### Task 3: Build the repository-backed configuration admin state composable

**Files:**
- Create: `app/composables/useStage01ConfigAdmin.ts`
- Create: `tests/unit/stage01-config/stage01-config-admin.spec.ts`

**Interfaces:**
- Consumes: `Stage01ConfigRepository`, editor helpers from Task 2.
- Produces `useStage01ConfigAdmin(repository)` with canonical view, persisted draft, local editable state, computed dirty state, pending operation, action error and lifecycle methods.

Use this public shape:

```ts
export type Stage01ConfigOperation = 'load' | 'create' | 'save' | 'discard' | 'publish' | null

export function useStage01ConfigAdmin(repository: Stage01ConfigRepository) {
  return {
    view,
    editable,
    dirty,
    operation,
    error,
    load,
    createDraft,
    saveDraft,
    discardDraft,
    publishDraft,
    resetLocal,
    reloadCanonical,
  }
}
```

- [ ] **Step 1: Write a fake repository and failing lifecycle tests**

Test all of these behaviors:

1. `load()` stores the fetched `Stage01BusinessConfigView` and initializes editable state only when a draft exists.
2. `createDraft()` sends `expectedPublishedSnapshotId`, stores returned draft and editable clone.
3. local mutation changes `dirty` without changing persisted draft.
4. `saveDraft()` sends `expectedDraftVersion` and current editable taxonomies/criteria, then replaces persisted draft and clears dirty state.
5. `discardDraft()` sends current draft version, clears draft/editable but preserves published state.
6. `publishDraft()` refuses to call repository while dirty; when clean, sends current version, reloads canonical state with `get()`, and exposes the returned template version for success feedback.
7. failed save/publish leaves editable local state intact and exposes the original `ClientError`.
8. `resetLocal()` restores editable state from persisted draft.

For dirty publish refusal, return a local `ClientError` with code `VALIDATION_FAILED` and message `Hãy lưu bản nháp trước khi xuất bản.` rather than silently saving.

- [ ] **Step 2: Run the new unit test and verify it fails**

```bash
pnpm test:unit -- tests/unit/stage01-config/stage01-config-admin.spec.ts
```

Expected: FAIL because the composable does not exist.

- [ ] **Step 3: Implement the composable with explicit Vue imports**

Import `computed`, `ref` from `vue` so the composable can be unit-tested without mounting a Nuxt page.

Use the server-returned draft as the only persisted baseline. Do not increment draft versions locally. Do not optimistically convert a publish result into a local published definition; after publish, call `repository.get()` and use canonical server state.

On errors, keep the original thrown `ClientError` when available. Unknown errors may be normalized to a non-retryable `ClientError` with `INTERNAL_ERROR` only at the UI boundary; the composable should prefer preserving the original error.

- [ ] **Step 4: Run focused test**

```bash
pnpm test:unit -- tests/unit/stage01-config/stage01-config-admin.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/composables/useStage01ConfigAdmin.ts tests/unit/stage01-config/stage01-config-admin.spec.ts
git commit -m "feat(stage01): add config admin lifecycle state"
```

---

### Task 4: Add shared unsaved-change protection and company-switch integration

**Files:**
- Create: `app/composables/useUnsavedChangesGuard.ts`
- Modify: `app/layouts/default.vue`
- Create: `tests/unit/stage01-config/unsaved-changes.spec.ts`
- Modify: `tests/unit/auth/shell-actions.spec.ts` only if a shell helper signature changes.

**Interfaces:**
- Produces a shared dirty registration that the B2 page controls and the default layout can query before company switching.
- Must support in-app route leave and browser `beforeunload` from the page.

Use a small public contract:

```ts
export const UNSAVED_CHANGES_MESSAGE = 'Bạn có thay đổi chưa lưu. Rời trang sẽ làm mất các thay đổi này.'

export function shouldAllowUnsavedNavigation(
  dirty: boolean,
  confirmLeave: (message: string) => boolean,
): boolean {
  return !dirty || confirmLeave(UNSAVED_CHANGES_MESSAGE)
}

export function useUnsavedChangesGuard() {
  const dirty = useState<boolean>('taskovia-unsaved-changes', () => false)
  return {
    dirty: readonly(dirty),
    setDirty(value: boolean): void,
    confirmLeave(): boolean,
    clear(): void,
  }
}
```

- [ ] **Step 1: Write failing unit tests for the pure navigation decision**

```ts
it('allows navigation without prompting when clean', () => {
  const confirm = vi.fn(() => false)
  expect(shouldAllowUnsavedNavigation(false, confirm)).toBe(true)
  expect(confirm).not.toHaveBeenCalled()
})

it('blocks dirty navigation when the user declines', () => {
  expect(shouldAllowUnsavedNavigation(true, () => false)).toBe(false)
})

it('allows dirty navigation only after confirmation', () => {
  expect(shouldAllowUnsavedNavigation(true, () => true)).toBe(true)
})
```

- [ ] **Step 2: Run and verify failure**

```bash
pnpm test:unit -- tests/unit/stage01-config/unsaved-changes.spec.ts
```

- [ ] **Step 3: Implement the guard composable**

`confirmLeave()` must use `window.confirm` only on client; server-side callers return true. The browser-native confirmation is acceptable for the cross-shell company-switch safety path. Publish/discard use the styled explicit confirmation component in Task 6.

- [ ] **Step 4: Guard company switching in `app/layouts/default.vue`**

Before `switchCompanyAndReload`, call the shared guard:

```ts
const unsavedChanges = useUnsavedChangesGuard()

async function selectCompany(companyId: string): Promise<void> {
  if (!unsavedChanges.confirmLeave()) return
  unsavedChanges.clear()
  await switchCompanyAndReload(companyId, {
    selectCompany: companyAccessStore.selectCompany,
    clearRuntimeData: clearNuxtData,
    reloadNuxtApp,
  })
}
```

Do not alter the existing `switchCompanyAndReload` behavior unless required by a failing test.

- [ ] **Step 5: Run focused unit tests**

```bash
pnpm test:unit -- tests/unit/stage01-config/unsaved-changes.spec.ts tests/unit/auth/shell-actions.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/composables/useUnsavedChangesGuard.ts app/layouts/default.vue tests/unit/stage01-config/unsaved-changes.spec.ts tests/unit/auth/shell-actions.spec.ts
git commit -m "feat(stage01): protect unsaved config changes"
```

If `tests/unit/auth/shell-actions.spec.ts` is unchanged, omit it from `git add`.

---

### Task 5: Build the focused Stage 01 configuration presentation components

**Files:**
- Create: `app/components/stage01-config/Stage01ConfigStatus.vue`
- Create: `app/components/stage01-config/Stage01TaxonomyEditor.vue`
- Create: `app/components/stage01-config/Stage01CriteriaEditor.vue`
- Create: `app/components/stage01-config/Stage01SystemConfigViewer.vue`
- Create: `app/components/stage01-config/Stage01ConfigActionBar.vue`
- Create: `app/components/stage01-config/Stage01ConfigConfirmDialog.vue`
- Modify/Create rendered coverage in: `tests/e2e/stage01-config-admin.spec.ts` after the fixture from Task 7 is available; during this task, use `pnpm typecheck` and component source review, then the full rendered gate is Task 7.

**Interfaces:**

`Stage01TaxonomyEditor.vue`:

```ts
defineProps<{
  modelValue: Stage01BusinessTaxonomies
  published: Stage01BusinessTaxonomies
  readonly: boolean
}>()

defineEmits<{
  'update:modelValue': [value: Stage01BusinessTaxonomies]
}>()
```

`Stage01CriteriaEditor.vue`:

```ts
defineProps<{
  modelValue: Stage01Criteria
  published: Stage01Criteria
  readonly: boolean
}>()

defineEmits<{
  'update:modelValue': [value: Stage01Criteria]
}>()
```

Leaf components do not call repositories.

- [ ] **Step 1: Implement `Stage01ConfigStatus.vue`**

Render:

- `Cấu hình Stage 01` context/status copy supplied by the page;
- published template version and timestamp;
- `Không có bản nháp` vs `Có bản nháp chưa xuất bản`;
- draft version when present.

Do not duplicate mutation orchestration in this component.

- [ ] **Step 2: Implement the taxonomy editor**

Render all 12 groups using `stage01TaxonomyLabels` from Task 2.

For each row:

- label: editable `UInput` in edit mode;
- code: visible; if code existed in `published`, render as disabled/read-only technical identity; new rows may edit code;
- remove button: visible only in edit mode, with accessible name including taxonomy label and row label/code;
- lead source only: render `requiresReferrer` as `USwitch`/checkbox equivalent;
- no editable `semanticKey` and no raw JSON field.

For add actions, append a minimal valid business entry with a unique empty-local placeholder object only in local component state, then require non-empty code/label before save succeeds through the existing shared schema. Do not invent or send `semanticKey`.

Because the existing Zod contract rejects blank values, the component may temporarily hold an internal UI row type while editing a new row; before emitting/saving, the page/composable must validate through the shared schema. Prefer keeping this temporary representation local to the editor instead of weakening `shared/schemas/stage01-config.ts`.

- [ ] **Step 3: Implement the criteria editor**

For each criterion expose:

- key (read-only if published, editable for a genuinely new criterion);
- `dimensionKey` select;
- label input;
- description textarea;
- criticality select;
- applicability mode select;
- allows-not-applicable switch;
- numeric display order.

Use existing enums/options from the shared schema or Task 2 metadata. Do not add drag-and-drop.

- [ ] **Step 4: Implement system configuration viewer**

Render structured read-only summaries for:

```text
nodes
dependencies
dimensions
capabilities
gates
```

Technical detail may use `<details><summary>Chi tiết kỹ thuật</summary>…</details>`, but never an editable textarea/JSON editor.

- [ ] **Step 5: Implement action bar and confirmation dialog**

Action bar must visibly distinguish dirty/clean state and emit actions rather than calling repositories.

Use `UModal` with `v-model:open` for `Stage01ConfigConfirmDialog.vue`, with explicit title/body/confirm/cancel text. Discard and publish confirmations must be keyboard reachable and cancelable.

- [ ] **Step 6: Run typecheck and lint on the application state reached so far**

```bash
pnpm typecheck
pnpm lint
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/components/stage01-config app/features/stage01-config/stage01-config-editor.ts
git commit -m "feat(stage01): add config admin editor components"
```

Only include `stage01-config-editor.ts` if Task 5 required a focused metadata addition; otherwise commit only component files.

---

### Task 6: Build `/settings/stage-01` page orchestration and error states

**Files:**
- Create: `app/pages/settings/stage-01.vue`
- Modify: `app/composables/useStage01ConfigAdmin.ts` only for behavior proven missing by tests.
- Use: `app/composables/useUnsavedChangesGuard.ts`

**Interfaces:**
- Route meta requires `stage01.config.read`.
- Uses `useRepositories().stage01Config` only; no direct HTTP or Supabase calls.

- [ ] **Step 1: Create the route with fail-closed access metadata**

At the top of the page:

```ts
definePageMeta({ requiredPermission: 'stage01.config.read' })
```

Initialize:

```ts
const repositories = useRepositories()
const companyAccessStore = useNuxtApp().$companyAccessStore
const admin = useStage01ConfigAdmin(repositories.stage01Config)
```

Derive:

```ts
const canUpdate = computed(() => companyAccessStore.hasPermission('stage01.config.update'))
const canPublish = computed(() => companyAccessStore.hasPermission('stage01.config.publish'))
```

- [ ] **Step 2: Load canonical configuration and render the four state families**

Use one initial `await useAsyncData` or explicit awaited `admin.load()` pattern consistent with current pages. Render:

1. loading skeleton;
2. blocking load error with retry;
3. `STAGE01_DEFINITION_CONFIG_UNAVAILABLE` blocking setup state;
4. loaded published/draft UI.

Do not render an empty editor when load fails.

- [ ] **Step 3: Wire create/save/reset actions**

Create draft uses current `published.snapshotId`.

Save must validate local editable taxonomies and criteria through the existing shared schemas before repository call. If validation fails, keep local state and show a user-facing validation alert; do not coerce values silently.

Reset local changes calls `admin.resetLocal()` after confirmation when useful.

- [ ] **Step 4: Wire discard and publish confirmations**

Discard:

```text
Hủy bản nháp?
Bản nháp đã lưu sẽ bị xóa. Cấu hình đang xuất bản không thay đổi.
```

Publish:

```text
Xuất bản cấu hình?
Hệ thống sẽ tạo phiên bản cấu hình bất biến tiếp theo cho các workflow Stage 01 tạo mới.
```

Publish button is disabled whenever `admin.dirty` is true or any mutation is pending.

After successful publish, show success feedback with returned template version, then rely on `admin.publishDraft()` canonical reload to display the new published state.

- [ ] **Step 5: Map conflict and permission errors explicitly**

For `ClientError.code === 'VERSION_CONFLICT'`, display:

```text
Cấu hình đã thay đổi ở nơi khác. Hãy tải lại phiên bản mới nhất trước khi tiếp tục.
```

Offer `Tải lại cấu hình`. If local state is dirty, this action must run through the unsaved-change confirmation before `admin.reloadCanonical()`.

For `PERMISSION_DENIED`/`COMPANY_FORBIDDEN`, display authorization feedback; do not pretend the mutation succeeded. Existing authenticated HTTP client revalidation remains authoritative.

For network/server errors, preserve local editable state and expose retry/action feedback.

- [ ] **Step 6: Register unsaved-change protection**

Watch `admin.dirty` and mirror it into the shared unsaved guard.

Use `onBeforeRouteLeave`:

```ts
onBeforeRouteLeave(() => unsavedChanges.confirmLeave())
```

Register a client-side `beforeunload` handler only while dirty:

```ts
function onBeforeUnload(event: BeforeUnloadEvent) {
  if (!admin.dirty.value) return
  event.preventDefault()
  event.returnValue = ''
}
```

Clear shared dirty state on clean save/discard/publish and on component unmount.

- [ ] **Step 7: Make read-only behavior explicit**

A user with only `stage01.config.read`:

- sees published config and existing draft;
- sees taxonomy/criteria draft content in read-only form;
- does not see edit/save/discard controls;
- does not see publish unless they independently hold `stage01.config.publish`.

A publisher without update permission may publish an already persisted clean draft but cannot edit it.

- [ ] **Step 8: Run typecheck/lint**

```bash
pnpm typecheck
pnpm lint
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add app/pages/settings/stage-01.vue app/composables/useStage01ConfigAdmin.ts app/composables/useUnsavedChangesGuard.ts
git commit -m "feat(stage01): add config admin settings page"
```

Only include composables if this task changed them.

---

### Task 7: Add deterministic B2 API fixtures and rendered E2E coverage

**Files:**
- Create: `tests/e2e/fixtures/stage01-config.ts`
- Create: `tests/e2e/stage01-config-admin.spec.ts`

**Interfaces:**
- Extends existing authenticated fixture by intercepting only the Stage 01 config API paths.
- Keeps B2 E2E independent from Cloud DEV and real business data.

Define fixture state similar to:

```ts
export interface Stage01ConfigApiTestState {
  view: Stage01BusinessConfigView
  requests: Array<{ method: string, path: string, body?: unknown }>
  nextFailure: null | {
    method: string
    suffix: string
    status: number
    code: ApiErrorCode
  }
}
```

Provide:

```ts
createStage01ConfigView()
installStage01ConfigRoutes(page, state)
```

The route handler must implement the current B1 contract exactly:

- GET config returns `state.view`;
- POST draft creates draft version 0 based on current published snapshot;
- PUT draft verifies `expectedDraftVersion`, increments version once, updates taxonomies/criteria;
- DELETE draft verifies version, clears draft, returns JSON `null`;
- POST publish verifies version, increments published template version, promotes draft business config into published, clears draft, returns `PublishStage01ConfigResult`.

`nextFailure` supports deterministic 409/403/500 cases and resets after use.

- [ ] **Step 1: Write the fixture with valid shared-schema data**

Use `stage01BusinessConfigViewSchema.parse(...)` and related shared schemas when constructing fixture responses so the fixture cannot drift from the B1 client contract.

- [ ] **Step 2: Write E2E tests for access and initial rendering**

Cover:

1. header `Cấu hình` link opens `/settings/stage-01` for a user with read permission;
2. direct route access without `stage01.config.read` goes through existing forbidden behavior;
3. published-only state shows version/status and `Bắt đầu chỉnh sửa` for updater;
4. existing draft resumes without creating a second draft;
5. read-only user can inspect but not mutate.

- [ ] **Step 3: Write E2E tests for taxonomy/criteria editing**

Cover:

- published taxonomy code is not editable inline;
- published criterion key is not editable inline;
- taxonomy label can change;
- `lead_source.requiresReferrer` can change;
- criterion label/description/criticality/applicability/display order can change;
- `semanticKey` is not exposed as an editable control;
- no raw editable JSON textarea exists.

- [ ] **Step 4: Write E2E tests for save/reset/dirty behavior**

Cover:

- local edit shows unsaved state;
- Publish is disabled while dirty;
- `Lưu bản nháp` issues PUT with current expected version;
- successful save advances displayed draft version and clears dirty state;
- reset local changes restores persisted draft without network mutation.

- [ ] **Step 5: Write E2E tests for discard and publish**

Cover explicit confirmation cancel/confirm for both actions. After publish, assert:

- new template version is visible;
- draft indicator disappears;
- GET canonical reload occurred after publish;
- old published snapshot is never edited in place in fixture behavior.

- [ ] **Step 6: Write E2E tests for conflict/error behavior**

Inject `VERSION_CONFLICT` on save and assert:

- conflict message is visible;
- local edited field value remains present;
- reload action is offered;
- reload while dirty prompts before discarding local changes.

Inject server/network-style failure and assert local input remains.

Inject 403 mutation failure and assert success feedback is absent.

- [ ] **Step 7: Write E2E tests for unsaved route/company switch protection**

After making a local edit:

- attempt a normal in-app navigation and reject the browser confirm; URL stays on settings page;
- accept confirmation; navigation proceeds;
- with multiple company fixture, attempt company switch and reject confirmation; active page/company context remains;
- clean state does not prompt.

- [ ] **Step 8: Write responsive and accessibility-critical assertions**

At 390px width verify:

- no horizontal overflow;
- core fields/actions remain reachable;
- primary `.mobile-nav` remains the existing three workspace items;
- settings route remains reachable through header/admin context;
- action bar does not overlap the mobile bottom navigation;
- page has one `h1` named `Cấu hình Stage 01`;
- form controls have accessible names;
- errors expose alert semantics.

- [ ] **Step 9: Run B2 E2E**

```bash
pnpm exec playwright test tests/e2e/stage01-config-admin.spec.ts tests/e2e/app-shell-navigation.spec.ts
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add tests/e2e/fixtures/stage01-config.ts tests/e2e/stage01-config-admin.spec.ts tests/e2e/app-shell-navigation.spec.ts
git commit -m "test(stage01): cover config admin ui flows"
```

---

### Task 8: Run final B2 verification and scope audit

**Files:**
- No planned production-code changes; fix only task-introduced failures discovered by verification.

**Interfaces:**
- Produces completion evidence for the B2 Implementation Packet.

- [ ] **Step 1: Run all focused B2/unit tests**

```bash
pnpm test:unit -- \
  tests/unit/auth/navigation-permissions.spec.ts \
  tests/unit/stage01-config/stage01-config-editor.spec.ts \
  tests/unit/stage01-config/stage01-config-admin.spec.ts \
  tests/unit/stage01-config/unsaved-changes.spec.ts
```

Expected: PASS.

- [ ] **Step 2: Run focused rendered tests**

```bash
pnpm exec playwright test tests/e2e/stage01-config-admin.spec.ts tests/e2e/app-shell-navigation.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Run full application verification**

```bash
pnpm verify:app
```

Expected: unit tests, typecheck, lint and build all PASS.

- [ ] **Step 4: Run full E2E unless repository/runtime constraints provide a documented equivalent**

```bash
pnpm test:e2e
```

Expected: PASS.

- [ ] **Step 5: Audit backend/data scope**

Confirm the implementation diff contains no changes under:

```text
supabase/migrations/
supabase/tests/database/
server/features/stage01-config/
server/api/companies/*/stage-01/config/
shared/types/database.types.ts
```

unless a task-introduced compile failure proves a mechanical, contract-preserving change is required. Any such backend/schema need upgrades the task beyond the approved B2 scope and must STOP for GPT review rather than being implemented by assumption.

- [ ] **Step 6: Audit B2 architecture invariants**

Confirm:

- `/settings/stage-01` is guarded by `stage01.config.read`;
- primary sidebar/mobile workspace navigation still contains only workspace items;
- B2 never directly calls fetch/Supabase and never references `workflow_taxonomy_values`;
- published data is never locally mutated as draft source;
- system config has no mutation controls;
- `semanticKey` has no editable UI;
- permissions are checked by explicit permission codes, not role names;
- publish cannot execute while dirty;
- version conflict never auto-overwrites;
- dirty state guards route leave and company switching.

- [ ] **Step 7: Inspect git diff for unrelated changes**

```bash
git status --short
git diff --check
git diff --stat <execution_base_sha>...HEAD
```

Expected: only approved B2/docs/task files; no whitespace errors.

- [ ] **Step 8: Commit any verification-only fixes separately**

If verification exposed a task-introduced issue, fix it with a focused test and commit, e.g.:

```bash
git commit -m "fix(stage01): harden config admin ui"
```

Do not create a no-op verification commit.

- [ ] **Step 9: Push and verify remote head**

Push the dedicated implementation branch, then verify:

```text
remote_head_sha == head_sha
```

using `git ls-remote` or repository-equivalent remote inspection.

---

## Implementation Notes

### Error classification

Use the existing `ClientError` class from `app/errors/client-error.ts`. The important B2 codes already exist in `shared/schemas/api-error.ts`:

```text
STAGE01_DEFINITION_CONFIG_UNAVAILABLE
STAGE01_DEFINITION_CONFIG_INVALID
STAGE01_CONFIG_DRAFT_EXISTS
STAGE01_CONFIG_DRAFT_NOT_FOUND
VERSION_CONFLICT
PERMISSION_DENIED
COMPANY_FORBIDDEN
INTERNAL_ERROR
```

Do not invent a parallel error model.

### Permission source

Use `$companyAccessStore.hasPermission(...)`. Do not parse role names.

### Local validation

The UI may hold temporarily incomplete form fields while the user types. The persisted request must still pass the existing B1 Zod schemas. Do not weaken shared schemas to make partial UI input legal.

### Published identity detection

A taxonomy code/criterion key is considered published when it exists in `view.published`. Those identities are rendered read-only even when a draft exists. Newly introduced draft-only values may edit their identity before first publication.

### No Cloud DEV dependency

B2 is an application/UI task. E2E must intercept the existing HTTP contract. Do not mutate Cloud DEV merely to test the UI.

### No generic workflow builder

Do not add editing controls for nodes, dependencies, gates, capabilities or dimensions. They are shown only so administrators understand the system-owned boundary.

---

## Self-Review Checklist

Before handing off the plan, confirm:

- Every approved design section maps to a task above.
- No task adds a backend API, migration, direct taxonomy-catalog access, Decision Runtime change, or Stage 02 behavior.
- The page lifecycle uses the exact existing `Stage01ConfigRepository` signatures.
- Dirty state derives from editable content and blocks unsafe publish/navigation.
- Permission behavior covers read/update/publish independently.
- Error coverage includes unavailable config, version conflict, authorization, validation and network/server failure.
- Desktop/mobile/accessibility expectations have rendered E2E coverage.
- No placeholder/TBD instructions remain.
