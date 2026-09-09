# GMP WebAssembly dependency notices and source

ToolTab's own code is MIT. This directory does **not** relicense the dependencies as MIT.

- gmp-wasm **1.3.2**, copyright Dani Biro and contributors; **LGPL-3.0-only**. Original license and authors are retained in `WRAPPER-LGPL-3.0.txt` and `WRAPPER-AUTHORS.txt`.
- GNU GMP **6.3.0**, copyright Free Software Foundation, Inc. and the individual authors identified in the complete source; **LGPL-3.0-or-later OR GPL-2.0-or-later**. We use the LGPL option. `GMP-README.txt`, `GMP-AUTHORS.txt`, `GMP-LGPL-3.0.txt`, `GPL-3.0.txt`, and `GPL-2.0.txt` preserve the upstream texts. Individual source file copyright notices remain in the source archive.
- The mini wrapper includes fflate **0.7.3** (MIT, Arjun Barrett) and TypeScript tslib **2.4.0** (Microsoft license notices in its package). Their original packages, including source and notices, are provided here.

This library is free software, without warranty. LGPL rights include modifying the library and reverse engineering the combined work for debugging such modifications; ToolTab imposes no prohibition on those activities.

## Exact corresponding source and original distribution

All files below are served alongside this notice; `SHA256SUMS` records their digests.

- `gmp-wasm-1.3.2-source.tar.gz`: complete wrapper source and build scripts at upstream tag v1.3.2, commit **4e372e5a3c4a65f871e1bcaab63c78b29dc80ff8**, fetched from https://api.github.com/repos/Daninet/gmp-wasm/tarball/4e372e5a3c4a65f871e1bcaab63c78b29dc80ff8.
- `gmp-6.3.0-source.tar.xz`: complete GMP source, fetched from https://ftp.gnu.org/gnu/gmp/gmp-6.3.0.tar.xz. Wrapper `binding/build-gmp.sh` pins this exact release; its Dockerfile and tuning header describe the configure patch and parameters used by the wrapper.
- `gmp-wasm-1.3.2-npm.tgz`: original npm package, including unmodified `dist/mini.esm.js` consumed by ToolTab. The WebAssembly is compressed and embedded in this JavaScript module, not downloaded from a CDN.
- `fflate-0.7.3.tgz` and `tslib-2.4.0.tgz`: original packages, exact versions from the wrapper's package-lock.json, fetched from registry.npmjs.org.

## Rebuild or replace

Extract the wrapper source; use its package-lock.json with `npm ci`. The upstream build requires Docker and pins **emscripten/emsdk:3.1.58** in its Dockerfiles. Its `npm run build` runs build-gmp, build-mpfr, build-src, build-wasm-ts, build-rollup, and build-types. GMP source is the archive above; upstream full build also downloads **MPFR 4.2.1** from https://ftp.gnu.org/gnu/mpfr/mpfr-4.2.1.tar.xz, although the **mini runtime links only GMP**, as shown by `binding/src/Dockerfile` (`-lgmp`, no `-lmpfr`). The source archive contains all wrapper build scripts and the tuning header. Docker/toolchain/package downloads require network unless cached. This project has not yet reproduced the upstream binary byte-for-byte; no such claim is made.

To use a modified library in ToolTab, rebuild the wrapper and replace `node_modules/gmp-wasm/dist/mini.esm.js` (and types if its API changed), then run `bun run build` in the corresponding ToolTab source tree. The adapter imports that module from `src/tools/base-encoding/base58-wasm.ts`; it does not check a signature or prohibit a replacement. Base58 runs in a separate Worker; Vite generates local JS chunks containing the mini library/WASM. A deployed replacement must update those chunks and the PWA precache manifest together, then refresh or unregister the old service worker. There is no remote CDN or separate remote WASM URL to replace.

Before distributing a built ToolTab bundle, also provide the **matching ToolTab application source and build configuration/lockfile** so recipients can recombine it with a modified library under LGPL section 4(d)(0), and keep these notices, source archives, and license texts downloadable. This checked-in preparation is not evidence that a release or its complete corresponding application source has already been published. If dependency sources are modified, include the actual patches and updated source/build instructions with that release.
