import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useWallet } from "../context/WalletContext";
import { Button, Card, HelperText, Input, Label, Notice, PageHeader, SectionTitle, Textarea } from "../components/ui";
import { useRunner } from "../hooks/useRunner";
import {
  acceptEventOrganizer,
  addAttendees,
  cancelEvent,
  closeEvent,
  createEvent,
  extendClaimWindow,
  getEvent,
  getEventBadges,
  getVerifyToken,
  organizerMint,
  proposeEventOrganizer,
  removeAttendee,
  resolveAppeal,
  revokeBadge,
  setEventPaused,
  setOperator,
  verifyPrefix,
} from "../lib/client";
import type { EventForm } from "../lib/client";
import { formatIsoTimestamp } from "../lib/format";
import { isContractConfigured } from "../lib/networks";
import * as L from "../lib/rules.js";
import type { BadgeRow, EventRecord } from "../lib/types";

const EMPTY_FORM = {
  name: "",
  description: "",
  location: "",
  eventCode: "",
  sourcePrefix: "https://",
  startsAt: "",
  claimFrom: "",
  claimUntil: "",
  maxSeats: "50",
  imageUri: "",
  requireName: false,
  requirePreregistration: false,
};

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="space-y-4 p-6">
      <h3 className="font-display text-[16px] text-mist-100">{title}</h3>
      {children}
    </Card>
  );
}

