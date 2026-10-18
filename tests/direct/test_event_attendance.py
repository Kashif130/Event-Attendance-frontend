import pytest

from conftest import warp_to, NOW

CLAIM_FROM = NOW
CLAIM_UNTIL = "2099-01-31T23:59:59Z"
STARTS_AT = "2099-01-10T18:00:00Z"
PREFIX = "https://events.example.com/checkin/"
CODE = "DEVCON-2099-7F3K"
EVENT_NAME = "DevCon 2099"
DESC = "Annual developer conference"
LOC = "Hall A, Main Campus"

T_PLUS_1_DAY = "2099-01-02T00:00:00Z"
T_APPEAL_CLOSED = "2099-01-16T00:00:00Z"
T_REVIEW_CLOSED = "2099-02-02T00:00:00Z"
T_AFTER_CLAIM = "2099-02-01T00:00:00Z"

URL_1 = PREFIX + "ticket-1"
URL_2 = PREFIX + "ticket-2"
URL_3 = PREFIX + "ticket-3"


def create_event(contract, direct_vm, organizer, max_seats=5, require_name=False,
                 require_prereg=False, claim_from=CLAIM_FROM, claim_until=CLAIM_UNTIL,
                 prefix=PREFIX, code=CODE, verify=True):
    """Creates an event as `organizer`; by default also verifies the prefix page."""
    direct_vm.sender = organizer
    contract.create_event(EVENT_NAME, DESC, LOC, code, prefix, STARTS_AT, claim_from,
                          claim_until, max_seats, require_name, require_prereg, "")
    eid = int(contract.get_config()["event_count"]) - 1
    if verify:
        verify_event(contract, direct_vm, organizer, eid, prefix)
    direct_vm.sender = organizer
    return eid


def verify_event(contract, direct_vm, organizer, eid, prefix=PREFIX, token_in_main=True):
    token = contract.get_verify_token(eid)
    body = f"Check-in portal. Verification: {token}" if token_in_main else "Check-in portal."
    direct_vm.clear_mocks()
    direct_vm.mock_web(r".*", {"status": 200, "body": _page(body)})
    direct_vm.sender = organizer
    contract.verify_prefix(eid)


def register(contract, direct_vm, organizer, *wallets, eid=0):
    direct_vm.sender = organizer
    contract.add_attendees(eid, ",".join(wallets))


def _page(body, comment=""):
    return (
        "<html><body><nav>Home Tickets</nav><main>"
        f"<h1>{EVENT_NAME} check-in</h1><p>{body}</p>"
        "</main>"
        f'<section id="comments"><p>{comment}</p></section>'
        "<footer>(c) organizer</footer></body></html>"
    )


def _mock(direct_vm, html, passed):
    direct_vm.clear_mocks()
    direct_vm.mock_web(r".*", {"status": 200, "body": html})
    direct_vm.mock_llm(r".*verifier for an event attendance claim.*",
                       '{"passed": true}' if passed else '{"passed": false}')


def good_body(code, wallet, name=None):
    base = f"Confirmed attendee. Event code: {code}. Wallet: {wallet}. Status: checked in."
    if name:
        base += f" Name: {name}."
    return base


def mock_pass(direct_vm, code, wallet, name=None):
    _mock(direct_vm, _page(good_body(code, wallet, name)), True)


def mock_llm_fail(direct_vm, code, wallet):
    _mock(direct_vm, _page(good_body(code, wallet) + " Note: refund issued."), False)


def claim(contract, direct_vm, who, url=URL_1, name=""):
    direct_vm.sender = who
    contract.submit_proof(0, url, name)


def _reject(contract, direct_vm, carol):
    mock_llm_fail(direct_vm, CODE, str(carol))
    claim(contract, direct_vm, carol)
    assert contract.get_submission_status(0, carol) == "rejected"


# ------------------------------------------------------------ creation

def test_create_event_stores_fields(contract, direct_vm, direct_alice):
    create_event(contract, direct_vm, direct_alice, max_seats=10)
    ev = contract.get_event(0)
    assert ev["organizer"] == str(direct_alice)
    assert ev["max_seats"] == 10
    assert ev["status"] == "active"
    assert ev["verified"] is True
    assert ev["location"] == LOC
    assert ev["description"] == DESC


