# qpdf WebAssembly dependency provenance

ToolTab loads the unmodified WASM and generated wrapper from the exact npm package `@neslinesli93/qpdf-wasm@0.3.0`. Its published manifest is preserved as `wrapper-package.json`. The package declares ISC; its published archive does not supply a separate ISC license file or name a copyright holder. We do not invent attribution or relabel the wrapper as ToolTab MIT code. The exact upstream wrapper source is available at commit `e661db2d17e391a9fbe6b350b4ea6dbd8c385891`:

https://github.com/neslinesli93/qpdf-wasm/tree/e661db2d17e391a9fbe6b350b4ea6dbd8c385891

Exact published archive:
https://registry.npmjs.org/@neslinesli93/qpdf-wasm/-/qpdf-wasm-0.3.0.tgz

The actual engine reports qpdf 12.2.0. qpdf is used under Apache-2.0; its original LICENSE.txt and NOTICE.md (including embedded cryptographic-code notices) are preserved here. The wrapper's exact Dockerfile and build script record these source commits:

- qpdf: `856d32c610334855d30e96d25eb5f9636fb62f08` (12.2.0), https://github.com/qpdf/qpdf/tree/856d32c610334855d30e96d25eb5f9636fb62f08
- zlib: `21767c654d31d2dccdde4330529775c6c5fd5389`, https://github.com/madler/zlib/tree/21767c654d31d2dccdde4330529775c6c5fd5389
- libjpeg-turbo fork: `7aa2a898c564041a24b09d0a6e780aaa632d08d3`, https://github.com/ImageMagick/jpeg-turbo/tree/7aa2a898c564041a24b09d0a6e780aaa632d08d3

The exact zlib README/header and libjpeg-turbo LICENSE/README.ijg are preserved, with their original copyright and license language. Machine-readable original URLs are in `source-links.json`.

To rebuild, acquire the wrapper at the exact commit above and use its Dockerfile/build.sh (copies included here) with Emscripten 3.1.74; that recipe pins the three compiled sources and the wrapper's patches. To replace the dependency, install a verified wrapper/WASM version and update both imports and matching license/source notices. ToolTab serves the emitted WASM from its own bundled assets, never a runtime CDN. The WebAssembly binary and dependency are not relicensed as ToolTab code. ToolTab's independently authored integration remains MIT.
