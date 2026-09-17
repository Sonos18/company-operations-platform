# C1 P3R Gate E VQH Project Cost Execution Packet

**Status:** `PASS_PRELOAD_READY` — packet prepared only; real load remains `NOT_AUTHORIZED` and `NOT_EXECUTED`.

## Reused preload evidence

The immediately preceding authorized Cloud DEV read-only preload established the two Project identities, source UUID ownership/value/semantics, absence of equivalent Project Cost rows, and the intended actor capability. This packet makes **zero** Cloud queries and **zero** Cloud mutations.

| Fact | Reviewed result |
| --- | --- |
| VQH company | `10000000-0000-4000-8000-000000000020` |
| Eo Gió Project | `7e7e3904-d53b-4337-9360-22256887474a` / `EO-GIO` |
| Yong Mei Project | `22727545-1534-4c1a-9378-06969cb40f97` / `YONG-MEI` |
| Existing Project Cost rows / provenance links | `0` / `0` |
| Existing Project Cost audit events / create receipts | `0` / `0` |
| Intended actor | `7c01c684-5c18-4c2f-ac34-5f300910b605` |
| Effective capability | active `c1_vqh_cost_operator` role with `cost.manage` |

## Deterministic identifier convention

```text
packetId: c1-p3r-gate-e-vqh-project-cost-load-2026-09-16-v1
packetVersion: v1
algorithm: UUIDv5
namespace: RFC URL namespace / 6ba7b811-9dad-11d1-80b4-00c04fd430c8
baseName: taskovia://c1/p3r/gate-e/vqh-project-cost-load/2026-09-16/v1/company/{companyId}/project/{projectId}/item/{logicalRef}
idempotencyKey: UUIDv5(URL_NAMESPACE, baseName + "/idempotency")
requestId: UUIDv5(URL_NAMESPACE, baseName + "/request")
```

The immutable logical operation, rather than mutable payload fields, identifies each idempotency key. The existing create RPC scopes a receipt by company, actor, command name, and idempotency key; hashes `companyId` plus input; and returns `IDEMPOTENCY_CONFLICT` when the same key has a different hash. `requestId` is audit correlation only.

`v1` is immutable once materialized. Before its first mutation, any change to the company, Project, logical item, amount, currency, status, source UUIDs, business reference, optional hierarchy/date, or non-overlap confirmation requires a newly versioned and reviewed packet. After an attempt, exact retries retain the packet identifiers and approved input; reconcile the existing receipt/result before any retry. A later business correction uses update/correct, never another create identity.

## Execution packet

All items use `businessReference: null`; `partyId`, `engagementId`, `componentId`, and `relevantDate` are omitted. The common non-overlap reference is `VQH_BUSINESS_APPROVED / 2026-09-16 / p3r-vqh-project-cost-confirmation-packet.md#non-overlap-approval`.

### EOG-01

```yaml
projectId: 7e7e3904-d53b-4337-9360-22256887474a
baseName: taskovia://c1/p3r/gate-e/vqh-project-cost-load/2026-09-16/v1/company/10000000-0000-4000-8000-000000000020/project/7e7e3904-d53b-4337-9360-22256887474a/item/EOG-01
description: Chi phí vật tư công trình Eo Gió
amount: '3197669056'
currencyCode: VND
workStatus: in_progress
sourceFigureIds: [a3e5b2f3-7567-47bf-8b9f-d6eb4a3938ed, 6b09c829-0db1-4a1c-8fe4-c4955e332d81, ea6afa64-3378-4062-b692-2dc4d48931c4, be968b8c-221f-4d03-859f-4c58c75b86dd]
idempotencyKey: bf51b662-2475-54cc-9b6c-1d88d5f56612
requestId: d75877d3-9c90-55a0-bab2-20f372507e77
```

### EOG-02

```yaml
projectId: 7e7e3904-d53b-4337-9360-22256887474a
baseName: taskovia://c1/p3r/gate-e/vqh-project-cost-load/2026-09-16/v1/company/10000000-0000-4000-8000-000000000020/project/7e7e3904-d53b-4337-9360-22256887474a/item/EOG-02
description: Chi phí nhân công trực tiếp công trình Eo Gió
amount: '1009392500'
currencyCode: VND
workStatus: in_progress
sourceFigureIds: [6bb42ded-22bc-4505-8d98-4a7570094f9b]
idempotencyKey: f49660ba-a3f7-508d-9cc0-c001091017c9
requestId: b15da8e0-83e1-5f34-99bf-93d0312f3489
```

### EOG-03

```yaml
projectId: 7e7e3904-d53b-4337-9360-22256887474a
baseName: taskovia://c1/p3r/gate-e/vqh-project-cost-load/2026-09-16/v1/company/10000000-0000-4000-8000-000000000020/project/7e7e3904-d53b-4337-9360-22256887474a/item/EOG-03
description: Giá trị nhân công khoán công trình Eo Gió
amount: '1188100400'
currencyCode: VND
workStatus: in_progress
sourceFigureIds: [d6ee8648-4da6-4cc6-a72b-92a866cd1e46]
idempotencyKey: 14e947de-1abf-5e84-82cb-509e1df7b332
requestId: ea179172-e7bc-5f41-8b64-63261c6193ed
```

### EOG-04

