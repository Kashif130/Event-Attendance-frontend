import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, EmptyState, Notice, PageHeader } from "../components/ui";
import { useOpenEvents } from "../hooks/data";
import { getActiveEvents } from "../lib/client";
import { formatIsoTimestamp } from "../lib/format";
import { isContractConfigured } from "../lib/networks";
import * as L from "../lib/rules.js";
import type { EventRecord } from "../lib/types";

const PAGE = 12;

export function Events() {
  const navigate = useNavigate();
  const first = useOpenEvents();
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);

  useEffect(() => {
    if (!first.data) return;
    setEvents(first.data.items as EventRecord[]);
    setOffset(Number(first.data.next_offset));
    setTotal(Number(first.data.total));
  }, [first.data]);

  const loadMore = async () => {
    setLoadingMore(true);
    setMoreError(null);
    try {
      const page = await getActiveEvents(offset, PAGE);
      setEvents((prev) => [...prev, ...(page.items as EventRecord[])]);
      setOffset(Number(page.next_offset));
      setTotal(Number(page.total));
    } catch (e) {
      setMoreError(L.parseContractError(e).message);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader title="Open events" actions={<Button variant="secondary" onClick={() => void first.refresh()}>Refresh</Button>}>
        Verified events that are active and still have free seats. Claim a badge once you are on an event's list.
      </PageHeader>

      {!isContractConfigured && <Notice tone="warn" title="No contract configured">Set a contract address to load events.</Notice>}
      {first.error && <Notice tone="error" title="Could not load events">{first.error}</Notice>}

      {first.loading && events.length === 0 && <p className="text-[13px] text-mist-500">Loading events…</p>}

      {!first.loading && isContractConfigured && !first.error && events.length === 0 && (
        <EmptyState title="No open events right now">Check back later, or ask an organizer for an event id.</EmptyState>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {events.map((ev) => (
          <Card key={ev.id} className="flex flex-col gap-3 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-[17px] text-mist-100">{ev.name}</h3>
                <p className="mt-0.5 text-[12px] text-mist-500">{ev.location || "Location not given"}</p>
              </div>
              <span className="rounded-full border border-deep-600 px-2 py-0.5 font-mono text-[11px] text-mist-400">#{ev.id}</span>
            </div>
            {ev.description && <p className="text-[13px] leading-relaxed text-mist-400">{ev.description}</p>}
            <dl className="mt-auto space-y-1 text-[12px] text-mist-400">
              <div>Claims open {formatIsoTimestamp(ev.claim_from)}</div>
              <div>Claims close {formatIsoTimestamp(ev.claim_until)}</div>
              <div>{L.seatsLabel(Number(ev.seats_taken), Number(ev.max_seats))}</div>
            </dl>
            <Button className="self-start" onClick={() => navigate(`/claim?event=${ev.id}`)}>Claim this badge</Button>
          </Card>
        ))}
      </div>

      {moreError && <Notice tone="error">{moreError}</Notice>}
      {events.length > 0 && events.length < total && (
        <div>
          <Button variant="secondary" loading={loadingMore} onClick={() => void loadMore()}>
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
