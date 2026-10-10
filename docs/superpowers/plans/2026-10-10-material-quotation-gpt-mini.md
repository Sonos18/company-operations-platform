# A3 GPT-5.4 mini Implementation Plan

> For agentic workers: execute the approved request with subagent-driven-development for the bounded backend task; AGY owns Vue.

Goal: PDF + approved proposal -> GPT-5.4 mini JSON -> safe draft autofill and final buyer review.
Spec: handoffs/2026-10-10-a3-gpt-mini-design.md.
Base: b4172ce930d6a2044ea20423522953295e7678de.
Remote worktree: /data/remote-worktrees/materials-alpha-a3-gpt-mini; branch codex/materials-alpha-a3-gpt-mini.

Global constraints: remote source only, no Vue edits by Codex, no dependencies/migrations/types, no Cloud/provider calls/build/test suites/deploy, retain A1/A2 contracts. Direct OpenAI fixed gpt-5.4-mini, private server secret. Scope flag is suggestion only, exact Decimal comparison, no AI-created business command.

- [ ] Backend worker: create shared material-quotation-analysis schema; private provider/extraction service/repository; one proposal-scoped POST route using existing auth/RLS; add HTTP repository method/type and endpoint manifest; private runtime key; one focused runnable mocked unit test source. Use existing helpers and direct fetch; no generic framework/provider abstraction or new SDK. Include design/plan copy in remote docs paths.
- [ ] Root review: exact diff, scope binding before/after provider, secret/HTTP failures, duplicate mappings, tax/currency, Decimal guards and split order preservation. Resolve findings in source, no test execution claim.
- [ ] Freeze accepted backend SHA; prepare one-file AGY MaterialOrderCreatePanel.vue prompt with exact API/interface and stale-write/busy/NCC reset requirements. User relays AGY authoring; do not invoke another chat.
- [ ] When AGY source is returned, review and mechanically integrate, then freeze publication/build packet. This dependent stage cannot be fabricated in the backend source turn.

Review focus: stale version/context; cross-proposal/revision/file scope; one PDF row reused for multiple proposal lines; ambiguous quantities/VAT/currency; buyer edits racing extraction or supplier reset creating upload loops.
