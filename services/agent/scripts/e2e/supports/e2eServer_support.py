from __future__ import annotations

import sys

import uvicorn
from scriptedProvider_support import ScriptedProvider, build_e2e_app, create_calc_then_finish

db, workspace, port = sys.argv[1], sys.argv[2], int(sys.argv[3])
app = build_e2e_app(db, workspace, ScriptedProvider(["Implement add"], create_calc_then_finish))
uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning")).run()
