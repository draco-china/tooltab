export function serviceWorkerUrl(name: string, moduleUrl: string) {
  return import.meta.env.PROD
    ? new URL(`../workers/${name}.js`, moduleUrl)
    : new URL(`./${name}.ts`, moduleUrl);
}