def test_create_event_rejects_bad_prefix(contract, direct_vm, direct_alice):
    for bad in ["http://events.example.com/checkin/", "https://events.example.com/",
                "https://user@events.example.com/x/", "https://events.example.com"]:
        with pytest.raises(Exception):
            create_event(contract, direct_vm, direct_alice, prefix=bad, verify=False)


def test_create_event_rejects_bad_code_and_inverted_window(contract, direct_vm, direct_alice):
    with pytest.raises(Exception):
        create_event(contract, direct_vm, direct_alice, code="bad code!", verify=False)
    with pytest.raises(Exception):
        create_event(contract, direct_vm, direct_alice,
                     claim_from="2099-02-01T00:00:00Z", claim_until="2099-01-31T00:00:00Z", verify=False)


def test_create_event_rejects_zero_seats_and_past_end(contract, direct_vm, direct_alice):
    with pytest.raises(Exception):
        create_event(contract, direct_vm, direct_alice, max_seats=0, verify=False)
    with pytest.raises(Exception):
        create_event(contract, direct_vm, direct_alice,
                     claim_from="2098-01-01T00:00:00Z", claim_until="2098-06-01T00:00:00Z", verify=False)


def test_event_code_unique_per_prefix(contract, direct_vm, direct_alice, direct_bob):
    create_event(contract, direct_vm, direct_alice)
    with pytest.raises(Exception):
        create_event(contract, direct_vm, direct_bob, verify=False)  # same prefix and code
    create_event(contract, direct_vm, direct_bob, prefix="https://other.example.org/checkin/",
                 verify=False)  # different prefix is fine


# ------------------------------------------------------- domain verification

def test_claims_blocked_until_prefix_verified(contract, direct_vm, direct_alice, direct_carol):
    create_event(contract, direct_vm, direct_alice, verify=False)
    mock_pass(direct_vm, CODE, str(direct_carol))
    with pytest.raises(Exception):
        claim(contract, direct_vm, direct_carol)


def test_verify_passes_when_token_in_main_content(contract, direct_vm, direct_alice):
    eid = create_event(contract, direct_vm, direct_alice, verify=False)
    verify_event(contract, direct_vm, direct_alice, eid)
    assert contract.get_event(eid)["verified"] is True


def test_verify_fails_when_token_only_in_comments(contract, direct_vm, direct_alice):
    create_event(contract, direct_vm, direct_alice, verify=False)
    token = contract.get_verify_token(0)
    direct_vm.clear_mocks()
    direct_vm.mock_web(r".*", {"status": 200,
                              "body": _page("Nice portal.", comment=f"token {token}")})
    direct_vm.sender = direct_alice
    with pytest.raises(Exception):
        contract.verify_prefix(0)
    assert contract.get_event(0)["verified"] is False


def test_verify_only_by_organizer_and_only_once(contract, direct_vm, direct_alice, direct_bob):
    create_event(contract, direct_vm, direct_alice, verify=False)
    direct_vm.sender = direct_bob
    with pytest.raises(Exception):
        contract.verify_prefix(0)
    verify_event(contract, direct_vm, direct_alice, 0)
    with pytest.raises(Exception):
        verify_event(contract, direct_vm, direct_alice, 0)


def test_verify_token_is_organizer_specific(contract, direct_vm, direct_alice, direct_bob):
    create_event(contract, direct_vm, direct_alice, verify=False)
    create_event(contract, direct_vm, direct_bob, prefix="https://other.example.org/checkin/", verify=False)
    assert contract.get_verify_token(0) != contract.get_verify_token(1)


def test_verify_unreachable_reverts(contract, direct_vm, direct_alice):
    create_event(contract, direct_vm, direct_alice, verify=False)
    direct_vm.clear_mocks()  # no page => unreachable
    direct_vm.sender = direct_alice
    with pytest.raises(Exception):
        contract.verify_prefix(0)
    assert contract.get_event(0)["verified"] is False


# --------------------------------------------------------- staff & registration

def test_only_staff_register_attendees(contract, direct_vm, direct_alice, direct_bob, direct_carol):
    create_event(contract, direct_vm, direct_alice)
    direct_vm.sender = direct_bob
    with pytest.raises(Exception):
        contract.add_attendees(0, str(direct_carol))


