# C1 P3R VQH Project Cost Confirmation Packet

## Gate E business confirmation

```text
Gate E business confirmation status:
VQH_BUSINESS_APPROVED

Approval date:
2026-09-16

Approved logical Project Cost Items:
9

Real VQH Project Cost load:
NOT_EXECUTED

Cloud DEV mutation authorization:
NOT_GRANTED
```

The user is acting as the VQH representative and has approved the business interpretation, amounts, currency default, statuses, and non-overlap decomposition below. This approval replaces the need for another VQH confirmation round for these exact nine items.

Any future material change to Project, logical business item, amount, status, or non-overlap decomposition requires renewed approval for the affected item.

## Approved global decisions

```text
domain:
management-tracked Project Cost

currency:
VND

currency_default:
VQH default VND explicitly approved for these nine items

business_reference:
NULL unless genuine source-backed reference exists

party:
optional

engagement:
optional

component:
optional

relevant_date:
optional

category:
none

source_figures:
provenance/evidence only

summary_totals:
control totals only

cash/payment/advance/balance:
not additive Project Cost

revenue/profit/tax:
not Project Cost

non_overlap:
approved for exactly the nine-item decomposition
```

Do not manufacture Party, Engagement, Component, category, or business reference.

## Approved Eo Gió items

Project: `Eo Gió`
Project ID: `7e7e3904-d53b-4337-9360-22256887474a`

All five items are `in_progress` because Eo Gió work remains in progress.

| Ref | Business item | Amount VND | Status |
| --- | --- | ---: | --- |
| EOG-01 | Chi phí vật tư công trình Eo Gió | 3197669056 | `in_progress` |
| EOG-02 | Chi phí nhân công trực tiếp công trình Eo Gió | 1009392500 | `in_progress` |
| EOG-03 | Giá trị nhân công khoán công trình Eo Gió | 1188100400 | `in_progress` |
| EOG-04 | Chi phí máy móc công trình Eo Gió | 102974792 | `in_progress` |
| EOG-05 | Chi phí khác công trình Eo Gió | 143589148 | `in_progress` |

Control total:

```text
3197669056
+ 1009392500
+ 1188100400
+ 102974792
+ 143589148
= 5641725896
```

This reconciles to `fig-eo-settlement-cost = 5641725896`. That source figure is a CONTROL TOTAL only; it is not a sixth Project Cost Item.

### Eo Gió provenance interpretation

#### EOG-01 material

Primary/control evidence: `fig-eo-cost-material`

Supporting decomposition:

- `fig-eo-material-cash = 592613138`
- `fig-eo-material-vqh = 2594555918`
- `fig-eo-material-laihuy = 10500000`

These sum to `3197669056`. They are supporting provenance, not three extra Project Cost Items. `fig-eo-inventory-inflow` and `fig-eo-cash-ledger-total` remain reference-only.

#### EOG-02 direct labor

Primary: `fig-eo-labor-actual = 1009392500`

`fig-eo-labor-rounded = 1009393000` is rounded comparison evidence only and must not create another item.

#### EOG-03 contract labor

Primary: `fig-eo-contract-labor-value = 1188100400`

`fig-eo-contract-labor-advanced` and `fig-eo-contract-labor-balance` are context only. Advance and balance must not become additive Project Cost.

#### EOG-04 machinery

Primary: `fig-eo-machinery-total = 102974792`

#### EOG-05 other

Primary: `fig-eo-other-total = 143589148`

Aggregate control: `fig-eo-cost-other = 246563940`

```text
102974792 + 143589148 = 246563940
```

## Approved Yong Mei items

Project: `Yong Mei`
Project ID: `22727545-1534-4c1a-9378-06969cb40f97`

All four items are `accepted` because the Yong Mei warehouse renovation / cải tạo mặt bằng work is complete and accepted for management Project Cost purposes. This does not mean paid, settled, posted to accounting, invoiced, or zero balance.

