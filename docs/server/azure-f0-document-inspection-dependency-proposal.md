# Azure document inspection — bounded dependency proposal

Source proposal only. No dependency installation, shared lock/fingerprint change, document trial, provider call, configuration or deployment has occurred.

The minimum required attestation is immutable-byte SHA-256 and complete structural page coverage of supported normal documents. Native extraction/rendering is a separate capability. Header-only dimensions, PDF text regexes, declared /Count, or successful rendering of only declared pages do not prove complete coverage.

Recommend an isolated /tmp trial with exact pins:

- pdf-lib1.17.1 (MIT), plus @pdf-lib/standard-fonts1.0.0 (MIT), @pdf-lib/upng1.0.1 (MIT), pako1.0.11 (MIT AND Zlib), tslib1.14.1 (0BSD).
- pngjs7.0.0 (MIT), jpeg-js0.4.4 (BSD-3-Clause metadata; preserve Apache upstream notices).
- @types/pngjs6.0.5 (MIT, development only).

Verified official npm unpacked closure is22,541,067bytes (~21.50MiB), excluding compressed downloads, package store and trial output. Image-only subset is731,603bytes. PDF.js6.4.299 plus images/types without canvas is35,645,251bytes; including Linux GNU canvas1.0.10 is70,565,792bytes. Canvas does not solve incorrect /Count and is not required for page-count attestation. MuPDF AGPL/commercial adoption is excluded.

pdf-lib getPages walks /Kids independently of /Count, but its built-in traversal lacks cycle/depth guards and ignores some invalid kids. Use the exposed catalog/context for an explicit bounded iterative walk: validate references, node types, parent/child consistency, visited/duplicate/cycle detection, supported framing, object-stream loading and descendant counts. Load with throwOnInvalidObject:true, ignoreEncryption:false, updateMetadata:false; additionally reject any Encrypt trailer reference, including unresolved encryption.

This is not universal PDF validity verification. pdf-lib can recover a missing root, tolerate missing endobj or EOF framing and skip extraneous bytes. Strict wrapper checks and synthetic malformed/truncated cases must decide supported scope; uncertain input returns complete:false. Do not produce nativeResult from successful structural enumeration.

PNG requires full chunk boundary/CRC/IEND/trailing-data validation, bounded inflation and dimensions, and animation rejection until all-frame coverage exists. JPEG requires tolerantDecoding:false, bounded dimensions/memory and complete termination/framing. Decode in a terminable isolated process: Promise.race cannot stop synchronous work; Node heap limits alone do not bound native/Buffer RSS.

Trial proposal: synthetic bytes only, one process at a time, <=120s total and10s per case, <=256MiB trial disk including isolated store. First verify an enforceable process memory boundary on the existing worker; disk availability is not RAM evidence. No resource upgrade. Exercise ordinary nested/object-stream PDFs, falsely small Count, cycles, duplicate kids, broken references, encryption and truncation; valid/malformed/CRC-failed/animated PNG and corrupt/truncated JPEG. Preserve verdicts/limits and actual runtime RSS evidence. Do not mutate shared dependencies during trial.

Controller alone owns package.json, pnpm-lock.yaml and shared dependency fingerprint; Azure owner owns inspector files/tests. After a successful separately authorized trial and reviewed packaging, make a pinned source dependency change and rerun aggregate checks. Both provider gates remain false; reconciled resource/month usage and fresh actor authorization wiring also remain activation prerequisites. User prefers one later authorized deployment combining staged configuration.

Exact-version OSV queries found no listed matching advisories for these pinned packages; this is not a vulnerability-free guarantee. No trial verification has been performed.

Primary sources: [pdf-lib npm](https://registry.npmjs.org/pdf-lib/1.17.1), [page-tree implementation](https://raw.githubusercontent.com/Hopding/pdf-lib/v1.17.1/src/core/structures/PDFPageTree.ts), [PDF parser](https://raw.githubusercontent.com/Hopding/pdf-lib/v1.17.1/src/core/parser/PDFParser.ts), [object-stream parser](https://raw.githubusercontent.com/Hopding/pdf-lib/v1.17.1/src/core/parser/PDFObjectStreamParser.ts), [PDF.js page-count implementation](https://raw.githubusercontent.com/mozilla/pdf.js/v6.4.299/src/core/catalog.js), [PNG parser](https://raw.githubusercontent.com/pngjs/pngjs/master/lib/parser.js), [JPEG decoder options](https://github.com/jpeg-js/jpeg-js).
