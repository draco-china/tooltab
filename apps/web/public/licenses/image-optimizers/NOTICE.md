# Image optimizers: original third-party notices

`@jsquash/oxipng@2.3.0` is distributed under Apache-2.0; its original license is retained as `jsquash-LICENSE.txt`. The original packaged OxiPNG MIT notice, including Joshua Holmer's copyright, is `oxipng-packaged-LICENSE.md`. Wrapper source headers retain Google Inc. copyright and Jamie Sinclair's modification notice.

Exact package archive: https://registry.npmjs.org/@jsquash/oxipng/-/oxipng-2.3.0.tgz
Exact published npm gitHead: https://github.com/jamsinclair/jSquash/tree/68a7201e5b4d9703bf65670fb0284d16536dd145
Build directory: packages/oxipng/codec in that commit. Original Cargo.toml and Cargo.lock are retained here. The package codec README's v3.0.0 label is stale: this fixed build lock resolves oxipng 9.1.1. ToolTab uses only the single-thread `codec/pkg` JavaScript/WASM pair, not `pkg-parallel`.

The WASM is 164,172 bytes, SHA256 `5ea3e53c0b4fc1b4e8d1511d35b89329d9376bec75a9c4d3c054774487e5f9a3`. It is served as a local bundled asset; no CDN is used. To replace it, rebuild the pinned crate using the repository's wasm-pack build instructions and lock file, replace the single-thread package pair and rebuild ToolTab.

`rust-lock-notices.json` records exact crates.io archives/checksums and original notice files copied under `rust-lock/`. This intentionally includes the entire fixed lock set, including optional parallel/native/build dependencies; it is not a claim that every listed crate is linked into the single-thread WASM. Original notices have not been rewritten. wasm_sync 0.1.2 ships no standalone license text; its original Cargo.toml.orig and README are retained, declaring MIT OR Apache-2.0 and the upstream repository. No copyright holder or missing license text has been invented.

`svgo@4.1.0` is MIT; its original license, including Kir Belevich's copyright, is `svgo-LICENSE.txt`.
Exact archive: https://registry.npmjs.org/svgo/-/svgo-4.1.0.tgz
Official source release: https://github.com/svg/svgo/tree/v4.1.0
ToolTab imports the published browser bundle on both runtimes and does not modify that library.

ToolTab's own code remains MIT; this does not change the licenses of any dependency.
