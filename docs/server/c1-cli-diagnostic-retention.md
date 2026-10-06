# Shared native CLI diagnostic retention

Source-only correction; no SQL replay, migration apply, provider call, secret or deployment change.

CLI 2.114.0 emits linked-query HTTP failures as a JSON Error envelope with typed
LegacyDbQueryUnexpectedStatusError and message containing 'unexpected status 400:'
followed by the API JSON body. The former common formatter parsed only the outer
message and expected ERROR/SQLSTATE prefixes there. Azure reused that same parser;
it did not bypass a separate safe transport. Previous synthetic fixtures covered
flat JSON and prefixed text, leaving this envelope and ordinary bare primary
messages untested.

The common transport now unwraps that typed envelope at bounded depth, reads only
authoritative error/message/code/context fields, and retains native diagnostic
schemaVersion 2. It keeps SQLSTATE, known guard classification, validated location,
bounded redacted primaryMessage (at most 512 UTF8 bytes), normalized pre-redaction
primaryMessageSha256, truncation flag, HTTP status and original captured stream
byte counts/hashes. The diagnostic stays at most 2048 serialized bytes. Details,
hints and SQL/query dumps are excluded. Unknown guard/function names remain
withheld or hashed. Ordinary primary wording is retained independently of the
known guard allowlist. Quote-aware masking prevents quoted values from supplying
SQLSTATE, category or guard attribution and handles escaped/doubled/unfinished
quotes. Native context is accepted only from the adjacent diagnostic line.

Timeout, output overflow, unavailable CLI and invalid UTF8/JSON/result-shape
errors attach the same metadata while retaining their existing operation codes.
Their primary wording identifies the command failure rather than interpreting
untrusted partial/result bytes. streamsComplete is false when only partial
captured output is available. Stream hashes do not reconstruct discarded bytes.
Primary fingerprints hash the normalized primary before redaction/truncation,
rather than the full original stream; stream fingerprints cover captured bytes.

The shared runner archives every command diagnostic with a commandNumber, covering
preflight, clock, batch, cleanup, postflight and final capture. Batch diagnostic
labels remain available. Wrappers and secondary lock/link/directory/lease
finalizers preserve the command primary. Archive-write failure fails closed and
retains the diagnostic on the propagated error; it cannot guarantee durable disk
evidence when disk writes fail.

Fixtures explicitly distinguish reconstructed installed-CLI envelopes from captured
live stdout. The original failed run retained only stream counts and hashes, so
its exact CLI bytes are unavailable. Its SQLSTATE/primary/context were recovered
separately from a narrow job-tagged read-only DEV log query.

This change does not alter SQL admission, dependency allowlists, migration files,
sequence budgets, Azure gates or one-shot reservations. The previously consumed
manifest remains consumed. A future execution requires a separately reviewed
source packet and new explicit authorization.
