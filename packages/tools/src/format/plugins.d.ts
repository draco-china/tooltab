declare module "prettier-plugin-svelte/browser" {
  export const languages: import("prettier").Plugin["languages"];
  export const parsers: import("prettier").Plugin["parsers"];
  export const printers: import("prettier").Plugin["printers"];
  export const options: import("prettier").Plugin["options"];
}
