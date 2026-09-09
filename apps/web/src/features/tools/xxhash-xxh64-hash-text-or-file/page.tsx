import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import { XxHashTool } from "../xxhash/page";
function Xxh64ToolContent() {
  return <XxHashTool algorithm="XXH64" />;
}

export default function Xxh64Tool() {
  return (
    <ToolPage>
      <Xxh64ToolContent />
    </ToolPage>
  );
}
