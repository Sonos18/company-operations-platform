# VQH Stage 01 Business Configuration Admin UI — Design Specification

## Status

- Product/design status: **APPROVED by Sơn in chat on 2026-08-31**
- Design branch: `docs/vqh-stage-01-business-config-admin-ui-design`
- Analysis base: `main@154cc8cdfb46e0953ea1958f49aedf378e894dd1`
- Implementation phase: **B2 — Business Configuration Admin UI**

## Goal

Build a dedicated administrative UI for VQH Stage 01 business configuration on top of the already-approved B1/B1.5 control plane.

The UI must let an authorized administrator:

1. inspect the currently published Stage 01 configuration;
2. create or resume a draft;
3. edit approved business taxonomies;
4. edit approved Stage 01 evaluation criteria;
5. save a draft;
6. discard a draft;
7. publish a draft as the next immutable workflow definition snapshot;
8. inspect system-owned configuration without editing it.

The UI must use the existing `Stage01ConfigRepository` and existing B1 API contracts. B2 does not introduce a new backend API or a new database ownership model.

---

## Architectural decision

B2 is a **dedicated settings/admin surface**, not part of the operational Opportunity workspace and not a generic workflow builder.

Approved route:

```text
/settings/stage-01
```

Approved navigation placement:

- expose a **Settings / Cấu hình** entry from the application header/admin context;
- do not add Stage 01 configuration as a primary workspace item beside Projects, My Work, or Employees;
- do not expand the mobile primary workspace navigation merely to expose this administrative surface.

Reasoning:

- operational pages answer “what work do I need to do?”;
- configuration pages answer “how should the workflow behave?”;
- mixing them would blur permissions, user intent, and future navigation structure.

---

## Existing control-plane contract

B2 consumes the existing client repository:

```ts
interface Stage01ConfigRepository {
  get(): Promise<Stage01BusinessConfigView>
  createDraft(input: CreateStage01ConfigDraftInput): Promise<Stage01ConfigDraft>
  updateDraft(input: UpdateStage01ConfigDraftInput): Promise<Stage01ConfigDraft>
  discardDraft(input: DiscardStage01ConfigDraftInput): Promise<void>
  publishDraft(input: PublishStage01ConfigDraftInput): Promise<PublishStage01ConfigResult>
}
```

The current HTTP implementation remains authoritative:

```text
GET    /api/companies/:companyId/stage-01/config
POST   /api/companies/:companyId/stage-01/config/draft
PUT    /api/companies/:companyId/stage-01/config/draft
DELETE /api/companies/:companyId/stage-01/config/draft
POST   /api/companies/:companyId/stage-01/config/draft/publish
```

B2 must not directly read or mutate `workflow_taxonomy_values`.

B2 configuration persistence flow remains:

```text
Admin UI
   ↓
Stage01ConfigRepository
   ↓
B1 config HTTP/RPC control plane
   ↓
workflow_definition_drafts
   ↓ publish
workflow_definition_snapshots
   ↓ projection
workflow_taxonomy_values
```

`workflow_definition_snapshots` remains the immutable published/runtime authority.

---

## Authorization model

The page itself requires:

```text
stage01.config.read
```

Action visibility and enablement are permission-specific:

| Permission | UI capability |
| --- | --- |
| `stage01.config.read` | Open page and inspect published configuration / existing draft |
| `stage01.config.update` | Create draft, edit draft, save draft, discard draft |
| `stage01.config.publish` | Publish an existing valid draft |

Rules:

- frontend permission checks improve UX only; server/RPC authorization remains authoritative;
- do not infer configuration capability from role names;
- do not treat `company_admin` as a frontend special case;
- a read-only user may inspect a draft but may not mutate it;
- a publisher without update permission may publish an already-existing valid draft if the backend permission contract allows it, but may not edit it;
- direct unauthorized routes continue through the existing global access middleware and forbidden/access-state behavior.

---

## Page information architecture

The page contains five top-level regions.

### 1. Page header and configuration status

Display:

- title: **Cấu hình Stage 01**;
- short description explaining that changes affect newly created workflow instances after publication, while existing bound instances keep their published snapshot;
- published template version;
- published timestamp;
- draft state: `Không có bản nháp` or `Có bản nháp chưa xuất bản`;
- draft version when a draft exists.

Primary contextual actions are permission-aware:

- `Bắt đầu chỉnh sửa` when no draft exists and user has `stage01.config.update`;
- `Tiếp tục chỉnh sửa` when a draft exists and user has update permission;
- `Xuất bản` when a draft exists and user has publish permission;
- `Hủy bản nháp` when a draft exists and user has update permission.

The page must never imply that editing mutates the published snapshot in place.

### 2. Taxonomies

Editable business taxonomy groups:

```text
customer_type
contact_relationship
scope
lead_source
referrer_type
engagement_status
invalid_reason
budget_status
timeline_status
priority
intake_channel
blocker_category
```

Each taxonomy is presented as a labeled section/card containing a structured row editor.

Common row fields:

- `label` — editable in draft mode;
- `code` — visible technical identity;
- remove action where the backend contract permits removal;
- add action for a new business value.

Special `lead_source` behavior:

- expose `requiresReferrer` as an explicit boolean control;
- no generic JSON editor is exposed.

Identity rule:

- for values originating from a published definition, `code` is displayed as a stable identity and is not edited inline;
- changing a business code is represented as an explicit remove/add attempt and remains subject to backend semantic/historical identity guards;
- reserved `semanticKey` is never exposed as an editable field;
- B2 must not expose `semanticKey` as a normal business control.

The UI may display a short technical-code hint where useful, but business labels remain the primary visual content.

### 3. Evaluation criteria

The draft editor exposes approved fields already accepted by the B1 contract:

- `key` — visible, immutable for published criteria;
- `dimensionKey`;
- `label`;
- `description`;
- `criticality`;
- `applicabilityMode`;
- `allowsNotApplicable`;
- `displayOrder`.

Editing rules:

- published criterion `key` is a stable technical identity and is not edited inline;
- label/description/business evaluation settings are editable in draft mode;
- new criteria may be added if they satisfy the existing shared schema and backend validation;
- removing or re-keying historically published criteria is not presented as a guaranteed supported operation; backend rejection must be surfaced clearly;
- criterion order is controlled by `displayOrder`; drag-and-drop is not required for B2 unless it can be implemented without obscuring the numeric ordering contract.

Prefer explicit form fields over a raw JSON editor.

### 4. System configuration — read only

Display, without mutation controls:

```text
nodes
dependencies
dimensions
capabilities
gates
```

Purpose:

- allow administrators to understand what is system-owned;
- make the business/system boundary visible;
- prevent the B2 interface from becoming a workflow-engine designer.

The UI should render a concise structured summary rather than a raw editable JSON textarea.

A collapsed “Chi tiết kỹ thuật” presentation is acceptable for verbose objects.

### 5. Draft action area

When draft mode is active, maintain a persistent action area containing:

- local dirty-state indicator;
- `Lưu bản nháp`;
- `Hủy thay đổi chưa lưu` when local edits differ from the fetched draft;
- `Hủy bản nháp`;
- `Xuất bản` when allowed.

Publishing must not implicitly save unknown local edits. If local state is dirty, the UI must require saving the current draft first or perform an explicit save-then-publish sequence whose failure states remain visible and deterministic.

Preferred B2 behavior: **save first, then publish**. Disable Publish while local draft changes are unsaved.

---

## Page state model

The page has four relevant application states.

### State A — loading

Show skeleton/loading UI while `stage01Config.get()` resolves.

### State B — published only

```text
published != null
draft = null
```

Behavior:

- render published configuration read-only;
- if user has update permission, offer `Bắt đầu chỉnh sửa`;
- clicking it calls `createDraft({ expectedPublishedSnapshotId })`;
- successful result becomes the editing source.

### State C — draft exists, clean

```text
draft != null
localForm == fetchedDraft
```

Behavior:

- show published metadata and draft status;
- render editor for users with update permission;
- render same draft read-only for read-only users;
- publish may be enabled for users with publish permission.

### State D — draft exists, dirty

```text
draft != null
localForm != fetchedDraft
```

Behavior:

- show unsaved indicator;
- enable Save for update-capable users;
- disable Publish until save succeeds;
- warn before navigation away or destructive reload;
- offer reset of local changes back to the latest fetched draft.

---

## Draft creation, save, discard, and publish behavior

### Create draft

Input:

```text
expectedPublishedSnapshotId = current published.snapshotId
```

On success:

- replace page draft state with returned draft;
- initialize local form from returned taxonomies/criteria;
- no second GET is required unless implementation needs it for consistency.

### Save draft

Input:

```text
expectedDraftVersion = current draft.version
taxonomies = local editable taxonomies
criteria = local editable criteria
```

On success:

- replace fetched draft with returned draft;
- replace local baseline with returned draft values;
- dirty state becomes false;
- displayed draft version advances to the returned version.

### Discard draft

Requires explicit confirmation because it deletes the persisted draft.

Input:

```text
expectedDraftVersion = current draft.version
```

On success:

- draft becomes null;
- local form is cleared;
- published configuration remains unchanged.

### Publish draft

Requires explicit confirmation explaining that publication creates the next immutable version and affects future Stage 01 workflow instances.

Input:

```text
expectedDraftVersion = current draft.version
```