def test_operator_can_manage_attendees_but_not_delegate(contract, direct_vm, direct_alice, direct_bob, direct_carol, direct_dave):
    create_event(contract, direct_vm, direct_alice)
    direct_vm.sender = direct_alice
    contract.set_operator(0, direct_bob, True)
    assert contract.is_staff(0, direct_bob) is True
    register(contract, direct_vm, direct_bob, str(direct_carol))
    assert contract.get_event(0)["registered"] == 1
    direct_vm.sender = direct_bob
    with pytest.raises(Exception):
        contract.set_operator(0, direct_dave, True)
    with pytest.raises(Exception):
        contract.propose_event_organizer(0, direct_dave)
    with pytest.raises(Exception):
        contract.extend_claim_window(0, "2099-06-01T00:00:00Z")


def test_removed_operator_loses_access(contract, direct_vm, direct_alice, direct_bob, direct_carol):
    create_event(contract, direct_vm, direct_alice)
    direct_vm.sender = direct_alice
    contract.set_operator(0, direct_bob, True)
    contract.set_operator(0, direct_bob, False)
    direct_vm.sender = direct_bob
    with pytest.raises(Exception):
        contract.add_attendees(0, str(direct_carol))


def test_add_attendees_rejects_bad_and_unicode_address(contract, direct_vm, direct_alice, direct_carol):
    create_event(contract, direct_vm, direct_alice)
    direct_vm.sender = direct_alice
    with pytest.raises(Exception):
        contract.add_attendees(0, "0xnothex")
    with pytest.raises(Exception):
        contract.add_attendees(0, "0x" + "\u0660" * 40)  # Arabic-Indic zero is not a hex digit
    contract.add_attendees(0, str(direct_carol))
    with pytest.raises(Exception):
        contract.add_attendees(0, str(direct_carol))
    assert contract.get_event(0)["registered"] == 1


def test_remove_attendee_blocked_after_badge(contract, direct_vm, direct_alice, direct_carol):
    create_event(contract, direct_vm, direct_alice)
    register(contract, direct_vm, direct_alice, str(direct_carol))
    mock_pass(direct_vm, CODE, str(direct_carol))
    claim(contract, direct_vm, direct_carol)
    direct_vm.sender = direct_alice
    with pytest.raises(Exception):
        contract.remove_attendee(0, str(direct_carol))


# ------------------------------------------------------------ claims

def test_attendee_gets_page_badge_with_serial(contract, direct_vm, direct_alice, direct_carol):
    create_event(contract, direct_vm, direct_alice)
    mock_pass(direct_vm, CODE, str(direct_carol))
    claim(contract, direct_vm, direct_carol)
    assert contract.get_submission_status(0, direct_carol) == "approved"
    badge = contract.get_badge(0, direct_carol)
    assert badge["exists"] is True
    assert badge["serial"] == 1
    assert badge["source"] == "page"
    assert badge["revoked"] is False
    assert contract.get_badge_count(direct_carol) == "1"
    assert contract.get_event(0)["seats_taken"] == 1


def test_wallet_cannot_claim_twice(contract, direct_vm, direct_alice, direct_carol):
    create_event(contract, direct_vm, direct_alice)
    mock_pass(direct_vm, CODE, str(direct_carol))
    claim(contract, direct_vm, direct_carol)
    with pytest.raises(Exception):
        claim(contract, direct_vm, direct_carol, url=URL_2)


def test_page_for_another_wallet_grants_nothing(contract, direct_vm, direct_alice, direct_carol, direct_dave):
    create_event(contract, direct_vm, direct_alice)
    _mock(direct_vm, _page(good_body(CODE, str(direct_carol))), True)
    direct_vm.sender = direct_dave
    contract.submit_proof(0, URL_1, "")
    assert contract.get_submission_status(0, direct_dave) == "rejected"
    assert contract.get_event(0)["seats_taken"] == 0


def test_wallet_in_comment_does_not_count(contract, direct_vm, direct_alice, direct_carol):
    create_event(contract, direct_vm, direct_alice)
    _mock(direct_vm, _page("Attendance list for this event.", comment=good_body(CODE, str(direct_carol))), True)
    claim(contract, direct_vm, direct_carol)
    assert contract.get_submission_status(0, direct_carol) == "rejected"


def test_wallet_in_comments_inside_main_does_not_count(contract, direct_vm, direct_alice, direct_carol):
    create_event(contract, direct_vm, direct_alice)
    html = (
        "<html><body><main><p>Attendance list for this event.</p>"
        '<section id="comments"><p>' + good_body(CODE, str(direct_carol)) + "</p></section>"
        "</main></body></html>"
    )
    _mock(direct_vm, html, True)
    claim(contract, direct_vm, direct_carol)
    assert contract.get_submission_status(0, direct_carol) == "rejected"


