import { useCallback, useState } from "react";
import { useWallet } from "../context/WalletContext";
import { useToast } from "../context/ToastContext";
import type { Signer } from "../lib/types";
import { parseContractError } from "../lib/rules.js";
import { awaitFinalization } from "../lib/client";

/**
 * One place for the "check wallet -> mark busy -> send -> toast -> refresh" dance every action
 * button needs. `busy` holds the label of the action in flight so each button can show its own
 * spinner while the others stay disabled.
 */
export function useRunner(onDone?: () => void | Promise<void>) {
  const wallet = useWallet();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const run = useCallback(
    async (
      label: string,
      fn: (signer: Signer) => Promise<unknown>,
      successTitle: string,
      successDetail?: string,
    ): Promise<boolean> => {
      if (!wallet.signer) {
        toast.push("error", "Connect a wallet first.");
        return false;
      }
      setBusy(label);
      try {
        const result = (await fn(wallet.signer)) as { hash?: string; finalized?: boolean } | undefined;
        const hash = result?.hash;
        if (hash && !result?.finalized) {
          // Accepted is not final: say so, then confirm finalization in the background.
          toast.push("info", `${successTitle} (accepted, not yet final)`, `tx ${hash.slice(0, 10)}… ${successDetail ?? ""}`.trim());
          const signer = wallet.signer;
          void awaitFinalization(signer, hash).then(
            () => { toast.push("success", "Finalized", `tx ${hash.slice(0, 10)}…`); if (onDone) void onDone(); },
            (e) => toast.push("error", "Not finalized", parseContractError(e).message),
          );
        } else {
          toast.push("success", successTitle, successDetail);
        }
        if (onDone) await onDone();
        return true;
      } catch (e) {
        toast.push("error", "Transaction failed", parseContractError(e).message);
        return false;
      } finally {
        setBusy(null);
      }
    },
    [wallet.signer, toast, onDone],
  );

  return { busy, run };
}
