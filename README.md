# EventAttendance v0.3

Proof of attendance for in-person and hybrid events, built on GenLayer. An organizer proves control of
a confirmation-page path, lists attendee wallets on that page, and attendees claim non-transferable
badges by submitting it. Consensus checks the page in plain code first, then an LLM confirms the page
is a valid attendance record. Third parties can verify badges with a single contract call.

## Who does what

- **Organizer**: creates the event, verifies the confirmation-page prefix, lists attendees, and
  controls the event lifecycle (claim window, pause, close, cancel, revoke).
- **Staff** (delegated by the organizer): register attendees, mint badges directly, resolve appeals.
  Staff cannot verify, transfer ownership, or delegate further.
- **Moderators** (set by the protocol owner): pause, close, cancel and revoke on any event.
- **Attendees**: claim a badge, appeal a rejection, claim a series badge.
- **Anyone**: verify a badge, read metadata, finalize lapsed appeals (`expire_stale`).

## Flow

1. Organizer calls `create_event` with a name, description, location, a public event code, a
   confirmation path prefix (for example `https://events.example.com/checkin/`), a claim window and a
   seat cap.
2. Organizer calls `get_verify_token` and puts that token in the main content of the page at the prefix.
   Then they call `verify_prefix`. Claims are blocked until this passes.
3. Organizer registers wallets (`add_attendees`) and publishes a confirmation page under the prefix that
   lists each wallet with the event code.
4. Attendee calls `get_claim_requirements`, then `submit_proof(event_id, url, display_name)`.
5. Consensus checks the main content: event code, full wallet address, display name (if required), then
   the LLM. A pass issues a badge (source `page`). A rejection costs one of three attempts and opens a
   14-day appeal window.

## Features

**Trust and verification**
- Domain-control proof: the organizer must publish a per-event token in the main content of the
  prefix page (`verify_prefix`). Comments and footers do not count.
- Path-prefix allow-list: claims must use a URL under that prefix, and the prefix must include a path.
- Event-code uniqueness per prefix, so one page cannot serve two events under the same organizer.
- Wallet binding: the claimant's full address must appear in the organizer's main content.
- Main-content extraction removes comments, reviews, navigation and footers, including comments inside
  `<main>`.
- Third-party verification: `verify_attendance` returns validity, reason, serial, source and organizer.
- EIP-5192-style `is_locked`: badges are always non-transferable.

**Badges and records**
- Serial numbers, issue time, and source (`page`, `organizer` or `appeal`).
- Revocation with a stored reason. A revoked wallet can never be re-issued for that event.
- Marketplace-friendly metadata via `get_badge_metadata` (name, description, image, attributes).
- Paginated badge lists per event (`get_event_badges`) and per wallet (`get_wallet_badges`).
- Display names are checked, never stored.

**Access and operations**
- Staff delegation (`set_operator`) for event teams.
- Organizer minting (`organizer_mint`) for offline check-ins, QR scans and speakers.
- Preregistration (optional) and a claim window with an organizer-extendable end.
- Pause, close and cancel per event; global pause; two-step ownership and organizer transfers.
- Seat cap, enforced for every route to a badge. Rejections never consume seats.

**Appeals**
- 14-day appeal window after a rejection. Organizer or staff resolves the appeal within 30 days.
- An unresolved appeal expires through `expire_stale`. Appeal approval still needs a free seat.

**Series credentials**
- `create_series` builds a credential from 2 to 10 events. Anyone can create a series.
- `claim_series_badge` issues the series badge when the wallet holds a non-revoked badge for every
  event. A revocation before the series badge is claimed blocks it. An issued series badge is not
  revoked when one of its events is later revoked.
- `get_series_progress` shows completion for a wallet.

**No money**: there are no fees, escrow or rewards. This is a credential registry.

## Contract methods