def test_wallet_must_be_a_full_token(contract, direct_vm, direct_alice, direct_carol):
    create_event(contract, direct_vm, direct_alice)
    _mock(direct_vm, _page(good_body(CODE, str(direct_carol) + "ff")), True)
    claim(contract, direct_vm, direct_carol)
    assert contract.get_submission_status(0, direct_carol) == "rejected"


def test_event_code_must_match_this_event(contract, direct_vm, direct_alice, direct_carol):
    create_event(contract, direct_vm, direct_alice)
    _mock(direct_vm, _page(good_body("DEVCON-2020-OLD1", str(direct_carol))), True)
    claim(contract, direct_vm, direct_carol)
    assert contract.get_submission_status(0, direct_carol) == "rejected"


def test_llm_rejects_cancelled_or_refunded_page(contract, direct_vm, direct_alice, direct_carol):
    create_event(contract, direct_vm, direct_alice)
    _reject(contract, direct_vm, direct_carol)
    assert contract.get_claim_requirements(0, direct_carol)["attempts_left"] == 2


def test_name_required_and_matched(contract, direct_vm, direct_alice, direct_carol, direct_dave):
    create_event(contract, direct_vm, direct_alice, require_name=True)
    mock_pass(direct_vm, CODE, str(direct_carol))
    claim(contract, direct_vm, direct_carol, name="Carol Danvers")
    assert contract.get_submission_status(0, direct_carol) == "rejected"
    _mock(direct_vm, _page(good_body(CODE, str(direct_dave), name="ana o'neil")), True)
    direct_vm.sender = direct_dave
    contract.submit_proof(0, URL_2, "Ana  O-Neil")
    assert contract.get_submission_status(0, direct_dave) == "approved"


def test_name_required_but_missing_reverts(contract, direct_vm, direct_alice, direct_carol):
    create_event(contract, direct_vm, direct_alice, require_name=True)
    mock_pass(direct_vm, CODE, str(direct_carol))
    with pytest.raises(Exception):
        claim(contract, direct_vm, direct_carol, name="")


def test_display_name_never_stored(contract, direct_vm, direct_alice, direct_carol):
    create_event(contract, direct_vm, direct_alice, require_name=True)
    _mock(direct_vm, _page(good_body(CODE, str(direct_carol), name="Carol Danvers")), True)
    claim(contract, direct_vm, direct_carol, name="Carol Danvers")
    assert "Danvers" not in str(contract.get_badge(0, direct_carol))
    assert "Danvers" not in str(contract.get_appeal(0, direct_carol))


def test_preregistration_gate(contract, direct_vm, direct_alice, direct_carol):
    create_event(contract, direct_vm, direct_alice, require_prereg=True)
    mock_pass(direct_vm, CODE, str(direct_carol))
    with pytest.raises(Exception):
        claim(contract, direct_vm, direct_carol)
    register(contract, direct_vm, direct_alice, str(direct_carol))
    claim(contract, direct_vm, direct_carol)
    assert contract.get_submission_status(0, direct_carol) == "approved"


# ------------------------------------------------------------ seats & mint

def test_seat_cap_enforced(contract, direct_vm, direct_alice, direct_carol, direct_dave):
    create_event(contract, direct_vm, direct_alice, max_seats=1)
    mock_pass(direct_vm, CODE, str(direct_carol))
    claim(contract, direct_vm, direct_carol)
    mock_pass(direct_vm, CODE, str(direct_dave))
    with pytest.raises(Exception):
        claim(contract, direct_vm, direct_dave, url=URL_2)
    assert contract.get_submission_status(0, direct_dave) == "none"


def test_rejections_never_use_seats(contract, direct_vm, direct_alice, direct_carol, direct_dave):
    create_event(contract, direct_vm, direct_alice, max_seats=1)
    _reject(contract, direct_vm, direct_carol)
    mock_pass(direct_vm, CODE, str(direct_dave))
    claim(contract, direct_vm, direct_dave, url=URL_2)
    assert contract.get_submission_status(0, direct_dave) == "approved"


