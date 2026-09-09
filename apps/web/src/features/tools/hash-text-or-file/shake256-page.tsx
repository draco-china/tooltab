import { ShakeHashPage } from "./shake-page";
import { runShake256Worker } from "./worker-client";

export default function Shake256HashTextOrFile() {
  return (
    <ShakeHashPage
      variant={256}
      defaultOutputBits={512}
      legacyStorageKey="tools:shake256-hash-text-or-file:text"
      fileInputTestId="shake256-file-input"
      runWorker={runShake256Worker}
    />
  );
}
