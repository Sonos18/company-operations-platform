# Taskovia C1 Acceptance Map

**Approved execution base:** `b2731f4ef72c10cbcafe9f176cc1e2b54b9c8cfd`
**Spec baseline:** Taskovia C1 v1.1
**Status at P0:** allocation only; no C1 application, migration, fixture, or Cloud write has run.

## Evidence Rule

An acceptance row is **partial** until all listed layers have evidence: shared schema/unit, server/HTTP, database/RLS/storage when applicable, UI/E2E when user-visible, and the P6 synthetic acceptance run. A source-file inspection, mock-only test, report commit, or real workbook presence is never final acceptance evidence.

| ID | Build phase | Verification phase | Required evidence / partial condition |
| --- | --- | --- | --- |
| A01 | P1 | P1, P6 | Project register HTTP + DB fixture creates `legacy_import` project without Opportunity/Journey. |
| A02 | P1 | P1, P6 | Composite FKs and HTTP test prove party/project engagements/components do not merge. |
| A03 | P2 | P2, P6 | Source/version/file draft exists before document; summary unchanged. |
| A04 | P3 | P3, P6 | Published unverified document remains labeled and excluded from confirmed KPI. |
| A05 | P3 | P3, P6 | Opening cutoff/reporting projection proves no upload-date delta and payable may remain. |
| A06 | P3 | P3, P6 | DB command rejects detail/baseline overlap; no invented split. |
| A07 | P3 | P3, P6 | Source claim/validation rejects total plus detail double posting. |
| A08 | P3 | P3, P5, P6 | Line kinds preserve labor/bonus/allowance and no paid/tax inference. |
| A09 | P3 | P3, P5, P6 | Service dates survive month boundary; report uses confirmed reporting date. |
| A10 | P3 | P3, P5, P6 | Tax basis partition tests preserve exclusive/inclusive/not-separated/unknown. |
| A11 | P3 | P3, P4, P6 | Retention/offset line semantics and F01/F08 report proof. |
| A12 | P4 | P4, P6 | Advance, application, refund and F09 allocation proof. |
| A13 | P4 | P4, P5, P6 | Overpayment remains unallocated cash; no negative-payable clamp. |
| A14 | P2 | P2, P4, P5, P6 | Reported balance is source figure; computed KPI unavailable without allocation. |
| A15 | P4 | P4, P5, P6 | Coverage assertion/state proves partial/unavailable rather than false project total. |
| A16 | P3 | P3, P6 | Idempotency/business identity/hash reuse prevents a duplicate effect. |
| A17 | P3 | P3, P6 | Command receipt replay returns one result/event; payload mismatch is 409. |
| A18 | P1 | P1, P6 | Mutable master/source draft expectedVersion rejects stale write. |
| A19 | P4 | P4, P6 | Locked concurrent allocation test admits at most one valid total. |
| A20 | P4 | P4, P6 | Correction preview resolves dependencies atomically or returns conflict. |
| A21 | P2 | P2, P3, P6 | New immutable version preserves old bytes/links and does not repost facts. |
| A22 | P1 | P1, P2, P5, P6 | Cost viewer navigation, financial/source/file capability matrix, no mutation route. |
| A23 | P1 | P2, P5, P6 | Project-only engineer denied amounts, source, file, events, and summary. |
| A24 | P1 | P1–P4, P6 | Same-tenant/different-company and different-tenant RLS/FK/storage/RPC denial. |
| A25 | P1 | P5, P6 | Company-generation request cancellation clears draft/preview/candidate state. |
| A26 | P1 | P2–P4, P6 | Revoked membership/permission rejects commands and replay; prior URL TTL caveat documented. |
| A27 | P2 | P2, P6 | Server MIME/signature/size tests reject fake MIME, oversize, and XLSM. |
| A28 | P2 | P2, P6 | Static XLSX preview keeps cached/missing/error/hidden state and resource limits. |
| A29 | P2 | P2, P6 | Failed finalize/publish never exposes ready source or partial financial effect. |
| A30 | P1 | P3, P4, P6 | Decimal string round trip above safe integer; invalid scale rejects. |
| A31 | P4 | P4, P5, P6 | Dispute preserves history/amount and returns conflicted projection. |
| A32 | P3 | P3, P4, P6 | Commitment variation and valuation remain separate; cost is not double-added. |
| A33 | P1 | P2–P4, P6 | Restricted audit/source metadata prevents broad readers seeing money or PII. |
| A34 | P1 | P6 | C1 IDs/file links/cumulative contract retained by a forward-compatible fixture only; no C2/C3 implementation. |
| A35 | P2 | P6 | Synthetic tests prove core behavior; no real import/pilot claim. |
| A36 | P1 | P1, P5, P6 | Role union checks effective capabilities, not a misleading read-only label. |
| A37 | P1 | P1, P6 | Code/schema compatibility precedes permission grant/module enablement. |
| A38 | P3 | P3, P6 | Later confirmation activates same document once; replacement blocks late original activation. |
| A39 | P2 | P2, P6 | Mixed source upload stores no placeholder project/party/fact. |
| A40 | P2 | P2, P5, P6 | Shared source/version/figure visible to source viewer, with no KPI/confirmation side effect. |
| A41 | P2 | P3, P6 | Per-selection semantics/review required; no column-wide mapping. |
| A42 | P3 | P3, P6 | One financial fact can have multiple active evidence links; subtotal remains non-posting. |
| A43 | P2 | P4, P5, P6 | Whole-project source total returns `not_comparable`/null difference for engagement KPI. |
| A44 | P4 | P4, P5, P6 | Comparable partial reports a labeled partial difference without raising completeness. |
| A45 | P2 | P2, P6 | Filename is not scope; pending source requires confirmed mapping. |
| A46 | P2 | P2, P3, P6 | Blocking issue stops only uncertain selection; other valid source evidence proceeds. |
| A47 | P2 | P3, P5, P6 | Raw invalid/14-day/year-crossing dates retained; fact reporting date still confirmed. |
| A48 | P2 | P4, P5, P6 | Exact and rounded figures remain separate, non-posting, and non-adjusting. |
| A49 | P2 | P2, P6 | Hidden/error metadata visible; unused error does not block a valid selection. |
| A50 | P3 | P4, P5, P6 | Payer label does not change owner; third-party allocation requires acceptance reference. |
| A51 | P2 | P3, P6 | Version v2 reuses/evidences old fact and posts only a distinct new identity. |
| A52 | P2 | P2, P5, P6 | Linked-document actor without source+file rights cannot obtain metadata/preview/URL/object. |
| A53 | P3 | P3, P6 | Locator normalization plus unique active occurrence claim blocks duplicate publish. |
| A54 | P3 | P4, P6 | Multiple completed engagements create separate openings; retention stays outstanding. |
| A55 | P3 | P3, P6 | Legacy `reported_balance` financial-line input rejects; source figure owns the value. |
| A56 | P2 | P2, P3, P6 | Shared figure revision/history and source mapping never rewrite past fact scope/amount. |
| A57 | P4 | P4, P5, P6 | New source issue downgrades coverage/conflicts projection; resolution does not auto-complete. |
| A58 | P2 | P3, P4, P6 | Payment request/contract deduction without semantics is non-posting source data. |
| A59 | P3 | P3, P6 | Evidence draft adds provenance/file links/audit without a second financial activation. |
| A60 | P2 | P3, P6 | Confirmed source cannot bypass selection scope/semantics normalization guards. |
| A61 | P2 | P3, P6 | Unknown cutoff/engagement remains source/figure; no fake opening or upload date. |
| A62 | P4 | P4, P5, P6 | Possible duplicate opens issue/conflict; correction resolves dependencies without deletion/hiding. |