def test_organizer_mint_by_staff(contract, direct_vm, direct_alice, direct_bob, direct_carol):
    create_event(contract, direct_vm, direct_alice)
    direct_vm.sender = direct_alice
    contract.set_operator(0, direct_bob, True)
    direct_vm.sender = direct_bob
    contract.organizer_mint(0, str(direct_carol), "QR check-in at the door")
    badge = contract.get_badge(0, direct_carol)
    assert badge["source"] == "organizer"
    assert badge["serial"] == 1
    with pytest.raises(Exception):
        contract.organizer_mint(0, str(direct_carol), "again")


def test_organizer_mint_respects_seats_and_status(contract, direct_vm, direct_alice, direct_carol, direct_dave):
    create_event(contract, direct_vm, direct_alice, max_seats=1)
    direct_vm.sender = direct_alice
    contract.organizer_mint(0, str(direct_carol), "speaker")
    with pytest.raises(Exception):
        contract.organizer_mint(0, str(direct_dave), "late speaker")


def test_organizer_mint_blocked_for_non_staff_and_cancelled(contract, direct_vm, direct_alice, direct_carol, direct_dave):
    create_event(contract, direct_vm, direct_alice)
    direct_vm.sender = direct_dave
    with pytest.raises(Exception):
        contract.organizer_mint(0, str(direct_carol), "nope")
    direct_vm.sender = direct_alice
    contract.cancel_event(0)
    with pytest.raises(Exception):
        contract.organizer_mint(0, str(direct_carol), "cancelled")


def test_revoked_wallet_cannot_be_reminted(contract, direct_vm, direct_alice, direct_carol):
    create_event(contract, direct_vm, direct_alice)
    direct_vm.sender = direct_alice
    contract.organizer_mint(0, str(direct_carol), "speaker")
    contract.revoke_badge(0, str(direct_carol), "wrong person")
    with pytest.raises(Exception):
        contract.organizer_mint(0, str(direct_carol), "again")


# ------------------------------------------------------------ appeals

def test_appeal_approved_issues_badge_with_appeal_source(contract, direct_vm, direct_alice, direct_carol):
    create_event(contract, direct_vm, direct_alice)
    _reject(contract, direct_vm, direct_carol)
    direct_vm.sender = direct_carol
    contract.appeal(0, URL_1, "I did check in")
    assert contract.get_submission_status(0, direct_carol) == "appeal_pending"
    direct_vm.sender = direct_alice
    contract.resolve_appeal(0, str(direct_carol), True)
    assert contract.get_badge(0, direct_carol)["source"] == "appeal"
    assert contract.get_event(0)["pending_appeals"] == 0


def test_appeal_rejected(contract, direct_vm, direct_alice, direct_carol):
    create_event(contract, direct_vm, direct_alice)
    _reject(contract, direct_vm, direct_carol)
    direct_vm.sender = direct_carol
    contract.appeal(0, URL_1, "please review")
    direct_vm.sender = direct_alice
    contract.resolve_appeal(0, str(direct_carol), False)
    assert contract.get_submission_status(0, direct_carol) == "appeal_rejected"


def test_appeal_refused_when_seats_full_but_reject_allowed(contract, direct_vm, direct_alice, direct_carol, direct_dave):
    create_event(contract, direct_vm, direct_alice, max_seats=1)
    _reject(contract, direct_vm, direct_carol)
    direct_vm.sender = direct_carol
    contract.appeal(0, URL_1, "please review")
    mock_pass(direct_vm, CODE, str(direct_dave))
    claim(contract, direct_vm, direct_dave, url=URL_2)
    direct_vm.sender = direct_alice
    with pytest.raises(Exception):
        contract.resolve_appeal(0, str(direct_carol), True)
    contract.resolve_appeal(0, str(direct_carol), False)


def test_appeal_window_closes_and_expiry_finalizes(contract, direct_vm, direct_alice, direct_carol, direct_bob):
    create_event(contract, direct_vm, direct_alice)
    _reject(contract, direct_vm, direct_carol)
    direct_vm.sender = direct_bob
    with pytest.raises(Exception):
        contract.expire_stale(0, str(direct_carol))
    warp_to(direct_vm, T_APPEAL_CLOSED)
    direct_vm.sender = direct_carol
    with pytest.raises(Exception):
        contract.appeal(0, URL_1, "too late")
    direct_vm.sender = direct_bob
    contract.expire_stale(0, str(direct_carol))
    assert contract.get_submission_status(0, direct_carol) == "expired"


