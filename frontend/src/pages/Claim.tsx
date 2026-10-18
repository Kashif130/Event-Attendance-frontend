import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useWallet } from "../context/WalletContext";
import { Button, Card, HelperText, Input, Label, Notice, PageHeader, Textarea } from "../components/ui";
import { useRunner } from "../hooks/useRunner";
import { appeal, getClaimRequirements, submitProof } from "../lib/client";
import { isContractConfigured } from "../lib/networks";
import * as L from "../lib/rules.js";
import type { ClaimRequirements } from "../lib/types";

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="grid grid-cols-[2rem_1fr] gap-x-4">
      <div className="flex flex-col items-center">
        <span className="flex h-8 w-8 items-center justify-center rounded-full border border-deep-600 bg-deep-900 text-[13px] font-medium text-mist-200">
          {n}
        </span>
        <span className="mt-2 w-px flex-1 bg-deep-700" aria-hidden />
      </div>
      <div className="pb-10">
        <h2 className="font-display text-[19px] font-semibold text-mist-100">{title}</h2>
        <div className="mt-3">{children}</div>
      </div>
    </section>
  );
}

export function Claim() {
  const wallet = useWallet();
  const address = wallet.address;
  const [params, setParams] = useSearchParams();
  const [eventId, setEventId] = useState(params.get("event") ?? "");
  const [req, setReq] = useState<ClaimRequirements | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [appealUrl, setAppealUrl] = useState("");
  const [appealNote, setAppealNote] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const load = async (id = eventId) => {
    if (!address || id.trim() === "") return;
    setLoading(true);
    setLoadError(null);
    try {
      setReq(await getClaimRequirements(id.trim(), address));
    } catch (e) {
      setReq(null);
      setLoadError(L.parseContractError(e).message);
    } finally {
      setLoading(false);
    }
  };

  const { busy, run } = useRunner(async () => {
    await load();
  });

  // Follow a link from the Events page: ?event=ID loads the requirements straight away.
  useEffect(() => {
    const fromLink = params.get("event");
    if (fromLink) setEventId(fromLink);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (eventId && address) void load(eventId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, eventId]);

  const onLoad = () => {
    setParams(eventId ? { event: eventId } : {});
    void load();
  };

  const onSubmit = async () => {
    if (!req || !address) return;
    const errors = L.validateClaim({ url, prefix: req.source_prefix, displayName, requireName: req.require_name });
    if (errors.length) return setFormError(errors[0]);
    setFormError(null);
    await run(
      "submit",
      (s) => submitProof(s, eventId.trim(), url.trim(), displayName.trim()),
      "Proof submitted",
      "Validators are reading the page. Reload the status in a minute.",
    );
  };

  const onAppeal = async () => {
    if (!address) return;
    if (!appealUrl.trim().startsWith("https://")) return setFormError("Paste the confirmation page URL for the appeal.");
    setFormError(null);
    await run(
      "appeal",
      (s) => appeal(s, eventId.trim(), appealUrl.trim(), appealNote.trim()),
      "Appeal sent",
      "A reviewer will look at it within the review window.",
    );
  };

  const instructions = req && address
    ? L.claimInstructions({ eventCode: req.event_code, wallet: address, requireName: req.require_name })
    : [];

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Claim your badge">
        Submit the confirmation page the organizer published. Validators check that it lists your wallet and the event code.
      </PageHeader>

      {!isContractConfigured && (
        <div className="mt-6">
          <Notice tone="warn" title="No contract configured">Set a contract address before sending anything.</Notice>
        </div>
      )}

      {!address && (
        <div className="mt-6">
          <Notice tone="info" title="Connect a wallet to begin">
            The badge is tied to the address you connect. Use the wallet button at the top.
          </Notice>
        </div>
      )}

      <div className="mt-10">
        <Step n={1} title="Choose the event">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[10rem] flex-1">
              <Label>Event id</Label>
              <Input type="number" min={0} value={eventId} onChange={(e) => setEventId(e.target.value)} placeholder="0" />
            </div>
            <Button variant="secondary" loading={loading} disabled={!address || eventId.trim() === ""} onClick={onLoad}>
              Load requirements
            </Button>
          </div>
          {loadError && <HelperText tone="error">{loadError}</HelperText>}
        </Step>

        {req && (
          <Step n={2} title="Put the proof on the confirmation page">
            <Card className="p-5">
              <p className="text-[13px] text-mist-300">
                Status: <span className="font-medium text-mist-100">{L.statusLabel(req.status)}</span>
                {" · "}Attempts left: <span className="font-medium text-mist-100">{req.attempts_left}</span>
              </p>
              {!req.claim_open && (
                <div className="mt-3">
                  <Notice tone="warn">Claims are not open for this event right now. Check the claim window and the event status.</Notice>
                </div>
              )}
              {req.require_preregistration && !req.is_registered && (
                <div className="mt-3">
                  <Notice tone="error">This event only admits pre-registered wallets, and yours is not registered.</Notice>
                </div>
              )}
              <p className="mt-4 text-[13px] text-mist-400">Your confirmation page must contain:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] text-mist-200">
                {instructions.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
              <p className="mt-3 text-[12px] text-mist-500">It must sit under: <span className="font-mono">{req.source_prefix}</span></p>
            </Card>
          </Step>
        )}

        {req && L.canRetry(req.status, Number(req.attempts_left)) && req.claim_open && (
          <Step n={3} title="Submit the link">
            <div className="space-y-4">
              <div>
                <Label>Confirmation page URL</Label>
                <Input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={req.source_prefix} />
              </div>
              {req.require_name && (
                <div>
                  <Label>Display name</Label>
                  <Input maxLength={80} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
                </div>
              )}
              {formError && <HelperText tone="error">{formError}</HelperText>}
              <Button loading={busy === "submit"} disabled={!address || !url.trim()} onClick={onSubmit}>
                Submit claim
              </Button>
              <HelperText>Validators read the page. Each attempt uses one of your remaining tries.</HelperText>
            </div>
          </Step>
        )}

        {req && L.canAppeal(req.status) && (
          <Step n={4} title="Appeal the rejection">
            <div className="space-y-4">
              <div>
                <Label>Confirmation page URL</Label>
                <Input type="url" value={appealUrl} onChange={(e) => setAppealUrl(e.target.value)} />
              </div>
              <div>
                <Label hint={`${appealNote.length}/300`}>Note for the reviewer</Label>
                <Textarea maxLength={300} value={appealNote} onChange={(e) => setAppealNote(e.target.value)} />
              </div>
              <Button variant="secondary" loading={busy === "appeal"} disabled={!address} onClick={onAppeal}>
                Send appeal
              </Button>
            </div>
          </Step>
        )}
      </div>
    </div>
  );
}
