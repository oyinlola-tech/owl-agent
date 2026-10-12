from supports.taskClient_support import make_test_client
from supports.verificationDriver_support import DONE, RecordingProvider, approve_until_task_settles

from app.databases.databaseConnection_database import open_database
from app.memories.promptKnowledge_memory import KNOWLEDGE_HEADER, PromptKnowledgeBuilder
from app.memories.sqliteMemoryStore_memory import SqliteMemoryStore
from app.memories.userProfile_memory import UserProfileStore


def build_knowledge(**kwargs):
    conn = open_database(":memory:")
    memory = SqliteMemoryStore(conn)
    profile = UserProfileStore(conn)
    return memory, profile, PromptKnowledgeBuilder(conn, memory, profile, **kwargs)


def test_block_has_profile_ranked_memories_and_excludes_disabled():
    memory, profile, builder = build_knowledge()
    profile.save_profile({"display_name": "Ada", "languages": ["Python", "Rust"]})
    keep = memory.save_memory("global", "Prefer pytest fixtures over setUp methods.")
    other = memory.save_memory("project", "Uses Django templates.", project="other")
    off = memory.save_memory("global", "Always deploy on Fridays to production.")
    memory.set_memory_enabled(off["id"], False)
    block, used = builder.build_knowledge_block("add pytest tests", "owl")
    assert block.startswith(KNOWLEDGE_HEADER)
    assert "never override the safety rules" in block
    assert "Name: Ada" in block and "Python, Rust" in block
    assert "Prefer pytest fixtures" in block
    assert "Fridays" not in block and "Django" not in block
    assert [m["id"] for m in used] == [keep["id"]]
    assert other


def test_confirmed_first_and_suggestions_hidden_until_confirmed():
    memory, _, builder = build_knowledge(top_k=2)
    memory.save_memory(
        "global", "Indent with tabs in Makefiles, a draft note.", confirmed=False, source="user"
    )
    memory.save_memory("global", "Format Python with black and line length 100.")
    hidden = memory.save_memory(
        "global", "Suggested note about linting.", confirmed=False, source="task-suggestion:t1"
    )
    block, used = builder.build_knowledge_block("python note", "")
    assert used[0]["text"] == "Format Python with black and line length 100."
    assert "(not yet confirmed)" in block
    assert "linting" not in block
    memory.confirm_memory(hidden["id"])
    assert "linting" in builder.build_knowledge_block("linting note", "")[0]


def test_block_respects_token_budget():
    memory, _, builder = build_knowledge(token_budget=120)
    for i in range(20):
        memory.save_memory("global", f"Preference number {i} " + "word " * 30 + f"tail{i}")
    block, used = builder.build_knowledge_block("preference", "")
    assert len(used) < 20
    assert len(block) < 120 * 6


def test_empty_knowledge_adds_nothing():
    _, _, builder = build_knowledge()
    assert builder.build_knowledge_block("anything", "") == ("", [])


def test_agent_prompts_include_memories_and_task_exposes_them(tmp_path):
    provider = RecordingProvider([])
    with make_test_client(tmp_path, provider=provider) as client:
        kept = client.post(
            "/memory", json={"category": "global", "text": "Use uv instead of pip."}
        ).json()["memory"]
        off = client.post(
            "/memory", json={"category": "global", "text": "Secret plan: rewrite in COBOL."}
        ).json()["memory"]
        client.post(f"/memory/{off['id']}/disable")
        client.put("/profile", json={"display_name": "Grace", "role": "Backend engineer"})
        task_id = client.post("/tasks", json={"prompt": "set up the project", "project": "owl"})
        task_id = task_id.json()["id"]
        assert approve_until_task_settles(client, task_id) in DONE
        plan_prompt = next(p for p in provider.prompts if "RETURN-JSON-PLAN" in p)
        next_prompt = next(p for p in provider.prompts if "NEXT-ACTION" in p)
        for prompt in (plan_prompt, next_prompt):
            assert "Use uv instead of pip." in prompt
            assert "Name: Grace" in prompt
            assert "COBOL" not in prompt
        used = client.get(f"/tasks/{task_id}/memories").json()["used"]
        assert [m["id"] for m in used] == [kept["id"]]
        detail = client.get(f"/tasks/{task_id}/detail").json()
        assert [m["id"] for m in detail["memories_used"]] == [kept["id"]]
