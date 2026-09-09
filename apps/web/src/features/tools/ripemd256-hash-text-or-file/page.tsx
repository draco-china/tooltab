import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import { m } from "@/paraglide/messages.js";
import {
  RipemdHashPage,
  type RipemdMessages,
} from "../ripemd-extended/hash-page";

const messages = {
  textError: m["tools.ripemd128HashTextOrFile.textError"],
  fileError: m["tools.ripemd128HashTextOrFile.fileError"],
  article: {
    title: m["tools.ripemd256HashTextOrFile.articleTitle"],
    summary: m["tools.ripemd256HashTextOrFile.articleSummary"],
    characteristicsTitle:
      m["shared.blakeHash.blake2bArticleCharacteristicsLabel"],
    characteristics: [
      [
        m["shared.blakeHash.blake2bArticleCharacteristics2Title"],
        m["shared.blakeHash.blake2bArticleCharacteristics2Body"],
      ],
      [
        m["tools.md4HashTextOrFile.article.characteristics10"],
        m["tools.md4HashTextOrFile.article.characteristics11"],
      ],
      [
        m["shared.blakeHash.blake2bArticleCharacteristics3Title"],
        m["shared.blakeHash.blake2bArticleCharacteristics3Body"],
      ],
      [
        m["tools.md4HashTextOrFile.article.characteristics30"],
        m["tools.ripemd256HashTextOrFile.articleCharacteristics31"],
      ],
      [
        m["tools.ripemd128HashTextOrFile.article.characteristics40"],
        m["tools.ripemd128HashTextOrFile.article.characteristics41"],
      ],
    ],
    usesTitle: m["common.adler32articlecommonuses"],
    uses: [
      m["tools.ripemd128HashTextOrFile.article.uses0"],
      m["tools.ripemd128HashTextOrFile.article.uses1"],
      m["tools.ripemd128HashTextOrFile.article.uses2"],
    ],
  },
} satisfies RipemdMessages;

function Ripemd256ToolContent() {
  return (
    <RipemdHashPage
      algorithm="RIPEMD-256"
      messages={messages}
      legacyStorageKey="tools:ripemd256-hash-text-or-file:text"
    />
  );
}

export default function Ripemd256Tool() {
  return (
    <ToolPage>
      <Ripemd256ToolContent />
    </ToolPage>
  );
}
