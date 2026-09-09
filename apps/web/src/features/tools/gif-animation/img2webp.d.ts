declare module "@libwebp-wasm/img2webp" {
  export type WebpModule = {
    FS: {
      writeFile(name: string, bytes: Uint8Array): void;
      readFile(name: string): Uint8Array;
      unlink(name: string): void;
    };
  };
  export function Img2Webp(options: {
    locateFile(path: string, prefix: string): string;
  }): Promise<WebpModule>;
  export function runImg2Webp(
    module: WebpModule,
    method: string,
    ...args: string[]
  ): void;
}
