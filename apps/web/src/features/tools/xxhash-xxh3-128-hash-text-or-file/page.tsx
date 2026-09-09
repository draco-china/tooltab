import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import { XxHashTool } from "../xxhash/page";
function Xxh3128ToolContent() {
  return <XxHashTool algorithm="XXH3-128" />;
}

export default function Xxh3128Tool() {
  return (
    <ToolPage>
      <Xxh3128ToolContent />
    </ToolPage>
  );
}
