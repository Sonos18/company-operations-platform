# C1 P3R Gate E VQH Project Cost Execution Packet v2

Status: PASS_PRELOAD_READY. This packet is prepared only; the real load remains NOT_AUTHORIZED and NOT_EXECUTED.

## Lineage and execution actor

~~~yaml
packetId: c1-p3r-gate-e-vqh-project-cost-load-2026-09-16-v2
packetVersion: v2
supersedes: c1-p3r-gate-e-vqh-project-cost-load-2026-09-16-v1
supersessionReason: execution actor changed to the provisioned VQH accountant
businessApprovalDate: 2026-09-16
actorId: c1e4499a-102b-4fec-8c41-0b02e1a89436
businessRole: accountant
executionCapabilityRole: c1_vqh_cost_operator
requiredExecutionCapability: cost.manage
realLoad: NOT_AUTHORIZED
realLoadState: NOT_EXECUTED
gateF: NOT_STARTED / NOT_AUTHORIZED
~~~

All other current actor capabilities are outside the authorized Gate E execution scope. This packet supersedes v1 only for its execution actor; v1 remains immutable historical evidence.

## Identifier convention

Identifiers are UUIDv5 under RFC URL namespace 6ba7b811-9dad-11d1-80b4-00c04fd430c8. The base name is:

~~~text
taskovia://c1/p3r/gate-e/vqh-project-cost-load/2026-09-16/v2/company/{companyId}/project/{projectId}/item/{logicalRef}
~~~

The idempotencyKey is UUIDv5 of baseName plus /idempotency, and requestId is UUIDv5 of baseName plus /request. Neither includes actor, mutable payload, source UUID, or runtime data.

## Execution packet

All items retain businessReference null; partyId, engagementId, componentId, and relevantDate are omitted. Common non-overlap confirmation: VQH_BUSINESS_APPROVED / 2026-09-16 / p3r-vqh-project-cost-confirmation-packet.md#non-overlap-approval.

### EOG-01

~~~yaml
projectId: 7e7e3904-d53b-4337-9360-22256887474a
baseName: taskovia://c1/p3r/gate-e/vqh-project-cost-load/2026-09-16/v2/company/10000000-0000-4000-8000-000000000020/project/7e7e3904-d53b-4337-9360-22256887474a/item/EOG-01
description: Chi phí vật tư công trình Eo Gió
amount: '3197669056'
currencyCode: VND
workStatus: in_progress
sourceFigureIds: [a3e5b2f3-7567-47bf-8b9f-d6eb4a3938ed, 6b09c829-0db1-4a1c-8fe4-c4955e332d81, ea6afa64-3378-4062-b692-2dc4d48931c4, be968b8c-221f-4d03-859f-4c58c75b86dd]
idempotencyKey: 62782b75-5313-5083-8645-ec8121ce4291
requestId: ab5d7529-0e49-52a3-ad58-c415cbfd5e09
~~~

### EOG-02

~~~yaml
projectId: 7e7e3904-d53b-4337-9360-22256887474a
baseName: taskovia://c1/p3r/gate-e/vqh-project-cost-load/2026-09-16/v2/company/10000000-0000-4000-8000-000000000020/project/7e7e3904-d53b-4337-9360-22256887474a/item/EOG-02
description: Chi phí nhân công trực tiếp công trình Eo Gió
amount: '1009392500'
currencyCode: VND
workStatus: in_progress
sourceFigureIds: [6bb42ded-22bc-4505-8d98-4a7570094f9b]
idempotencyKey: 1016e60c-8012-5477-b786-9b694aad1bfa
requestId: 87bdf375-8256-55e7-878c-68e785257858
~~~

### EOG-03

~~~yaml
projectId: 7e7e3904-d53b-4337-9360-22256887474a
baseName: taskovia://c1/p3r/gate-e/vqh-project-cost-load/2026-09-16/v2/company/10000000-0000-4000-8000-000000000020/project/7e7e3904-d53b-4337-9360-22256887474a/item/EOG-03
description: Giá trị nhân công khoán công trình Eo Gió
amount: '1188100400'
currencyCode: VND
workStatus: in_progress
sourceFigureIds: [d6ee8648-4da6-4cc6-a72b-92a866cd1e46]
idempotencyKey: 3a0f0c1a-de6e-525e-9344-14db889f6f94
requestId: e18ff5ff-8e64-50d0-b4fb-4b6558616e78
~~~

### EOG-04

~~~yaml
projectId: 7e7e3904-d53b-4337-9360-22256887474a
baseName: taskovia://c1/p3r/gate-e/vqh-project-cost-load/2026-09-16/v2/company/10000000-0000-4000-8000-000000000020/project/7e7e3904-d53b-4337-9360-22256887474a/item/EOG-04
description: Chi phí máy móc công trình Eo Gió
amount: '102974792'
currencyCode: VND
workStatus: in_progress
sourceFigureIds: [0e3d8e13-beec-474d-bc88-4975bc38aa66]
idempotencyKey: dbbbee6c-3987-57bb-8049-dad59bd97bcd
requestId: dd894058-c718-50fb-9bef-fbe6903dd9f7
~~~

