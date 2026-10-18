// Live check against the deployed contract. Run from the frontend folder after `npm install`:
//   VITE_CONTRACT_ADDRESS=0x... node tests/connect-check.mjs
// Optional: VITE_GENLAYER_NETWORK (studionet | localnet | testnetAsimov | testnetBradbury), default studionet.
// Prints the real result or the real error of each call. Needs network access to the GenLayer network.
import { createClient } from "genlayer-js";
import * as chains from "genlayer-js/chains";
import { createGenLayerAdapter, connectionCheck } from "../src/lib/adapter.js";

const networkKey = process.env.VITE_GENLAYER_NETWORK || "studionet";
const address = process.env.VITE_CONTRACT_ADDRESS || "";
const chain = chains[networkKey];

console.log(`Network:  ${networkKey}`);
console.log(`Contract: ${address || "(not set)"}\n`);

if (!chain) {
  console.log(`FAILED: unknown network "${networkKey}".`);
  process.exit(1);
}
if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
  console.log("FAILED: set VITE_CONTRACT_ADDRESS to the deployed 0x address.");
  process.exit(1);
}

const adapter = createGenLayerAdapter(createClient({ chain }), address);
const results = await connectionCheck(adapter);
let failed = 0;
for (const r of results) {
  if (r.ok) console.log(`OK     ${r.name}\n       ${JSON.stringify(r.value, (_, v) => (typeof v === "bigint" ? v.toString() : v))}`);
  else {
    failed++;
    console.log(`FAILED ${r.name}\n       ${r.error}`);
  }
}
console.log(failed === 0 ? "\nAll checks passed." : `\n${failed} check(s) failed.`);
process.exit(failed === 0 ? 0 : 1);
