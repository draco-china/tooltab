import { describe, expect, it } from "vitest";
import { FORMATTER_INPUT_LIMIT } from "@workspace/tools/format/contract";
import {
  detectFormatterLanguage,
  formatterFilename,
  formatterLanguages,
  languageConfigurations,
  prettierOptionsSchema,
} from "@workspace/tools/format/prettier-config";
import { formatPrettier } from "@workspace/tools/format/prettier";

const samples = {
  javascript:
    "const values=[1,2,3]; export const twice=values.map(value=>value*2)",
  jsx: "export const View=()=> <section><p>Hello</p></section>",
  typescript:
    'type Item={id:number,label:string}; const item:Item={id:1,label:"Sample"}',
  tsx: "export const View=({name}:{name:string})=><p>{name}</p>",
  flow: "// @flow\ntype Point={x:number,y:number}; const point:Point={x:1,y:2}",
  json: '{"label":"Sample","values":[1,2,3]}',
  "json-stringify": '{"name":"sample-project","private":true}',
  json5: '{label:"Sample", // Comment\nvalues:[1,2,],}',
  jsonc: '{ // Comment\n"label":"Sample","enabled":true}',
  html: "<article><h1>Sample</h1><p>Local formatting</p></article>",
  angular: '<section *ngIf="visible"><p>{{ label }}</p></section>',
  vue: '<template><p>{{ label }}</p></template><script setup lang="ts">const label="Sample";</script>',
  svelte:
    '<script lang="ts">let count=0;</script><button onclick={()=>count+=1}>{count}</button>',
  lwc: '<template><lightning-button label="Sample" onclick={handleClick}></lightning-button></template>',
  mjml: "<mjml><mj-body><mj-section><mj-column><mj-text>Sample</mj-text></mj-column></mj-section></mj-body></mjml>",
  handlebars: "{{#if visible}}<p>{{label}}</p>{{/if}}",
  xml: '<items><item id="1">Sample</item><item id="2"/></items>',
  css: ".sample{display:flex;gap:1rem;color:blue}",
  postcss: "@custom-media --compact (max-width:40rem); .sample{color:blue}",
  scss: "$color:blue;.sample{color:$color;&:hover{opacity:.8}}",
  less: "@color:blue;.sample{color:@color;&:hover{opacity:.8}}",
  markdown: "# Sample\n\n* one\n* two",
  mdx: '# Sample\n\n<Card label="Example" />\n\nexport const values=[1,2,3]',
  yaml: "label: Sample\nvalues: [one,two]",
  graphql: "query Sample($id:ID!){item(id:$id){id label}}",
} satisfies Record<(typeof formatterLanguages)[number], string>;

const expectedOutputs = {
  javascript:
    "const values = [1, 2, 3];\nexport const twice = values.map((value) => value * 2);\n",
  jsx: "export const View = () => (\n  <section>\n    <p>Hello</p>\n  </section>\n);\n",
  typescript:
    'type Item = { id: number; label: string };\nconst item: Item = { id: 1, label: "Sample" };\n',
  tsx: "export const View = ({ name }: { name: string }) => <p>{name}</p>;\n",
  flow: "// @flow\ntype Point = { x: number, y: number };\nconst point: Point = { x: 1, y: 2 };\n",
  json: '{ "label": "Sample", "values": [1, 2, 3] }\n',
  "json-stringify": '{\n  "name": "sample-project",\n  "private": true\n}\n',
  json5: '{\n  label: "Sample", // Comment\n  values: [1, 2],\n}\n',
  jsonc: '{\n  // Comment\n  "label": "Sample",\n  "enabled": true,\n}\n',
  html: "<article>\n  <h1>Sample</h1>\n  <p>Local formatting</p>\n</article>\n",
  angular: '<section *ngIf="visible">\n  <p>{{ label }}</p>\n</section>\n',
  vue: '<template>\n  <p>{{ label }}</p>\n</template>\n<script setup lang="ts">\nconst label = "Sample";\n</script>\n',
  svelte:
    '<script lang="ts">\n  let count = 0;\n</script>\n\n<button onclick={() => (count += 1)}>{count}</button>\n',
  lwc: '<template\n  ><lightning-button label="Sample" onclick={handleClick}></lightning-button\n></template>\n',
  mjml: "<mjml\n  ><mj-body\n    ><mj-section\n      ><mj-column><mj-text>Sample</mj-text></mj-column></mj-section\n    ></mj-body\n  ></mjml\n>\n",
  handlebars: "{{#if visible}}<p>{{label}}</p>{{/if}}",
  xml: '<items><item id="1">Sample</item><item id="2" /></items>\n',
  css: ".sample {\n  display: flex;\n  gap: 1rem;\n  color: blue;\n}\n",
  postcss:
    "@custom-media --compact (max-width: 40rem);\n.sample {\n  color: blue;\n}\n",
  scss: "$color: blue;\n.sample {\n  color: $color;\n  &:hover {\n    opacity: 0.8;\n  }\n}\n",
  less: "@color: blue;\n.sample {\n  color: @color;\n  &:hover {\n    opacity: 0.8;\n  }\n}\n",
  markdown: "# Sample\n\n- one\n- two\n",
  mdx: '# Sample\n\n<Card label="Example" />\n\nexport const values = [1, 2, 3];\n',
  yaml: "label: Sample\nvalues: [one, two]\n",
  graphql:
    "query Sample($id: ID!) {\n  item(id: $id) {\n    id\n    label\n  }\n}\n",
} as const;