### EOG-05

~~~yaml
projectId: 7e7e3904-d53b-4337-9360-22256887474a
baseName: taskovia://c1/p3r/gate-e/vqh-project-cost-load/2026-09-16/v2/company/10000000-0000-4000-8000-000000000020/project/7e7e3904-d53b-4337-9360-22256887474a/item/EOG-05
description: Chi phí khác công trình Eo Gió
amount: '143589148'
currencyCode: VND
workStatus: in_progress
sourceFigureIds: [f65ceb02-d8eb-4d13-b4b9-ae15cc030014]
idempotencyKey: 5c5596fe-d032-5307-99bf-05096714ee6c
requestId: 94f867e2-2532-5e87-8ad6-214f97de0170
~~~

### YM-01

~~~yaml
projectId: 22727545-1534-4c1a-9378-06969cb40f97
baseName: taskovia://c1/p3r/gate-e/vqh-project-cost-load/2026-09-16/v2/company/10000000-0000-4000-8000-000000000020/project/22727545-1534-4c1a-9378-06969cb40f97/item/YM-01
description: Chi phí vật tư cải tạo mặt bằng Yong Mei
amount: '123607288'
currencyCode: VND
workStatus: accepted
sourceFigureIds: [e952e170-22cb-4ae7-bab7-fac5565d8d59, fc6d5e52-6fec-4391-ba71-f77b44f361db, f52fb3dd-c280-4720-9a30-2ff49b06c0d2]
idempotencyKey: d7a80286-81b2-599d-978f-673e7db19213
requestId: bfee6da2-04fb-5741-bae3-9840fb9e01de
~~~

### YM-02

~~~yaml
projectId: 22727545-1534-4c1a-9378-06969cb40f97
baseName: taskovia://c1/p3r/gate-e/vqh-project-cost-load/2026-09-16/v2/company/10000000-0000-4000-8000-000000000020/project/22727545-1534-4c1a-9378-06969cb40f97/item/YM-02
description: Chi phí khác cải tạo mặt bằng Yong Mei
amount: '2520088'
currencyCode: VND
workStatus: accepted
sourceFigureIds: [19a7d6a2-4af8-4bfb-bff8-7d4b6b20298b, be800f86-7581-44eb-9776-304a48741ab3]
idempotencyKey: bb0e5eb1-6bca-5880-b1b6-2413c8e093c0
requestId: 7933aa5e-e034-5c66-8558-781bfcdd92ec
~~~

### YM-03

~~~yaml
projectId: 22727545-1534-4c1a-9378-06969cb40f97
baseName: taskovia://c1/p3r/gate-e/vqh-project-cost-load/2026-09-16/v2/company/10000000-0000-4000-8000-000000000020/project/22727545-1534-4c1a-9378-06969cb40f97/item/YM-03
description: Chi phí nhân công trực tiếp cải tạo mặt bằng Yong Mei
amount: '8905000'
currencyCode: VND
workStatus: accepted
sourceFigureIds: [40067f8e-144e-4198-88ae-a490f35b481f]
idempotencyKey: 9ecbc169-4b27-56a8-93de-9483cbde04db
requestId: 974e56c4-39b2-5200-8f17-624c9cfc1587
~~~

### YM-04

~~~yaml
projectId: 22727545-1534-4c1a-9378-06969cb40f97
baseName: taskovia://c1/p3r/gate-e/vqh-project-cost-load/2026-09-16/v2/company/10000000-0000-4000-8000-000000000020/project/22727545-1534-4c1a-9378-06969cb40f97/item/YM-04
description: Giá trị nhân công khoán cải tạo mặt bằng Yong Mei
amount: '107530000'
currencyCode: VND
workStatus: accepted
sourceFigureIds: [998e5766-aed4-4b56-9a71-f3d458116af6]
idempotencyKey: d655137e-16df-545f-a624-dfc98f068bf3
requestId: f0c72471-05cc-5f40-8310-eefd0f36d87a
~~~

## Expected post-load acceptance

~~~yaml
itemCount: 9
provenanceLinkCount: 15
eoGio:
  projectId: 7e7e3904-d53b-4337-9360-22256887474a
  acceptedValue: 0
  acceptedCount: 0
  inProgressValue: 5641725896
  inProgressCount: 5
  unknownStatusValue: 0
  unknownCount: 0
  totalTrackedWorkValue: 5641725896
  itemCount: 5
yongMei:
  projectId: 22727545-1534-4c1a-9378-06969cb40f97
  acceptedValue: 242562376
  acceptedCount: 4
  inProgressValue: 0
  inProgressCount: 0
  unknownStatusValue: 0
  unknownCount: 0
  totalTrackedWorkValue: 242562376
  itemCount: 4
~~~
