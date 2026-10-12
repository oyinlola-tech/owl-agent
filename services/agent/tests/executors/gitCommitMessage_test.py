import asyncio
import subprocess

from app.executors.commandExecutor_executor import CommandExecutor
from app.guards.workspaceAccess_guard import WorkspaceAccessGuard
from app.llms.providers.providerError_provider import ProviderNotConfiguredError
from app.tools.handlers.git.gitMessage_handler import generate_commit_message
from app.tools.toolArgument_tool import GitCommitMessageArguments

GIT_ENV = {"PATH": "/usr/bin:/bin", "GIT_TEMPLATE_DIR": ""}
IDENTITY = ["-c", "user.email=t@t", "-c", "user.name=t"]


class ScriptedProvider:
    def __init__(self, reply):
        self.reply = reply
        self.seen = None

    async def complete(self, messages, model=None):
        self.seen = messages[-1]["content"]
        return self.reply


class UnconfiguredTestProvider:
    async def complete(self, messages, model=None):
        raise ProviderNotConfiguredError("Connect a model first.")


def make_repo_with_change(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    subprocess.run(["git", "-C", str(repo), "init", "-q", "-b", "main"], check=True, env=GIT_ENV)
    (repo / "a.txt").write_text("one\n")
    subprocess.run(["git", "-C", str(repo), "add", "a.txt"], check=True, env=GIT_ENV)
    subprocess.run(
        ["git", "-C", str(repo), *IDENTITY, "commit", "-q", "-m", "base"], check=True, env=GIT_ENV
    )
    (repo / "a.txt").write_text("one\ntwo\n")
    subprocess.run(["git", "-C", str(repo), "add", "a.txt"], check=True, env=GIT_ENV)
    return repo


def ctx_for(repo, provider):
    ex = CommandExecutor(WorkspaceAccessGuard([str(repo)]))
    return {"exec": ex, "provider": provider}


def test_generate_commit_message_drafts_from_diff(tmp_path):
    repo = make_repo_with_change(tmp_path)
    provider = ScriptedProvider("feat(a): add a second line")
    result = asyncio.run(
        generate_commit_message(ctx_for(repo, provider), GitCommitMessageArguments(path=str(repo)))
    )
    assert result["message"] == "feat(a): add a second line"
    assert result["provider_configured"] is True
    assert "two" in (provider.seen or "")


def test_generate_commit_message_without_provider_is_not_an_error(tmp_path):
    repo = make_repo_with_change(tmp_path)
    result = asyncio.run(
        generate_commit_message(
            ctx_for(repo, UnconfiguredTestProvider()), GitCommitMessageArguments(path=str(repo))
        )
    )
    assert result["message"] == ""
    assert result["provider_configured"] is False
    assert "connect a model" in result["note"].lower()
