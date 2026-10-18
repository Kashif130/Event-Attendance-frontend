// Contract access layer for the deployed EventAttendance contract. The UI talks only to this object.
// Every write argument follows the argument order in contracts/EventAttendance.py exactly.
//
// IMPORTANT, hard-won from building and shipping another GenLayer frontend (ProofOfLifeVault): a
// transaction reaching ACCEPTED/FINALIZED consensus is NOT the same as the contract call having
// succeeded. GenLayer's own docs say so explicitly -- "a transaction can be finalized by consensus
// but still have a failed execution" -- and validators can perfectly well agree that a call should
// be REJECTED (any gl.vm.UserError in this contract, for example: wrong event id, claim window
// closed, not the organizer, and so on). waitForTransactionReceipt does NOT throw in that case; it
// resolves normally with a receipt whose txExecutionResultName is FINISHED_WITH_ERROR. A write()
// that only catches thrown exceptions -- as an earlier version of this file did -- will show a
// false "done." success message for a transaction the contract actually rejected, while nothing
// really changed. write() below checks txExecutionResultName explicitly and throws a real error
// (with the contract's own message, when the receipt carries one) instead. Re-reading contract
// state after a write, which the UI still does everywhere, stays as a second, independent check --
// belt and suspenders, not a replacement for checking the receipt.

import * as L from "./rules.js";
import { TransactionStatus, ExecutionResult } from "genlayer-js/types";

