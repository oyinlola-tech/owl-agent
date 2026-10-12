from __future__ import annotations

from fastapi import APIRouter, Request

from ...knowledge.knowledgeSearch_knowledge import knowledge_stats, search_knowledge

MAX_QUERY_CHARS = 400
MAX_PROJECT_CHARS = 256


def create_knowledge_router() -> APIRouter:
    router = APIRouter()

    @router.get("/knowledge/search")
    async def knowledge_search(  # type: ignore[no-untyped-def]
        request: Request, q: str = "", types: str = "", project: str = "", limit: int = 10
    ):
        conn = request.app.state.local_storage.conn
        type_list = [item.strip() for item in types.split(",") if item.strip()]
        cleaned_query = q[:MAX_QUERY_CHARS]
        results = search_knowledge(
            conn,
            cleaned_query,
            types=type_list,
            project=project[:MAX_PROJECT_CHARS],
            limit=limit,
        )
        return {"query": cleaned_query, "results": results}

    @router.get("/knowledge/stats")
    async def knowledge_statistics(request: Request):  # type: ignore[no-untyped-def]
        return knowledge_stats(request.app.state.local_storage.conn)

    return router
