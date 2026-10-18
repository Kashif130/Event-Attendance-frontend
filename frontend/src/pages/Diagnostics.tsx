import { useState } from "react";
import { Button, Card, EmptyState, PageHeader } from "../components/ui";
import { runConnectionCheck } from "../lib/client";
import { activeNetworkLabel, CONTRACT_ADDRESS, isContractConfigured } from "../lib/networks";
import type { ConnectionCheckResult } from "../lib/types";

/** Calls the deployed contract's views and shows each real result or error. Run this first. */
export function Diagnostics() {
  const [results, setResults] = useState<ConnectionCheckResult[] | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      setResults(await runConnectionCheck());
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader title="Connection check">
        Reads the contract on {activeNetworkLabel} and shows the raw answer or error for each call.
      </PageHeader>

      <Card className="space-y-3 p-6">
        <p className="font-mono text-[12px] text-mist-400">{isContractConfigured ? CONTRACT_ADDRESS : "No contract address set"}</p>
        <Button loading={busy} disabled={!isContractConfigured} onClick={() => void run()}>
          Run checks
        </Button>
      </Card>

      {!results && <EmptyState title="Not run yet">Press Run checks to call the contract.</EmptyState>}

      {results?.map((r) => (
        <Card key={r.name} className="p-5">
          <p className={`font-medium ${r.ok ? "text-jade-400" : "text-ember-400"}`}>
            {r.ok ? "OK" : "FAILED"} · {r.name}
          </p>
          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all rounded-md border border-deep-700 bg-deep-950 p-3 text-[12px] text-mist-300">
            {r.ok ? JSON.stringify(r.value, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2) : r.error}
          </pre>
        </Card>
      ))}
    </div>
  );
}
