// Unit tests for the live adapter. A recording transport checks that each call goes to the right
// contract function with the right arguments. No contract data is simulated here.
//
// NOTE: adapter.js imports { TransactionStatus, ExecutionResult } from "genlayer-js/types". These tests
// need `npm install` first (genlayer-js 1.1.8, pinned in package.json).
import test from "node:test";
import assert from "node:assert/strict";
import { createGenLayerAdapter, connectionCheck } from "../src/lib/adapter.js";
import { ExecutionResult } from "genlayer-js/types";

const ADDRESS = "0x01eB69fE56E6F6cb46ef65A4B5C1D43b028303fc";
const PREFIX = "https://events.example.com/checkin/";
const FORM = {
  name: "DevCon 2099", description: "Conf", location: "Hall A", eventCode: "DEVCON-2099-7F3K", sourcePrefix: PREFIX,
  startsAt: "2099-01-10T18:00", claimFrom: "2099-01-01T00:00", claimUntil: "2099-01-31T23:59", maxSeats: 2, imageUri: "",
};

// `receipt` lets a test override the mocked execution outcome -- defaults to a normal success so
// every pre-existing test below keeps behaving exactly as before.
function recordingClient(readReturn = {}, receipt = {}) {
  const calls = [];
  return {
    calls,
    account: { address: "0xA1A1a1A1a1a1A1a1a1a1a1a1A1a1A1A1a1a1A1a1" },
    readContract: async (c) => { calls.push({ kind: "read", ...c }); return readReturn; },
    writeContract: async (c) => { calls.push({ kind: "write", ...c }); return "0xhash"; },
    waitForTransactionReceipt: async ({ hash }) => ({
      hash,
      txExecutionResultName: ExecutionResult.FINISHED_WITH_RETURN,
      ...receipt,
    }),
  };
}

test("reads go to the contract address with the contract function name", async () => {
  const client = recordingClient({ owner: "0xabc" });
  const a = createGenLayerAdapter(client, ADDRESS);
  await a.getConfig();
  await a.getEvent(3);
  await a.getClaimRequirements(3, "0x" + "c3".repeat(20));
  assert.deepEqual(client.calls.map((c) => c.functionName), ["get_config", "get_event", "get_claim_requirements"]);
  assert.ok(client.calls.every((c) => c.address === ADDRESS));
  assert.equal(client.calls[1].args[0], 3n, "ids are sent as bigint");
});

test("create_event sends 12 arguments in contract order with ISO times", async () => {
  const client = recordingClient();
  const a = createGenLayerAdapter(client, ADDRESS);
  await a.createEvent(FORM);
  const w = client.calls.at(-1);
  assert.equal(w.kind, "write");
  assert.equal(w.functionName, "create_event");
  assert.equal(w.args.length, 12);
  assert.deepEqual(w.args.slice(0, 5), ["DevCon 2099", "Conf", "Hall A", "DEVCON-2099-7F3K", PREFIX]);
  assert.equal(w.args[5], "2099-01-10T18:00:00Z");
  assert.equal(w.args[6], "2099-01-01T00:00:00Z");
  assert.equal(w.args[7], "2099-01-31T23:59:00Z");
  assert.equal(w.args[8], 2n);
  assert.equal(w.args[9], false);
  assert.equal(w.args[10], false);
  assert.equal(w.args[11], "");
  assert.equal(w.value, 0n);
});

test("submit_proof sends event id, url and display name", async () => {
  const client = recordingClient();
  const a = createGenLayerAdapter(client, ADDRESS);
  await a.submitProof(3, PREFIX + "t", "Ana");
  assert.deepEqual(client.calls.at(-1).args, [3n, PREFIX + "t", "Ana"]);
  assert.equal(client.calls.at(-1).functionName, "submit_proof");
});

test("organizer_mint, revoke and staff calls map to their contract functions", async () => {
  const client = recordingClient();
  const a = createGenLayerAdapter(client, ADDRESS);
  await a.organizerMint(1, "0x" + "e5".repeat(20), "QR");
  await a.revokeBadge(1, "0x" + "e5".repeat(20), "fraud");
  await a.setOperator(1, "0x" + "f6".repeat(20), true);
  assert.deepEqual(client.calls.filter((c) => c.kind === "write").map((c) => c.functionName),
    ["organizer_mint", "revoke_badge", "set_operator"]);
  assert.equal(client.calls.at(-1).args[2], true);
});

test("series calls map to their contract functions", async () => {
  const client = recordingClient();
  const a = createGenLayerAdapter(client, ADDRESS);
  await a.createSeries("Dev Circuit", "0,1", "");
  await a.claimSeriesBadge(0);
  assert.deepEqual(client.calls.map((c) => c.functionName), ["create_series", "claim_series_badge"]);
  assert.deepEqual(client.calls[0].args, ["Dev Circuit", "0,1", ""]);
});

test("signer address comes from the client account", () => {
  const a = createGenLayerAdapter(recordingClient(), ADDRESS);
  assert.equal(a.hasSigner(), true);
  assert.equal(a.signerAddress(), "0xa1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1");
  const readOnly = createGenLayerAdapter({ ...recordingClient(), account: undefined }, ADDRESS);
  assert.equal(readOnly.hasSigner(), false);
});