## Invariant Allocation

| ID | Build phase | Verification phase | Evidence |
| --- | --- | --- | --- |
| I01 | P1 | P1–P4, P6 | Composite scope FKs, server context, two-company/two-tenant SQL. |
| I02 | P3 | P3, P6 | RLS/grants deny direct financial writes; command/RPC permission tests. |
| I03 | P2 | P2–P4, P6 | Immutable file/source/figure/fact history and append-only revisions. |
| I04 | P3 | P3, P6 | One original opening per engagement and overlap guard. |
| I05 | P3 | P3, P5, P6 | Baseline cutoff is not an upload-date report delta. |
| I06 | P3 | P3, P6 | Confirmation is explicit and disputed/unverified does not self-confirm. |
| I07 | P4 | P4, P6 | Cash, advance, and allocation totals are independent. |
| I08 | P3 | P3, P4, P6 | Commitment variation cannot duplicate recognized value. |
| I09 | P3 | P3–P5, P6 | Currency/tax partitions and unknown values survive all projections. |
| I10 | P4 | P4, P6 | Locks/constraints prevent excess refund/release/allocation/race. |
| I11 | P3 | P3, P6 | System totals are validation only; no total line double count. |
| I12 | P3 | P3–P4, P6 | Publish/line/allocation/audit/receipt/coverage commit atomically. |
| I13 | P2 | P2–P3, P6 | Storage readiness is separate from DB; publish requires ready immutable objects. |
| I14 | P1 | P5, P6 | Company/logout clears scopes and stale responses/mutations. |
| I15 | P2 | P2, P6 | Intake/share/figure does not create financial posting or placeholder engagement. |
| I16 | P2 | P3, P6 | Publish requires mapping, shared ready source, and resolved blocking issues. |
| I17 | P3 | P3, P6 | Active occurrence/economic-role claim plus evidence link rules. |
| I18 | P2 | P4–P5, P6 | Source totals stay separate and comparison validates scope/basis/period. |
| I19 | P2 | P4–P5, P6 | Issue changes coverage/conflict without deleting historic fact. |
| I20 | P2 | P2, P6 | Private file API, storage metadata, preview, URL all require source+file capability. |
| I21 | P2 | P3, P5, P6 | Historical date/error/rounding raw values are not auto-repaired. |
| I22 | P3 | P4, P6 | Payer label never changes owner; allocation acceptance is explicit. |
| I23 | P3 | P3, P6 | Evidence/source links affect provenance only, never activation twice. |
| I24 | P2 | P2–P3, P6 | Source figure revision is single balance location with immutable history. |

