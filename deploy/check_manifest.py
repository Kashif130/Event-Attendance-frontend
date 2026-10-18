"""Confirms that the source in the repo is the source the manifest pins, and, once a
deployment is recorded, that the deployed source hash matches the reviewed source.

Usage (from the repo root):  python3 deploy/check_manifest.py
Exit code 0 = consistent. Non-zero = mismatch or incomplete record.
"""
import hashlib, json, sys

with open("deploy/manifest.json") as f:
    m = json.load(f)
with open(m["source_path"], "rb") as f:
    actual = hashlib.sha256(f.read()).hexdigest()

ok = True
if actual != m["source_sha256"]:
    print(f"MISMATCH: repo source {actual} != manifest source_sha256 {m['source_sha256']}")
    ok = False
else:
    print(f"source OK: {actual}")

if m["deployed"]:
    for field in ("address", "deploy_tx_hash", "deployed_source_sha256", "deployed_at", "deployed_by"):
        if not m.get(field):
            print(f"INCOMPLETE: deployed=true but {field} is empty")
            ok = False
    if m.get("deployed_source_sha256") and m["deployed_source_sha256"] != m["source_sha256"]:
        print("MISMATCH: deployed source differs from reviewed source")
        ok = False
    if ok:
        print(f"deployment OK: {m['address']} on {m['network']} (tx {m['deploy_tx_hash']})")
else:
    print("not deployed yet (manifest deployed=false)")

sys.exit(0 if ok else 1)
