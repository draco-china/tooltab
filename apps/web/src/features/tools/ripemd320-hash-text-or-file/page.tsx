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
    title: m["tools.ripemd320HashTextOrFile.articleTitle"],
    summary: m["tools.ripemd320HashTextOrFile.articleSummary"],
    details: m["tools.ripemd320HashTextOrFile.articleDetails"],
    characteristicsTitle:
      m["shared.blakeHash.blake2bArticleCharacteristicsLabel"],
    characteristics: [
      [
        m["shared.blakeHash.blake2bArticleCharacteristics2Title"],
        m["tools.ripemd320HashTextOrFile.articleCharacteristics01"],
      ],
      [
        m["tools.md4HashTextOrFile.article.characteristics10"],
        m["tools.md4HashTextOrFile.article.characteristics11"],
      ],
      [
        m["shared.blakeHash.blake2bArticleCharacteristics3Title"],
        m["tools.ripemd320HashTextOrFile.articleCharacteristics21"],
      ],
      [
        m["tools.md4HashTextOrFile.article.characteristics30"],
        m["tools.ripemd320HashTextOrFile.articleCharacteristics31"],
      ],
      [
        m["tools.ripemd128HashTextOrFile.article.characteristics40"],
        m["tools.ripemd320HashTextOrFile.articleCharacteristics41"],
      ],
    ],
    usesTitle: m["common.adler32articlecommonuses"],
    uses: [
      m["tools.ripemd128HashTextOrFile.article.uses0"],
      m["tools.ripemd128HashTextOrFile.article.uses1"],
      m["tools.ripemd128HashTextOrFile.article.uses2"],
    ],
    noteTitle: m["tools.ripemd320HashTextOrFile.articleNoteTitle"],
    noteBody: m["tools.ripemd320HashTextOrFile.articleNoteBody"],
  },
} satisfies RipemdMessages;

function Ripemd320ToolContent() {
  return (
    <RipemdHashPage
      algorithm="RIPEMD-320"
      messages={messages}
      legacyStorageKey="tools:ripemd320-hash-text-or-file:text"
    />
  );
}

export default function Ripemd320Tool() {
  return (
    <ToolPage>
      <Ripemd320ToolContent />
    </ToolPage>
  );
}
