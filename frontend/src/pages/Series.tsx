import { useState } from "react";
import type { FormEvent } from "react";
import { useWallet } from "../context/WalletContext";
import { Button, Card, HelperText, Input, Label, Notice, PageHeader, SectionTitle } from "../components/ui";
import { useRunner } from "../hooks/useRunner";
import { claimSeriesBadge, createSeries, getSeries, getSeriesProgress } from "../lib/client";
import { shortAddress } from "../lib/format";
import { isContractConfigured } from "../lib/networks";
import * as L from "../lib/rules.js";
import type { SeriesProgress, SeriesRecord } from "../lib/types";

export function Series() {
  const wallet = useWallet();
  const [name, setName] = useState("");
  const [ids, setIds] = useState("");
  const [image, setImage] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [createBusy, setCreateBusy] = useState(false);
  const [createdNote, setCreatedNote] = useState<string | null>(null);

  const [sid, setSid] = useState("");
  const [series, setSeries] = useState<SeriesRecord | null>(null);
  const [progress, setProgress] = useState<SeriesProgress | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadSeries = async () => {
    setLoadError(null);
    try {
      const s = await getSeries(sid.trim());
      setSeries(s);
      const w = wallet.address ?? "";
      setProgress(L.isValidAddress(w) ? await getSeriesProgress(sid.trim(), w) : null);
    } catch (e) {
      setSeries(null);
      setProgress(null);
      setLoadError(L.parseContractError(e).message);
    }
  };

  const { busy, run } = useRunner(loadSeries);

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreatedNote(null);
    if (!wallet.signer) return setCreateError("Connect a wallet first.");
    if (name.trim() === "") return setCreateError("Give the series a name.");
    const list = ids.replace(/\s+/g, "");
    if (!/^\d+(,\d+)*$/.test(list)) return setCreateError("Event ids must be numbers separated by commas.");
    setCreateBusy(true);
    try {
      await createSeries(wallet.signer, name.trim(), list, image.trim());
      setCreatedNote("Series created. Its id is the next number in the list; load it below.");
      setName("");
      setIds("");
      setImage("");
    } catch (err) {
      setCreateError(L.parseContractError(err).message);
    } finally {
      setCreateBusy(false);
    }
  };

  const complete = !!progress && progress.complete && !Number(progress.series_badge_serial);

  return (
    <div className="space-y-10">
      <PageHeader title="Series credentials">
        Hold a badge for every event in a series to claim the series credential. Up to 10 events per series.
      </PageHeader>

      {!isContractConfigured && <Notice tone="warn" title="No contract configured">Set a contract address first.</Notice>}

      <Card className="space-y-4 p-6">
        <SectionTitle>Create a series</SectionTitle>
        <form onSubmit={onCreate} className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label>Name</Label>
            <Input maxLength={100} required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Label hint="comma separated">Event ids</Label>
            <Input required placeholder="0,1,2" value={ids} onChange={(e) => setIds(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Label hint="https only, optional">Image URL</Label>
            <Input maxLength={200} value={image} onChange={(e) => setImage(e.target.value)} />
          </div>
          <div className="md:col-span-2 space-y-2">
            {createError && <HelperText tone="error">{createError}</HelperText>}
            {createdNote && <Notice tone="success">{createdNote}</Notice>}
            <Button type="submit" loading={createBusy} disabled={!wallet.address}>Create series</Button>
          </div>
        </form>
      </Card>

      <Card className="space-y-4 p-6">
        <SectionTitle>View and claim</SectionTitle>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[10rem] flex-1">
            <Label>Series id</Label>
            <Input type="number" min={0} value={sid} onChange={(e) => setSid(e.target.value)} />
          </div>
          <Button variant="secondary" disabled={sid === ""} onClick={() => void loadSeries()}>Load</Button>
        </div>
        {loadError && <HelperText tone="error">{loadError}</HelperText>}

        {series && (
          <div className="space-y-2 text-[14px] text-mist-200">
            <p className="font-display text-[17px] text-mist-100">{series.name}</p>
            <p>Events: {series.event_ids.map(String).join(", ")}</p>
            {progress ? (
              <p>
                Progress for {shortAddress(wallet.address)}: {progress.completed} of {progress.total}
              </p>
            ) : (
              <p className="text-mist-500">Connect a wallet to see your progress.</p>
            )}
            {complete && (
              <Button loading={busy === "claim"} onClick={() => void run("claim", (s) => claimSeriesBadge(s, sid.trim()), "Series credential claimed")}>
                Claim series credential
              </Button>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
