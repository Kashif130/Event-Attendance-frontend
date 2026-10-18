import test from "node:test";
import assert from "node:assert/strict";
import * as L from "../src/lib/rules.js";

const GOOD_FORM = {
  name: "DevCon 2099", description: "Annual conference", location: "Hall A",
  eventCode: "DEVCON-2099-7F3K", sourcePrefix: "https://events.example.com/checkin/", imageUri: "",
  startsAt: "2099-01-10T18:00", claimFrom: "2099-01-01T00:00", claimUntil: "2099-01-31T23:59", maxSeats: 50,
};

test("addresses: accepts 0x + 40 hex in any case, rejects others", () => {
  assert.equal(L.isValidAddress("0x01eB69fE56E6F6cb46ef65A4B5C1D43b028303fc"), true);
  assert.equal(L.isValidAddress("0x" + "a".repeat(40)), true);
  assert.equal(L.isValidAddress("0x" + "a".repeat(39)), false);
  assert.equal(L.isValidAddress("0x" + "g".repeat(40)), false);
  assert.equal(L.isValidAddress("0x" + "\u0660".repeat(40)), false, "non-ASCII digits are not hex");
  assert.equal(L.isValidAddress(""), false);
});

test("event codes: 6-40 ASCII letters, digits or hyphen", () => {
  assert.equal(L.isValidEventCode("DEVCON-2099"), true);
  assert.equal(L.isValidEventCode("ab"), false);
  assert.equal(L.isValidEventCode("bad code!"), false);
  assert.equal(L.isValidEventCode("x".repeat(41)), false);
});

test("prefixes: https, trailing slash, no userinfo, at least one path segment", () => {
  assert.equal(L.isValidPrefix("https://events.example.com/checkin/"), true);
  assert.equal(L.isValidPrefix("http://events.example.com/checkin/"), false);
  assert.equal(L.isValidPrefix("https://events.example.com/"), false, "a whole domain is too broad");
  assert.equal(L.isValidPrefix("https://events.example.com/checkin"), false, "must end with /");
  assert.equal(L.isValidPrefix("https://user@events.example.com/x/"), false);
});

test("times: datetime-local input becomes contract ISO format", () => {
  assert.equal(L.toContractTime("2099-01-10T18:00"), "2099-01-10T18:00:00Z");
  assert.equal(L.toContractTime("2099-01-10T18:00:30"), "2099-01-10T18:00:30Z");
  assert.equal(L.isValidIso("2099-01-10T18:00:00Z"), true);
  assert.equal(L.isValidIso("2099-01-10 18:00"), false);
});

test("event form: valid form has no errors", () => {
  assert.deepEqual(L.validateEventForm(GOOD_FORM), []);
});

test("event form: reports every problem at once", () => {
  const errors = L.validateEventForm({ ...GOOD_FORM, name: "", eventCode: "x", sourcePrefix: "nope",
    claimUntil: "2099-01-01T00:00", maxSeats: 0, imageUri: "http://insecure.example/a.png" });
  assert.equal(errors.length, 6, errors.join(" | "));
});

test("event form: claim window must end after it starts", () => {
  const errors = L.validateEventForm({ ...GOOD_FORM, claimUntil: "2098-12-31T00:00" });
  assert.ok(errors.some((e) => e.includes("Claim window")));
});

test("claim validation: URL prefix and required name", () => {
  const prefix = "https://events.example.com/checkin/";
  assert.deepEqual(L.validateClaim({ url: prefix + "ticket-1", prefix, displayName: "", requireName: false }), []);
  assert.equal(L.validateClaim({ url: "https://evil.example.org/x", prefix, requireName: false }).length, 1);
  assert.equal(L.validateClaim({ url: prefix + "t", prefix, displayName: "  ", requireName: true }).length, 1);
  assert.equal(L.validateClaim({ url: "", prefix, requireName: false }).length, 1);
});

test("claim instructions list the code and wallet, plus name when required", () => {
  const plain = L.claimInstructions({ eventCode: "DEVCON-2099", wallet: "0xABCDEF" + "0".repeat(34), requireName: false });
  assert.ok(plain[0].includes("DEVCON-2099"));
  assert.ok(plain[1].includes("0xabcdef"), "wallet shown lowercase");
  assert.equal(plain.length, 3);
  const named = L.claimInstructions({ eventCode: "DEVCON-2099", wallet: "0x" + "1".repeat(40), requireName: true });
  assert.equal(named.length, 4);
});

test("status labels and retry/appeal rules", () => {
  assert.equal(L.statusLabel("approved"), "Approved");
  assert.equal(L.statusLabel("weird_state"), "weird_state");
  assert.equal(L.canAppeal("rejected"), true);
  assert.equal(L.canAppeal("approved"), false);
  assert.equal(L.canRetry("rejected", 1), true);
  assert.equal(L.canRetry("rejected", 0), false);
  assert.equal(L.canRetry("approved", 2), false);
  assert.equal(L.canRetry("appeal_pending", 2), false);
});

test("contract errors are classified and cleaned", () => {
  assert.deepEqual(L.parseContractError(new Error("reverted: [EXPECTED] Claim window is not open")),
    { kind: "expected", message: "Claim window is not open" });
  assert.equal(L.parseContractError({ message: "[TRANSIENT] Confirmation page unreachable" }).kind, "transient");
  assert.equal(L.parseContractError("[LLM_ERROR] bad JSON").kind, "llm");
  assert.deepEqual(L.parseContractError(new Error("network down")), { kind: "other", message: "network down" });
  assert.equal(L.parseContractError(new Error("")).message, "Something went wrong.");
});

test("formatting helpers", () => {
  assert.equal(L.seatsLabel(3, 50), "3 / 50 seats");
  assert.equal(L.shortAddress("0x01eB69fE56E6F6cb46ef65A4B5C1D43b028303fc"), "0x01eb...03fc");
  assert.equal(L.explorerAddressUrl("https://explorer-studio.genlayer.com/", "0xabc"),
    "https://explorer-studio.genlayer.com/address/0xabc");
});
