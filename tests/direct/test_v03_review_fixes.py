"""v0.3 tests for the steward review items: strict verdict parsing, appeal attempts,
retrieval/parse failures vs genuine rejection, calendar-valid times, active-event
windows, series validity and verified-only organizer minting."""
import pytest

from conftest import warp_to, NOW
from test_event_attendance import (
    CODE, PREFIX, URL_1, URL_2, URL_3, T_APPEAL_CLOSED, CLAIM_UNTIL, STARTS_AT, EVENT_NAME,
    create_event, claim, good_body, mock_pass, mock_llm_fail, _page, _mock, _reject,
)


def _mock_llm_raw(direct_vm, carol, text):
    """Page is fine and complete; the verifier answers with `text`."""
    direct_vm.clear_mocks()
    direct_vm.mock_web(r".*", {"status": 200, "body": _page(good_body(CODE, str(carol)))})
    direct_vm.mock_llm(r".*verifier for an event attendance claim.*", text)


# ---------------------------------------------------------------- 3. strict LLM verdict
@pytest.mark.parametrize("bad", [
    '{"passed": "false"}', '{"passed": "true"}', '{"passed": 1}', '{"passed": 0}',
    '{"passed": null}', '{}', '{"ok": true}', '[true]', 'true', 'passed: true',
    '{"passed": true, "extra": 1}', 'Sure! {"passed": true} hope that helps', '',
    '{"passed": true', 'not json at all',
])
def test_malformed_llm_output_never_issues_and_costs_no_attempt(contract, direct_vm, direct_alice, direct_carol, bad):
    create_event(contract, direct_vm, direct_alice)
    _mock_llm_raw(direct_vm, direct_carol, bad)
    with pytest.raises(Exception):
        claim(contract, direct_vm, direct_carol)
    assert contract.get_submission_status(0, direct_carol) == "none"
    assert contract.get_badge(0, direct_carol)["exists"] is False
    assert contract.get_claim_requirements(0, direct_carol)["attempts_left"] == 3


def test_fenced_json_boolean_is_accepted(contract, direct_vm, direct_alice, direct_carol):
    create_event(contract, direct_vm, direct_alice)
    _mock_llm_raw(direct_vm, direct_carol, '```json\n{"passed": true}\n```')
    claim(contract, direct_vm, direct_carol)
    assert contract.get_badge(0, direct_carol)["exists"] is True


def test_json_false_boolean_is_a_real_rejection(contract, direct_vm, direct_alice, direct_carol):
    create_event(contract, direct_vm, direct_alice)
    _mock_llm_raw(direct_vm, direct_carol, '{"passed": false}')
    claim(contract, direct_vm, direct_carol)
    assert contract.get_submission_status(0, direct_carol) == "rejected"
    assert contract.get_claim_requirements(0, direct_carol)["last_reject_reason"] == "llm_fail"


# ---------------------------------------------------------------- 4. appeals and attempts
def test_unsuccessful_appeal_keeps_unused_attempts(contract, direct_vm, direct_alice, direct_carol):
    create_event(contract, direct_vm, direct_alice)
    _reject(contract, direct_vm, direct_carol)
    direct_vm.sender = direct_carol
    contract.appeal(0, URL_1, "please review")
    direct_vm.sender = direct_alice
    contract.resolve_appeal(0, str(direct_carol), False)
    assert contract.get_submission_status(0, direct_carol) == "appeal_rejected"
    assert contract.get_claim_requirements(0, direct_carol)["attempts_left"] == 2
    mock_pass(direct_vm, CODE, str(direct_carol))
    claim(contract, direct_vm, direct_carol, URL_2)
    assert contract.get_badge(0, direct_carol)["exists"] is True


