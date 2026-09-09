/** Original local document styles; no upstream stylesheet is redistributed. */
export const EXPORT_BASE_STYLES = `*{box-sizing:border-box}body{margin:0;font:16px/1.7 system-ui,sans-serif}main{max-width:850px;margin:auto;padding:40px 24px}h1,h2,h3,h4,h5,h6{line-height:1.25;margin-block:1.4em .6em}h1{font-size:2.2em}h2{font-size:1.6em}p,ul,ol,blockquote,pre,table{margin-block:1em}a{color:inherit;text-decoration:underline;text-underline-offset:3px}pre{overflow:auto;padding:16px;border:1px solid currentColor;border-radius:8px}code{font: .9em/1.5 ui-monospace,monospace}blockquote{border-inline-start:3px solid currentColor;padding-inline-start:20px;margin-inline:0;opacity:.8}table{border-collapse:collapse;max-width:100%;display:block;overflow:auto}th,td{padding:8px 14px;border:1px solid currentColor;text-align:start}img{max-width:100%;height:auto}hr{border:0;border-top:1px solid currentColor;opacity:.25}nav{border:1px solid currentColor;border-radius:8px;padding:12px 20px}input{pointer-events:none}@media(max-width:480px){main{padding:24px 16px}}@media print{body{background:white!important;color:black!important}main{max-width:none;padding:0}pre,blockquote,table{break-inside:avoid}a{text-decoration:none}h1,h2,h3{break-after:avoid}}`;
export const EXPORT_THEME_STYLES = {
  clean:
    "body{background:#fff;color:#222}h1,h2{letter-spacing:-.02em}pre{background:#f4f4f5}",
  slate:
    "body{background:#f1f5f9;color:#1e293b}main{background:#fff}h1,h2,h3{color:#0f172a}pre{background:#e2e8f0}",
} as const;
