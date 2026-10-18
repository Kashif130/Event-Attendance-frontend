"""Breaks the contract in known ways; every mutant must make at least one test fail."""
import os, shutil, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.abspath(os.path.join(HERE, "..", ".."))
ORIG = open(os.path.join(SRC, "contracts", "EventAttendance.py")).read()

# name -> list of (old, new) replacements; each `old` must occur exactly once
MUTANTS = {
    "wallet not checked on page": [(
        '    if not _has_token(low, wallet.lower()):\n        return json.dumps({"status": "no_wallet"})\n', '')],
    "comments not excluded from primary text": [(
        '    for marker in COMMENT_MARKERS:\n        k = low_region.find(marker)\n        if k >= 0:\n            region = region[:k]\n            low_region = low_region[:k]\n', '')],
    "domain verification checks whole page, not main content": [(
        '    primary = _primary_text(page)\n    if _has_token(primary.lower(), token.lower()):',
        '    primary = _visible_text(page)\n    if _has_token(primary.lower(), token.lower()):')],
    "events start verified": [('    verified=False,', '    verified=True,')],
    "claims allowed before verification": [(
        '        if not ev.verified:\n            raise gl.vm.UserError(f"{ERROR_EXPECTED} The organizer has not verified this event\'s page")\n', '')],
    "event code not unique per prefix": [('        if taken_key in self.code_taken:', '        if False:')],
    "operator can delegate staff": [(
        '        key, ev = self._get_event(event_id)\n        if gl.message.sender_address != ev.organizer:\n            raise gl.vm.UserError(f"{ERROR_EXPECTED} Only the organizer")\n        self.staff[',
        '        key, ev = self._get_event(event_id)\n        if False:\n            raise gl.vm.UserError(f"{ERROR_EXPECTED} Only the organizer")\n        self.staff[')],
    "organizer mint allowed on cancelled event": [(
        '        if ev.status == "cancelled":\n            raise gl.vm.UserError(f"{ERROR_EXPECTED} Event is cancelled")\n        if not ev.verified:',
        '        if not ev.verified:')],
    "rejections consume a seat": [(
        '        self.submissions[sub] = "rejected"\n        self.attempts[sub] = u256(used + 1)',
        '        ev.seats_taken = u256(int(ev.seats_taken) + 1)\n        self.submissions[sub] = "rejected"\n        self.attempts[sub] = u256(used + 1)')],
    "seat cap not enforced": [(
        '        if int(ev.seats_taken) >= int(ev.max_seats):\n            raise gl.vm.UserError(f"{ERROR_EXPECTED} No seats left")\n        if self.submissions',
        '        if self.submissions')],
    "series completes despite revoked badge": [(
        '            if bkey not in self.badges or self.badges[bkey].revoked:', '            if bkey not in self.badges:')],
    "series can be claimed twice": [(
        '        if int(self.series_issued.get(ssub, u256(0))) > 0:\n            raise gl.vm.UserError(f"{ERROR_EXPECTED} Series badge already claimed")\n', '')],
    "non-ASCII digits accepted as hex": [(
        '    return all(ch in HEX_CHARS for ch in a[2:])', '    return all(ch.isdigit() or ch in HEX_CHARS for ch in a[2:])')],
    "name requirement not checked": [('    if require_name:\n        if (" " + _norm_words(name)', '    if False:\n        if (" " + _norm_words(name)')],
    "LLM verdict ignored": [(
        '    if verdict == "pass":\n        return json.dumps({"status": "pass"})\n    if verdict == "fail":\n        return json.dumps({"status": "llm_fail"})',
        '    if verdict in ("pass", "fail"):\n        return json.dumps({"status": "pass"})')],
    "claim window not checked": [(
        '        if not self._claim_open(ev, now):\n            raise gl.vm.UserError(f"{ERROR_EXPECTED} Claim window is not open")\n', '')],
    "verdict parser accepts truthy strings": [(
        '    if v is True:\n        return "pass"', '    if v is True or v == "true":\n        return "pass"')],
    "malformed verdict treated as rejection": [(
        '    return json.dumps({"status": "llm_malformed"})', '    return json.dumps({"status": "llm_fail"})')],
    "unparseable page treated as rejection": [(
        '        return json.dumps({"status": "unparseable"})\n    low = primary.lower()',
        '        return json.dumps({"status": "no_code"})\n    low = primary.lower()')],
    "appeal_rejected locks claimant out": [(
        '"none", "rejected", "expired", "appeal_rejected", "appeal_expired"', '"none", "rejected", "expired"')],
    "calendar dates not validated": [(
        '    if not (1 <= d <= _days_in_month(y, mo)):\n        return False\n', '')],
    "expired windows listed as active": [(
        '            expired = now != "" and ev.claim_until < now', '            expired = False')],
    "organizer mint skips verification": [(
        '        if not ev.verified:\n            raise gl.vm.UserError(f"{ERROR_EXPECTED} Verify the event prefix (verify_prefix) before issuing badges")\n', '')],
    "series check ignores revocation": [(
        '            elif self.badges[bkey].revoked:\n                revoked_events.append(eid)\n', '')],
    "uppercase comment markers not excluded": [(
        '    low_region = region.lower()\n    for marker', '    low_region = region\n    for marker')],
}

failures = 0
for name, reps in MUTANTS.items():
    text = ORIG
    ok = True
    for old, new in reps:
        if text.count(old) != 1:
            print(f"SKIP   {name}: pattern occurs {text.count(old)} times"); ok = False; break
        text = text.replace(old, new)
    if not ok:
        failures += 1
        continue
    d = tempfile.mkdtemp(prefix="ea2_mut_")
    shutil.rmtree(d)
    shutil.copytree(SRC, d)
    open(os.path.join(d, "contracts", "EventAttendance.py"), "w").write(text)
    out = subprocess.run([sys.executable, os.path.join(d, "tests", "offline", "run_offline.py"), d],
                         capture_output=True, text=True, cwd=d).stdout
    fails = [l for l in out.splitlines() if l.startswith("FAIL")]
    summary = [l for l in out.splitlines() if "passed" in l]
    status = "CAUGHT" if fails else "MISSED"
    if not fails:
        failures += 1
    print(f"{status:7} {name}: {summary[-1] if summary else 'no summary'}")
    for f in fails[:2]:
        print("         ", f[:120])
    shutil.rmtree(d, ignore_errors=True)

print("\nall mutants caught" if failures == 0 else f"\n{failures} mutant(s) survived or were skipped")
sys.exit(1 if failures else 0)