Preconditions in UI:

- draft exists;
- user has publish permission;
- local form is not dirty;
- no mutation request is already pending.

On success:

- call `stage01Config.get()` to reload canonical published/draft state;
- expect the draft to disappear and published metadata to advance;
- show success feedback identifying the new template version.

---

## Error handling

### Initial load failure

Show a full-page or page-section error state with retry.

Do not silently render empty configuration.

### `STAGE01_DEFINITION_CONFIG_UNAVAILABLE`

Display a blocking configuration-not-ready state rather than an empty editor.

This is an exceptional setup state; B2 does not invent a first-definition bootstrap flow.

### Version conflict / HTTP 409

Do not retry or overwrite automatically.

Display a conflict message equivalent to:

> Cấu hình đã thay đổi ở nơi khác. Hãy tải lại phiên bản mới nhất trước khi tiếp tục.

Offer `Tải lại cấu hình`.

If local edits exist, warn that reload will discard those unsaved local edits.

### Validation rejection

Surface validation failures close to the relevant section when the client schema can identify them.

For backend business-validation failures that are not safely field-addressable, show a clear page/action alert and keep local input intact.

Do not “fix” rejected data automatically.

### Permission failure / 403

If permissions changed after page load, surface an authorization message and refresh/revalidate access state rather than presenting the mutation as successful.

### Network/server failure

Keep local dirty state intact and allow retry.

---

## Unsaved-change protection

When local draft state is dirty:

- warn before route navigation that would leave the editor;
- warn before switching company;
- warn before reloading the canonical draft;
- do not rely only on browser unload warnings for in-app navigation;
- do not block navigation when the draft is clean.

The implementation may use a focused composable for dirty-state/navigation protection if that keeps page logic small and testable.

---

## Navigation and shell integration

The primary sidebar currently represents workspace navigation and remains unchanged in concept.

B2 adds a permission-aware administrative entry through the shell/header context.

Approved behavior:

- visible only when user has `stage01.config.read`;
- label: `Cấu hình` or `Cài đặt` with a settings/sliders icon;
- target: `/settings/stage-01`;
- desktop: header/admin action is acceptable;
- mobile: expose the same administrative route without increasing the three-item primary bottom navigation into a generic settings tab bar.

Exact visual placement within `AppHeader.vue` may follow the existing shell style as long as it remains discoverable and permission-aware.

---

## Visual and interaction direction

Follow the existing Taskovia/VQH application design language:

- existing CSS variables (`--paper`, `--forest`, `--ink-muted`, `--line`, etc.);
- existing Nuxt UI components where they fit;
- minimum practical interactive target around 44px;
- clear hierarchy, restrained admin UI, no dashboard-style decorative metrics unless they help configuration comprehension;
- Vietnamese user-facing copy;
- technical identifiers may remain English/code values.

The page should feel like a configuration editor, not a database console.

Do not expose editable raw JSON.

---

## Responsive behavior

Desktop/tablet:

- content constrained to a readable admin width;
- taxonomy and criterion sections may use tables/cards depending on field density;
- action bar remains easy to reach.

Mobile:

- stack fields vertically;
- do not require horizontal scrolling for core edit actions;
- long technical IDs/codes may wrap or use secondary presentation;
- destructive/publish confirmations remain explicit;
- persistent actions must not conflict with the existing mobile navigation.

B2 must support the existing authenticated responsive shell rather than introducing a desktop-only admin page.

---

## Accessibility requirements

- page has one clear `h1`;
- all inputs have programmatic labels;
- taxonomy sections and criteria sections have semantic headings;
- add/remove buttons have contextual accessible names;
- pending mutations expose disabled/busy states;
- errors use appropriate alert semantics;
- confirmations are keyboard accessible;
- focus moves to meaningful feedback after failed save/publish where practical;
- color is not the sole indicator of dirty/published/error state;
- respect existing reduced-motion behavior.

---

## Component boundaries

B2 should favor focused components instead of one large page component.

Recommended responsibilities, not mandatory filenames:

### Settings page container

Responsible for:

- permission-aware page composition;
- canonical async load;
- draft lifecycle orchestration;
- mutation pending/error state;
- publish/discard confirmation orchestration.

### Configuration status/header component

Responsible for:

- published version metadata;
- draft status;
- top-level actions.

### Taxonomy editor

Responsible for:

- rendering 12 taxonomy groups;
- local row editing;
- add/remove controls;
- `lead_source.requiresReferrer` special behavior.

It does not call repositories directly.

### Criteria editor

Responsible for:

- criterion fields and local list mutations;
- stable-key presentation;
- add/remove/reorder/displayOrder behavior.

It does not call repositories directly.

### System configuration viewer

Responsible only for read-only structured rendering.

