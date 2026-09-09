# GIF animation dependency notices

Published versions: gifuct-js 2.1.2 (MIT), @libwebp-wasm/img2webp 1.0.0 (MIT wrapper), upng-js 2.1.0 (MIT; independent test decoder only). Production APNG packing uses existing fflate, not UPNG encoding.

Single-thread published img2webp WASM: 772591 bytes, SHA256 109f43681b260e9fe30aa909533b19a4438abc73a8e3da4837df5eadf0d1ac86. Loaded from a local Vite asset; no CDN.

The npm package declares source gitHead 889c605617b1e0a3ef6f3e3a566c4f391f0ab4bc, but this commit returned HTTP 404 from the declared official repository on 2026-09-05. Consequently an exact published-WASM-to-source mapping is NOT verified. The npm tarball is https://registry.npmjs.org/@libwebp-wasm/img2webp/-/img2webp-1.0.0.tgz.

The bundled codec notices here are unmodified originals from the official wrapper repository's accessible fixed tree 2ea57765ebb7a0b0eb5eac4f63bc568da198b37c submodule refs (not claimed identical to the unavailable npm build commit):

- libwebp-COPYING.txt: https://github.com/webmproject/libwebp/blob/baff2c8980970f58e2aa88622c6575bdee2f876a/COPYING
- libwebp-PATENTS.txt: https://github.com/webmproject/libwebp/blob/baff2c8980970f58e2aa88622c6575bdee2f876a/PATENTS
- libpng-LICENSE.txt: https://github.com/pnggroup/libpng/blob/99652c99876997c701b9113ce509e2eb7707b9d2/LICENSE
- libjpeg-README.txt: https://github.com/LuaDist/libjpeg/blob/6c0fcb8ddee365e7abc4d332662b06900612e923/README
- zlib-LICENSE.txt: https://github.com/madler/zlib/blob/da607da739fa6047df13e66a2af6b8bec7c2a498/LICENSE

Source and rebuild instructions: https://github.com/libwebp-wasm/img2webp/tree/2ea57765ebb7a0b0eb5eac4f63bc568da198b37c. Inspect and pin submodules; do not use its README's moving --remote command for a reproducible build. ToolTab does not modify the published library. The wrapper's MIT declaration does not replace the bundled codecs' own licenses. Resolve the exact build provenance before claiming a reproducible distribution.
