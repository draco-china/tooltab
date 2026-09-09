# jSquash AVIF 2.1.1

ToolTab loads the unmodified single-thread encoder from `@jsquash/avif@2.1.1` locally. The package wrapper is Apache-2.0; its original license is `LICENSE.txt`. Its source headers retain Google Inc. copyright and Jamie Sinclair's modification notice. ToolTab does not relabel this dependency as MIT.

Exact package: https://registry.npmjs.org/@jsquash/avif/-/avif-2.1.1.tgz
Exact npm gitHead: https://github.com/jamsinclair/jSquash/tree/b7fa9ac9ec02f224847ad23d19d115f9e296a368
Single-thread asset: `codec/enc/avif_enc.wasm`, 3,485,872 bytes, SHA-256 `d9f2a95164362af48558d176e619becfd49dd97b50b86c679b47100860522b3d`.

The original fixed-commit build recipe is retained as `codec-Makefile.txt`. It identifies libavif 1.0.1, libaom 3.7.0 and the libsharpyuv component of libwebp commit e2c85878f6a33f29948b43d3492d9cdaf801aa54. Corresponding original licenses and patent grants are retained here; `source-links.json` records exact download URLs. `libavif-LICENSE.txt` itself includes its referenced third-party notices. These are the original legal texts, not a synthesized license.

Sources/rebuild: check out the exact jSquash commit above, follow its AVIF codec build instructions and the checked-in Makefile/helper.Makefile with Emscripten. The Makefile pins the component archives. ToolTab consumes only the single-thread encoder factory and WASM, not the multithread encoder or decoder. Replacing the npm package or rebuilding its single-thread pair and rebuilding ToolTab replaces the local asset; the PWA asset revision must be updated accordingly. No runtime CDN is used.