| Ref | Business item | Amount VND | Status |
| --- | --- | ---: | --- |
| YM-01 | Chi phí vật tư cải tạo mặt bằng Yong Mei | 123607288 | `accepted` |
| YM-02 | Chi phí khác cải tạo mặt bằng Yong Mei | 2520088 | `accepted` |
| YM-03 | Chi phí nhân công trực tiếp cải tạo mặt bằng Yong Mei | 8905000 | `accepted` |
| YM-04 | Giá trị nhân công khoán cải tạo mặt bằng Yong Mei | 107530000 | `accepted` |

Control total:

```text
123607288
+ 2520088
+ 8905000
+ 107530000
= 242562376
```

This reconciles to `fig-ym-settlement-cost = 242562376`. That source figure is a CONTROL TOTAL only; it is not a fifth Project Cost Item.

### Yong Mei provenance interpretation

#### YM-01 material

Primary: `fig-ym-cost-material = 123607288`

Supporting decomposition:

- `fig-ym-material-g = 10108000`
- `fig-ym-material-h = 113499288`

```text
10108000 + 113499288 = 123607288
```

`fig-ym-purchase-net`, `fig-ym-purchase-vat`, and `fig-ym-purchase-gross` remain purchase-invoice evidence/reference and must not become separate Project Cost Items.

#### YM-02 other

`fig-ym-cost-other` and `fig-ym-other-total` both refer to the same logical value, `2520088`. Create only ONE logical Project Cost Item.

#### YM-03 direct labor

Primary: `fig-ym-direct-labor = 8905000`

Aggregate control: `fig-ym-cost-labor`

#### YM-04 contract labor

Primary: `fig-ym-contract-labor-value = 107530000`

Contextual decomposition:

- `fig-ym-contract-labor-paid = 102153500`
- `fig-ym-contract-labor-balance = 5376500`

```text
102153500 + 5376500 = 107530000
```

Payment and balance figures remain contextual evidence and must not become additive Project Cost Items.

## Explicitly excluded accounting and context figures

Revenue, profit, cash, payment, balance, sales, tax, advance, and duplicated summary values are not automatically Project Cost Items. Do not create additive Project Cost Items from Eo Gió revenue, profit, received cash, outstanding balance, or advance; or from Yong Mei contract balance, sales figures, VAT figures, revenue, profit, or paid amount. They may remain provenance/context only where relevant.

## Expected aggregate after an eventual load

This is an EXPECTED POST-LOAD acceptance target, not current Cloud DEV state.

| Project | Accepted value | In-progress value | Unknown value | Total tracked work value | Count |
| --- | ---: | ---: | ---: | ---: | ---: |
| Eo Gió | 0 | 5641725896 | 0 | 5641725896 | 5 |
| Yong Mei | 242562376 | 0 | 0 | 242562376 | 4 |

## Non-overlap approval

The VQH representative approves the following initial decomposition as mutually non-overlapping management Project Cost:

```text
Eo Gió:
material
+ direct labor
+ contract labor
+ machinery
+ other

Yong Mei:
material
+ other
+ direct labor
+ contract labor
```

Summary figures and lower-level decompositions must not be added again. This satisfies the business non-overlap confirmation for these exact items.

## Real-data execution boundary

```text
BUSINESS APPROVAL != CLOUD EXECUTION AUTHORIZATION
```

No real Project Cost record has been created by this approval. No Cloud command is authorized by this checkpoint. Before any real mutation there must be a separate execution packet and explicit user authorization.

The future load must use the controlled Project Cost create command. Raw `INSERT` into `project_cost_items` or `project_cost_item_sources` is forbidden. Production remains forbidden.

## Canonical gate sequence

```text
Gate D:
COMPLETE

Gate E — VQH candidate confirmation:
BUSINESS_APPROVED

Gate E — real VQH load:
NOT_EXECUTED
NOT_AUTHORIZED

Gate F — aggregation/API hardening:
NOT_STARTED

Gate G — Director Project Cost UI:
NOT_STARTED

Gate H — acceptance:
NOT_STARTED
```
