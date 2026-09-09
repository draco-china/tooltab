import {
  Braces,
  Clock3,
  Code2,
  FileText,
  Globe2,
  Image,
  RadioTower,
  ShieldCheck,
  TextCursorInput,
} from "lucide-react";
import type { ToolCategory } from "@/features/tools/catalog/categories";

export const toolCategoryIcons = {
  "image-design": Image,
  "files-documents": FileText,
  "text-reading": TextCursorInput,
  "data-conversion": Braces,
  development: Code2,
  "network-addresses": Globe2,
  security: ShieldCheck,
  "time-calculation": Clock3,
  "media-devices": RadioTower,
} satisfies Record<ToolCategory, typeof Image>;
