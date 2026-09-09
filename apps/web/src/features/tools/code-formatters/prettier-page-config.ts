import {
  languageConfigurations,
  type FormatterLanguage,
} from "@workspace/tools/format/prettier-config";

type PageLanguage = {
  label: string;
  sample: string;
};

export const PRETTIER_PAGE_LANGUAGES: Record<FormatterLanguage, PageLanguage> =
  {
    javascript: {
      label: "JavaScript",
      sample:
        "const greeting = (name) => {\n  return { message: 'Hello ' + name, items: [1, 2, 3] }\n}\n",
    },
    jsx: {
      label: "JSX",
      sample:
        'export function App() {\n  return <main className="card">Hello</main>\n}\n',
    },
    typescript: {
      label: "TypeScript",
      sample:
        "type User = { id: number; name: string }\n\nconst users: User[] = [{ id: 1, name: 'Ada' }]\n",
    },
    tsx: {
      label: "TSX",
      sample:
        "type Props = { title: string }\n\nexport function Card({ title }: Props) {\n  return <section>{title}</section>\n}\n",
    },
    flow: {
      label: "Flow",
      sample:
        "/* @flow */\ntype User = { id: number, name: string }\n\nconst user: User = { id: 1, name: 'Ada' }\n",
    },
    json: {
      label: "JSON",
      sample:
        '{\n  "name": "Example",\n  "items": [1, 2, 3],\n  "active": true\n}\n',
    },
    "json-stringify": {
      label: "JSON.stringify",
      sample:
        '{\n  "name": "prettier-demo",\n  "private": true,\n  "scripts": {\n    "format": "prettier --write ."\n  }\n}\n',
    },
    json5: {
      label: "JSON5",
      sample:
        "{\n  // JSON5 supports comments\n  unquoted: 'value',\n  trailing: true,\n}\n",
    },
    jsonc: {
      label: "JSONC",
      sample:
        '{\n  // JSON with comments\n  "name": "Example",\n  "enabled": true\n}\n',
    },
    html: {
      label: "HTML",
      sample:
        '<div class="card"><h1>Hello</h1><p>Prettier formatting</p></div>\n',
    },
    angular: {
      label: "Angular",
      sample: '<div *ngIf="isReady">{{ title }}</div>\n',
    },
    vue: {
      label: "Vue",
      sample:
        '<template>\n  <div class="card">{{ message }}</div>\n</template>\n\n<script setup lang="ts">\nconst message = \'Hello\'\n</script>\n',
    },
    svelte: {
      label: "Svelte",
      sample:
        '<script lang="ts">\n  let count = 0\n</script>\n\n<button on:click={() => count += 1}>\n  {count}\n</button>\n',
    },
    lwc: {
      label: "LWC",
      sample:
        '<template>\n  <lightning-button label="Hello" onclick={handleClick}></lightning-button>\n</template>\n',
    },
    mjml: {
      label: "MJML",
      sample:
        "<mjml><mj-body><mj-section><mj-column><mj-text>Hello</mj-text></mj-column></mj-section></mj-body></mjml>\n",
    },
    handlebars: {
      label: "Handlebars",
      sample: "{{#if isReady}}\n  <span>{{title}}</span>\n{{/if}}\n",
    },
    xml: {
      label: "XML",
      sample:
        '<root><item id="1">Hello</item><item id="2">World</item></root>\n',
    },
    css: {
      label: "CSS",
      sample: ".card {\n  display: flex;\n  gap: 12px;\n}\n",
    },
    postcss: {
      label: "PostCSS",
      sample:
        "@custom-media --small-screen (max-width: 40rem);\n\n.card {\n  color: rebeccapurple;\n}\n",
    },
    scss: {
      label: "SCSS",
      sample:
        "$primary: #2b4b6f;\n\n.card {\n  color: $primary;\n  &:hover {\n    opacity: 0.9;\n  }\n}\n",
    },
    less: {
      label: "Less",
      sample:
        "@primary: #2b4b6f;\n\n.card {\n  color: @primary;\n  &:hover {\n    opacity: 0.9;\n  }\n}\n",
    },
    markdown: {
      label: "Markdown",
      sample: "# Prettier Formatter\n\n- Paste your code\n- Adjust options\n",
    },
    mdx: {
      label: "MDX",
      sample:
        "# MDX Example\n\n<Alert>Hi</Alert>\n\nexport const answer = 42\n",
    },
    yaml: {
      label: "YAML",
      sample: "name: Example\nitems:\n  - one\n  - two\n",
    },
    graphql: {
      label: "GraphQL",
      sample:
        "query User($id: ID!) {\n  user(id: $id) {\n    id\n    name\n  }\n}\n",
    },
  };

export const PRETTIER_FILE_ACCEPT = [
  ...new Set(
    Object.values(languageConfigurations).flatMap(
      ({ extensions }) => extensions,
    ),
  ),
  ".txt",
  "text/plain",
];
