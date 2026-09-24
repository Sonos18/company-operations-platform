# Jev Router v0 — Shadow Mode

Status: experimental, advisory-only.

## Goal

Measure whether TypeSafe Jev can cheaply identify which context and reasoning depth a Codex task appears to need before any active routing is introduced.

This phase deliberately does **not** change Codex behavior. Jev output is telemetry, not authority.

## Architecture

1. Codex or a developer prepares a compact JSON state containing the request and only the evidence needed for routing.
2. `scripts/run-jev-router-shadow.mjs` builds one TypeSafe System One request with multiple independent questions over the same state.
3. Jev returns a task-mode Choice, a reasoning-depth Choice, one evidence-sufficiency Noul, and independent context-domain Noul signals.
4. The CLI prints the decision summary.
5. Shadow telemetry is appended to `.jev-router-shadow/decisions.jsonl`. Raw state is not persisted; only a SHA-256 state hash is logged.
6. Codex continues using repository rules, its own reasoning, deterministic checks, and user authorization exactly as before.

## Why shadow first

Typed output guarantees shape, not correctness. Choice confidence is derived from the option distribution and must not be interpreted as permission to act. Thresholds will be selected only after measuring this repository's actual tasks.

## Input contract

The state must be a JSON object with a non-empty `request` string. Additional fields are intentionally open so experiments can provide compact facts such as branch, changed areas, review findings, or verification state.

Avoid raw secrets, credentials, personal data, full source trees, or large unfiltered documents. The v0 contract rejects common secret-bearing keys and obvious bearer/private-key values, and caps serialized state at 24,000 bytes. These checks reduce accidental leakage; they are not a substitute for repository/data-handling policy. The 24 KB byte ceiling deliberately leaves headroom below Jev's documented 32k-token state-plus-longest-question limit; it is a conservative byte guard, not a token estimator.

### External processing boundary

The raw router state is transmitted to TypeSafe for evaluation even though it is not written to the local shadow telemetry file. Treat TypeSafe as an external processor and send only data that is approved for that purpose.

At implementation time (2026-09-24), TypeSafe documents that customer requests/responses are not used to train Jev and that zero-data-retention is an enterprise option. Re-check the provider's current terms before expanding the router to more sensitive Taskovia data. Shadow mode does not change this external-processing boundary.

## Output contract

The CLI returns:

- `mode: "shadow"`
- `authority: "advisory_only"`
- `stateSha256`
- exact returned model id
- TypeSafe request latency and token usage
- `taskMode` Choice value/confidence/probabilities
- `reasoningDepth` Choice value/confidence/probabilities
- `evidenceInsufficient` Noul probability
- independent context probabilities for `frontend`, `backend`, `database`, `security`, `testing`, `git`, and `docs`

No output field is an authorization gate in v0.

## Commands

```bash
pnpm jev:router:shadow -- /path/to/state.json
pnpm jev:router:shadow -- /path/to/state.json --no-log
pnpm jev:router:shadow -- /path/to/state.json --model jev-1.13.0
```

Environment:

- `TYPESAFE_API_KEY` — required by the TypeSafe API client.
- `JEV_ROUTER_MODEL` — optional override. The default is pinned to `jev-1.13.0` for stable benchmarking.

## Safety hierarchy

Jev never outranks repository invariants, deterministic rules, tests, typecheck/lint/build results, security controls, database constraints, or explicit human authorization.

High-risk or irreversible operations remain outside the router's authority, including database mutations, production actions, merges, deployments, security-boundary changes, and destructive operations.

## v0 acceptance criteria

- Existing `run-typesafe-jev.mjs` behavior remains untouched.
- Router code is opt-in and shadow-only.
- A single TypeSafe request evaluates all routing questions over one compact state.
- Raw router state is not written to telemetry.
- Model id, latency, and TypeSafe usage are recorded.
- Core request/response shaping has unit tests.
- No database, runtime application, or production behavior changes.

## Next experiment

After representative shadow samples exist, add an outcome/annotation step and compare Jev routing against the work Codex actually performed. Only then evaluate whether active context selection is worthwhile. Codex token telemetry should be added separately if the available Codex runtime exposes a trustworthy per-task measurement; do not estimate it from prompt length.
