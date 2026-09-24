---
name: jev-router-shadow
description: >
  Benchmark TypeSafe Jev as an advisory router for Codex work without changing Codex behavior.
  Use when the user asks to test, evaluate, benchmark, or develop the Jev routing experiment.
  This skill is shadow-only: Jev may classify task mode, reasoning depth, and relevant context domains,
  but its output never authorizes edits, commands, merges, deployments, or security/data decisions.
---

# Jev Router Shadow

Use this skill only for the repository's experimental Jev routing benchmark.
Read `.agents/skills/typesafe-ai/SKILL.md` first for current TypeSafe guidance and live-doc requirements.

## Contract

- Jev is advisory only. Continue to reason and act exactly as the repository and current task require.
- Do not use Jev output as permission for a mutation, merge, deployment, database action, or destructive operation.
- Deterministic repository rules, tests, security boundaries, and explicit user authorization always take precedence.
- Never put secrets, credentials, tokens, or unnecessary sensitive content into router state.
- Treat TypeSafe as an external data processor: only send repository/task data approved for third-party processing. The CLI blocks common secret-bearing keys and obvious bearer/private-key values, but that guard is intentionally conservative and not a complete DLP system.
- Prefer a compact English routing summary when practical because Jev's current documentation identifies English as its strongest language; preserve exact code identifiers and facts that affect routing.
- Keep router state compact and evidence-based. Do not send an entire repository or large file when a summary is sufficient.
- Do not treat confidence as correctness. Shadow output exists to measure agreement and usefulness before any active routing is enabled.

## Run

Create a temporary JSON state outside tracked source when possible. It must contain a non-empty `request` string and may include compact repository facts or evidence, for example:

```json
{
  "request": "Review PR 18 and determine which context domains are relevant.",
  "repository": {
    "branch": "feat/example",
    "changed_areas": ["frontend", "tests"]
  },
  "evidence": {
    "review_findings": 3,
    "tests_known": true
  }
}
```

Run:

```bash
pnpm jev:router:shadow -- /path/to/state.json
```

The command prints an advisory JSON summary and appends a telemetry record to
`.jev-router-shadow/decisions.jsonl` unless `--no-log` is supplied. The log stores a SHA-256 hash of the state, not the raw state.

Use `--model <id>` or `JEV_ROUTER_MODEL` only for an intentional benchmark change. The v0 default is pinned to `jev-1.13.0` so comparisons do not silently move when an alias changes.

## Interpret

The router returns:

- primary `taskMode`
- `reasoningDepth`
- probability that evidence is insufficient
- independent Noul probabilities for frontend, backend, database, security, testing, Git/GitHub, and docs context
- TypeSafe model, usage, and request latency

Do not add universal cutoffs in shadow mode. Collect representative task data first and calibrate thresholds from observed outcomes.
