# Taskovia C1 P2 final synthetic command-path acceptance packet

Status: `NOT_EXECUTED — REQUIRES EXPLICIT CLOUD DEV AUTHORIZATION`

Execution source must be the reviewed implementation SHA or an explicitly approved successor. Target is canonical Cloud DEV only. Before execution, verify clean Git state, migration parity, deployed endpoint SHA, authenticated synthetic actor membership, company C1 enablement, both `cost.source.read` and `cost.prepare`, and an explicitly reviewed adapter registration. Do not create those prerequisites inside the run.

Prepare fresh synthetic workbooks and a strict VQH-family synthetic manifest outside the repository. Run the offline `c1:import:prepare` command; require exact byte digests, deterministic manifest digest, reviewed counts, provenance coverage, and zero network calls. Then run `db:dev:c1:import` once with a fixed authorization reference, runId, idempotencyKey, input digests, manifest digest, bindings, authenticated Cloud DEV endpoint, and durable capture. Verify canonical result/read-back, same-key replay, different-payload conflict, current-auth replay denial, cross-company denial, zero master/financial effect, audit redaction, and rollback/residue for all run-owned synthetic setup.

Unknown completion forbids resubmission: use only `db:dev:c1:import:get-result` with the same company/run identity. Stop on target, identity, permission, module, adapter, digest, structure, result, residue, or capture mismatch. Permit one execution and one reconciliation only unless a later amendment says otherwise.

Run a separately approved simultaneous-session test for the P2 import identity/serialization invariant required by inherited v1.1 §6.10. Record `concurrency_execution = NOT_RUN` until that occurs; sequential replay is insufficient. This packet does not authorize load testing, real data, registration/grants/enablement, cleanup, P3, Production, or Local DB.
