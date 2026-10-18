import { useEffect, useState } from "react";
import { useWallet } from "../context/WalletContext";
import { Button, Card, HelperText, Input, Label, Notice, PageHeader, SectionTitle } from "../components/ui";
import { useRunner } from "../hooks/useRunner";
import { acceptOwnership, getConfig, proposeOwner, setGlobalPause, setModerator } from "../lib/client";
import { sameAddress, shortAddress } from "../lib/format";
import { isContractConfigured } from "../lib/networks";
import * as L from "../lib/rules.js";
import type { ProtocolConfig } from "../lib/types";

/** Protocol-wide controls. Only the owner, or moderators for pause, can succeed here; the contract enforces it. */
export function Admin() {
  const wallet = useWallet();
  const [cfg, setCfg] = useState<ProtocolConfig | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [modWallet, setModWallet] = useState("");
  const [newOwner, setNewOwner] = useState("");

  const reload = async () => {
    try {
      const c = await getConfig();
      setCfg(c);
      setPaused(!!c.global_paused);
      setLoadError(null);
    } catch (e) {
      setLoadError(L.parseContractError(e).message);
    }
  };

  useEffect(() => {
    if (isContractConfigured) void reload();
  }, []);

  const { busy, run } = useRunner(reload);
  const isOwner = !!cfg && !!wallet.address && sameAddress(cfg.owner, wallet.address);
  const modAddr = L.isValidAddress(L.normalizeAddress(modWallet)) ? L.normalizeAddress(modWallet) : null;
  const ownerAddr = L.isValidAddress(L.normalizeAddress(newOwner)) ? L.normalizeAddress(newOwner) : null;

  return (
    <div className="space-y-10">
      <PageHeader title="Protocol admin">
        Protocol-wide actions. These affect every event on this contract, so use them with care.
      </PageHeader>

      {!isContractConfigured && <Notice tone="warn" title="No contract configured">Set a contract address first.</Notice>}
      {loadError && <Notice tone="error" title="Could not load the config">{loadError}</Notice>}

      <Card className="space-y-2 p-6">
        <SectionTitle aside={<Button variant="secondary" onClick={() => void reload()}>Reload</Button>}>Current config</SectionTitle>
        {cfg ? (
          <>
            <p className="text-[14px] text-mist-200">
              Owner: <span className="font-mono">{shortAddress(cfg.owner, 6)}</span>
              {isOwner && <span className="ml-2 rounded-full bg-beacon-400/20 px-2 text-[11px] text-beacon-300">you</span>}
            </p>
            <p className="text-[14px] text-mist-200">Global pause: {cfg.global_paused ? "PAUSED" : "active"}</p>
            <p className="text-[13px] text-mist-400">
              Events created: {cfg.event_count} · Series created: {cfg.series_count}
            </p>
            <p className="text-[12px] text-mist-500">
              Limits: {cfg.max_attempts} claim attempts, {cfg.max_seats_cap} seats per event, {cfg.appeal_window_secs}s appeal window,{" "}
              {cfg.review_window_secs}s review window.
            </p>
          </>
        ) : (
          <p className="text-[13px] text-mist-500">Loading…</p>
        )}
      </Card>

      <Card className="space-y-4 p-6">
        <h3 className="font-display text-[16px] text-mist-100">Global pause</h3>
        <p className="text-[13px] text-mist-400">Owner or moderator only. Blocks claims and minting across every event at once.</p>
        <label className="flex items-center gap-2 text-[13px] text-mist-200">
          <input type="checkbox" checked={paused} onChange={(e) => setPaused(e.target.checked)} />
          Pause the whole protocol
        </label>
        <Button
          loading={busy === "pause"}
          disabled={!wallet.address}
          onClick={() => void run("pause", (s) => setGlobalPause(s, paused), paused ? "Protocol paused" : "Protocol resumed")}
        >
          Apply
        </Button>
      </Card>

      <Card className="space-y-4 p-6">
        <h3 className="font-display text-[16px] text-mist-100">Moderators</h3>
        <p className="text-[13px] text-mist-400">
          Owner only. A moderator can pause or unpause any event, resolve appeals and revoke badges across all events.
        </p>
        <div>
          <Label>Wallet</Label>
          <Input className="font-mono" value={modWallet} onChange={(e) => setModWallet(e.target.value)} placeholder="0x…" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" loading={busy === "mod-add"} disabled={!modAddr} onClick={() => void run("mod-add", (s) => setModerator(s, modAddr as string, true), "Moderator granted")}>
            Grant moderator
          </Button>
          <Button variant="danger" loading={busy === "mod-remove"} disabled={!modAddr} onClick={() => void run("mod-remove", (s) => setModerator(s, modAddr as string, false), "Moderator revoked")}>
            Revoke moderator
          </Button>
        </div>
      </Card>

      <Card className="space-y-4 p-6">
        <h3 className="font-display text-[16px] text-mist-100">Transfer protocol ownership</h3>
        <p className="text-[13px] text-mist-400">
          Two steps, the same as an event's organizer transfer. The new owner must accept from their own connected wallet.
        </p>
        <div>
          <Label>New owner wallet</Label>
          <Input className="font-mono" value={newOwner} onChange={(e) => setNewOwner(e.target.value)} placeholder="0x…" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" loading={busy === "owner-propose"} disabled={!ownerAddr} onClick={() => void run("owner-propose", (s) => proposeOwner(s, ownerAddr as string), "Ownership proposed")}>
            Propose new owner
          </Button>
          <Button variant="secondary" loading={busy === "owner-accept"} onClick={() => void run("owner-accept", (s) => acceptOwnership(s), "Ownership accepted")}>
            Accept ownership (as connected wallet)
          </Button>
        </div>
        {!wallet.address && <HelperText>Connect a wallet to send these transactions.</HelperText>}
      </Card>
    </div>
  );
}
