// Pure helpers shared by the UI and the tests. No DOM, no network.
// Rules here mirror contracts/EventAttendance.py. The contract is the source of truth;
// these checks only save the user a round trip.

export const MAX_TITLE = 100;
export const MAX_DESC = 300;
export const MAX_LOCATION = 120;
export const MAX_NAME = 80;
export const MAX_NOTE = 300;
export const MAX_REASON = 200;
export const MAX_IMAGE = 200;
export const MAX_SERIES_EVENTS = 10;
export const MAX_ATTEMPTS = 3;

const HEX = "0123456789abcdef";

export function normalizeAddress(a) {
  return String(a ?? "").trim().toLowerCase();
}

export function isValidAddress(a) {
  const s = normalizeAddress(a);
  return s.length === 42 && s.startsWith("0x") && [...s.slice(2)].every((c) => HEX.includes(c));
}

export function isValidEventCode(c) {
  const s = String(c ?? "");
  if (s.length < 6 || s.length > 40) return false;
  return [...s].every((ch) => (ch.charCodeAt(0) < 128 && /[A-Za-z0-9]/.test(ch)) || ch === "-");
}

export function isValidPrefix(p) {
  const s = String(p ?? "");
  if (!s.startsWith("https://") || !s.endsWith("/") || s.length > 200) return false;
  if ([" ", "\n", "\r", "\t", '"', "'", "<", ">", "\\", "`"].some((c) => s.includes(c))) return false;
  const rest = s.slice("https://".length);
  const host = rest.split("/")[0];
  if (!host || host.includes("@") || host.includes(":") || !host.includes(".")) return false;
  return rest.split("/").length - 1 >= 2; // at least one path segment
}

export function isValidIso(t) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(String(t ?? ""));
}

// "2026-12-31T18:00" (from <input type="datetime-local">, read as UTC) -> contract format
export function toContractTime(local) {
  const s = String(local ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return `${s}:00Z`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(s)) return `${s}Z`;
  return s;
}

export function validateEventForm(f) {
  const errors = [];
  if (!f.name || f.name.trim().length < 1 || f.name.length > MAX_TITLE) errors.push(`Name is required (max ${MAX_TITLE} characters).`);
  if ((f.description ?? "").length > MAX_DESC) errors.push(`Description is too long (max ${MAX_DESC}).`);
  if ((f.location ?? "").length > MAX_LOCATION) errors.push(`Location is too long (max ${MAX_LOCATION}).`);
  if (!isValidEventCode(f.eventCode)) errors.push("Event code must be 6-40 letters, digits or '-'.");
  if (!isValidPrefix(f.sourcePrefix)) errors.push("Confirmation path must look like https://host/path/ and include a path.");
  const image = f.imageUri ?? "";
  if (image !== "" && (!image.startsWith("https://") || image.length > MAX_IMAGE)) errors.push("Image must be an https URL.");
  const starts = toContractTime(f.startsAt), from = toContractTime(f.claimFrom), until = toContractTime(f.claimUntil);
  if (![starts, from, until].every(isValidIso)) errors.push("Dates must be filled in (UTC).");
  else if (until <= from) errors.push("Claim window must end after it starts.");
  const seats = Number(f.maxSeats);
  if (!Number.isInteger(seats) || seats < 1 || seats > 10000) errors.push("Seats must be a whole number from 1 to 10000.");
  return errors;
}

export function validateClaim({ url, prefix, displayName, requireName }) {
  const errors = [];
  const u = String(url ?? "").trim();
  if (!u) errors.push("Paste the confirmation page URL.");
  else if (prefix && !u.startsWith(prefix)) errors.push(`URL must start with the organizer's path: ${prefix}`);
  if (requireName && !String(displayName ?? "").trim()) errors.push("This event requires your display name.");
  if (String(displayName ?? "").length > MAX_NAME) errors.push(`Display name is too long (max ${MAX_NAME}).`);
  return errors;
}

// What the organizer's page must contain for a claim to pass. Shown to the attendee before they submit.
export function claimInstructions({ eventCode, wallet, requireName }) {
  const lines = [
    `Event code exactly as written: ${eventCode}`,
    `Your full wallet address: ${normalizeAddress(wallet)}`,
  ];
  if (requireName) lines.push("Your display name, as you entered it (letters and spacing do not need to match exactly).");
  lines.push("Both must appear in the main content of the page, not in comments.");
  return lines;
}

const STATUS_LABELS = {
  none: "Not claimed yet",
  approved: "Approved",
  rejected: "Rejected (you can appeal or try again)",
  expired: "Expired (you can try again)",
  appeal_pending: "Appeal under review",
  appeal_rejected: "Appeal rejected",
  appeal_expired: "Appeal expired without a decision",
};
export function statusLabel(status) {
  return STATUS_LABELS[status] ?? String(status);
}

export function canAppeal(status) {
  return status === "rejected";
}

export function canRetry(status, attemptsLeft) {
  return (status === "none" || status === "rejected" || status === "expired") && attemptsLeft > 0;
}

// Contract errors look like "[EXPECTED] message" or come wrapped in other text.
export function parseContractError(err) {
  const raw = String(err?.message ?? err ?? "");
  const m = raw.match(/\[(EXPECTED|TRANSIENT|LLM_ERROR)\]\s*(.*)/);
  if (!m) return { kind: "other", message: raw.trim() || "Something went wrong." };
  const kind = { EXPECTED: "expected", TRANSIENT: "transient", LLM_ERROR: "llm" }[m[1]];
  return { kind, message: m[2].trim() || "Request was not accepted." };
}

export function seatsLabel(taken, max) {
  return `${taken} / ${max} seats`;
}

export function shortAddress(a) {
  const s = normalizeAddress(a);
  return s.length === 42 ? `${s.slice(0, 6)}...${s.slice(-4)}` : s;
}

export function explorerAddressUrl(explorerBase, address) {
  return `${explorerBase.replace(/\/$/, "")}/address/${address}`;
}
