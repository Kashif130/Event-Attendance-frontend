import { createAccount, createClient } from "genlayer-js";
import { activeChain, CONTRACT_ADDRESS } from "./networks";
import { createGenLayerAdapter, connectionCheck } from "./adapter.js";
import { withActiveProvider } from "./injectedWallets";
import { ensureWalletOnActiveNetwork } from "./evm";
import type { Signer, ProtocolConfig, EventRecord, ClaimRequirements, BadgeRow, Page, SeriesRecord, SeriesProgress, VerifyResult, ConnectionCheckResult } from "./types";

// Every contract call goes through contracts/EventAttendance.py. The adapter (adapter.js) owns the
// function names and argument order, and checks each receipt for a rejected execution.

type Adapter = ReturnType<typeof createGenLayerAdapter>;

// A read-only client needs no signer, so the public pages work before any wallet is connected.
const readClient = createClient({ chain: activeChain });
const readAdapter: Adapter = createGenLayerAdapter(readClient, CONTRACT_ADDRESS);

/** genlayer-js can return Maps and bigints. The UI wants plain objects and safe numbers. */
function normalize(value: unknown): unknown {
  if (value instanceof Map) {
    const obj: Record<string, unknown> = {};
    value.forEach((v, k) => {
      obj[String(k)] = normalize(v);
    });
    return obj;
  }
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === "bigint") {
    return value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= -BigInt(Number.MAX_SAFE_INTEGER)
      ? Number(value)
      : value.toString();
  }
  if (value && typeof value === "object") {
    const obj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) obj[k] = normalize(v);
    return obj;
  }
  return value;
}

async function view<T>(call: () => Promise<unknown>): Promise<T> {
  return normalize(await call()) as T;
}

/** Runs one write for a specific signer. A browser wallet is moved to the app's network first. */
export async function withSigner<T>(signer: Signer, fn: (adapter: Adapter) => Promise<T>): Promise<T> {
  const isPrivateKey = !!signer.privateKey;
  if (!isPrivateKey && signer.provider) await ensureWalletOnActiveNetwork(signer.provider);
  const account: unknown = isPrivateKey ? createAccount(signer.privateKey as `0x${string}`) : signer.address;
  const client = createClient({ chain: activeChain, account } as Parameters<typeof createClient>[0]);
  const adapter = createGenLayerAdapter(client, CONTRACT_ADDRESS);
  return withActiveProvider(isPrivateKey ? null : (signer.provider ?? null), () => fn(adapter));
}

/** Native-token balance for a wallet, for the wallet panel. */
export async function readClientBalance(address: `0x${string}`): Promise<bigint> {
  const client = readClient as unknown as { getBalance: (args: { address: `0x${string}` }) => Promise<bigint> };
  return client.getBalance({ address });
}

/** Resolves when the transaction is FINALIZED with a successful execution; rejects otherwise. */
export const awaitFinalization = (signer: Signer, hash: string) =>
  withSigner(signer, (adapter) => adapter.awaitFinalization(hash as `0x${string}`));

export const runConnectionCheck = (): Promise<ConnectionCheckResult[]> =>
  connectionCheck(readAdapter) as Promise<ConnectionCheckResult[]>;

// ---------------------------------------------------------------------------
// Views (free, no wallet)
// ---------------------------------------------------------------------------

export const getConfig = () => view<ProtocolConfig>(() => readAdapter.getConfig());
export const getActiveEvents = (offset: number, limit: number) =>
  view<Page<EventRecord>>(() => readAdapter.getActiveEvents(offset, limit));
export const getEvent = (id: number | string) => view<EventRecord>(() => readAdapter.getEvent(id));
export const getEventCount = async () => (await getConfig()).event_count;
/**
 * The contract computes claim_open from the node clock, which a read call may not have; it then
 * reports false even inside the window. The claim transaction itself always has a clock and the
 * contract re-checks the window there, so the UI recomputes the flag from the event record and the
 * browser clock when the contract says "closed". A wrong guess only costs a reverted transaction.
 */
export async function getClaimRequirements(id: number | string, wallet: string): Promise<ClaimRequirements> {
  const req = await view<ClaimRequirements>(() => readAdapter.getClaimRequirements(id, wallet));
  if (req.claim_open) return req;
  const ev = await view<EventRecord>(() => readAdapter.getEvent(id));
  const now = new Date().toISOString().slice(0, 19) + "Z";
  const open =
    ev.verified && ev.status === "active" && !ev.paused && ev.claim_from <= now && now <= ev.claim_until;
  return { ...req, claim_open: open };
}
export const getVerifyToken = (id: number | string) => view<string>(() => readAdapter.getVerifyToken(id));
export const getWalletBadges = (wallet: string, offset: number, limit: number) =>
  view<Page<BadgeRow>>(() => readAdapter.getWalletBadges(wallet, offset, limit));
export const getEventBadges = (id: number | string, offset: number, limit: number) =>
  view<Page<BadgeRow>>(() => readAdapter.getEventBadges(id, offset, limit));