| Method | Who | Consensus? | Purpose |
| --- | --- | --- | --- |
| `create_event(...)` | anyone | no | Creates an event. Not claimable until verified. |
| `verify_prefix(id)` | organizer | **yes** | Confirms the verify token is in the prefix page's main content. |
| `set_operator(id, user, enabled)` | organizer | no | Delegates or removes staff. |
| `add_attendees(id, csv)` / `remove_attendee(id, wallet)` | organizer or staff | no | Manages registrations. |
| `organizer_mint(id, wallet, reason)` | organizer or staff | no | Issues a badge with source `organizer`. |
| `extend_claim_window(id, until)` | organizer | no | Moves the claim-window end later only. |
| `set_event_paused(id, bool)` | organizer or moderator | no | Pauses or resumes claims. |
| `close_event(id)` / `cancel_event(id)` | organizer or moderator | no | Stops claims. Cancel also blocks appeal approvals. |
| `propose_event_organizer` / `accept_event_organizer` | organizer, then proposed | no | Two-step organizer transfer. |
| `submit_proof(id, url, display_name)` | attendee | **yes, per attempt** | Runs the checks and issues a badge on pass. |
| `appeal(id, url, note)` | attendee | no | Requests review of a rejection. |
| `resolve_appeal(id, wallet, approve)` | organizer, staff or moderator | no | Decides an appeal. |
| `expire_stale(id, wallet)` | anyone | no | Finalizes a lapsed rejection or appeal. |
| `revoke_badge(id, wallet, reason)` | organizer or moderator | no | Revokes a badge. |
| `create_series(name, ids, image)` / `claim_series_badge(sid)` | anyone / attendee | no | Series credentials. |
| `set_moderator`, `set_global_pause`, `propose_owner`, `accept_ownership` | owner | no | Protocol administration. |
| Views | anyone | no | `get_config`, `get_event`, `get_events`, `get_active_events`, `get_claim_requirements`, `get_verify_token`, `get_submission_status`, `get_badge`, `verify_attendance`, `is_locked`, `get_badge_metadata`, `get_event_badges`, `get_wallet_badges`, `get_badge_count`, `get_series`, `get_series_progress`, `get_appeal`, `is_moderator`, `is_staff`. |

## Trust model and limitations

- **The organizer is the trust root for attendance.** Once verified, the organizer decides who is listed
  and who is minted. Nothing in the contract checks that the attendee was physically present.
- **Domain verification proves control of a page, not identity.** It shows the organizer can write to the
  prefix page's main content. It does not prove which legal entity runs the page.
- **Verification tokens are public.** They are derived from the event id and organizer address, so anyone
  can compute them. Verification only works because the token must appear in main content, which
  attendees cannot edit. Organizers who host user-writable main content should not rely on this.
- **Pages are public.** Wallets and event codes appear there, so anyone can see who is listed.
- **Claim codes are not implemented.** POAP-style single-use codes would need either a hashing primitive
  or secret storage. The runtime's hashing support is unverified, and storing plain codes on chain would
  expose them to anyone reading contract state. Staff minting covers the same offline use cases.
- **Badges are a registry, not an NFT.** They do not show up in standard wallets or marketplaces without a
  bridge. `get_badge_metadata` provides the data such a bridge needs.
- **Page extraction is heuristic.** It is tested only against fixture HTML. Unusual layouts can make a valid
  page unlocated, which costs one attempt, and appeal is the backstop.
- **Series badges outlive later revocations.** A series badge issued before one of its events is revoked
  stays valid. Revocations are not retroactive.
- **Clock dependence.** Claim windows and appeal timers rely on the contract clock. If it is unavailable,
  the call reverts instead of guessing.

## Layout

- `contracts/EventAttendance.py`: the contract.
- `tests/direct/`: direct-VM tests (61), written for gltest. Offline runner in `tests/offline/`.
- `tests/offline/run_mutants.py`: 16 targeted mutations, each of which must be caught.
- `frontend/`: static web app (no build step), unit tests and a browser smoke test. See `frontend/README.md`.
- `deploy/`: manifest, check script and deployment guide.
- `DECISION.md`: design reasoning, research basis, trade-offs and self-review.


## Deployment (StudioNet)

- Contract: `0x68f01b081fcc59394b68f743672DeCC317d32b01`
- Deploy transaction: `0x4001e305502f4ccbaf9ef14cf60df7be749fcbd2fd1a4b9581f6ae0dc42f8b5e`
- Source hash: see `deploy/manifest.json`; verify with `python3 deploy/check_manifest.py`.
