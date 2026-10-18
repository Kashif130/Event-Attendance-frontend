# EventAttendance v0.3 -- design decisions

## Starting point and review findings

v0.1 checked attendance on an organizer page by requiring the attendee's wallet address and an event
code in the page's main content. Reviewing it turned up these gaps:

1. **Anyone could create an event under someone else's domain.** Nothing proved the creator controlled
   the confirmation-page prefix. This is the most serious gap, because it made every badge depend on a
   page the creator did not own.
2. **Event codes could repeat under one prefix.** Two events could share a page and a code.
3. **Hex-address validation accepted non-ASCII digits.** `str.isdigit()` returns True for characters such
   as Arabic-Indic zero, so a malformed "address" passed. Fixed with an explicit ASCII hex set.
4. **No way to issue badges outside the page flow.** Offline check-ins, QR scans, speakers and
   corrections had no route.
5. **No staff model.** Only the organizer could manage attendees.
6. **No third-party verification call** and no EIP-5192-style lock query.
7. **No paginated indexes.** Event and wallet badge lists could not be read without scanning storage.
8. **No multi-event credential.** Galxe-style series and Sismo-style groups had no counterpart.

## Research basis

- **POAP** uses organizer-issued claim codes and delegated, signed minting. This version covers delegated
  minting through `organizer_mint` for staff. Claim codes are left out (see Trade-offs).
- **EIP-5192 (minimal soulbound NFT)** defines a `locked(tokenId)` view and treats non-transferability as
  an interface property. `is_locked` follows that pattern. Badges have no transfer function.
- **EAS (Ethereum Attestation Service)** schemas for event attendance use fields such as event name,
  location, check-in time, and revocable attestations. Badges carry the event location, issue time, source
  and revocation reason, and `get_badge_metadata` exposes them in a shape a verifier can read.
- **Galxe and Sismo** use credentials that combine several attestations and are earned by completing a
  set. Series credentials follow that model, with a limit of 10 events per series.

## Decisions

- **Verify the domain before accepting claims.** The organizer must publish a per-event token in the
  prefix page's main content, checked by consensus. Verification is deterministic in spirit: the page
  either contains the token or does not, and no LLM is involved. Comments are excluded, so a visitor
  cannot verify someone else's event by posting the token in a comment.
- **Event codes are unique per prefix**, enforced at creation.
- **Staff is a separate role.** Staff can manage attendees, mint, and resolve appeals. Verification,
  ownership, delegation, and extending the claim window stay with the organizer. Moderators keep their
  existing powers over pausing, closing, cancelling and revoking.
- **Organizer minting is marked as its own source.** Verifiers can tell a page-verified badge from a
  staff-issued one, and an appeal approval from a direct issue.
- **Indexes are written at issue time**, so reads never scan storage. The index for a badge is set when it
  is issued and is never removed, because badges are not deleted, only revoked.
- **Series credentials are permissionless to create** and do no harm: they only pay out a badge to a
  wallet that already holds every listed event's badge. Completion ignores revoked badges, and an issued
  series badge is not revoked retroactively.
- **Display names are checked and discarded**, so no personal data reaches contract state.
- **No money.** Escrow and reward flows would bring back the reservation mechanics from the quest
  contract without serving this use case.

## Trade-offs and residual risk

- **Claim codes are not implemented.** Single-use codes are the most common POAP claim method, and this
  is the largest feature gap. Implementing them safely would require hashing the codes on chain, or keeping
  them secret off chain and verifying them through the organizer's page. Neither is available here, so
  staff minting covers the offline cases instead.
- **The organizer is trusted for presence.** The contract confirms that the organizer listed a wallet on a
  verified page. It cannot confirm that the attendee was in the room.
- **Verification tokens are derivable.** They depend only on event id and organizer address, so the
  security rests on the main-content placement, not on the token being secret.
- **Badges are not standard tokens.** `get_badge_metadata` makes a bridge possible, but this contract does
  not implement one.
