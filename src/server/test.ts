/**
 * Environment test for the GitHub Models Paperclip adapter.
 *
 * Checks:
 *   1. GITHUB_TOKEN is set (config.env > process.env)
 *   2. Token can reach GitHub Models API (live ping)
 *   3. Model is configured
 */

import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentCheckLevel,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";
import {
  ADAPTER_TYPE,
  DEFAULT_MODEL,
  GITHUB_MODELS_BASE_URL,
  GITHUB_MODELS_CHAT_PATH,
} from "../shared/constants.js";

function asStr(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function makeCheck(
  level: AdapterEnvironmentCheckLevel,
  code: string,
  message: string,
  extras: { detail?: string | null; hint?: string | null } = {},
): AdapterEnvironmentCheck {
  return { code, level, message, detail: extras.detail ?? null, hint: extras.hint ?? null };
}

function resolveToken(config: Record<string, unknown>): {
  token: string | null;
  source: string;
} {
  const envConfig = (config.env ?? {}) as Record<string, unknown>;
  const fromConfig =
    typeof envConfig.GITHUB_TOKEN === "string" ? envConfig.GITHUB_TOKEN.trim() : "";
  if (fromConfig) return { token: fromConfig, source: "agent.env.GITHUB_TOKEN" };
  const fromProc = (process.env.GITHUB_TOKEN ?? "").trim();
  if (fromProc) return { token: fromProc, source: "process.env.GITHUB_TOKEN" };
  return { token: null, source: "missing" };
}

async function pingGitHubModels(
  token: string,
  model: string,
): Promise<AdapterEnvironmentCheck> {
  const url = GITHUB_MODELS_BASE_URL + GITHUB_MODELS_CHAT_PATH;
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "github-models-paperclip-adapter/0.5",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
        stream: false,
      }),
      signal: AbortSignal.timeout(12_000),
    });

    if (resp.status === 401 || resp.status === 403) {
      return makeCheck(
        "error",
        "github_models_auth_failed",
        `GitHub Models rejected the token (HTTP ${resp.status})`,
        { hint: "Ensure the PAT has models:read scope (fine-grained token)." },
      );
    }
    if (resp.status === 404) {
      return makeCheck(
        "warn",
        "github_models_model_not_found",
        `Model "${model}" returned 404 — may not be available`,
        { hint: "Check the GitHub Models catalog for available model IDs." },
      );
    }
    if (!resp.ok) {
      let detail: string | null = null;
      try {
        const j = (await resp.json()) as { error?: { message?: string } };
        detail = j.error?.message ?? null;
      } catch {
        // ignore
      }
      return makeCheck(
        "warn",
        "github_models_api_error",
        `GitHub Models API returned HTTP ${resp.status}`,
        { detail },
      );
    }
    return makeCheck(
      "info",
      "github_models_reachable",
      `GitHub Models API reachable, model "${model}" responded`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return makeCheck(
      "warn",
      "github_models_unreachable",
      "Could not reach GitHub Models API",
      { detail: message, hint: "Check network connectivity from the Paperclip host." },
    );
  }
}

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const config = (ctx.config ?? {}) as Record<string, unknown>;
  const checks: AdapterEnvironmentCheck[] = [];

  // 1. GITHUB_TOKEN
  const { token, source } = resolveToken(config);
  if (!token) {
    checks.push(
      makeCheck("error", "github_models_no_token", "GITHUB_TOKEN not configured", {
        hint:
          "Set GITHUB_TOKEN in adapterConfig.env.GITHUB_TOKEN or the server process environment. " +
          "Create a fine-grained PAT at github.com/settings/tokens with models:read scope.",
      }),
    );
    return { adapterType: ADAPTER_TYPE, status: "fail", checks, testedAt: new Date().toISOString() };
  }
  checks.push(
    makeCheck("info", "github_models_token_found", `GITHUB_TOKEN resolved from: ${source}`),
  );

  // 2. Model
  const model = asStr(config.model) ?? DEFAULT_MODEL;
  if (!asStr(config.model)) {
    checks.push(
      makeCheck(
        "warn",
        "github_models_no_model",
        `No model specified — will use default "${DEFAULT_MODEL}"`,
        { hint: "Set adapterConfig.model to a GitHub Models model id (e.g. gpt-4o-mini)." },
      ),
    );
  } else {
    checks.push(makeCheck("info", "github_models_model_configured", `Model: ${model}`));
  }

  // 3. Live ping
  const pingCheck = await pingGitHubModels(token, model);
  checks.push(pingCheck);

  const hasError = checks.some((c) => c.level === "error");
  const hasWarn = checks.some((c) => c.level === "warn");
  return {
    adapterType: ADAPTER_TYPE,
    status: hasError ? "fail" : hasWarn ? "warn" : "pass",
    checks,
    testedAt: new Date().toISOString(),
  };
}
