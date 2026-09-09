import figlet, { type FontName } from "figlet";
import { loadAsciiFont } from "./font-loader";
import { generateAsciiArt } from "@workspace/tools/text/ascii";
import { AsciiError, type AsciiJob } from "@workspace/tools/text/ascii";

self.onmessage = async (event: MessageEvent<AsciiJob>) => {
  try {
    await loadAsciiFont(event.data.font);
    self.postMessage({
      result: generateAsciiArt(event.data, (text, options) =>
        figlet.textSync(text, { ...options, font: options.font as FontName }),
      ),
    });
  } catch (error) {
    self.postMessage({
      error: error instanceof AsciiError ? error.code : "invalid_input",
    });
  }
};