def test_expired_appeal_keeps_unused_attempts(contract, direct_vm, direct_alice, direct_carol):
    create_event(contract, direct_vm, direct_alice, claim_until="2099-12-31T23:59:59Z")
    _reject(contract, direct_vm, direct_carol)
    direct_vm.sender = direct_carol
    contract.appeal(0, URL_1, "please review")
    warp_to(direct_vm, "2099-03-01T00:00:00Z")  # review window (30 days) has lapsed
    contract.expire_stale(0, str(direct_carol))
    assert contract.get_submission_status(0, direct_carol) == "appeal_expired"
    assert contract.get_claim_requirements(0, direct_carol)["attempts_left"] == 2
    mock_pass(direct_vm, CODE, str(direct_carol))
    claim(contract, direct_vm, direct_carol, URL_2)
    assert contract.get_badge(0, direct_carol)["exists"] is True


def test_attempts_are_still_capped_after_appeals(contract, direct_vm, direct_alice, direct_carol):
    create_event(contract, direct_vm, direct_alice)
    for n, url in enumerate((URL_1, URL_2, URL_3)):
        mock_llm_fail(direct_vm, CODE, str(direct_carol))
        claim(contract, direct_vm, direct_carol, url)
        if n < 2:
            direct_vm.sender = direct_carol
            contract.appeal(0, url, "review")
            direct_vm.sender = direct_alice
            contract.resolve_appeal(0, str(direct_carol), False)
    assert contract.get_claim_requirements(0, direct_carol)["attempts_left"] == 0
    with pytest.raises(Exception):
        claim(contract, direct_vm, direct_carol, URL_1)


def test_pending_appeal_still_blocks_new_claims(contract, direct_vm, direct_alice, direct_carol):
    create_event(contract, direct_vm, direct_alice)
    _reject(contract, direct_vm, direct_carol)
    direct_vm.sender = direct_carol
    contract.appeal(0, URL_1, "review")
    mock_pass(direct_vm, CODE, str(direct_carol))
    with pytest.raises(Exception):
        claim(contract, direct_vm, direct_carol, URL_2)


# ---------------------------------------------------------------- 5. extraction vs absence
def test_unreachable_page_costs_no_attempt(contract, direct_vm, direct_alice, direct_carol):
    create_event(contract, direct_vm, direct_alice)
    direct_vm.clear_mocks()  # no web mock: render raises
    with pytest.raises(Exception):
        claim(contract, direct_vm, direct_carol)
    assert contract.get_submission_status(0, direct_carol) == "none"
    assert contract.get_claim_requirements(0, direct_carol)["attempts_left"] == 3


def test_unreadable_page_is_a_technical_failure_not_a_rejection(contract, direct_vm, direct_alice, direct_carol):
    create_event(contract, direct_vm, direct_alice)
    for html in ("<html><body><main>   </main></body></html>", "<html><head></head></html>",
                 "<html><body><script>var x=1</script></body></html>"):
        direct_vm.clear_mocks()
        direct_vm.mock_web(r".*", {"status": 200, "body": html})
        with pytest.raises(Exception):
            claim(contract, direct_vm, direct_carol)
        assert contract.get_submission_status(0, direct_carol) == "none"
        assert contract.get_claim_requirements(0, direct_carol)["attempts_left"] == 3


def test_genuine_absence_records_reason_and_costs_attempt(contract, direct_vm, direct_alice, direct_carol):
    create_event(contract, direct_vm, direct_alice)
    direct_vm.clear_mocks()
    direct_vm.mock_web(r".*", {"status": 200, "body": _page("No attendees listed yet.")})
    claim(contract, direct_vm, direct_carol)
    assert contract.get_submission_status(0, direct_carol) == "rejected"
    assert contract.get_claim_requirements(0, direct_carol)["attempts_left"] == 2
    assert contract.get_claim_requirements(0, direct_carol)["last_reject_reason"] == "no_code"
    assert contract.get_appeal(0, direct_carol)["reject_reason"] == "no_code"


def test_missing_wallet_reason(contract, direct_vm, direct_alice, direct_carol):
    create_event(contract, direct_vm, direct_alice)
    direct_vm.clear_mocks()
    direct_vm.mock_web(r".*", {"status": 200, "body": _page(f"Event code: {CODE}. Nobody yet.")})
    claim(contract, direct_vm, direct_carol)
    assert contract.get_appeal(0, direct_carol)["reject_reason"] == "no_wallet"


