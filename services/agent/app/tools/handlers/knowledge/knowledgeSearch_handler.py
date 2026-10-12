from __future__ import annotations

from ....knowledge.knowledgeSearch_knowledge import search_knowledge
from ...toolArgument_tool import KnowledgeSearchArguments


async def run_knowledge_search(ctx: dict, args: KnowledgeSearchArguments) -> dict:
    conn = ctx["conn"]
    results = search_knowledge(
        conn,
        args.query,
        types=list(args.types),
        project=args.project,
        limit=args.limit,
    )
    return {"query": args.query, "results": results, "count": len(results)}
