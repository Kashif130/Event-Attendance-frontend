# Deploying EventAttendance v0.3

Deploy as a new contract. v0.3 is not an upgrade of earlier versions, and earlier events do not carry over.

## Before deploying
1. Run `tests/direct/` with gltest against the real SDK. The suite (115 test cases) was run only on an offline
   shim, not on gltest or StudioNet.
2. Confirm `gl.nondet.web.render(url, mode="html")` is supported. Without it, every claim and every
   `verify_prefix` call returns unreachable.
3. Confirm the schema loads. The constructor takes no arguments.

## Deploying
Deploy `contracts/EventAttendance.py` to StudioNet with your GenLayer tooling (the Studio UI, or the CLI
deploy command). Check the exact command against current GenLayer documentation.

## Recording the deployment
1. Record the address.
2. `sha256sum contracts/EventAttendance.py` gives the deployed source hash.
3. In `deploy/manifest.json`, set `deployed` to `true` and fill `address`, `deployed_source_sha256`,
   `deployed_at` and `deployed_by`.
4. Run `python3 deploy/check_manifest.py`. It must exit 0.

## Smoke test
- `get_config()` returns `appeal_window_secs` 1209600 and `review_window_secs` 2592000.
- Create an event, call `get_verify_token`, place that token in the main content of a test page at the
  prefix, and call `verify_prefix`. It should succeed.
- Register a test wallet, put the event code and wallet on a test page, and claim. The status should become
  `approved`.
- If an honest page comes back `rejected` without an LLM call, check page extraction against the live
  markup. Read `get_claim_requirements(...).last_reject_reason`: `no_code` / `no_wallet` point at extraction, `llm_fail` at the verifier. Unreadable pages and malformed verifier output revert without using an attempt.
