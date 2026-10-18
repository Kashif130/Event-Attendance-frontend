# EventAttendance frontend

React + TypeScript + Vite app for the EventAttendance v0.3 contract on GenLayer
(`../contracts/EventAttendance.py`). Wallet and network handling, polled data hooks, and a shared UI kit.

There is no offline or demo mode. Every value on screen comes from a contract call, and every write is a
real transaction.

## Pages

| Route | Who | What |
| --- | --- | --- |
| `/` | anyone | Overview, live protocol stats |
| `/events` | anyone | Open events with seats and claim window |
| `/claim?event=ID` | attendee | Requirements, submit confirmation page, appeal |
| `/badges` | anyone | Badges held by a wallet, series progress |
| `/verify` | anyone | Check one badge by event id and wallet (no signer) |
| `/organizer` | organizer, staff | Create an event; verify domain, attendees, minting, revocation, appeals, lifecycle, staff, transfer |
| `/series` | anyone | Create a series, view progress, claim the series credential |
| `/admin` | owner, moderators | Config, global pause, moderators, owner transfer |
| `/check` | anyone | Raw result of each contract view |

## Layout

- `src/lib/networks.ts`: network list, contract address resolution, chain params.
- `src/lib/client.ts`: the only module that calls the contract. Views are free; writes run through `withSigner`.
- `src/lib/adapter.js`: function names and argument order for every contract call. It checks each receipt for a
  rejected execution, so a transaction the contract refused is shown as an error, not as success.
- `src/lib/rules.js`: validation that mirrors the contract's rules. The contract still decides.
- `src/lib/wallet.ts`, `injectedWallets.ts`, `evm.ts`: built-in encrypted wallet, EIP-6963 browser wallets, network switching.
- `src/context/`: wallet and toast state. `src/hooks/`: polling and the action runner.

## Configuration

Copy `.env.example` to `.env.local`:

```
VITE_GENLAYER_NETWORK=studionet
VITE_CONTRACT_ADDRESS=0x...
```

Per-network addresses are available as `VITE_CONTRACT_ADDRESS_STUDIONET` and friends. Users can also paste an
address in the network menu; that is saved in their browser and wins over the env value.

Never put a private key in a `VITE_` variable. Those values are shipped in the browser bundle.

## Running

```
npm install
npm run dev            # http://localhost:5173
npm run typecheck
npm test               # unit tests: validation rules and adapter argument mapping
VITE_CONTRACT_ADDRESS=0x... npm run connect-check   # live calls against the deployed contract
npm run build
```

## Deploying on Vercel

- Root directory: `event-attendance-v02/frontend` (or wherever this folder sits in the repo)
- Framework preset: Vite. Build command `npm run build`, output `dist`.
- Add `VITE_CONTRACT_ADDRESS` and `VITE_GENLAYER_NETWORK` under Environment Variables, then redeploy.
- `vercel.json` rewrites all paths to `index.html`, so deep links such as `/claim?event=0` load.

## Before going live

1. `npm install` must succeed with `genlayer-js` 1.1.8. Check that `genlayer-js/types` exports `TransactionStatus`
   and `ExecutionResult`, and that `createClient`, `createAccount` and `genlayer-js/chains` exist in that version.
2. `npm run connect-check` must print OK for `get_config`, `get_events` and `get_active_events`, and `get_config`
   must return the owner address.
3. Run the contract tests in `../tests/direct/` with gltest against StudioNet.
4. Confirm the deployed source hash, then fill `../deploy/manifest.json`.