- **Series completion is a read, not a snapshot.** A series badge is issued from the current state, and
  later revocations do not undo it.

## Self-review

1. Domain verification is the main new control. A mutation that checks the whole page rather than the main
   content is caught by the comments-only verification test.
2. Claims before verification: mutation caught.
3. Event-code uniqueness: mutation caught.
4. Staff cannot delegate, verify, or extend the claim window. The operator test covers all three.
5. Organizer minting respects the cancelled-event rule, the seat cap, and the duplicate-holder rule, and a
   revoked wallet cannot be re-minted. The re-mint block is enforced twice (in `organizer_mint` and in
   `_issue`), so one check alone does not remove it.
6. The non-ASCII hex bug is caught by a mutation that restores `isdigit()`.
7. Series: two events required, every event required, one claim per wallet, revocation blocks completion.
8. The v0.1 mutation checks still hold in v0.2 (wallet check, comments, rejections not consuming seats, LLM
   verdict, name check, claim window).


## v0.3 changes (steward review of v0.2)

1. **Deployment record.** `deploy/manifest.json` pins the v0.3 source hash and records the StudioNet deployment:
   address `0x68f01b081fcc59394b68f743672DeCC317d32b01`, deploy tx `0x4001e305502f4ccbaf9ef14cf60df7be749fcbd2fd1a4b9581f6ae0dc42f8b5e`. Deployer `0x09180Dde6760F040B836B21d35C51D9de7cD0904`, created 2026-10-18T13:51:53Z.
2. **Organizer minting requires `verify_prefix()`.** `organizer_mint` reverts on unverified events.
   `verify_attendance` and `get_badge_metadata` now also return `event_verified` and `event_status`.
3. **Strict verdict parsing.** Only a JSON object with exactly one key, `passed`, holding a JSON boolean is
   accepted. `"false"`, numbers, null, missing keys, extra keys, prose around the JSON and invalid JSON are
   `llm_malformed`: the call reverts with `[LLM_ERROR]`, no attempt is used, no badge is issued.
4. **Appeals and attempts.** After `appeal_rejected` or `appeal_expired` the claimant keeps unused attempts
   (still capped at 3 total) while the claim window is open. A pending appeal still blocks new claims.
5. **Retrieval and parsing failures are not rejections.** Unreachable pages, pages with no readable main
   content, and malformed verifier output revert without using an attempt. Genuine rejections store a reason
   code (`no_code`, `no_wallet`, `no_name`, `llm_fail`) readable through `get_claim_requirements` and
   `get_appeal`. Extraction is now case-insensitive, handles attributes, unclosed `<main>`, `<article>`,
   body-only pages, bare fragments and HTML comments, and drops `<aside>`. A content fingerprint is not stored
   because page content can differ between validators and would break `strict_eq` consensus.
6. **Finalization.** The frontend adapter waits for ACCEPTED, checks the execution result, labels the result
   "accepted, not yet final", then waits for FINALIZED in the background and re-checks the result.
7. **Calendar-valid times.** `_valid_iso` requires ASCII digits and a real date (month, day-of-month with leap
   years, hour, minute, second). `get_active_events` excludes events whose claim window has ended and adds
   `accepting_claims` (null when the node supplies no clock). `get_events` still lists everything.
8. **Series credentials are point-in-time.** An issued series badge is not revoked when an event badge is
   revoked later. `check_series_badge(series_id, wallet)` reports `issued`, `currently_valid`,
   `revoked_events` and `missing_events` for verifiers who need continuous validity.

## Not done in v0.3 (needs your environment)

- Independent source-equivalence evidence beyond the recorded hash, and finalized hashes for the demo transactions.
- Confirming that `gl.nondet.web.render(url, mode="html")` works on the target runtime.
- Running `tests/direct/` with gltest/StudioNet (the 115 tests and 25 mutants ran only on the offline shim).
- A browser-originated StudioNet demonstration with the evidence listed in the steward request.
