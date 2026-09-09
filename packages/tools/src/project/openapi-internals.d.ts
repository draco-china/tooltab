declare module "openapi-typescript/dist/transform/index.mjs" {
  import type { GlobalContext, OpenAPI3 } from "openapi-typescript";
  import type ts from "typescript";
  export default function transformSchema(
    schema: OpenAPI3,
    context: Omit<GlobalContext, "redoc">,
  ): ts.Node[];
}
declare module "openapi-typescript/dist/lib/ts.mjs" {
  export { astToString } from "openapi-typescript";
}
declare module "openapi-typescript/dist/lib/utils.mjs" {
  export { resolveRef, scanDiscriminators } from "openapi-typescript";
}
