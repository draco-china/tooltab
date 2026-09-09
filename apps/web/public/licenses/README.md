# Runtime dependency licensing

ToolTab source remains MIT. Base58 now lazily loads the mini integer WebAssembly build of **gmp-wasm 1.3.2** inside a local Worker. This is an **LGPL-3.0-only wrapper**, with **GMP 6.3.0** used under its LGPL-3.0-or-later option. It is not an MIT dependency.

The full original notices, exact corresponding wrapper/GMP source archives, original npm distribution, transitive bundled fflate/tslib packages, SHA-256 digests, and rebuild/replacement instructions are maintained in [gmp-wasm/NOTICE.md](gmp-wasm/NOTICE.md). Those files are intended to be served at `/licenses/gmp-wasm/`; no remote CDN is used at runtime.

The mini build links GMP only; MPFR is needed by the upstream full package build but is not linked into the mini WASM runtime. The preserved wrapper source includes build scripts and its pinned Emscripten 3.1.58 Dockerfiles. Reproducible, byte-identical rebuilding has not been performed.

Release obligation: retain the LGPL/GPL texts and library notices, provide these exact library sources together with the matching ToolTab application source and build/lock files needed to rebuild or recombine a modified library, and permit modification and debugging of that library. A generated deployment must keep the notices and corresponding source accessible.

## Unicode data

The text utilities Unicode data notice is preserved in [text-utilities-unicode-license.txt](text-utilities-unicode-license.txt). Retain this notice with distributions of the associated data.
