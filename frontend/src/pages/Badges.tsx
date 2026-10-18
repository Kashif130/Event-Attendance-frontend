import { useEffect, useState } from "react";
import { useWallet } from "../context/WalletContext";
import { Button, Card, EmptyState, HelperText, Input, Label, Notice, PageHeader, SectionTitle } from "../components/ui";
import { getSeriesProgress, getWalletBadges } from "../lib/client";
import { shortAddress } from "../lib/format";
import { isContractConfigured } from "../lib/networks";
import * as L from "../lib/rules.js";
import type { BadgeRow, SeriesProgress } from "../lib/types";

const PAGE = 12;

export function Badges() {
  const wallet = useWallet();
  const [wantWallet, setWantWallet] = useState("");
  const [badges, setBadges] = useState<BadgeRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  const [seriesId, setSeriesId] = useState("");
  const [progress, setProgress] = useState<SeriesProgress | null>(null);
  const [seriesError, setSeriesError] = useState<string | null>(null);

  // Default to the connected wallet, and reload when it changes.
  useEffect(() => {
    if (wallet.address) setWantWallet(wallet.address);
  }, [wallet.address]);

  const load = async (reset: boolean) => {
    const w = L.normalizeAddress(wantWallet);
    if (!L.isValidAddress(w)) return setError("Enter a valid wallet address.");
    setLoading(true);
    setError(null);
    try {
      const from = reset ? 0 : offset;
      const page = await getWalletBadges(w, from, PAGE);
      setBadges((prev) => (reset ? (page.items as BadgeRow[]) : [...prev, ...(page.items as BadgeRow[])]));
      setOffset(Number(page.next_offset));
      setTotal(Number(page.total));
      setLoadedFor(w);
    } catch (e) {
      setError(L.parseContractError(e).message);
    } finally {
      setLoading(false);
    }
  };

  const checkSeries = async () => {
    const w = L.normalizeAddress(wantWallet);
    if (!L.isValidAddress(w)) return setSeriesError("Enter a valid wallet address above.");
    setSeriesError(null);
    try {
      setProgress(await getSeriesProgress(seriesId, w));
    } catch (e) {
      setProgress(null);
      setSeriesError(L.parseContractError(e).message);
    }
  };

  return (
    <div className="space-y-10">
      <PageHeader title="My badges">
        Every attendance badge held by a wallet. Badges are non-transferable: they stay with the address that earned them.
      </PageHeader>

      {!isContractConfigured && <Notice tone="warn" title="No contract configured">Set a contract address to read badges.</Notice>}

      <Card className="p-6">
        <SectionTitle>Badges</SectionTitle>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[16rem] flex-1">
            <Label hint={wallet.address ? "connected wallet" : undefined}>Wallet</Label>
            <Input className="font-mono" placeholder="0x…" value={wantWallet} onChange={(e) => setWantWallet(e.target.value)} />
          </div>
          <Button loading={loading} onClick={() => void load(true)}>Load badges</Button>
        </div>
        {error && <HelperText tone="error">{error}</HelperText>}

        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {badges.map((b) => (
            <div key={`${b.event_id}-${b.serial}`} className="rounded-md border border-deep-700 bg-deep-950/50 p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="font-display text-[16px] text-mist-100">Event #{String(b.event_id)}</p>
                <span className={`rounded-full border px-2 py-0.5 text-[11px] ${b.revoked ? "border-ember-500/50 text-ember-400" : "border-jade-500/50 text-jade-400"}`}>
                  {b.revoked ? "Revoked" : "Valid"}
                </span>
              </div>
              <p className="mt-2 text-[12px] text-mist-400">Serial #{String(b.serial)} · source: {b.source}</p>
              {b.revoked && <p className="mt-1 text-[12px] text-ember-400">Reason: {b.revoke_reason}</p>}
            </div>
          ))}
        </div>

        {loadedFor && badges.length === 0 && !loading && (
          <div className="mt-6">
            <EmptyState title="No badges yet">{shortAddress(loadedFor)} has not claimed a badge.</EmptyState>
          </div>
        )}
        {badges.length > 0 && badges.length < total && (
          <div className="mt-4">
            <Button variant="secondary" loading={loading} onClick={() => void load(false)}>Load more</Button>
          </div>
        )}
      </Card>

      <Card className="p-6">
        <SectionTitle>Series progress</SectionTitle>
        <p className="mb-4 text-[13px] text-mist-400">Hold a badge for every event in a series to claim the series credential.</p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[10rem] flex-1">
            <Label>Series id</Label>
            <Input type="number" min={0} value={seriesId} onChange={(e) => setSeriesId(e.target.value)} />
          </div>
          <Button variant="secondary" onClick={() => void checkSeries()} disabled={seriesId === ""}>Check progress</Button>
        </div>
        {seriesError && <HelperText tone="error">{seriesError}</HelperText>}
        {progress && (
          <div className="mt-4 space-y-1 text-[14px] text-mist-200">
            <p>{progress.completed} of {progress.total} events completed</p>
            <p className={progress.complete ? "text-jade-400" : "text-mist-400"}>
              {progress.complete ? "Complete: the series credential can be claimed." : "Not complete yet."}
            </p>
            <p className="text-mist-400">
              {progress.series_badge_serial ? `Series credential claimed (serial ${String(progress.series_badge_serial)}).` : "Series credential not claimed."}
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
