# Image decoder subprocess boundary

This source successor implements the approved short-lived Node image child. Both Azure gates remain false. It does not configure credentials, call a provider, apply SQL or deploy.

The HTTP-side inspector now awaits the child and re-reads original metadata/access afterward. The unchanged strict PNG/JPEG guards live in one canonical plain-JavaScript decoder module; its legacy synchronous export is retained for format regression tests. Production inspection uses the subprocess executor exclusively. PDF and unsupported images stay incomplete.

The executor admits one child per server process with no queue. It snapshots at most 4,000,000 bytes before spawning, pins MIME/hash/size, and sends raw bytes over stdin. The trusted worker emits one canonical JSON line containing complete/hash/size/MIME. Extra/duplicate fields, malformed output, any stderr, more than 1,024 stdout bytes, a crash or a late result fail closed. The worker independently bounds input. Neither bytes nor pixels are logged or returned.

A monotonic 5,000ms deadline starts before spawn. Expiry sends SIGKILL, including during synchronous native work. The parent awaits child/pipe close before returning or releasing its permit; there is no main-thread decode fallback. OS scheduling or uninterruptible OS work can delay signal delivery/reaping, so this is an operational kill deadline rather than an absolute real-time guarantee. The current extraction input has no caller cancellation signal; caller teardown is bounded by this deadline, and no abort API is claimed.

The child runs process.execPath with fixed --max-old-space-size=64 and --max-semi-space-size=8, shell:false and only LANG=C/TZ=UTC. NODE_OPTIONS, NODE_PATH, credentials and runtime configuration are not inherited. This reduces environment exposure; the same-UID child is not an OS security sandbox.

The installed Nitro compiled hook copies the worker, canonical decoder and executor as plain .mjs into generated server/cost-ocr. Exact pngjs7.0.0/jpeg-js0.4.4 and original notices remain in server/node_modules. The detached checker launches that artifact executor with NODE_PATH unset and checks supported PNG/JPEG plus malformed rejection. No temporary source/dependency fallback is permitted.

Input/dimension/pixel/inflation/output/JPEG allocation checks remain unchanged. V8 flags bound their documented heap scopes, not total RSS or native/Buffer memory. The current host cgroup memory.max is max, so no finite host total-memory cap is demonstrated. A hard total-memory boundary is an activation blocker requiring separate host/service authorization and measurement; this task changes no host limits. Limits are per server process, not global across replicas.

Validation covers the old strict format corpus, byte immutability, child environment, busy admission, synchronous JavaScript and native stalls, crash, missing entry, malformed/duplicate/oversized responses, PID reaping and fresh original access. Live provider, DB and deployment behavior are outside this verification.