export function Organizer() {
  const wallet = useWallet();
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [createBusy, setCreateBusy] = useState(false);
  const [createdNote, setCreatedNote] = useState<string | null>(null);

  const [eventId, setEventId] = useState("");
  const [managed, setManaged] = useState<{ event: EventRecord; token: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [issued, setIssued] = useState<BadgeRow[] | null>(null);

  const [wallets, setWallets] = useState("");
  const [mintWallet, setMintWallet] = useState("");
  const [mintReason, setMintReason] = useState("");
  const [revokeWallet, setRevokeWallet] = useState("");
  const [revokeReason, setRevokeReason] = useState("");
  const [appealWallet, setAppealWallet] = useState("");
  const [approve, setApprove] = useState(true);
  const [staffWallet, setStaffWallet] = useState("");
  const [removeWallet, setRemoveWallet] = useState("");
  const [paused, setPaused] = useState(false);
  const [newClaimUntil, setNewClaimUntil] = useState("");
  const [newOrganizer, setNewOrganizer] = useState("");

  const id = eventId.trim();

  const reload = async () => {
    if (!managed && id === "") return;
    try {
      const event = await getEvent(id);
      const token = await getVerifyToken(id);
      setManaged({ event, token });
      setPaused(!!event.paused);
    } catch {
      /* keep the last loaded state */
    }
  };

  const { busy, run } = useRunner(reload);

  const loadEvent = async () => {
    setLoadError(null);
    setIssued(null);
    try {
      const event = await getEvent(id);
      const token = await getVerifyToken(id);
      setManaged({ event, token });
      setPaused(!!event.paused);
    } catch (e) {
      setManaged(null);
      setLoadError(L.parseContractError(e).message);
    }
  };

  const onCreate = async (ev: FormEvent) => {
    ev.preventDefault();
    const values = { ...form, requireName: form.requireName, requirePreregistration: form.requirePreregistration };
    const errors = L.validateEventForm(values);
    setFormErrors(errors);
    if (errors.length || !wallet.signer) {
      if (!wallet.signer) setFormErrors(["Connect a wallet first. Writes are signed by that account."]);
      return;
    }
    setCreateBusy(true);
    setCreatedNote(null);
    try {
      await createEvent(wallet.signer, values as EventForm);
      setCreatedNote("Event created. Its id is the next number in the list. Load it below to get the verify token.");
      setForm(EMPTY_FORM);
    } catch (e) {
      setFormErrors([L.parseContractError(e).message]);
    } finally {
      setCreateBusy(false);
    }
  };

  const addressOr = (value: string): string | null => {
    const w = L.normalizeAddress(value);
    return L.isValidAddress(w) ? w : null;
  };

  const eventInput = (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-[10rem] flex-1">
        <Label>Event id</Label>
        <Input type="number" min={0} value={eventId} onChange={(e) => setEventId(e.target.value)} />
      </div>
      <Button variant="secondary" onClick={() => void loadEvent()} disabled={id === ""}>
        Load
      </Button>
    </div>
  );

  return (
    <div className="space-y-12">
      <PageHeader title="Organizer">
        Create an event, prove you control its confirmation page, register attendees and manage the event. Only the event's
        organizer, or a staff wallet they add, can do this.
      </PageHeader>

      {!isContractConfigured && <Notice tone="warn" title="No contract configured">Set a contract address first.</Notice>}
      {!wallet.address && <Notice tone="info" title="Connect a wallet">Organizer actions are signed by the connected wallet.</Notice>}

      {/* ---------------- Create ---------------- */}
      <section>
        <SectionTitle>Create an event</SectionTitle>
        <form onSubmit={onCreate} className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label>Name</Label>
            <Input maxLength={100} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <Label hint={`${form.description.length}/300`}>Description</Label>
            <Textarea maxLength={300} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div>
            <Label>Location</Label>
            <Input maxLength={120} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </div>
          <div>
            <Label hint="6-40 letters, digits or -">Event code</Label>
            <Input required maxLength={40} placeholder="DEVCON-2099-7F3K" value={form.eventCode} onChange={(e) => setForm({ ...form, eventCode: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <Label hint="must end with /">Confirmation path prefix</Label>
            <Input required placeholder="https://events.example.com/checkin/" value={form.sourcePrefix} onChange={(e) => setForm({ ...form, sourcePrefix: e.target.value })} />
          </div>
          <div>
            <Label hint="UTC">Starts</Label>
            <Input type="datetime-local" required value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
          </div>
          <div>
            <Label hint="UTC">Seats</Label>
            <Input type="number" min={1} max={10000} required value={form.maxSeats} onChange={(e) => setForm({ ...form, maxSeats: e.target.value })} />
          </div>
          <div>
            <Label hint="UTC">Claims open</Label>
            <Input type="datetime-local" required value={form.claimFrom} onChange={(e) => setForm({ ...form, claimFrom: e.target.value })} />
          </div>
          <div>
            <Label hint="UTC">Claims close</Label>
            <Input type="datetime-local" required value={form.claimUntil} onChange={(e) => setForm({ ...form, claimUntil: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <Label hint="https only">Image URL</Label>
            <Input maxLength={200} value={form.imageUri} onChange={(e) => setForm({ ...form, imageUri: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-[13px] text-mist-200">
            <input type="checkbox" checked={form.requireName} onChange={(e) => setForm({ ...form, requireName: e.target.checked })} />
            Require a display name
          </label>
          <label className="flex items-center gap-2 text-[13px] text-mist-200">
            <input type="checkbox" checked={form.requirePreregistration} onChange={(e) => setForm({ ...form, requirePreregistration: e.target.checked })} />
            Only pre-registered wallets
          </label>
          <div className="md:col-span-2 space-y-2">
            {formErrors.map((e) => (
              <HelperText key={e} tone="error">{e}</HelperText>
            ))}
            {createdNote && <Notice tone="success">{createdNote}</Notice>}
            <Button type="submit" loading={createBusy} disabled={!wallet.address}>Create event</Button>
          </div>
        </form>
      </section>

      {/* ---------------- Manage ---------------- */}
      <section className="space-y-6">
        <SectionTitle>Manage an event</SectionTitle>
        {eventInput}
        {loadError && <HelperText tone="error">{loadError}</HelperText>}

        {managed && (
          <>
            <Card className="space-y-2 p-6">
              <h3 className="font-display text-[18px] text-mist-100">{managed.event.name}</h3>
              <p className="text-[13px] text-mist-400">
                Status: {managed.event.status} · {managed.event.verified ? "domain verified" : "domain NOT verified"} ·{" "}
                {managed.event.paused ? "paused" : "not paused"}
              </p>
              <p className="text-[13px] text-mist-400">Confirmation path: <span className="font-mono">{managed.event.source_prefix}</span></p>
              <p className="text-[13px] text-mist-400">
                Claims {formatIsoTimestamp(managed.event.claim_from)} to {formatIsoTimestamp(managed.event.claim_until)}
              </p>
              <p className="text-[13px] text-mist-400">{L.seatsLabel(Number(managed.event.seats_taken), Number(managed.event.max_seats))}</p>
            </Card>

            <Panel title="1. Domain verification">
              <p className="text-[13px] text-mist-400">
                Put this token in the <strong className="text-mist-200">main content</strong> of the page at your confirmation path, then verify.
              </p>
              <p className="break-all rounded-md border border-deep-700 bg-deep-950 p-3 font-mono text-[12px] text-mist-200">{managed.token}</p>
              <Button loading={busy === "verify"} onClick={() => void run("verify", (s) => verifyPrefix(s, id), "Domain verification sent", "The result shows in the event details once validators finish.")}>
                Verify domain
              </Button>
            </Panel>

            <Panel title="2. Attendees">
              <Label hint="up to 100 per batch">Wallets (comma or line separated)</Label>
              <Textarea placeholder="0x…, 0x…" value={wallets} onChange={(e) => setWallets(e.target.value)} />
              <Button
                loading={busy === "add"}
                disabled={wallets.trim() === ""}
                onClick={() => {
                  const list = wallets.split(/[\s,]+/).filter(Boolean).map((w) => L.normalizeAddress(w));
                  if (list.some((w) => !L.isValidAddress(w))) return setLoadError("One or more wallets are not valid addresses.");
                  void run("add", (s) => addAttendees(s, id, list.join(",")), "Wallets registered");
                }}
              >
                Register wallets
              </Button>

              <div className="border-t border-deep-700 pt-4">
                <h4 className="mb-3 text-[13px] font-medium text-mist-200">Organizer minting</h4>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <Label>Wallet</Label>
                    <Input className="font-mono" value={mintWallet} onChange={(e) => setMintWallet(e.target.value)} placeholder="0x…" />
                  </div>
                  <div>
                    <Label>Reason</Label>
                    <Input maxLength={200} value={mintReason} onChange={(e) => setMintReason(e.target.value)} placeholder="QR check-in at door" />
                  </div>
                </div>
                <Button
                  className="mt-3"
                  loading={busy === "mint"}
                  disabled={!addressOr(mintWallet)}
                  onClick={() => void run("mint", (s) => organizerMint(s, id, addressOr(mintWallet) as string, mintReason.trim()), "Badge minted")}
                >
                  Mint badge
                </Button>
              </div>
            </Panel>

            <Panel title="3. Badges and appeals">
              <div>
                <Button
                  variant="secondary"
                  onClick={async () => {
                    try {
                      setIssued((await getEventBadges(id, 0, 50)).items as BadgeRow[]);
                    } catch (e) {
                      setLoadError(L.parseContractError(e).message);
                    }
                  }}
                >
                  Show issued badges
                </Button>
              </div>
              {issued && (
                <ul className="space-y-1 text-[13px] text-mist-300">
                  {issued.length === 0 && <li className="text-mist-500">No badges issued yet.</li>}
                  {issued.map((b) => (
                    <li key={`${b.wallet}-${b.serial}`} className="font-mono">
                      #{String(b.serial)} · {b.wallet} · {b.source} {b.revoked ? `· revoked (${b.revoke_reason})` : ""}
                    </li>
                  ))}
                </ul>
              )}
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label>Wallet to revoke</Label>
                  <Input className="font-mono" value={revokeWallet} onChange={(e) => setRevokeWallet(e.target.value)} placeholder="0x…" />
                </div>
                <div>
                  <Label>Revoke reason</Label>
                  <Input maxLength={200} value={revokeReason} onChange={(e) => setRevokeReason(e.target.value)} />
                </div>
              </div>
              <Button
                variant="danger"
                loading={busy === "revoke"}
                disabled={!addressOr(revokeWallet)}
                onClick={() => void run("revoke", (s) => revokeBadge(s, id, addressOr(revokeWallet) as string, revokeReason.trim()), "Badge revoked")}
              >
                Revoke badge
              </Button>
              <div className="grid gap-3 border-t border-deep-700 pt-4 md:grid-cols-2">
                <div>
                  <Label>Appealing wallet</Label>
                  <Input className="font-mono" value={appealWallet} onChange={(e) => setAppealWallet(e.target.value)} placeholder="0x…" />
                </div>
                <label className="flex items-end gap-2 pb-2 text-[13px] text-mist-200">
                  <input type="checkbox" checked={approve} onChange={(e) => setApprove(e.target.checked)} />
                  Approve the appeal
                </label>
              </div>
              <Button
                variant="secondary"
                loading={busy === "appeal"}
                disabled={!addressOr(appealWallet)}
                onClick={() => void run("appeal", (s) => resolveAppeal(s, id, addressOr(appealWallet) as string, approve), "Appeal resolved")}
              >
                Resolve appeal
              </Button>
            </Panel>

            <Panel title="4. Lifecycle and staff">
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" loading={busy === "close"} onClick={() => void run("close", (s) => closeEvent(s, id), "Claims closed")}>
                  Close claims
                </Button>
                <Button
                  variant="danger"
                  loading={busy === "cancel"}
                  onClick={() => {
                    if (window.confirm("Cancel this event? New claims will stop.")) void run("cancel", (s) => cancelEvent(s, id), "Event cancelled");
                  }}
                >
                  Cancel event
                </Button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label>Staff wallet</Label>
                  <Input className="font-mono" value={staffWallet} onChange={(e) => setStaffWallet(e.target.value)} placeholder="0x…" />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" disabled={!addressOr(staffWallet)} onClick={() => void run("staff", (s) => setOperator(s, id, addressOr(staffWallet) as string, true), "Staff added")}>
                  Add staff
                </Button>
                <Button variant="secondary" disabled={!addressOr(staffWallet)} onClick={() => void run("staff", (s) => setOperator(s, id, addressOr(staffWallet) as string, false), "Staff removed")}>
                  Remove staff
                </Button>
              </div>
            </Panel>

            <Panel title="5. Pause, deadline and attendees">
              <label className="flex items-center gap-2 text-[13px] text-mist-200">
                <input type="checkbox" checked={paused} onChange={(e) => setPaused(e.target.checked)} />
                Pause this event
              </label>
              <Button variant="secondary" loading={busy === "pause"} onClick={() => void run("pause", (s) => setEventPaused(s, id, paused), paused ? "Event paused" : "Event resumed")}>
                Apply
              </Button>
              <p className="text-[12px] text-mist-500">A paused event blocks new claims without closing or cancelling it.</p>

              <div className="border-t border-deep-700 pt-4">
                <Label hint="UTC, can only move later">New claims-close time</Label>
                <Input type="datetime-local" value={newClaimUntil} onChange={(e) => setNewClaimUntil(e.target.value)} />
                <Button
                  className="mt-3"
                  variant="secondary"
                  loading={busy === "extend"}
                  disabled={newClaimUntil === ""}
                  onClick={() => void run("extend", (s) => extendClaimWindow(s, id, newClaimUntil), "Claim window extended")}
                >
                  Extend claim window
                </Button>
              </div>

              <div className="border-t border-deep-700 pt-4">
                <Label>Wallet to remove</Label>
                <Input className="font-mono" value={removeWallet} onChange={(e) => setRemoveWallet(e.target.value)} placeholder="0x…" />
                <Button
                  className="mt-3"
                  variant="danger"
                  loading={busy === "remove"}
                  disabled={!addressOr(removeWallet)}
                  onClick={() => void run("remove", (s) => removeAttendee(s, id, addressOr(removeWallet) as string), "Attendee removed")}
                >
                  Remove attendee
                </Button>
              </div>
            </Panel>

            <Panel title="6. Transfer organizer role">
              <Label>New organizer wallet</Label>
              <Input className="font-mono" value={newOrganizer} onChange={(e) => setNewOrganizer(e.target.value)} placeholder="0x…" />
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" disabled={!addressOr(newOrganizer)} onClick={() => void run("transfer", (s) => proposeEventOrganizer(s, id, addressOr(newOrganizer) as string), "Transfer proposed", "The new organizer must accept from their own wallet.")}>
                  Propose transfer
                </Button>
                <Button variant="secondary" onClick={() => void run("accept", (s) => acceptEventOrganizer(s, id), "Organizer role accepted")}>
                  Accept organizer role for this event
                </Button>
              </div>
            </Panel>
          </>
        )}
      </section>
    </div>
  );
}