test("write() throws with the contract's own message when execution fails", async () => {
  const client = recordingClient({}, {
    txExecutionResultName: ExecutionResult.FINISHED_WITH_ERROR,
    stderr: "[EXPECTED] Only the organizer",
  });
  const a = createGenLayerAdapter(client, ADDRESS);
  await assert.rejects(() => a.closeEvent(1), /Only the organizer/);
});

test("write() throws a generic message when execution fails with no detail in the receipt", async () => {
  const client = recordingClient({}, { txExecutionResultName: ExecutionResult.FINISHED_WITH_ERROR });
  const a = createGenLayerAdapter(client, ADDRESS);
  await assert.rejects(() => a.closeEvent(1), /rejected this transaction/);
});

test("write() throws a transient error when the network has not voted yet", async () => {
  const client = recordingClient({}, { txExecutionResultName: ExecutionResult.NOT_VOTED });
  const a = createGenLayerAdapter(client, ADDRESS);
  await assert.rejects(() => a.closeEvent(1), /\[TRANSIENT\]/);
});

test("write() resolves normally when execution actually succeeded", async () => {
  const client = recordingClient({}, { txExecutionResultName: ExecutionResult.FINISHED_WITH_RETURN });
  const a = createGenLayerAdapter(client, ADDRESS);
  const result = await a.closeEvent(1);
  assert.equal(result.hash, "0xhash");
});

test("event lifecycle and organizer-transfer calls map to their contract functions", async () => {
  const client = recordingClient();
  const a = createGenLayerAdapter(client, ADDRESS);
  await a.extendClaimWindow(1, "2099-02-01T00:00");
  await a.setEventPaused(1, true);
  await a.proposeEventOrganizer(1, "0x" + "f6".repeat(20));
  await a.acceptEventOrganizer(1);
  assert.deepEqual(client.calls.map((c) => c.functionName),
    ["extend_claim_window", "set_event_paused", "propose_event_organizer", "accept_event_organizer"]);
  assert.equal(client.calls[0].args[1], "2099-02-01T00:00:00Z", "extend_claim_window converts to contract time");
  assert.equal(client.calls[1].args[1], true);
  assert.equal(client.calls[3].args.length, 1, "accept_event_organizer takes only the event id");
});

test("protocol-admin calls map to their contract functions", async () => {
  const client = recordingClient();
  const a = createGenLayerAdapter(client, ADDRESS);
  await a.setModerator("0x" + "e5".repeat(20), true);
  await a.setGlobalPause(true);
  await a.proposeOwner("0x" + "f6".repeat(20));
  await a.acceptOwnership();
  assert.deepEqual(client.calls.map((c) => c.functionName),
    ["set_moderator", "set_global_pause", "propose_owner", "accept_ownership"]);
  assert.equal(client.calls[1].args[0], true);
  assert.equal(client.calls[3].args.length, 0, "accept_ownership takes no arguments");
});

test("a client without read/write functions is refused", () => {
  assert.throws(() => createGenLayerAdapter(null, ADDRESS), /client/);
  assert.throws(() => createGenLayerAdapter({}, ADDRESS), /client/);
});

test("connectionCheck reports each call's real result or real error", async () => {
  const fake = {
    getConfig: async () => ({ owner: "0x1" }),
    getEvents: async () => { throw new Error("[EXPECTED] nope"); },
    getActiveEvents: async () => ({ items: [], total: 0 }),
  };
  const results = await connectionCheck(fake);
  assert.equal(results.length, 3);
  assert.equal(results[0].ok, true);
  assert.equal(results[1].ok, false);
  assert.match(results[1].error, /nope/);
  assert.equal(results[2].ok, true);
});


test("write reports accepted-but-not-finalized and awaitFinalization waits for FINALIZED", async () => {
  const statuses = [];
  const client = recordingClient();
  client.waitForTransactionReceipt = async ({ hash, status }) => {
    statuses.push(status);
    return { hash, txExecutionResultName: ExecutionResult.FINISHED_WITH_RETURN };
  };
  const a = createGenLayerAdapter(client, ADDRESS);
  const r = await a.verifyPrefix(1);
  assert.equal(r.accepted, true);
  assert.equal(r.finalized, false);
  const f = await a.awaitFinalization(r.hash);
  assert.equal(f.finalized, true);
  assert.deepEqual(statuses, ["ACCEPTED", "FINALIZED"]);
});

test("a transaction that finalizes with an execution error is reported as failed", async () => {
  const client = recordingClient();
  client.waitForTransactionReceipt = async ({ hash }) => ({ hash, txExecutionResultName: ExecutionResult.FINISHED_WITH_ERROR });
  const a = createGenLayerAdapter(client, ADDRESS);
  await assert.rejects(() => a.awaitFinalization("0xhash"), /execution error/);
});

test("a finalization wait that times out is a transient error that names the hash", async () => {
  const client = recordingClient();
  client.waitForTransactionReceipt = async () => { throw new Error("timeout"); };
  const a = createGenLayerAdapter(client, ADDRESS);
  await assert.rejects(() => a.awaitFinalization("0xabc"), /TRANSIENT.*0xabc/);
});

test("check_series_badge maps to its contract view", async () => {
  const client = recordingClient({});
  const a = createGenLayerAdapter(client, ADDRESS);
  await a.checkSeriesBadge(2, "0x" + "c3".repeat(20));
  assert.equal(client.calls.at(-1).functionName, "check_series_badge");
  assert.equal(client.calls.at(-1).args[0], 2n);
});