@pytest.mark.parametrize("html", [
    # uppercase tags
    lambda w: f"<HTML><BODY><MAIN><P>Code {CODE} wallet {w} checked in</P></MAIN></BODY></HTML>",
    # attributes on main
    lambda w: f'<html><body><main id="m" class="content wide"><div>Code {CODE}<br>wallet {w}</div></main></body></html>',
    # article only
    lambda w: f"<html><body><header>Site</header><article>Code {CODE} wallet {w}</article></body></html>",
    # body only with nav/footer and an html comment containing noise
    lambda w: f"<html><body><nav>x</nav><!-- hidden --><div>Code {CODE} wallet {w}</div><footer>f</footer></body></html>",
    # unclosed main
    lambda w: f"<html><body><main><p>Code {CODE}</p><p>wallet {w}</p>",
    # bare fragment, no structural tags
    lambda w: f"<div><p>Code {CODE}</p><p>wallet {w}</p></div>",
    # entities and nested inline markup
    lambda w: f"<html><body><main><p>Code&nbsp;<b>{CODE}</b> &amp; wallet <code>{w}</code></p></main></body></html>",
    # attribute containing '>' inside script
    lambda w: f"<html><body><main><script>if(a>b){{}}</script><p>Code {CODE} wallet {w}</p></main></body></html>",
])
def test_realistic_html_layouts_pass(contract, direct_vm, direct_alice, direct_carol, html):
    create_event(contract, direct_vm, direct_alice)
    direct_vm.clear_mocks()
    direct_vm.mock_web(r".*", {"status": 200, "body": html(str(direct_carol))})
    direct_vm.mock_llm(r".*verifier for an event attendance claim.*", '{"passed": true}')
    claim(contract, direct_vm, direct_carol)
    assert contract.get_badge(0, direct_carol)["exists"] is True


def test_uppercase_comment_section_is_still_excluded(contract, direct_vm, direct_alice, direct_carol):
    create_event(contract, direct_vm, direct_alice)
    w = str(direct_carol)
    html = (f'<HTML><BODY><MAIN><p>Code {CODE}</p>'
            f'<SECTION ID="COMMENTS"><p>wallet {w}</p></SECTION></MAIN></BODY></HTML>')
    direct_vm.clear_mocks()
    direct_vm.mock_web(r".*", {"status": 200, "body": html})
    direct_vm.mock_llm(r".*verifier for an event attendance claim.*", '{"passed": true}')
    claim(contract, direct_vm, direct_carol)
    assert contract.get_submission_status(0, direct_carol) == "rejected"


# ---------------------------------------------------------------- 7. calendar validation
@pytest.mark.parametrize("bad", [
    "2099-13-01T00:00:00Z", "2099-00-10T00:00:00Z", "2099-02-30T00:00:00Z", "2099-02-29T00:00:00Z",
    "2099-04-31T00:00:00Z", "2099-01-01T24:00:00Z", "2099-01-01T23:60:00Z", "2099-01-01T23:59:60Z",
    "2099-01-00T00:00:00Z", "abcd-ef-ghTij:kl:mnZ", "2099-01-01T00:00:0\u0660Z", "1999-01-01T00:00:00Z",
])
def test_invalid_calendar_times_rejected(contract, direct_vm, direct_alice, bad):
    direct_vm.sender = direct_alice
    with pytest.raises(Exception):
        contract.create_event("Name", "d", "l", "CODE-ABC-1", PREFIX, STARTS_AT, NOW, bad, 5, False, False, "")
    with pytest.raises(Exception):
        contract.create_event("Name", "d", "l", "CODE-ABC-2", PREFIX, bad, NOW, CLAIM_UNTIL, 5, False, False, "")


def test_leap_day_accepted(contract, direct_vm, direct_alice):
    direct_vm.sender = direct_alice
    contract.create_event("Name", "d", "l", "CODE-ABC-1", PREFIX, "2100-03-01T00:00:00Z",
                          NOW, "2104-02-29T12:00:00Z", 5, False, False, "")
    assert contract.get_event(0)["claim_until"] == "2104-02-29T12:00:00Z"


