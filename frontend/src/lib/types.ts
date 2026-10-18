import type { Eip1193Provider } from "./injectedWallets";

export type WalletMode = "none" | "burner-locked" | "burner-unlocked" | "injected";

/** A usable signer: an address, optionally with the private key that controls it (built-in wallet),
 *  or with the EIP-1193 provider of the browser wallet that holds the key (extension wallets). */
export interface Signer {
  address: `0x${string}`;
  privateKey?: `0x${string}`;
  provider?: Eip1193Provider;
}

/** `get_config`: protocol-wide settings and roles. */
export interface ProtocolConfig {
  owner: string;
  global_paused: boolean;
  event_count: number;
  series_count: number;
  max_attempts: number;
  max_seats_cap: number;
  appeal_window_secs: number;
  review_window_secs: number;
}

/** `get_event` / rows of `get_active_events`. Times are ISO strings in UTC. */
export interface EventRecord {
  id: number;
  name: string;
  description: string;
  location: string;
  organizer: string;
  status: string;
  verified: boolean;
  paused: boolean;
  source_prefix: string;
  starts_at: string;
  claim_from: string;
  claim_until: string;
  max_seats: number;
  seats_taken: number;
  require_name: boolean;
  require_preregistration: boolean;
}

/** `get_claim_requirements` for one event and one wallet. */
export interface ClaimRequirements {
  event_id: number;
  status: string;
  claim_open: boolean;
  attempts_left: number;
  event_code: string;
  source_prefix: string;
  require_name: boolean;
  require_preregistration: boolean;
  is_registered: boolean;
}

/** One badge, as returned by `get_wallet_badges` (items) and `get_event_badges` (items). */
export interface BadgeRow {
  event_id: number;
  wallet: string;
  serial: number;
  source: string;
  revoked: boolean;
  revoke_reason: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  next_offset: number;
}

export interface SeriesRecord {
  name: string;
  event_ids: number[];
}

export interface SeriesProgress {
  completed: number;
  total: number;
  complete: boolean;
  series_badge_serial: number;
}

export interface VerifyResult {
  valid: boolean;
  reason: string;
  event_name: string | null;
  serial: number | null;
  source: string | null;
}

export interface ConnectionCheckResult {
  name: string;
  ok: boolean;
  value?: unknown;
  error?: string;
}
