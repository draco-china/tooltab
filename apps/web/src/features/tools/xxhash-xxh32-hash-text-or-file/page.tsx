import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import { XxHashTool } from "../xxhash/page";
function Xxh32ToolContent() {
  return <XxHashTool algorithm="XXH32" />;
}

export default function Xxh32Tool() {
  return (
    <ToolPage>
      <Xxh32ToolContent />
    </ToolPage>
  );
}