def test_extend_claim_window_rejects_invalid_calendar_time(contract, direct_vm, direct_alice):
    create_event(contract, direct_vm, direct_alice)
    direct_vm.sender = direct_alice
    with pytest.raises(Exception):
        contract.extend_claim_window(0, "2099-02-30T00:00:00Z")


def test_active_events_excludes_expired_claim_windows(contract, direct_vm, direct_alice):
    create_event(contract, direct_vm, direct_alice)
    create_event(contract, direct_vm, direct_alice, prefix="https://later.example.org/x/",
                 code="LATER-EVT-1", claim_until="2099-06-30T00:00:00Z")
    warp_to(direct_vm, "2099-03-01T00:00:00Z")
    items = contract.get_active_events(0, 10)["items"]
    assert [e["id"] for e in items] == [1]
    assert items[0]["accepting_claims"] is True
    # administratively listed in get_events, but not "active" for claims
    assert len(contract.get_events(0, 10)["items"]) == 2


def test_active_events_marks_not_yet_open_window(contract, direct_vm, direct_alice):
    create_event(contract, direct_vm, direct_alice, claim_from="2099-01-15T00:00:00Z")
    items = contract.get_active_events(0, 10)["items"]
    assert len(items) == 1 and items[0]["accepting_claims"] is False


# ---------------------------------------------------------------- 2. verified-only mint
def test_organizer_mint_requires_verified_prefix(contract, direct_vm, direct_alice, direct_carol):
    create_event(contract, direct_vm, direct_alice, verify=False)
    direct_vm.sender = direct_alice
    with pytest.raises(Exception):
        contract.organizer_mint(0, str(direct_carol), "walk-in")
    assert contract.get_badge(0, direct_carol)["exists"] is False


def test_verify_attendance_reports_event_verification(contract, direct_vm, direct_alice, direct_carol):
    create_event(contract, direct_vm, direct_alice)
    direct_vm.sender = direct_alice
    contract.organizer_mint(0, str(direct_carol), "speaker")
    v = contract.verify_attendance(0, direct_carol)
    assert v["valid"] is True and v["event_verified"] is True and v["event_status"] == "active"
    assert contract.get_badge_metadata(0, direct_carol)["attributes"]["event_verified"] is True


# ---------------------------------------------------------------- 8. series validity
def test_series_badge_is_point_in_time_and_check_view_reports_revocation(contract, direct_vm, direct_alice, direct_carol):
    create_event(contract, direct_vm, direct_alice)
    create_event(contract, direct_vm, direct_alice, prefix="https://second.example.org/x/", code="SECOND-EVT-1")
    direct_vm.sender = direct_alice
    contract.organizer_mint(0, str(direct_carol), "a")
    contract.organizer_mint(1, str(direct_carol), "b")
    contract.create_series("Both", "0,1", "")
    direct_vm.sender = direct_carol
    contract.claim_series_badge(0)
    ok = contract.check_series_badge(0, direct_carol)
    assert ok["issued"] is True and ok["currently_valid"] is True
    direct_vm.sender = direct_alice
    contract.revoke_badge(1, str(direct_carol), "fraud")
    after = contract.check_series_badge(0, direct_carol)
    assert after["issued"] is True and after["currently_valid"] is False
    assert after["revoked_events"] == [1]
    assert contract.get_series_progress(0, direct_carol)["series_badge_serial"] == 1  # documented: not revoked retroactively


def test_check_series_badge_for_non_holder(contract, direct_vm, direct_alice, direct_bob):
    create_event(contract, direct_vm, direct_alice)
    create_event(contract, direct_vm, direct_alice, prefix="https://second.example.org/x/", code="SECOND-EVT-1")
    direct_vm.sender = direct_alice
    contract.create_series("Both", "0,1", "")
    r = contract.check_series_badge(0, direct_bob)
    assert r["issued"] is False and r["currently_valid"] is False and r["missing_events"] == [0, 1]