## Arithmetic Examples

| ID | Implementation phase | Verification phase | Required result |
| --- | --- | --- | --- |
| F01 | P4 | P4, P5, P6 | C=100, K=5, P=40, A=20, R=10 yields payable 35, outside-retention 25, unallocated advance 10 from advance 30. |
| F02 | P4 | P4, P5, P6 | C=100/cash=120/allocation=100 leaves 20 unallocated cash; no deletion or clamp. |
| F03 | P3 | P3, P5, P6 | Net 100 with unknown tax/liability remains incomplete; gross is not inferred. |
| F04 | P3 | P3, P5, P6 | Gross 110/net 100/tax 10 preserves all source values without a default rate. |
| F05 | P3 | P3, P5, P6 | Opening 200 to 31/08 plus 30 on 05/09 gives cumulative 230 and September delta 30. |
| F06 | P3 | P3, P4, P6 | Variation 20 included in valuation 120 reports recognized value 120, not 140. |
| F07 | P3 | P3, P5, P6 | Labor 18 + bonus 2 + allowance .3 is one total or components, never both/paid/tax inference. |
| F08 | P4 | P4, P5, P6 | Retention release 10 changes R only; liability and cash remain unchanged. |
| F09 | P4 | P4, P5, P6 | Advance 30, apply 20, refund 10 gives zero unallocated advance and net cash 20. |
| F10 | P2 | P4, P5, P6 | Source reported payable 50 remains labeled source amount; computed is unavailable without P/A/coverage. |

## Deferred Compatibility Boundary

C2/C3 are represented only by stable C1 IDs, source contracts, and forward-compatible migrations. No C1 task creates attendance, rate, settlement, period, or approval engines. A34's migration compatibility fixture is evidence for preserving C1 records, not an authorization to implement or test C2/C3.
