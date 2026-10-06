# Image inspection source plan after the isolated trial

Proposal only; application integration and dependency changes still require approval. The approved isolated trial installed only pngjs 7.0.0 and jpeg-js 0.4.4 in a temporary mount, now unmounted. No application package, lockfile, shared dependency, inspector, provider gate or deployment changed.

Evidence retained at /tmp/taskovia-document-inspection-trial:

| Artifact | SHA-256 |
| --- | --- |
| trial-report.md | 0a36dd035e2a8f74313c878a76a3c55ef9def59df1dfa3f9eabb388da99e1c7a |
| results.json | adff4e4c37a90b06942727fd03ee833d25661743040259b071fde158252ac04a |
| case.cjs | 7b4d62ec6f235e06150b66ac027599fbb28499b5fcf8df1ba87ec9e5421d7cfd |
| runner.py | bc108a628aff1fb5052a5e24fefb13e3c3ac104612d472e7d34d0b1e3af37a16 |
| manifest.sha256 | 4aa4602cbcec7159be8551cd049ee9958215bb83eca3af6c11ba184e97ea8afd |

The trial recorded 25/25 guarded decisions: four complete synthetic decodes and 21 rejections. Positive coverage was three static noninterlaced 8-bit RGB/RGBA PNG images and one baseline three-component JPEG, all 16×12. Seven unsupported or malformed inputs were accepted by the raw libraries. A decoded buffer alone is insufficient to attest completeness.

Sampled process RSS peaked at 112.574 MiB. Monitoring was best effort; it did not establish a hard memory bound. Cumulative active runtime was 4.283 seconds, while preparation and orchestration elapsed 266.087 seconds. These are distinct measurements. The successful controlled run itself took 1.901 seconds. The separately approved alternative superseded the earlier proposed hard memory prerequisite for this tiny isolated trial only.

## Smallest proposed integration

1. Approve exact application dependency pins pngjs 7.0.0 and jpeg-js 0.4.4, their licenses/notices and lockfile closure. Decide whether to approve development-only @types/pngjs 6.0.5 or a reviewed narrow declaration. The isolated runtime-package approval does not authorize application installation or that third package.
2. Add a server-only image guard and a terminable decode worker behind the existing inspection port. Preserve immutable file identity, revision and byte SHA-256. Choose input, pixel/output, runtime, RSS and concurrency limits explicitly before implementation; the trial's tiny images do not establish production limits. A Promise timeout cannot terminate synchronous decode.
3. PNG: validate signature, chunk order/lengths and every CRC; require one final IEND and no trailing bytes. Reject APNG markers and unsupported variants. Verify bounded complete zlib consumption and exact predicted scanline length before pixel decode, then match dimensions and full RGBA byte count.
4. JPEG: validate marker/length/scan framing through one terminal EOI, reject trailing/concatenated frames, MPF/MPO and unverified variants, and bound dimensions before allocation. Use tolerantDecoding=false plus the decoder's resolution/memory limits; verify the complete output. Limit the initial candidate to baseline three-component JPEG.
5. Expand synthetic positive and adversarial coverage, including truncation at every structural boundary and limit failures; review the guard and process lifecycle independently. The trial prototype is evidence, not a production parser.
6. Integrate the attestation only after that coverage and review. Keep complete=false for every unsupported or uncertain input, including PDFs. Perform source/unit/type/build checks with gates false; activation remains a separate decision.

Palette, interlaced and 16-bit PNG, valid progressive/grayscale/CMYK JPEG, metadata-embedded images, a wider hostile corpus and all PDFs remain unverified. No PDF dependency is included in this images-only plan.

Full trusted inspection, fresh actor/scope/revision authorization wiring and known reconciled Azure resource/month usage remain activation blockers. Preserve both Azure gates false and the user's preference for one eventual separately authorized deployment.

The earlier [broader dependency proposal](azure-f0-document-inspection-dependency-proposal.md) remains research context; its PDF scope and proposed trial limits are not an application integration authorization.
