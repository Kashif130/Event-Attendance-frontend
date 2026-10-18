import { Link } from "react-router-dom";
import { Card, CopyButton, EmptyState, InfoRow, Notice, PageHeader, SectionTitle, buttonClass } from "../components/ui";
import { useProtocolConfig } from "../hooks/data";
import { CONTRACT_ADDRESS, activeNetworkLabel, isContractConfigured } from "../lib/networks";
import { shortAddress } from "../lib/format";

const steps = [
  {
    title: "Organizer verifies the page",
    body: "Create an event, put the token shown in the app into the main content of your confirmation page, then verify the path. Only then can claims start.",
  },
  {
    title: "Attendees claim a badge",
    body: "Each attendee submits the link to the confirmation page that lists their wallet and the event code. Validators read it and decide.",
  },
  {
    title: "Anyone can verify",
    body: "A badge is non-transferable and can be checked by event id and wallet, with no account and no signer needed.",
  },
];

export function Overview() {
  const cfg = useProtocolConfig();

  return (
    <div className="space-y-12">
      <PageHeader
        title="Proof of attendance, checked by validators"
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/events" className={buttonClass("primary")}>Open events</Link>
            <Link to="/verify" className={buttonClass("secondary")}>Verify a badge</Link>
          </div>
        }
      >
        Attendance badges for in-person and hybrid events. An organizer proves control of a confirmation page, attendees claim
        non-transferable badges by submitting it, and GenLayer validators check the page before anything is written.
      </PageHeader>

      {!isContractConfigured && (
        <Notice tone="warn" title="No contract configured">
          Set VITE_CONTRACT_ADDRESS, or paste an address in the network menu, to read live data.
        </Notice>
      )}

      <section>
        <SectionTitle>How it works</SectionTitle>
        <div className="grid gap-4 md:grid-cols-3">
          {steps.map((s, i) => (
            <Card key={s.title} className="p-5">
              <p className="font-mono text-[12px] text-beacon-300">0{i + 1}</p>
              <h3 className="mt-2 font-display text-[17px] text-mist-100">{s.title}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-mist-400">{s.body}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <Card className="p-6">
          <SectionTitle>Protocol</SectionTitle>
          {!isContractConfigured ? (
            <EmptyState title="Not connected to a contract" />
          ) : cfg.error ? (
            <Notice tone="error" title="Could not read the contract">{cfg.error}</Notice>
          ) : cfg.data ? (
            <dl>
              <InfoRow label="Events created">{cfg.data.event_count}</InfoRow>
              <InfoRow label="Series created">{cfg.data.series_count}</InfoRow>
              <InfoRow label="Global pause">{cfg.data.global_paused ? "Paused" : "Active"}</InfoRow>
              <InfoRow label="Owner">
                <span className="font-mono">{shortAddress(cfg.data.owner)}</span>
              </InfoRow>
              <InfoRow label="Claim attempts per event">{cfg.data.max_attempts}</InfoRow>
              <InfoRow label="Seat cap per event">{cfg.data.max_seats_cap}</InfoRow>
            </dl>
          ) : (
            <p className="text-[13px] text-mist-500">Loading…</p>
          )}
        </Card>

        <Card className="p-6">
          <SectionTitle>Contract</SectionTitle>
          <dl>
            <InfoRow label="Network">{activeNetworkLabel}</InfoRow>
            <InfoRow label="Address">
              <span className="font-mono text-[12px]">{isContractConfigured ? CONTRACT_ADDRESS : "not set"}</span>
            </InfoRow>
          </dl>
          {isContractConfigured && (
            <div className="mt-3">
              <CopyButton value={CONTRACT_ADDRESS} label="Copy address" />
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}