def test_pending_appeal_expires_after_review(contract, direct_vm, direct_alice, direct_carol, direct_bob):
    create_event(contract, direct_vm, direct_alice)
    _reject(contract, direct_vm, direct_carol)
    direct_vm.sender = direct_carol
    contract.appeal(0, URL_1, "please review")
    direct_vm.sender = direct_bob
    warp_to(direct_vm, T_PLUS_1_DAY)
    with pytest.raises(Exception):
        contract.expire_stale(0, str(direct_carol))
    warp_to(direct_vm, T_REVIEW_CLOSED)
    contract.expire_stale(0, str(direct_carol))
    assert contract.get_submission_status(0, direct_carol) == "appeal_expired"
    assert contract.get_event(0)["pending_appeals"] == 0


def test_expired_rejection_can_resubmit(contract, direct_vm, direct_alice, direct_carol, direct_bob):
    create_event(contract, direct_vm, direct_alice)
    _reject(contract, direct_vm, direct_carol)
    warp_to(direct_vm, T_APPEAL_CLOSED)
    direct_vm.sender = direct_bob
    contract.expire_stale(0, str(direct_carol))
    mock_pass(direct_vm, CODE, str(direct_carol))
    claim(contract, direct_vm, direct_carol, url=URL_2)
    assert contract.get_submission_status(0, direct_carol) == "approved"


# ---------------------------------------------------- revocation & lifecycle

def test_revoked_badge_blocks_reclaim_and_is_reported(contract, direct_vm, direct_alice, direct_carol):
    create_event(contract, direct_vm, direct_alice)
    mock_pass(direct_vm, CODE, str(direct_carol))
    claim(contract, direct_vm, direct_carol)
    direct_vm.sender = direct_alice
    contract.revoke_badge(0, str(direct_carol), "ticket resold")
    v = contract.verify_attendance(0, direct_carol)
    assert v["valid"] is False and v["reason"] == "revoked"
    direct_vm.sender = direct_carol
    with pytest.raises(Exception):
        claim(contract, direct_vm, direct_carol, url=URL_2)


def test_revoke_requires_reason_and_permission(contract, direct_vm, direct_alice, direct_carol, direct_bob):
    create_event(contract, direct_vm, direct_alice)
    mock_pass(direct_vm, CODE, str(direct_carol))
    claim(contract, direct_vm, direct_carol)
    direct_vm.sender = direct_bob
    with pytest.raises(Exception):
        contract.revoke_badge(0, str(direct_carol), "not allowed")
    direct_vm.sender = direct_alice
    with pytest.raises(Exception):
        contract.revoke_badge(0, str(direct_carol), "")


def test_close_blocks_claims_keeps_badges(contract, direct_vm, direct_alice, direct_carol, direct_dave):
    create_event(contract, direct_vm, direct_alice)
    mock_pass(direct_vm, CODE, str(direct_carol))
    claim(contract, direct_vm, direct_carol)
    direct_vm.sender = direct_alice
    contract.close_event(0)
    mock_pass(direct_vm, CODE, str(direct_dave))
    with pytest.raises(Exception):
        claim(contract, direct_vm, direct_dave, url=URL_2)
    assert contract.verify_attendance(0, direct_carol)["valid"] is True


def test_cancel_blocks_claims_and_appeal_approval(contract, direct_vm, direct_alice, direct_carol):
    create_event(contract, direct_vm, direct_alice)
    _reject(contract, direct_vm, direct_carol)
    direct_vm.sender = direct_carol
    contract.appeal(0, URL_1, "please review")
    direct_vm.sender = direct_alice
    contract.cancel_event(0)
    with pytest.raises(Exception):
        contract.resolve_appeal(0, str(direct_carol), True)


def test_pause_event_blocks_claims(contract, direct_vm, direct_alice, direct_carol):
    create_event(contract, direct_vm, direct_alice)
    direct_vm.sender = direct_alice
    contract.set_event_paused(0, True)
    mock_pass(direct_vm, CODE, str(direct_carol))
    with pytest.raises(Exception):
        claim(contract, direct_vm, direct_carol)


def test_global_pause_blocks_new_events(contract, direct_vm, direct_alice, direct_bob):
    direct_vm.sender = direct_alice
    contract.set_global_pause(True)
    direct_vm.sender = direct_bob
    with pytest.raises(Exception):
        contract.create_event(EVENT_NAME, DESC, LOC, CODE, PREFIX, STARTS_AT, CLAIM_FROM,
                              CLAIM_UNTIL, 1, False, False, "")


