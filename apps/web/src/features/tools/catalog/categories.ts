import type { MessageFunction, MessageKey } from "@/lib/message-keys";
import { m } from "@/paraglide/messages.js";
export const toolCategories = [
  {
    id: "image-design",
    nameKey: "home.categoryimage",
    nameMessage: m["home.categoryimage"],
    tasks: [
      {
        id: "imageEdit",
        nameKey: "home.taskimageedit",
        nameMessage: m["home.taskimageedit"],
      },
      {
        id: "imageConvert",
        nameKey: "home.taskimageconvert",
        nameMessage: m["home.taskimageconvert"],
      },
      {
        id: "colors",
        nameKey: "home.taskcolors",
        nameMessage: m["home.taskcolors"],
      },
      {
        id: "codes",
        nameKey: "home.taskcodes",
        nameMessage: m["home.taskcodes"],
      },
    ],
  },
  {
    id: "files-documents",
    nameKey: "home.categoryfiles",
    nameMessage: m["home.categoryfiles"],
    tasks: [
      {
        id: "pdf",
        nameKey: "home.taskpdf",
        nameMessage: m["home.taskpdf"],
      },
      {
        id: "archives",
        nameKey: "home.taskarchives",
        nameMessage: m["home.taskarchives"],
      },
      {
        id: "fileConvert",
        nameKey: "home.taskfileconvert",
        nameMessage: m["home.taskfileconvert"],
      },
    ],
  },
  {
    id: "text-reading",
    nameKey: "home.categorytext",
    nameMessage: m["home.categorytext"],
    tasks: [
      {
        id: "textEdit",
        nameKey: "home.tasktextedit",
        nameMessage: m["home.tasktextedit"],
      },
      {
        id: "writing",
        nameKey: "home.taskwriting",
        nameMessage: m["home.taskwriting"],
      },
      {
        id: "textCheck",
        nameKey: "home.tasktextcheck",
        nameMessage: m["home.tasktextcheck"],
      },
    ],
  },
  {
    id: "data-conversion",
    nameKey: "home.categorydata",
    nameMessage: m["home.categorydata"],
    tasks: [
      {
        id: "structuredData",
        nameKey: "home.taskstructureddata",
        nameMessage: m["home.taskstructureddata"],
      },
      {
        id: "encoding",
        nameKey: "home.taskencoding",
        nameMessage: m["home.taskencoding"],
      },
      {
        id: "validation",
        nameKey: "home.taskvalidation",
        nameMessage: m["home.taskvalidation"],
      },
    ],
  },
  {
    id: "development",
    nameKey: "home.categorydevelopment",
    nameMessage: m["home.categorydevelopment"],
    tasks: [
      {
        id: "formatCode",
        nameKey: "home.taskformatcode",
        nameMessage: m["home.taskformatcode"],
      },
      {
        id: "configuration",
        nameKey: "home.taskconfiguration",
        nameMessage: m["home.taskconfiguration"],
      },
      {
        id: "identifiers",
        nameKey: "home.taskidentifiers",
        nameMessage: m["home.taskidentifiers"],
      },
    ],
  },
  {
    id: "network-addresses",
    nameKey: "home.categorynetwork",
    nameMessage: m["home.categorynetwork"],
    tasks: [
      {
        id: "subnets",
        nameKey: "home.tasksubnets",
        nameMessage: m["home.tasksubnets"],
      },
      {
        id: "lookups",
        nameKey: "home.tasklookups",
        nameMessage: m["home.tasklookups"],
      },
      {
        id: "addresses",
        nameKey: "home.taskaddresses",
        nameMessage: m["home.taskaddresses"],
      },
    ],
  },
  {
    id: "security",
    nameKey: "home.categorysecurity",
    nameMessage: m["home.categorysecurity"],
    tasks: [
      {
        id: "passwords",
        nameKey: "home.taskpasswords",
        nameMessage: m["home.taskpasswords"],
      },
      {
        id: "encryption",
        nameKey: "home.taskencryption",
        nameMessage: m["home.taskencryption"],
      },
      {
        id: "checksums",
        nameKey: "home.taskchecksums",
        nameMessage: m["home.taskchecksums"],
      },
    ],
  },
  {
    id: "time-calculation",
    nameKey: "home.categorytime",
    nameMessage: m["home.categorytime"],
    tasks: [
      {
        id: "dates",
        nameKey: "home.taskdates",
        nameMessage: m["home.taskdates"],
      },
      {
        id: "timing",
        nameKey: "home.tasktiming",
        nameMessage: m["home.tasktiming"],
      },
      {
        id: "numbers",
        nameKey: "home.tasknumbers",
        nameMessage: m["home.tasknumbers"],
      },
    ],
  },
  {
    id: "media-devices",
    nameKey: "home.categorymedia",
    nameMessage: m["home.categorymedia"],
    tasks: [
      {
        id: "recording",
        nameKey: "home.taskrecording",
        nameMessage: m["home.taskrecording"],
      },
      {
        id: "camera",
        nameKey: "home.taskcamera",
        nameMessage: m["home.taskcamera"],
      },
      {
        id: "devices",
        nameKey: "home.taskdevices",
        nameMessage: m["home.taskdevices"],
      },
    ],
  },
] as const satisfies readonly {
  id: string;
  nameKey: MessageKey;
  nameMessage: MessageFunction;
  tasks: readonly {
    id: string;
    nameKey: MessageKey;
    nameMessage: MessageFunction;
  }[];
}[];
export type ToolCategory = (typeof toolCategories)[number]["id"];
export type ToolTask = (typeof toolCategories)[number]["tasks"][number]["id"];

const categoryOrder: readonly ToolCategory[] = [
  "security",
  "development",
  "text-reading",
  "network-addresses",
  "image-design",
  "data-conversion",
  "files-documents",
  "time-calculation",
  "media-devices",
];

export const orderedToolCategories = categoryOrder.flatMap((id) => {
  const category = toolCategories.find((item) => item.id === id);
  return category ? [category] : [];
});
