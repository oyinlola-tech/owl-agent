from __future__ import annotations

from fastapi import FastAPI

from ..events.eventBus_event import EventBus
from ..llms.providers.baseProvider_provider import ModelProvider
from ..routes.browserCapture_route import create_browser_capture_router
from ..routes.contextBudget_route import create_context_budget_router
from ..routes.knowledge.knowledgeSearch_route import create_knowledge_router
from ..routes.memory_route import create_memory_router
from ..routes.profiles.userProfile_route import create_user_profile_router
from ..routes.projects.git.gitBranch_route import create_project_git_branch_router
from ..routes.projects.git.gitCommit_route import create_project_git_commit_router
from ..routes.projects.projectCommand_route import create_project_command_router
from ..routes.projects.projectFile_route import create_project_file_router
from ..routes.projects.projectGit_route import create_project_git_router
from ..routes.projects.projectList_route import create_project_list_router
from ..routes.providers.chatReply_route import create_chat_router
from ..routes.providers.modelRegistry_route import create_model_registry_router
from ..routes.providers.providerSetup_route import create_provider_setup_router
from ..routes.providers.providerStatus_route import create_provider_status_router
from ..routes.security.projectSecurityScan_route import create_project_security_router
from ..routes.security.securityStatus_route import create_security_status_router
from ..routes.stacks.stackAdvisor_route import create_stack_advisor_router
from ..routes.storages.localData_route import create_local_data_router
from ..routes.tasks.taskApproval_route import create_task_approval_router
from ..routes.tasks.taskDetail_route import create_task_detail_router
from ..routes.tasks.taskEvent_route import create_task_event_router
from ..routes.tasks.taskLifecycle_route import create_task_lifecycle_router
from ..routes.usageReport_route import create_usage_report_router
from ..routes.workspaceTool_route import create_workspace_tool_router
from ..settings.serviceSettings_setting import Settings
from ..tasks.taskManager_task import TaskManager


def include_all_routers(
    app: FastAPI,
    settings: Settings,
    provider: ModelProvider,
    manager: TaskManager,
    bus: EventBus,
) -> None:
    app.include_router(create_provider_status_router(provider, settings))
    app.include_router(create_chat_router(app))
    app.include_router(create_task_lifecycle_router(manager))
    app.include_router(create_task_approval_router(manager))
    app.include_router(create_task_event_router(manager, bus))
    app.include_router(create_model_registry_router())
    app.include_router(create_context_budget_router(app, settings, manager))
    app.include_router(create_task_detail_router(manager))
    app.include_router(create_memory_router(app))
    app.include_router(create_usage_report_router(app))
    app.include_router(create_workspace_tool_router())
    app.include_router(create_browser_capture_router(app))
    app.include_router(create_security_status_router())
    app.include_router(create_provider_setup_router())
    app.include_router(create_user_profile_router())
    app.include_router(create_local_data_router())
    app.include_router(create_project_list_router(app))
    app.include_router(create_project_file_router())
    app.include_router(create_project_git_router())
    app.include_router(create_project_command_router())
    app.include_router(create_stack_advisor_router(app))
    app.include_router(create_project_git_branch_router())
    app.include_router(create_project_git_commit_router())
    app.include_router(create_project_security_router(app))
    app.include_router(create_knowledge_router())
