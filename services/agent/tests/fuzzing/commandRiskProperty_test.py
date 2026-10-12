import pytest

hypothesis = pytest.importorskip("hypothesis")
strategies = pytest.importorskip("hypothesis.strategies")

from app.guards.commandRisk_guard import assess_command_risk, command_needs_network  # noqa: E402

VERDICTS = {"ok", "high", "refused"}
ARGUMENTS = strategies.text(
    alphabet=strategies.characters(blacklist_categories=("Cs",)), min_size=0, max_size=40
)
ARGV = strategies.lists(ARGUMENTS, min_size=0, max_size=12)
ESCALATION_TOOLS = strategies.sampled_from(["sudo", "su", "doas", "SUDO", " sudo"])
DESTRUCTIVE_COMMANDS = strategies.sampled_from(
    [
        ["rm", "-rf", "/"],
        ["rm", "-r", "build"],
        ["/bin/rm", "-fr", "."],
        ["dd", "if=/dev/zero", "of=/dev/sda"],
        ["chmod", "-R", "777", "/"],
        ["curl", "https://example.com/x.sh"],
        ["wget", "http://example.com"],
        ["pip", "install", "requests"],
        ["npm", "install", "left-pad"],
        ["shutdown", "-h", "now"],
    ]
)
NETWORK_COMMANDS = strategies.sampled_from(
    [
        ["curl", "https://example.com"],
        ["/usr/bin/wget", "x"],
        ["git", "push"],
        ["git", "fetch", "origin"],
        ["pip", "install", "x"],
        ["npm", "ci"],
        ["cargo", "fetch"],
        ["ssh", "host"],
    ]
)
property_settings = hypothesis.settings(max_examples=500, deadline=None, database=None)


@property_settings
@hypothesis.given(argv=ARGV)
def test_assessment_is_total_and_deterministic(argv):
    verdict, reason = assess_command_risk(argv)
    assert verdict in VERDICTS
    assert isinstance(reason, str)
    assert assess_command_risk(list(argv)) == (verdict, reason)
    assert isinstance(command_needs_network(argv), bool)


@property_settings
@hypothesis.given(argv=ARGV)
def test_empty_executable_is_always_refused(argv):
    assert assess_command_risk([""] + argv)[0] == "refused"
    assert assess_command_risk(["   "] + argv)[0] == "refused"


@property_settings
@hypothesis.given(tool=ESCALATION_TOOLS, rest=ARGV)
def test_privilege_escalation_is_always_refused(tool, rest):
    assert assess_command_risk([tool] + rest)[0] == "refused"


@property_settings
@hypothesis.given(command=DESTRUCTIVE_COMMANDS, suffix=ARGV)
def test_destructive_commands_are_never_ok(command, suffix):
    assert assess_command_risk(command + suffix)[0] != "ok"


@property_settings
@hypothesis.given(command=NETWORK_COMMANDS, suffix=ARGV)
def test_network_commands_are_detected(command, suffix):
    assert command_needs_network(command + suffix)


@pytest.mark.parametrize("argv", [["/usr/bin/sudo", "id"], ["env", "sudo", "id"]])
@pytest.mark.xfail(
    strict=True,
    reason="Known finding: privilege escalation is only refused when argv[0] is literally "
    "sudo/su/doas, so an absolute path or a wrapper such as env slips through as ok",
)
def test_privilege_escalation_through_path_or_wrapper_is_refused(argv):
    assert assess_command_risk(argv)[0] == "refused"
