import { ShakeHashPage } from "./shake-page";
import { runShake128Worker } from "./worker-client";

export default function Shake128HashTextOrFile() {
  return (
    <ShakeHashPage
      variant={128}
      defaultOutputBits={256}
      legacyStorageKey="tools:shake128-hash-text-or-file:text"
      fileInputTestId="shake128-file-input"
      runWorker={runShake128Worker}
    />
  );
}
