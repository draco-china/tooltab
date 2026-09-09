import { createFileRoute } from "@tanstack/react-router";
import Bip39MnemonicGeneratorPage from "@/features/tools/bip39-mnemonic-generator/page";
import { bip39MnemonicGeneratorHead } from "@/features/tools/bip39-mnemonic-generator/head";

import { Bip39MnemonicGeneratorRouteSkeleton } from "@/features/tools/bip39-mnemonic-generator/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/bip39-mnemonic-generator",
)({
  head: bip39MnemonicGeneratorHead,
  pendingComponent: Bip39MnemonicGeneratorRouteSkeleton,
  component: Bip39MnemonicGeneratorPage,
});
