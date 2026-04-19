/**
 * Environment test for the OpenRouter Claude-Code adapter.
 *
 * Validates that:
 *   1. The local `claude` CLI binary is on PATH (and reports a version).
 *   2. An OpenRouter API key is reachable (config.env > process.env).
 *   3. The OpenRouter models endpoint is reachable (network + key valid).
 *
 * Errors fail the check; warnings degrade to "warn" status; everything else
 * is "info" and the overall status is "pass".
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentCheckLevel,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";
import {
  ADAPTER_TYPE,
  DEFAULT_CLAUDE_COMMAND,
  DEFAULT_MODEL,
  OPENROUTER_MODELS_URL,
} from "../shared/constants.js";

const execFileAsync = promisify(execFile);

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function makeCheck(
  level: AdapterEnvironmentCheckLevel,
  code: string,
  message: string,
  extras: { detail?: string | null; hint?: string | null } = {},
): AdapterEnvironmentCheck {
  return {
    code,
    level,
    message,
    detail: extras.detail ?? null,
    hint: extras.hint ?? null,
  };
}

function resolveEnv(config: Record<string, unknown>): Record<string, string> {
  const envConfig = (config.env ?? {}) as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(envConfig)) {
    if (typeof value === "string" && value.length > 0) {
      out[key] = value;
    }
  }
  return out;
}

async function checkClaudeCli(command: string): Promise<AdapterEnvironmentCheck> {
  try {
    const { stdout } = await execFileAsync(command, ["--version"], { timeout: 10_000 });
    const version = stdout.trim() || "(unknown version)";
    return makeCheck("info", "openrouter_claude_cli_found", `Claude CLI: ${version}`);
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "ENOENT") {
      return makeCheck(
        "error",
        "openrouter_claude_cli_missing",
        `Claude CLI "${command}" not found in PATH`,
        { hint: "Install Claude Code: npm install -g @anthropic-ai/claude-code" },
      );
    }
    return makeCheck(
      "warn",
      "openrouter_claude_cli_unreliable",
      `Claude CLI "${command}" exists but --version failed`,
      {
        detail: (e as Error).message ?? null,
        hint: "Run the CLI manually to confirm it works.",
      },
    );
  }
}

function checkApiKey(
  config: Record<string, unknown>,
  resolvedEnv: Record<string, string>,
): AdapterEnvironmentCheck {
  const fromConfigOR = resolvedEnv.OPENROUTER_API_KEY;
  const fromConfigAnthropic = resolvedEnv.ANTHROPIC_API_KEY;
  const fromProcOR = (process.env.OPENROUTER_API_KEY ?? "").trim();
  const fromProcAnthropic = (process.env.ANTHROPIC_API_KEY ?? "").trim();
  const sources: string[] = [];
  if (fromConfigOR) sources.push("agent.env.OPENROUTER_API_KEY");
  if (fromConfigAnthropic) sources.push("agent.env.ANTHROPIC_API_KEY");
  if (fromProcOR) sources.push("process.env.OPENROUTER_API_KEY");
  if (fromProcAnthropic) sources.push("process.env.ANTHROPIC_API_KEY");

  // Suppress unused-arg warning in strict mode without changing behavior.
  void config;

  if (sources.length === 0) {
    return makeCheck("error", "openrouter_no_api_key", "OpenRouter API key not configured", {
      hint:
        "Set OPENROUTER_API_KEY (preferred) or ANTHROPIC_API_KEY in the agent's adapter env, " +
        "or in the Paperclip server process environment.",
    });
  }

  return makeCheck(
    "info",
    "openrouter_api_key_found",
    `OpenRouter API key resolved from: ${sources[0]}`,
    sources.length > 1 ? { detail: `Other sources also present: ${sources.slice(1).join(", ")}` } : {},
  );
}

function checkModel(config: Record<string, unknown>): AdapterEnvironmentCheck {
  const model = asString(config.model);
  if (!model) {
    return makeCheck(
      "warn",
      "openrouter_no_model",
      `No model specified — adapter will fall back to "${DEFAULT_MODEL}"`,
      {
        hint: "Set adapterConfig.model to an OpenRouter model id (e.g. anthropic/claude-sonnet-4-6).",
      },
    );
  }
  return makeCheck("info", "openrouter_model_configured", `Model: ${model}`);
}

async function checkOpenRouterReachable(
  resolvedEnv: Record<string, string>,
): Promise<AdapterEnvironmentCheck> {
  const apiKey =
    resolvedEnv.OPENROUTER_API_KEY ??
    resolvedEnv.ANTHROPIC_API_KEY ??
    (process.env.OPENROUTER_API_KEY ?? "").trim() ??
    (process.env.ANTHROPIC_API_KEY ?? "").trim();
  const headers: Record<string, string> = {
    accept: "application/json",
    "user-agent": "openrouter-paperclip-adapter/0.1",
  };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;

  try {
    const response = await fetch(OPENROUTER_MODELS_URL, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return makeCheck(
          "error",
          "openrouter_auth_failed",
          `OpenRouter rejected the API key (HTTP ${response.status})`,
          { hint: "Verify the key at https://openrouter.ai/keys" },
        );
      }
      return makeCheck(
        "warn",
        "openrouter_models_endpoint_unhappy",
        `OpenRouter /models returned HTTP ${response.status}`,
      );
    }
    return makeCheck(
      "info",
      "openrouter_reachable",
      "OpenRouter /models endpoint reachable",
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return makeCheck(
      "warn",
      "openrouter_unreachable",
      "Could not reach OpenRouter /models endpoint",
      { detail: message, hint: "Check network connectivity from the Paperclip host." },
    );
  }
}

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const config = (ctx.config ?? {}) as Record<string, unknown>;
  const command = asString(config.command) ?? DEFAULT_CLAUDE_COMMAND;
  const resolvedEnv = resolveEnv(config);
  const checks: AdapterEnvironmentCheck[] = [];

  // 1. Claude CLI installed?
  const cliCheck = await checkClaudeCli(command);
  checks.push(cliCheck);
  if (cliCheck.level === "error") {
    return {
      adapterType: ADAPTER_TYPE,
      status: "fail",
      checks,
      testedAt: new Date().toISOString(),
    };
  }

  // 2. API key resolvable?
  const apiKeyCheck = checkApiKey(config, resolvedEnv);
  checks.push(apiKeyCheck);

  // 3. Model configured?
  checks.push(checkModel(config));

  // 4. OpenRouter reachable?
  // Only probe the network if we have a key — otherwise the unauthenticated
  // call is noisy and adds nothing the API-key check did not already say.
  if (apiKeyCheck.level !== "error") {
    const reach = await checkOpenRouterReachable(resolvedEnv);
    checks.push(reach);
  }

  const hasError = checks.some((c) => c.level === "error");
  const hasWarn = checks.some((c) => c.level === "warn");
  return {
    adapterType: ADAPTER_TYPE,
    status: hasError ? "fail" : hasWarn ? "warn" : "pass",
    checks,
    testedAt: new Date().toISOString(),
  };
}