describe("prettier configuration", () => {
  it("contains all 25 language configurations and defaults", () => {
    expect(formatterLanguages).toHaveLength(25);
    expect(Object.keys(languageConfigurations)).toHaveLength(25);
    expect(prettierOptionsSchema.parse({})).toEqual({
      language: "javascript",
      printWidth: 80,
      tabWidth: 2,
      useTabs: false,
      semi: true,
      singleQuote: false,
      trailingComma: "es5",
    });
  });

  it("rejects invalid options and unknown fields", () => {
    expect(() => prettierOptionsSchema.parse({ language: "sql" })).toThrow();
    expect(() => prettierOptionsSchema.parse({ printWidth: 39 })).toThrow();
    expect(() => prettierOptionsSchema.parse({ tabWidth: 9 })).toThrow();
    expect(() =>
      prettierOptionsSchema.parse({ trailingComma: "preserve" }),
    ).toThrow();
    expect(() => prettierOptionsSchema.parse({ extra: true })).toThrow();
  });

  it("detects special names, longest extensions, paths, and unknown files", () => {
    expect(detectFormatterLanguage("package.json")).toBe("json-stringify");
    expect(detectFormatterLanguage("/tmp/package-lock.json")).toBe(
      "json-stringify",
    );
    expect(detectFormatterLanguage("composer.json")).toBe("json-stringify");
    expect(detectFormatterLanguage("component.component.html")).toBe("angular");
    expect(detectFormatterLanguage("src/file.tsx")).toBe("tsx");
    expect(detectFormatterLanguage(String.raw`C:\src\schema.graphqls`)).toBe(
      "graphql",
    );
    expect(detectFormatterLanguage("README.unknown")).toBeNull();
    expect(detectFormatterLanguage("")).toBeNull();
    expect(detectFormatterLanguage(".JSON")).toBe("json");
  });

  it("returns the documented filename for every language", () => {
    expect(
      Object.fromEntries(
        formatterLanguages.map((language) => [
          language,
          formatterFilename(language),
        ]),
      ),
    ).toEqual({
      javascript: "formatted.js",
      jsx: "formatted.jsx",
      typescript: "formatted.ts",
      tsx: "formatted.tsx",
      flow: "formatted.js.flow",
      json: "formatted.json",
      "json-stringify": "formatted.json",
      json5: "formatted.json5",
      jsonc: "formatted.jsonc",
      html: "formatted.html",
      angular: "formatted.html",
      vue: "formatted.vue",
      svelte: "formatted.svelte",
      lwc: "formatted.html",
      mjml: "formatted.mjml",
      handlebars: "formatted.hbs",
      xml: "formatted.xml",
      css: "formatted.css",
      postcss: "formatted.postcss",
      scss: "formatted.scss",
      less: "formatted.less",
      markdown: "formatted.md",
      mdx: "formatted.mdx",
      yaml: "formatted.yaml",
      graphql: "formatted.graphql",
    });
  });
});

describe("formatPrettier", () => {
  it.each(formatterLanguages)(
    "formats the real %s sample",
    async (language) => {
      const output = await formatPrettier(samples[language], { language });
      expect(output).toBe(expectedOutputs[language]);
    },
  );

  it("preserves the baseline JavaScript output and applies style options", async () => {
    await expect(formatPrettier(samples.javascript)).resolves.toBe(
      "const values = [1, 2, 3];\nexport const twice = values.map((value) => value * 2);\n",
    );
    await expect(
      formatPrettier('const value = { name: "Sample" };', {
        language: "javascript",
        semi: false,
        singleQuote: true,
        trailingComma: "none",
        tabWidth: 4,
        useTabs: true,
      }),
    ).resolves.toBe("const value = { name: 'Sample' }\n");
  });

  it("returns parse errors with source location", async () => {
    try {
      await formatPrettier("const =", { language: "javascript" });
      throw new Error("expected parse error");
    } catch (error) {
      expect(error).toMatchObject({
        code: "parse_error",
        line: expect.any(Number),
        column: expect.any(Number),
      });
    }
  });

  it("handles empty input, runtime null, and invalid options", async () => {
    await expect(formatPrettier("")).resolves.toBe("");
    await expect(formatPrettier(null as never)).rejects.toMatchObject({
      code: "invalid_input",
    });
    await expect(
      formatPrettier("const value = 1;", { language: "sql" as never }),
    ).rejects.toThrow();
  });

  it("reports a real Svelte syntax error without a location", async () => {
    await expect(
      formatPrettier("<script>let value = 1;", { language: "svelte" }),
    ).rejects.toMatchObject({
      code: "parse_error",
      line: undefined,
      column: undefined,
    });
  });

  it("rejects lone UTF-16 surrogates and input over 32 MiB", async () => {
    await expect(formatPrettier("\uD800")).rejects.toMatchObject({
      code: "invalid_input",
    });
    await expect(
      formatPrettier("x".repeat(FORMATTER_INPUT_LIMIT + 1)),
    ).rejects.toMatchObject({ code: "too_large" });
  });
});

it("rejects real formatted output above 128 MiB even when input is small", async () => {
  // 256 levels of eight-space indentation expand this valid 132 KB JSON beyond the output limit.
  const input = `${"[".repeat(256)}${"0,".repeat(65_999)}0${"]".repeat(256)}`;
  expect(new TextEncoder().encode(input).length).toBe(132_511);
  expect(() => JSON.parse(input)).not.toThrow();
  await expect(
    formatPrettier(input, { language: "json", tabWidth: 8 }),
  ).rejects.toMatchObject({ code: "too_large" });
});