def test_extend_claim_window_only_forward(contract, direct_vm, direct_alice, direct_carol):
    create_event(contract, direct_vm, direct_alice)
    direct_vm.sender = direct_alice
    with pytest.raises(Exception):
        contract.extend_claim_window(0, "2099-01-15T00:00:00Z")
    contract.extend_claim_window(0, "2099-03-01T00:00:00Z")
    warp_to(direct_vm, T_AFTER_CLAIM)
    mock_pass(direct_vm, CODE, str(direct_carol))
    claim(contract, direct_vm, direct_carol)
    assert contract.get_submission_status(0, direct_carol) == "approved"


def test_claim_window_enforced(contract, direct_vm, direct_alice, direct_carol):
    create_event(contract, direct_vm, direct_alice, claim_from="2099-01-05T00:00:00Z")
    mock_pass(direct_vm, CODE, str(direct_carol))
    with pytest.raises(Exception):
        claim(contract, direct_vm, direct_carol)
    warp_to(direct_vm, T_AFTER_CLAIM)
    with pytest.raises(Exception):
        claim(contract, direct_vm, direct_carol)


def test_organizer_transfer_two_step(contract, direct_vm, direct_alice, direct_bob, direct_carol):
    create_event(contract, direct_vm, direct_alice)
    direct_vm.sender = direct_alice
    contract.propose_event_organizer(0, direct_bob)
    direct_vm.sender = direct_carol
    with pytest.raises(Exception):
        contract.accept_event_organizer(0)
    direct_vm.sender = direct_bob
    contract.accept_event_organizer(0)
    assert contract.get_event(0)["organizer"] == str(direct_bob)


def test_owner_transfer_two_step(contract, direct_vm, direct_alice, direct_bob):
    direct_vm.sender = direct_alice
    contract.propose_owner(direct_bob)
    direct_vm.sender = direct_bob
    contract.accept_ownership()
    assert contract.get_config()["owner"] == str(direct_bob)


def test_moderator_can_close_and_revoke(contract, direct_vm, direct_alice, direct_bob, direct_carol):
    create_event(contract, direct_vm, direct_alice)
    mock_pass(direct_vm, CODE, str(direct_carol))
    claim(contract, direct_vm, direct_carol)
    direct_vm.sender = direct_alice
    contract.set_moderator(direct_bob, True)
    direct_vm.sender = direct_bob
    contract.revoke_badge(0, str(direct_carol), "fraud review")
    contract.close_event(0)
    assert contract.get_event(0)["status"] == "closed"


# ----------------------------------------------------------- verification views

def test_verify_attendance_and_lock_flags(contract, direct_vm, direct_alice, direct_carol, direct_dave):
    create_event(contract, direct_vm, direct_alice)
    mock_pass(direct_vm, CODE, str(direct_carol))
    claim(contract, direct_vm, direct_carol)
    assert contract.verify_attendance(0, direct_carol)["valid"] is True
    assert contract.is_locked(0, direct_carol) is True
    v = contract.verify_attendance(0, direct_dave)
    assert v["valid"] is False and v["reason"] == "no badge"
    assert contract.is_locked(0, direct_dave) is False


def test_badge_metadata_shape(contract, direct_vm, direct_alice, direct_carol):
    create_event(contract, direct_vm, direct_alice)
    mock_pass(direct_vm, CODE, str(direct_carol))
    claim(contract, direct_vm, direct_carol)
    md = contract.get_badge_metadata(0, direct_carol)
    assert md["name"].startswith(EVENT_NAME)
    assert md["attributes"]["location"] == LOC
    assert md["attributes"]["serial"] == 1


def test_event_badges_and_wallet_badges_paginate(contract, direct_vm, direct_alice, direct_carol, direct_dave, direct_bob):
    create_event(contract, direct_vm, direct_alice, max_seats=5)
    create_event(contract, direct_vm, direct_alice, prefix="https://second.example.org/x/", code="SECOND-EVT-1")
    direct_vm.sender = direct_alice
    contract.organizer_mint(0, str(direct_carol), "a")
    contract.organizer_mint(0, str(direct_dave), "b")
    contract.organizer_mint(1, str(direct_carol), "c")
    page = contract.get_event_badges(0, 0, 1)
    assert [b["wallet"] for b in page["items"]] == [str(direct_carol)]
    assert page["total"] == 2
    page2 = contract.get_event_badges(0, 1, 10)
    assert [b["wallet"] for b in page2["items"]] == [str(direct_dave)]
    wb = contract.get_wallet_badges(direct_carol, 0, 10)
    assert wb["total"] == 2
    assert sorted(b["event_id"] for b in wb["items"]) == [0, 1]