export const getSeries = (sid: number | string) => view<SeriesRecord>(() => readAdapter.getSeries(sid));
export const checkSeriesBadge = (sid: number | string, wallet: string) =>
  view<Record<string, unknown>>(() => readAdapter.checkSeriesBadge(sid, wallet));
export const getSeriesProgress = (sid: number | string, wallet: string) =>
  view<SeriesProgress>(() => readAdapter.getSeriesProgress(sid, wallet));
export const verifyAttendance = (id: number | string, wallet: string) =>
  view<VerifyResult>(() => readAdapter.verifyAttendance(id, wallet));
export const isLocked = (id: number | string, wallet: string) =>
  view<boolean>(() => readAdapter.isLocked(id, wallet));
export const getBadgeMetadata = (id: number | string, wallet: string) =>
  view<Record<string, unknown>>(() => readAdapter.getBadgeMetadata(id, wallet));
export const isStaff = (id: number | string, wallet: string) => view<boolean>(() => readAdapter.isStaff(id, wallet));
export const isModerator = (wallet: string) => view<boolean>(() => readAdapter.isModerator(wallet));
export const getBadgeCount = (wallet: string) => view<number>(() => readAdapter.getBadgeCount(wallet));

// ---------------------------------------------------------------------------
// Writes (signed by the connected wallet)
// ---------------------------------------------------------------------------

export interface EventForm {
  name: string;
  description: string;
  location: string;
  eventCode: string;
  sourcePrefix: string;
  startsAt: string;
  claimFrom: string;
  claimUntil: string;
  maxSeats: string | number;
  requireName: boolean;
  requirePreregistration: boolean;
  imageUri: string;
}

export const createEvent = (s: Signer, f: EventForm) => withSigner(s, (a) => a.createEvent(f));
export const verifyPrefix = (s: Signer, id: string | number) => withSigner(s, (a) => a.verifyPrefix(id));
export const setOperator = (s: Signer, id: string | number, user: string, enabled: boolean) =>
  withSigner(s, (a) => a.setOperator(id, user, enabled));
export const addAttendees = (s: Signer, id: string | number, csv: string) => withSigner(s, (a) => a.addAttendees(id, csv));
export const removeAttendee = (s: Signer, id: string | number, wallet: string) =>
  withSigner(s, (a) => a.removeAttendee(id, wallet));
export const organizerMint = (s: Signer, id: string | number, wallet: string, reason: string) =>
  withSigner(s, (a) => a.organizerMint(id, wallet, reason));
export const submitProof = (s: Signer, id: string | number, url: string, displayName: string) =>
  withSigner(s, (a) => a.submitProof(id, url, displayName));
export const appeal = (s: Signer, id: string | number, url: string, note: string) =>
  withSigner(s, (a) => a.appeal(id, url, note));
export const resolveAppeal = (s: Signer, id: string | number, wallet: string, approve: boolean) =>
  withSigner(s, (a) => a.resolveAppeal(id, wallet, approve));
export const expireStale = (s: Signer, id: string | number, wallet: string) =>
  withSigner(s, (a) => a.expireStale(id, wallet));
export const revokeBadge = (s: Signer, id: string | number, wallet: string, reason: string) =>
  withSigner(s, (a) => a.revokeBadge(id, wallet, reason));
export const closeEvent = (s: Signer, id: string | number) => withSigner(s, (a) => a.closeEvent(id));
export const cancelEvent = (s: Signer, id: string | number) => withSigner(s, (a) => a.cancelEvent(id));
export const extendClaimWindow = (s: Signer, id: string | number, newClaimUntil: string) =>
  withSigner(s, (a) => a.extendClaimWindow(id, newClaimUntil));
export const setEventPaused = (s: Signer, id: string | number, paused: boolean) =>
  withSigner(s, (a) => a.setEventPaused(id, paused));
export const proposeEventOrganizer = (s: Signer, id: string | number, newOrganizer: string) =>
  withSigner(s, (a) => a.proposeEventOrganizer(id, newOrganizer));
export const acceptEventOrganizer = (s: Signer, id: string | number) => withSigner(s, (a) => a.acceptEventOrganizer(id));
export const createSeries = (s: Signer, name: string, idsCsv: string, imageUri: string) =>
  withSigner(s, (a) => a.createSeries(name, idsCsv, imageUri));
export const claimSeriesBadge = (s: Signer, sid: string | number) => withSigner(s, (a) => a.claimSeriesBadge(sid));
export const setModerator = (s: Signer, user: string, enabled: boolean) => withSigner(s, (a) => a.setModerator(user, enabled));
export const setGlobalPause = (s: Signer, paused: boolean) => withSigner(s, (a) => a.setGlobalPause(paused));
export const proposeOwner = (s: Signer, newOwner: string) => withSigner(s, (a) => a.proposeOwner(newOwner));
export const acceptOwnership = (s: Signer) => withSigner(s, (a) => a.acceptOwnership());
