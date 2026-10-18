export const NATIVE_SYMBOL = "GEN";
const WEI_PER_NATIVE = 1_000_000_000_000_000_000n;

/** Decimal GEN -> wei. Returns 0n for an empty string. */
export function toWei(nativeAmount: string): bigint {
  const trimmed = nativeAmount.trim();
  if (trimmed === "") return 0n;
  const [whole, frac = ""] = trimmed.split(".");
  const fracPadded = (frac + "000000000000000000").slice(0, 18);
  const wholeBig = BigInt(whole === "" ? "0" : whole);
  return wholeBig * WEI_PER_NATIVE + BigInt(fracPadded || "0");
}

export function fromWei(weiString: string | number | bigint, decimals = 4): string {
  let wei: bigint;
  try {
    wei = BigInt(weiString);
  } catch {
    return "0";
  }
  const whole = wei / WEI_PER_NATIVE;
  const remainder = wei % WEI_PER_NATIVE;
  if (decimals === 0) return whole.toString();
  const fracStr = remainder.toString().padStart(18, "0").slice(0, decimals);
  const trimmedFrac = fracStr.replace(/0+$/, "");
  return trimmedFrac ? `${whole}.${trimmedFrac}` : whole.toString();
}

export function shortAddress(address?: string | null, chars = 4): string {
  if (!address) return "—";
  if (address.length <= chars * 2 + 2) return address;
  return `${address.slice(0, chars + 2)}…${address.slice(-chars)}`;
}

export function sameAddress(a?: string | null, b?: string | null): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

/** Contract timestamps are ISO strings in UTC. Shown in the viewer's local time with a UTC label. */
export function formatIsoTimestamp(iso: string): string {
  if (!iso) return "—";
  const hasZone = /(Z|[+-]\d\d:?\d\d)$/.test(iso);
  const normalized = iso.length > 10 && !hasZone ? `${iso}Z` : iso;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  })} UTC`;
}

export function isoToUnixSeconds(iso: string): number {
  if (!iso) return 0;
  const hasZone = /(Z|[+-]\d\d:?\d\d)$/.test(iso);
  const t = new Date(iso.length > 10 && !hasZone ? `${iso}Z` : iso).getTime();
  return Number.isNaN(t) ? 0 : Math.floor(t / 1000);
}

/** Long waits, such as the claim window countdown: "5h 12m", "42m", "30s". */
export function formatWait(totalSeconds: number): string {
  if (totalSeconds <= 0) return "0s";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${Math.floor(totalSeconds)}s`;
}

export function shortHash(hash?: string | null, head = 10, tail = 8): string {
  if (!hash) return "—";
  if (hash.length <= head + tail + 1) return hash;
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}