# ----------------------------------------------------------------- series

def test_series_requires_existing_events_and_two_or_more(contract, direct_vm, direct_alice):
    create_event(contract, direct_vm, direct_alice)
    with pytest.raises(Exception):
        contract.create_series("Only one", "0", "")
    with pytest.raises(Exception):
        contract.create_series("Missing", "0,9", "")


def test_series_badge_needs_every_event(contract, direct_vm, direct_alice, direct_carol):
    create_event(contract, direct_vm, direct_alice)
    create_event(contract, direct_vm, direct_alice, prefix="https://second.example.org/x/", code="SECOND-EVT-1")
    contract.create_series("Dev Circuit", "0,1", "")
    direct_vm.sender = direct_alice
    contract.organizer_mint(0, str(direct_carol), "a")
    direct_vm.sender = direct_carol
    with pytest.raises(Exception):
        contract.claim_series_badge(0)
    assert contract.get_series_progress(0, direct_carol)["completed"] == 1
    direct_vm.sender = direct_alice
    contract.organizer_mint(1, str(direct_carol), "b")
    direct_vm.sender = direct_carol
    contract.claim_series_badge(0)
    assert contract.get_series_progress(0, direct_carol)["series_badge_serial"] == 1
    with pytest.raises(Exception):
        contract.claim_series_badge(0)


def test_revoked_badge_breaks_series_completion(contract, direct_vm, direct_alice, direct_carol):
    create_event(contract, direct_vm, direct_alice)
    create_event(contract, direct_vm, direct_alice, prefix="https://second.example.org/x/", code="SECOND-EVT-1")
    contract.create_series("Dev Circuit", "0,1", "")
    direct_vm.sender = direct_alice
    contract.organizer_mint(0, str(direct_carol), "a")
    contract.organizer_mint(1, str(direct_carol), "b")
    contract.revoke_badge(1, str(direct_carol), "fraud")
    direct_vm.sender = direct_carol
    with pytest.raises(Exception):
        contract.claim_series_badge(0)
    assert contract.get_series_progress(0, direct_carol)["complete"] is False


def test_series_view_lists_events(contract, direct_vm, direct_alice):
    create_event(contract, direct_vm, direct_alice)
    create_event(contract, direct_vm, direct_alice, prefix="https://second.example.org/x/", code="SECOND-EVT-1")
    contract.create_series("Dev Circuit", "0,1", "https://img.example.com/s.png")
    s = contract.get_series(0)
    assert s["event_ids"] == [0, 1]
    assert s["name"] == "Dev Circuit"


# ----------------------------------------------------------------- views

def test_claim_requirements_reflect_state(contract, direct_vm, direct_alice, direct_carol):
    create_event(contract, direct_vm, direct_alice, require_name=True)
    r = contract.get_claim_requirements(0, direct_carol)
    assert r["event_code"] == CODE
    assert r["wallet"] == str(direct_carol)
    assert r["verified"] is True
    assert r["claim_open"] is True
    assert r["attempts_left"] == 3


def test_active_events_excludes_full_unverified_and_closed(contract, direct_vm, direct_alice, direct_carol):
    create_event(contract, direct_vm, direct_alice, max_seats=1)
    create_event(contract, direct_vm, direct_alice, max_seats=5, prefix="https://second.example.org/x/", code="SECOND-EVT-1")
    create_event(contract, direct_vm, direct_alice, max_seats=5, prefix="https://third.example.org/x/", code="THIRD-EVT-1", verify=False)
    direct_vm.sender = direct_alice
    contract.organizer_mint(0, str(direct_carol), "fill")
    ids = [e["id"] for e in contract.get_active_events(0, 10)["items"]]
    assert ids == [1]


def test_get_events_pages(contract, direct_vm, direct_alice):
    for i in range(3):
        create_event(contract, direct_vm, direct_alice, prefix=f"https://p{i}.example.org/x/", code=f"CODE-{i}-XYZ")
    page = contract.get_events(0, 2)
    assert len(page["items"]) == 2
    assert page["total"] == 3
    assert page["next_offset"] == 2
