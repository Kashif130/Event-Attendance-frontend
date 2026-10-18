import { useState } from "react";
import { Button, Card, HelperText, Input, Label, Notice, PageHeader } from "../components/ui";
import { getBadgeMetadata, isLocked, verifyAttendance } from "../lib/client";
import { fromWei } from "../lib/format";
import { isContractConfigured } from "../lib/networks";
import * as L from "../lib/rules.js";
import type { VerifyResult } from "../lib/types";

interface Outcome {
  result: VerifyResult;
  locked: boolean;
  metadata: Record<string, unknown> | null;
}

/** Anyone can check a badge. No wallet or signer is needed. */
export function Verify() {
  const [eventId, setEventId] = useState("");
  const [wallet, setWallet] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const check = async () => {
    const w = L.normalizeAddress(wallet);
    if (!L.isValidAddress(w)) return setError("Enter a valid wallet address.");
    if (eventId.trim() === "") return setError("Enter an event id.");
    setBusy(true);
    setError(null);
    try {
      const result = await verifyAttendance(eventId.trim(), w);
      const locked = await isLocked(eventId.trim(), w);
      const metadata = result.valid ? await getBadgeMetadata(eventId.trim(), w) : null;
      setOutcome({ result, locked, metadata });
    } catch (e) {
      setOutcome(null);
      setError(L.parseContractError(e).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <PageHeader title="Verify an attendance badge">
        Enter an event id and a wallet to see whether that wallet holds a valid badge for the event. No account is needed.
      </PageHeader>

      {!isContractConfigured && <Notice tone="warn" title="No contract configured">Set a contract address to verify badges.</Notice>}

      <Card className="space-y-4 p-6">
        <div>
          <Label>Event id</Label>
          <Input type="number" min={0} value={eventId} onChange={(e) => setEventId(e.target.value)} />
        </div>
        <div>
          <Label>Wallet</Label>
          <Input className="font-mono" placeholder="0x…" value={wallet} onChange={(e) => setWallet(e.target.value)} />
        </div>
        {error && <HelperText tone="error">{error}</HelperText>}
        <Button loading={busy} onClick={() => void check()}>Verify</Button>
      </Card>

      {outcome && (
        <Card className="space-y-3 p-6">
          <p className={`font-display text-[18px] ${outcome.result.valid ? "text-jade-400" : "text-ember-400"}`}>
            {outcome.result.valid ? "Valid attendance badge" : `Not valid: ${outcome.result.reason}`}
          </p>
          <dl className="space-y-1 text-[14px] text-mist-200">
            <div>Event: {outcome.result.event_name ?? "—"}</div>
            <div>Serial: {String(outcome.result.serial ?? "—")} · source: {outcome.result.source ?? "—"}</div>
            <div>Non-transferable badge held: {outcome.locked ? "yes" : "no"}</div>
          </dl>
          {outcome.metadata && (
            <pre className="overflow-x-auto rounded-md border border-deep-700 bg-deep-950 p-3 text-[12px] text-mist-300">
              {JSON.stringify(outcome.metadata, (_, v) => (typeof v === "bigint" ? fromWei(v, 0) : v), 2)}
            </pre>
          )}
        </Card>
      )}
    </div>
  );
}
