// @ts-expect-error type error without @types/node package
import { spawn, type ChildProcess } from "node:child_process";
// @ts-expect-error type error without @types/node package
import { existsSync, mkdtempSync, rmSync } from "node:fs";
// @ts-expect-error type error without @types/node package
import { createServer } from "node:net";
// @ts-expect-error type error without @types/node package
import { tmpdir } from "node:os";
// @ts-expect-error type error without @types/node package
import { join, resolve } from "node:path";
// @ts-expect-error type error without @types/node package
import process from "node:process";
// @ts-expect-error type error without @types/node package
import { fileURLToPath } from "node:url";
import { QA_SERVICE_TOKEN } from "./qaServiceToken.support";

const SERVICE_DIR = resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..", "..", "services", "agent");
const APP_FACTORIES = ["app:create_app", "app.main:create_app"];

export type RunningService = { url: string; stop: () => void };

function buildServiceEnvironment(dataDir: string, trustedOrigin: string): Record<string, string> {
  const inherited: Record<string, string> = { ...process.env };
  for (const name of ["OWL_SERVICE_TOKEN", "OWL_SERVICE_TOKEN_FILE", "OWL_REQUIRE_TOKEN"]) delete inherited[name];
  return {
    ...inherited,
    PYTHONPATH: SERVICE_DIR,
    OWL_DB_PATH: join(dataDir, "owl.db"),
    OWL_TRUSTED_ORIGINS: trustedOrigin,
    OWL_DEV_TOKEN: QA_SERVICE_TOKEN,
    NVIDIA_API_KEY: "",
    OWL_PROVIDER: "mock",
    OWL_SECRET_STORE: "file",
  };
}

function findServicePython(): string | undefined {
  if (process.env.OWL_QA_PYTHON) return process.env.OWL_QA_PYTHON;
  const candidates = [join(SERVICE_DIR, ".venv", "bin", "python"), join(SERVICE_DIR, ".venv", "Scripts", "python.exe")];
  return candidates.find((candidate) => existsSync(candidate));
}

function findFreePort(): Promise<number> {
  return new Promise((done, fail) => {
    const server = createServer();
    server.once("error", fail);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => done(port));
    });
  });
}

async function waitForHealth(url: string, child: ChildProcess, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && child.exitCode === null) {
    try {
      const response = await fetch(`${url}/health`);
      if (response.ok) return true;
    } catch {
      await new Promise((wait) => setTimeout(wait, 250));
    }
  }
  return false;
}

export async function startRealService(trustedOrigin: string): Promise<RunningService | undefined> {
  const python = findServicePython();
  if (!python) return undefined;
  const dataDir = mkdtempSync(join(tmpdir(), "owl-qa-"));
  for (const factory of APP_FACTORIES) {
    const port = await findFreePort();
    const child = spawn(python, ["-m", "uvicorn", "--factory", factory, "--host", "127.0.0.1", "--port", String(port)], {
      cwd: dataDir,
      env: buildServiceEnvironment(dataDir, trustedOrigin),
      stdio: "ignore",
    });
    const url = `http://127.0.0.1:${port}`;
    if (await waitForHealth(url, child, 20_000)) {
      return {
        url,
        stop: () => {
          child.kill();
          rmSync(dataDir, { recursive: true, force: true });
        },
      };
    }
    child.kill();
  }
  rmSync(dataDir, { recursive: true, force: true });
  return undefined;
}