```yaml
projectId: 7e7e3904-d53b-4337-9360-22256887474a
baseName: taskovia://c1/p3r/gate-e/vqh-project-cost-load/2026-09-16/v1/company/10000000-0000-4000-8000-000000000020/project/7e7e3904-d53b-4337-9360-22256887474a/item/EOG-04
description: Chi phí máy móc công trình Eo Gió
amount: '102974792'
currencyCode: VND
workStatus: in_progress
sourceFigureIds: [0e3d8e13-beec-474d-bc88-4975bc38aa66]
idempotencyKey: 02d28d80-f798-55c9-9717-9434c815e99a
requestId: 0eea4200-5c8c-5b5e-a0b5-0336966ce223
```

### EOG-05

```yaml
projectId: 7e7e3904-d53b-4337-9360-22256887474a
baseName: taskovia://c1/p3r/gate-e/vqh-project-cost-load/2026-09-16/v1/company/10000000-0000-4000-8000-000000000020/project/7e7e3904-d53b-4337-9360-22256887474a/item/EOG-05
description: Chi phí khác công trình Eo Gió
amount: '143589148'
currencyCode: VND
workStatus: in_progress
sourceFigureIds: [f65ceb02-d8eb-4d13-b4b9-ae15cc030014]
idempotencyKey: 639065ea-444d-5fdc-be60-fcbf4d7828b8
requestId: badf2cf1-4edf-592a-891b-4fc9896402e0
```

### YM-01

```yaml
projectId: 22727545-1534-4c1a-9378-06969cb40f97
baseName: taskovia://c1/p3r/gate-e/vqh-project-cost-load/2026-09-16/v1/company/10000000-0000-4000-8000-000000000020/project/22727545-1534-4c1a-9378-06969cb40f97/item/YM-01
description: Chi phí vật tư cải tạo mặt bằng Yong Mei
amount: '123607288'
currencyCode: VND
workStatus: accepted
sourceFigureIds: [e952e170-22cb-4ae7-bab7-fac5565d8d59, fc6d5e52-6fec-4391-ba71-f77b44f361db, f52fb3dd-c280-4720-9a30-2ff49b06c0d2]
idempotencyKey: 4d2083fe-854e-5681-a941-e2a5690dbb4b
requestId: fa91d074-b60a-50c7-9dd4-f0c2578e2985
```

### YM-02

```yaml
projectId: 22727545-1534-4c1a-9378-06969cb40f97
baseName: taskovia://c1/p3r/gate-e/vqh-project-cost-load/2026-09-16/v1/company/10000000-0000-4000-8000-000000000020/project/22727545-1534-4c1a-9378-06969cb40f97/item/YM-02
description: Chi phí khác cải tạo mặt bằng Yong Mei
amount: '2520088'
currencyCode: VND
workStatus: accepted
sourceFigureIds: [19a7d6a2-4af8-4bfb-bff8-7d4b6b20298b, be800f86-7581-44eb-9776-304a48741ab3]
idempotencyKey: a8de5905-a680-5ac2-ab72-c28b64bd7a40
requestId: 527f625a-7ec1-59c4-aa2b-6eeff2184d5d
```

### YM-03

```yaml
projectId: 22727545-1534-4c1a-9378-06969cb40f97
baseName: taskovia://c1/p3r/gate-e/vqh-project-cost-load/2026-09-16/v1/company/10000000-0000-4000-8000-000000000020/project/22727545-1534-4c1a-9378-06969cb40f97/item/YM-03
description: Chi phí nhân công trực tiếp cải tạo mặt bằng Yong Mei
amount: '8905000'
currencyCode: VND
workStatus: accepted
sourceFigureIds: [40067f8e-144e-4198-88ae-a490f35b481f]
idempotencyKey: 86295a9d-78b3-5c7e-9af3-7675dadc3cb0
requestId: c041176e-9bd2-5f8d-8ac8-4ffada0a32c0
```

### YM-04

```yaml
projectId: 22727545-1534-4c1a-9378-06969cb40f97
baseName: taskovia://c1/p3r/gate-e/vqh-project-cost-load/2026-09-16/v1/company/10000000-0000-4000-8000-000000000020/project/22727545-1534-4c1a-9378-06969cb40f97/item/YM-04
description: Giá trị nhân công khoán cải tạo mặt bằng Yong Mei
amount: '107530000'
currencyCode: VND
workStatus: accepted
sourceFigureIds: [998e5766-aed4-4b56-9a71-f3d458116af6]
idempotencyKey: 3c914cec-e7c4-52cf-b883-b26f82b90151
requestId: baeeeb8e-9fad-5b58-a59d-476c57af2658
```

## Expected post-load acceptance

```yaml
itemCount: 9
provenanceLinkCount: 15
eoGio:
  acceptedValue: 0
  acceptedCount: 0
  inProgressValue: 5641725896
  inProgressCount: 5
  unknownStatusValue: 0
  unknownStatusCount: 0
  totalTrackedWorkValue: 5641725896
yongMei:
  acceptedValue: 242562376
  acceptedCount: 4
  inProgressValue: 0
  inProgressCount: 0
  unknownStatusValue: 0
  unknownStatusCount: 0
  totalTrackedWorkValue: 242562376
realLoad: NOT_AUTHORIZED
gateF: NOT_STARTED
```
