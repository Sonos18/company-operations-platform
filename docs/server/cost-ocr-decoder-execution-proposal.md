# Minimal terminable image decoder boundary — proposal only

No runtime behavior change is implemented by this proposal. The accompanying release change fixes decoder packaging only. Keep both Azure gates false. No broad queue, service, DB table, provider/configuration or infrastructure change is proposed.

## Problem and recommended boundary

Current hasCompleteAzureF0Image performs synchronous PNG inflation/JPEG decoding in the HTTP server process. Input/pixel/library allocation guards do not give a hard cancellation deadline or a hard total RSS cap. Provider HTTP timeout cannot interrupt that work.

Recommend one short-lived built-in node:child_process child per admitted image. A child can be force-killed even while native synchronous code is running; failure/OOM affects the child rather than the server. Keep the existing pure guard/decoder unchanged as the sole validation implementation; the parent owns immutable original identity, SHA256 and fresh actor/request authorization. Do not accept positive inspection data from the browser or a caller-supplied worker.

Proposed limits for review, not configured here:
- Existing original cap4,000,000bytes, dimensions50–4096, pixels4,000,000 and structural chunk/segment limits stay unchanged.
- Fixed5,000ms deadline measured from spawn through complete child response. On expiry/abort kill SIGKILL, reject any late output and await the owned child's exit before releasing its permit. Synchronous decoding gets no main-thread fallback.
- One live decoder child per server process; immediate fail-closed busy/manual-review outcome instead of a queue. This is per-process, not a claim about all replicas.
- Child Node flags --max-old-space-size=64 and --max-semi-space-size=8; existing JPEG maxMemoryUsageInMB64 and exact PNG inflation/output bounds remain. Cap raw child input at4,000,000bytes and diagnostic/output at1KiB. No encoded-image/base64 or pixel buffers are returned.
- These V8/library/input caps are enforceable scopes, NOT a hard total RSS/OS-memory guarantee. A proposed128MiB total-memory target requires separately approved platform/cgroup enforcement and measurement; built-in workers/Node flags alone cannot honestly supply it. Activation stays blocked if a hard total-memory boundary is required and unavailable.

Use spawn(process.execPath, fixed bundled child entry and fixed flags, {shell:false,...}). Minimal private environment without credentials, service keys, user tokens or provider configuration. Child entry imports only the reviewed guard and packaged pngjs/jpeg-js closure; it never invokes network/provider/DB APIs or loads user code. Send original bytes on bounded stdin with a small validated fixed-format metadata header, not CLI arguments. Bound both streams before allocating/copying; reject extra/truncated input.

Return a strict small result carrying only supported/unsupported, SHA256/byte length and verified dimensions. Parent checks exact immutable hash/size/MIME and fresh actor/file/request revision after this new async boundary and before any provider reservation/dispatch or exposing hints. Every abnormal exit, malformed/oversized response, timeout, cancellation or revision change becomes incomplete/manual review. Preserve original evidence and existing conservative job/lease behavior. No send retry follows an uncertain existing provider operation.

## Worker alternative and its limits

node:worker_threads with resourceLimits and worker.terminate is a smaller IPC implementation and protects the main event loop from JS decoding. resourceLimits constrains V8 heap/stack, not ArrayBuffer/native/zlib memory. Termination while native synchronous work is running can be delayed. Use it only if the approved deadline semantics permit that native completion window; do not advertise it as hard wall-clock interruption/total RSS enforcement. A child with SIGKILL is preferred for the required cancellable boundary. OS scheduling still prevents absolute real-time guarantees; state the operational deadline/cancellation contract precisely.

## Deployment packaging impact

The resolved-entry traceInclude correction targets pngjs/jpeg-js runtime modules and original notices; its artifact verification is recorded separately in the release receipts. A child introduces an additional runnable entry that Nitro must explicitly emit with the reviewed decoder implementation. A source-relative TS file or temporary source path is unacceptable.

Keep one small independent worker build entry in the generated server artifact, referencing only bundled relative files/runtime decoder modules. Choose the installed Nitro-supported entry/emission hook after a focused spike; do not copy uncompiled source or rely on build-tree node_modules. Confirm entry and guard are included and notices retained. Extend detached artifact checks to launch the child with NODE_PATH unset, no /tmp or /data source/package fallback, and no network/credential environment. Do not add a worker framework or install a new dependency.

## Required tests before implementation approval

1. Existing supported PNG/JPEG corpus still produces the same exact decisions; unsupported/corrupt/oversized originals stay incomplete and never dispatch.
2. A synthetic CPU-stalled child exceeds the deadline, is killed, emits no accepted late result, and frees its sole permit only after exit. A native-work fixture verifies actual kill/cleanup rather than Promise timeout alone.
3. Crash/OOM, malformed/extra/oversized stdout, truncated input, cancellation and lost result all fail closed; originals never reach logs.
4. Overlapping calls respect one-child limit with no queue; cancellation and caller teardown leave no process/pipe/timer behind.
5. Revocation, request/file revision or original hash changes during decode deny subsequent reservation/cache/result exposure through a fresh read.
6. Detached generated-server child launch resolves its entire runtime closure with NODE_PATH unset and no source/dependency symlinks. Missing/wrong decoder versions fail closed.
7. Measure worst supported input CPU/RSS/output and exercise proposed heap/library caps. Independently prove host total-memory enforcement before claiming a hard RSS bound.

Before coding this behavior, agree deadline5s, one-child admission, heap settings and whether total-memory enforcement is an activation prerequisite. This document neither activates OCR nor authorizes host resource changes.
