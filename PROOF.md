# EventAttendance v0.3: Deployment and Live Execution Proof

**Network:** GenLayer StudioNet
**Contract:** `0xbFE08Dcd9E7ec3Edf9c57C5a0a3699f63E256747`
**Deploy tx:** `0xd88deca99aeac19acfa1f5f85a3449c50b8801029be1d3037b88663abdf35305`
**Deployer:** `0x09180Dde6760F040B836B21d35C51D9de7cD0904`
**Deployed at:** 2026-10-19T09:06:27Z
**Source SHA-256:** `e2e505bf653a66d032c4356c2f797ed0d1318d8e5d7ad12d4587567c1c0c87ce` (contracts/EventAttendance.py)
**Frontend:** https://event-attendance-frontend-five.vercel.app (repo: Kashif130/Event-Attendance-frontend)
**Organizer wallet:** `0x8646D3DB04b961Fc5ACb2979Cd02F49d648791C3`

Superseded deployment (clock-format bug, fixed in this version): `0x68f01b081fcc59394b68f743672DeCC317d32b01`, tx `0x4001e305502f4ccbaf9ef14cf60df7be749fcbd2fd1a4b9581f6ae0dc42f8b5e`.

## Attendee wallets
- **A** `0x311f16f0cd3afd4cafbc6d39c730ab365dcea2e2`: successful claim, then series badge
- **B** `0x6d80121dce2425512229483c9d48830e10ef4449`: appeal approved by organizer
- **C** `0x66cf0d9d947138e4345d3b65a0acb238be5e6576`: claim rejected, appeal rejected, then organizer-minted, then revoked

## Event 1 (`DEMO-2026-OCT2`) transactions (all FINALIZED / SUCCESS unless marked)

| # | Action | Wallet | Tx hash |
|---|---|---|---|
| 1 | create_event | organizer | `0xe800b15bbd31bcd8b528e9ba174765433883d901ad8c9234738adda13ac27e02` |
| 2 | verify_prefix (web render, PASS) | organizer | `0x843f83b7d7a7c61615a71936a511e4ab068085e16ddb6fe7330eb2ea5c1442b0` |
| 3 | add_attendees | organizer | `0x8a749dd3f751e9d3244299d481993f07b5eb70ed39a32ca1a043f0b652acdb83` |
| 4 | submit_proof, badge issued (serial 1, source: page) | A | `0xbfa3c4f3845a426c3011cdf9fca5a9300ede1ef78177779ed1c1f8a14377c39c` |
| 5 | submit_proof, genuinely rejected (attempts_left 3 to 2) | C | `0x3bc08a0b5502b10788bf1616b5ce16ce3c7abdf27b4d609832410e5087d3a970` |
| 6 | appeal with URL outside organizer prefix, correctly **reverted** | B | `0xf5ff2d1b632d856e2df252e02b1eca0cf0c7c1e3c65e161121739560e0c831f6` |
| 7 | appeal (valid URL) | B | `0xb64df3d9b618179d333574c479d648ba5beddcf4ded625512fd4df3ec8706a5f` |
| 8 | resolve_appeal approve, badge serial 2 (source: appeal) | organizer | `0xc8dc3fcff1a20607a73191dc2d3721d693c6e22ef4f26ef88866df9e3ffa1593` |
| 9 | appeal, then resolve_appeal **reject** | C / organizer | `0x176c38d15df73d42d4d0de2d08e5ae8db5b146e04030f1693dc67a49797f84a3` |
| 10 | organizer_mint (reason: walk-in demo) | C | `0xe9740caec7e5bbd785f573bbb45e3028639e9e5161e97686eb088f83cb39ea1e` |
| 11 | revoke_badge (reason: Demo revoke) | C | `0x9c9d8b07dcdd6eed8b3759653b04895e403ed168511689427a93d93ae67cb115` |

Note on row 6: this revert is the intended behavior (appeal URL must sit under the organizer's confirmation path).

## Series (point-in-time badge)

| Action | Detail | Tx hash |
|---|---|---|
| create_series | "Series Demo", events 0,1 | `0x0d422a2cd2d300e7fb72644b1bee9d5c863808dfb4fd43c9684578880a90fd70` |
| claim_series_badge | series 0, wallet A | `0x6bfe2f0e46baab1a1f1332f9777e1a444a9083e5be966e71134e149780042795` |

## Review item to evidence map
1. Mint requires verified event: organizer_mint (row 10) succeeded only on the verified Event 1; reverts otherwise (offline tests).
2. Strict LLM verdict parsing: only exact `{"passed": true|false}`; anything else is `llm_malformed`, reverts, no attempt used, no badge (offline tests).
3. Attempts kept after failed/expired appeal: row 9 + offline tests `test_unsuccessful_appeal_keeps_unused_attempts`, `test_expired_appeal_keeps_unused_attempts`. **Not demonstrated live**, covered offline only.
4. Retrieval failures do not consume attempts; reject reasons readable: offline tests; rejection in row 5.
5. Finalization-aware frontend: txs reported "accepted, not yet final" then polled to FINALIZED.
6. Real calendar-date validation: offline tests (leap years, days-in-month).
7. Series badges point-in-time: `check_series_badge` view; series txs above.
8. Node clock normalization: the earlier deployment failed with "Contract clock unavailable"; on this deployment claim, appeal and mint all succeed.
9. Deployment and live-execution evidence: this document.

## Offline testing
- `tests/offline/run_offline.py`: 127/127 passing
- `tests/offline/run_mutants.py`: all 25+ mutants caught
- `tests/direct/test_v03_review_fixes.py`: new tests for the review fixes
