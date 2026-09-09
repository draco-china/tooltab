import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import { XxHashTool } from "../xxhash/page";
function Xxh364ToolContent() {
  return <XxHashTool algorithm="XXH3-64" />;
}

export default function Xxh364Tool() {
  return (
    <ToolPage>
      <Xxh364ToolContent />
    </ToolPage>
  );
}