export function createGenLayerAdapter(client, contractAddress) {
  if (!client || typeof client.readContract !== "function" || typeof client.writeContract !== "function") {
    throw new Error("A GenLayer client with readContract and writeContract is required.");
  }

  const read = (functionName, args = []) => client.readContract({ address: contractAddress, functionName, args });

  async function write(functionName, args = []) {
    const hash = await client.writeContract({ address: contractAddress, functionName, args, value: 0n });
    const receipt = await client.waitForTransactionReceipt({
      hash,
      status: TransactionStatus.ACCEPTED,
      retries: 160,
      interval: 3000,
      fullTransaction: true,
    });

    const resultName = receipt?.txExecutionResultName;
    if (resultName === ExecutionResult.FINISHED_WITH_ERROR) {
      const detail = receipt?.stderr || receipt?.result?.stderr || receipt?.data?.stderr;
      throw new Error(
        detail ? `[EXPECTED] ${detail}` : "[EXPECTED] The contract rejected this transaction.",
      );
    }
    if (resultName === ExecutionResult.NOT_VOTED) {
      throw new Error(
        "[TRANSIENT] The network has not finished voting on this transaction yet. Check again shortly.",
      );
    }
    // ACCEPTED means validators agreed and execution did not error, but the result can still
    // be appealed or reversed before FINALIZED. Callers must not present it as final.
    return { hash, receipt, accepted: true, finalized: false };
  }

  // Waits for FINALIZED and re-checks the execution result on the final receipt.
  async function awaitFinalization(hash, { retries = 600, interval = 3000 } = {}) {
    let receipt;
    try {
      receipt = await client.waitForTransactionReceipt({
        hash, status: TransactionStatus.FINALIZED, retries, interval, fullTransaction: true,
      });
    } catch (err) {
      throw new Error(`[TRANSIENT] Transaction ${hash} is not finalized yet (${err?.message ?? err}). Check again later.`);
    }
    const resultName = receipt?.txExecutionResultName;
    if (resultName === ExecutionResult.FINISHED_WITH_ERROR) {
      throw new Error(`[EXPECTED] Transaction ${hash} finalized with an execution error; nothing changed.`);
    }
    if (resultName === ExecutionResult.NOT_VOTED) {
      throw new Error(`[TRANSIENT] Transaction ${hash} has no final vote yet.`);
    }
    return { hash, receipt, accepted: true, finalized: true };
  }

  return {
    contractAddress,
    awaitFinalization,
    signerAddress: () => L.normalizeAddress(client.account?.address ?? ""),
    hasSigner: () => Boolean(client.account),

    // ---- reads (contract views)
    getConfig: () => read("get_config"),
    getEvent: (id) => read("get_event", [BigInt(id)]),
    getEvents: (offset = 0, limit = 20) => read("get_events", [BigInt(offset), BigInt(limit)]),
    getActiveEvents: (offset = 0, limit = 20) => read("get_active_events", [BigInt(offset), BigInt(limit)]),
    getClaimRequirements: (id, wallet) => read("get_claim_requirements", [BigInt(id), wallet]),
    getVerifyToken: (id) => read("get_verify_token", [BigInt(id)]),
    getSubmissionStatus: (id, wallet) => read("get_submission_status", [BigInt(id), wallet]),
    getAppeal: (id, wallet) => read("get_appeal", [BigInt(id), wallet]),
    getBadge: (id, wallet) => read("get_badge", [BigInt(id), wallet]),
    verifyAttendance: (id, wallet) => read("verify_attendance", [BigInt(id), wallet]),
    isLocked: (id, wallet) => read("is_locked", [BigInt(id), wallet]),
    getBadgeMetadata: (id, wallet) => read("get_badge_metadata", [BigInt(id), wallet]),
    getEventBadges: (id, offset = 0, limit = 20) => read("get_event_badges", [BigInt(id), BigInt(offset), BigInt(limit)]),
    getWalletBadges: (wallet, offset = 0, limit = 20) => read("get_wallet_badges", [wallet, BigInt(offset), BigInt(limit)]),
    getBadgeCount: (wallet) => read("get_badge_count", [wallet]),
    getSeries: (sid) => read("get_series", [BigInt(sid)]),
    getSeriesProgress: (sid, wallet) => read("get_series_progress", [BigInt(sid), wallet]),
    checkSeriesBadge: (sid, wallet) => read("check_series_badge", [BigInt(sid), wallet]),
    isStaff: (id, wallet) => read("is_staff", [BigInt(id), wallet]),
    isModerator: (wallet) => read("is_moderator", [wallet]),

    // ---- writes (signed by the client account)
    createEvent: (f) => write("create_event", [
      f.name, f.description ?? "", f.location ?? "", f.eventCode, f.sourcePrefix,
      L.toContractTime(f.startsAt), L.toContractTime(f.claimFrom), L.toContractTime(f.claimUntil),
      BigInt(f.maxSeats), !!f.requireName, !!f.requirePreregistration, f.imageUri ?? "",
    ]),
    verifyPrefix: (id) => write("verify_prefix", [BigInt(id)]),
    setOperator: (id, user, enabled) => write("set_operator", [BigInt(id), user, !!enabled]),
    addAttendees: (id, csv) => write("add_attendees", [BigInt(id), csv]),
    removeAttendee: (id, wallet) => write("remove_attendee", [BigInt(id), wallet]),
    organizerMint: (id, wallet, reason) => write("organizer_mint", [BigInt(id), wallet, reason]),
    submitProof: (id, url, displayName = "") => write("submit_proof", [BigInt(id), url, displayName]),
    appeal: (id, url, note = "") => write("appeal", [BigInt(id), url, note]),
    resolveAppeal: (id, wallet, approve) => write("resolve_appeal", [BigInt(id), wallet, !!approve]),
    expireStale: (id, wallet) => write("expire_stale", [BigInt(id), wallet]),
    revokeBadge: (id, wallet, reason) => write("revoke_badge", [BigInt(id), wallet, reason]),
    closeEvent: (id) => write("close_event", [BigInt(id)]),
    cancelEvent: (id) => write("cancel_event", [BigInt(id)]),
    extendClaimWindow: (id, newClaimUntilLocal) => write("extend_claim_window", [BigInt(id), L.toContractTime(newClaimUntilLocal)]),
    setEventPaused: (id, paused) => write("set_event_paused", [BigInt(id), !!paused]),
    proposeEventOrganizer: (id, newOrganizer) => write("propose_event_organizer", [BigInt(id), newOrganizer]),
    acceptEventOrganizer: (id) => write("accept_event_organizer", [BigInt(id)]),
    createSeries: (name, idsCsv, imageUri = "") => write("create_series", [name, idsCsv, imageUri]),
    claimSeriesBadge: (sid) => write("claim_series_badge", [BigInt(sid)]),

    // ---- protocol-owner / moderator writes (see get_config for who currently holds these roles)
    setModerator: (user, enabled) => write("set_moderator", [user, !!enabled]),
    setGlobalPause: (paused) => write("set_global_pause", [!!paused]),
    proposeOwner: (newOwner) => write("propose_owner", [newOwner]),
    acceptOwnership: () => write("accept_ownership", []),
  };
}

// Calls the contract's public views and reports each result or error. Used by the connection check.
export async function connectionCheck(adapter) {
  const checks = [
    ["get_config", () => adapter.getConfig()],
    ["get_events (first page)", () => adapter.getEvents(0, 5)],
    ["get_active_events (first page)", () => adapter.getActiveEvents(0, 5)],
  ];
  const results = [];
  for (const [name, fn] of checks) {
    try {
      const value = await fn();
      results.push({ name, ok: true, value });
    } catch (err) {
      results.push({ name, ok: false, error: err?.message ?? String(err) });
    }
  }
  return results;
}
