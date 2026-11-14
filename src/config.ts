import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { ZtError } from "./errors.js";
import type { ZtConfig } from "./types.js";

export function defaultConfig(): ZtConfig {
  return {
    plugins: [],
    git: {
      baseBranch: "main",
      protectedBranches: ["main", "master", "develop"],
    },
    http: {
      timeoutMs: 10_000,
    },
    doctor: {
      minVersions: {
        node: "18.0.0",
        npm: "9.0.0",
        git: "2.30.0",
      },
    },
  };
}

export function peekConfigPath(argv: string[], env: NodeJS.ProcessEnv): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    if (arg === "--") break;
    if (arg.startsWith("--config=")) {
      const value = arg.slice("--config=".length);
      if (!value) throw new ZtError("missing path after --config", "CONFIG_PATH");
      return value;
    }
    if (arg === "--config") {
      const value = argv[index + 1];
      if (!value || value.startsWith("-")) {
        throw new ZtError("missing path after --config", "CONFIG_PATH");
      }
      return value;
    }
  }
  const fromEnv = env.ZT_CONFIG;
  return fromEnv && fromEnv.length > 0 ? fromEnv : undefined;
}

export function parseConfig(text: string, location = "config"): ZtConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new ZtError(`invalid JSON in ${location}: ${(err as Error).message}`, "CONFIG_JSON");
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ZtError(`config ${location} must be a JSON object`, "CONFIG_SHAPE");
  }
  const record = raw as Record<string, unknown>;
  const config = defaultConfig();

  if ("color" in record) {
    if (typeof record.color !== "boolean") {
      throw new ZtError("config.color must be a boolean", "CONFIG_SHAPE");
    }
    config.color = record.color;
  }
  if ("plugins" in record) {
    if (!Array.isArray(record.plugins) || record.plugins.some((item) => typeof item !== "string")) {
      throw new ZtError("config.plugins must be an array of paths", "CONFIG_SHAPE");
    }
    config.plugins = [...record.plugins];
  }
  if ("git" in record) {
    const git = expectObject(record.git, "config.git");
    if ("baseBranch" in git) {
      if (typeof git.baseBranch !== "string" || git.baseBranch.length === 0) {
        throw new ZtError("config.git.baseBranch must be a string", "CONFIG_SHAPE");
      }
      config.git.baseBranch = git.baseBranch;
    }
    if ("protectedBranches" in git) {
      if (
        !Array.isArray(git.protectedBranches) ||
        git.protectedBranches.some((item) => typeof item !== "string")
      ) {
        throw new ZtError("config.git.protectedBranches must be an array of strings", "CONFIG_SHAPE");
      }
      config.git.protectedBranches = [...git.protectedBranches];
    }
  }
  if ("http" in record) {
    const http = expectObject(record.http, "config.http");
    if ("timeoutMs" in http) {
      if (typeof http.timeoutMs !== "number" || !Number.isFinite(http.timeoutMs) || http.timeoutMs <= 0) {
        throw new ZtError("config.http.timeoutMs must be a positive number", "CONFIG_SHAPE");
      }
      config.http.timeoutMs = http.timeoutMs;
    }
  }
  if ("doctor" in record) {
    const doctor = expectObject(record.doctor, "config.doctor");
    if ("minVersions" in doctor) {
      const mins = expectObject(doctor.minVersions, "config.doctor.minVersions");
      for (const [key, value] of Object.entries(mins)) {
        if (typeof value !== "string" || !/^\d+\.\d+\.\d+$/.test(value)) {
          throw new ZtError(
            `config.doctor.minVersions.${key} must be a version like 1.2.3`,
            "CONFIG_SHAPE",
          );
        }
      }
      config.doctor.minVersions = { ...(mins as Record<string, string>) };
    }
  }
  return config;
}

export async function loadConfig(options: {
  explicit?: string;
  homeDir: string;
  cwd: string;
}): Promise<{ config: ZtConfig; path?: string }> {
  const location = options.explicit
    ? isAbsolute(options.explicit)
      ? options.explicit
      : join(options.cwd, options.explicit)
    : join(options.homeDir, ".ztrc");

  let text: string;
  try {
    text = await readFile(location, "utf8");
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === "ENOENT") {
      if (options.explicit) throw new ZtError(`config not found: ${location}`, "CONFIG_MISSING");
      return { config: defaultConfig() };
    }
    throw new ZtError(`could not read config ${location}: ${error.message}`, "CONFIG_READ");
  }
  return { config: parseConfig(text, location), path: location };
}

function expectObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ZtError(`${label} must be an object`, "CONFIG_SHAPE");
  }
  return value as Record<string, unknown>;
}