### Draft action bar

Responsible for:

- dirty state presentation;
- Save / Reset local changes / Discard / Publish actions;
- pending-state affordances.

Repository/network orchestration should remain at page/composable level rather than inside leaf form components.

---

## Data ownership in the frontend

Maintain two distinct copies while a draft exists:

```text
persistedDraft
localEditableDraft
```

`persistedDraft` is the most recent server-returned draft.

`localEditableDraft` contains only business-editable fields:

```text
taxonomies
criteria
```

Dirty state is derived by comparing normalized editable content, not by a manually toggled boolean alone.

System-owned data comes from `published.system` and is never copied into an editable payload.

Do not send system-owned fields back through `updateDraft`.

---

## Testing strategy

B2 implementation must follow TDD for interaction/state behavior.

Minimum test coverage:

### Navigation/access

- settings entry hidden without `stage01.config.read`;
- settings entry visible with read permission;
- route declares required read permission.

### Published-only state

- published metadata renders;
- edit action hidden without update permission;
- create-draft action sends the current published snapshot ID.

### Existing draft

- draft is resumed instead of creating a second draft;
- read-only users can inspect but not mutate;
- update users can modify and save.

### Dirty state

- dirty indicator appears after local edits;
- Publish disabled while dirty;
- reset local changes restores persisted draft;
- navigation protection triggers only while dirty.

### Save

- sends `expectedDraftVersion` from persisted draft;
- successful save replaces baseline/version and clears dirty state;
- failed save retains local edits.

### Discard

- requires confirmation;
- sends current expected draft version;
- clears draft only after success.

### Publish

- hidden/disabled without publish permission;
- requires confirmation;
- only allowed on clean persisted draft;
- reloads canonical config after success.

### Conflict/error

- 409/version conflict offers canonical reload and does not overwrite silently;
- loading error offers retry;
- mutation error preserves local form state;
- unavailable initial config renders blocking state.

### Editors

- published taxonomy code identity is not edited inline;
- `semanticKey` is not exposed as editable business data;
- `lead_source.requiresReferrer` is editable;
- published criterion key is not edited inline;
- criterion business fields map exactly to existing shared schema.

### Accessibility/responsive

- key interactions are keyboard reachable;
- form controls have labels;
- no critical action relies solely on desktop layout.

Existing B1/B1.5 backend/database tests remain regression coverage and should not need redesign for B2.

---

## Non-goals

B2 does **not** include:

- generic workflow definition builder;
- editing nodes/dependencies/gates/capabilities;
- Stage 02 configuration;
- Decision Runtime table migration;
- completion baseline migration;
- taxonomy catalog direct CRUD;
- role/permission administration;
- first-ever Stage 01 definition bootstrap;
- configuration diff viewer across arbitrary historical versions;
- rollback to an old published snapshot;
- multi-user collaborative live editing;
- autosave;
- drag-and-drop requirement for criteria;
- production deployment.

These require separate design decisions if needed later.

---

## Acceptance design outcomes

B2 design is satisfied when the implementation provides all of the following:

1. `/settings/stage-01` is an authenticated, company-scoped page protected by `stage01.config.read`.
2. Admin navigation is permission-aware without turning Stage 01 config into a primary workspace item.
3. Published configuration is always visibly read-only.
4. Draft creation starts from the current published snapshot.
5. Existing drafts resume correctly.
6. Only `taxonomies` and `criteria` are editable.
7. System-owned configuration remains readable but non-editable.
8. Local unsaved state is separate from persisted draft state.
9. Save uses optimistic draft versioning.
10. Publish requires a clean persisted draft and explicit confirmation.
11. Discard requires explicit confirmation.
12. Version conflicts never overwrite automatically.
13. Backend/API/database contracts from B1/B1.5 remain unchanged.
14. No direct `workflow_taxonomy_values` CRUD is added to the UI.
15. UI behavior is covered by focused unit/component tests and application verification.

---

## Implementation boundary

Expected B2 changes are primarily under:

```text
app/pages/settings/
app/components/stage01-config/            (or equivalent focused feature folder)
app/composables/                          (only if useful for editor state/navigation guard)
app/components/app/AppHeader.vue
app/components/app/navigation-permissions.ts or a focused admin-navigation helper
app/repositories/contracts.ts             (no contract change expected)
app/repositories/http/http-stage01-config-repository.ts (no contract change expected)
tests/unit/...
```

Backend/server/database changes are **not expected**.

If implementation discovers that B2 requires a new backend contract, schema change, permission semantic, or editable system configuration, Codex must stop and report architectural drift rather than inventing it.

---

## Exit condition

After this design is approved and committed, the next artifact is a detailed B2 implementation plan followed by an approved Implementation Packet for Codex.
