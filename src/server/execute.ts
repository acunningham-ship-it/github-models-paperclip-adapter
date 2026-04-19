/**
 * Execute a single GitHub Models run.
 *
 * v0.5.0: non-streaming single-turn MVP.
 * - POSTs to https://models.inference.ai.azure.com/chat/completions
 * - Uses GITHUB_TOKEN (fine-grained PAT with models:read scope)
 * - No session persistence — each run is independent (v0.8.0 will add history replay)
 * - No subprocess — pure HTTP via fetch
 */

import fs from "node:fs/promises";
import path from "node:path";
import {
  asString,
  asNumber,
  parseObject,
  renderTemplate,
  renderPaperclipWakePrompt,
  joinPromptSections,
} from "@paperclipai/adapter-utils/server-utils";
import type {
  AdapterExecutionContext,
  AdapterExecutionResult,
} from "@paperclipai/adapter-utils";
import {
  ADAPTER_TYPE,
  BILLER_SLUG,
  DEFAULT_MODEL,
  DEFAULT_PROMPT_TEMPLATE,
  DEFAULT_TIMEOUT_SEC,
  GITHUB_MODELS_BASE_URL,
  GITHUB_MODELS_CHAT_PATH,
  PROVIDER_SLUG,
} from "../shared/constants.js";

// ---------------------------------------------------------------------------
// OpenAI-compatible API types (subset)
// ---------------------------------------------------------------------------

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream: false;
}

interface ChatCompletionResponse {
  id?: string;
  model?: string;
  choices?: Array<{
    message?: { role?: string; content?: string | null };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: { message?: string; code?: string | number; type?: string };
}

// ---------------------------------------------------------------------------
// Token resolution
// ---------------------------------------------------------------------------

function resolveGitHubToken(
  envConfig: Record<string, unknown>,
): { token: string | null; source: "config_env" | "process_env" | "missing" } {
  const fromConfig =
    typeof envConfig.GITHUB_TOKEN === "string" ? envConfig.GITHUB_TOKEN.trim() : "";
  if (fromConfig) return { token: fromConfig, source: "config_env" };
  const fromProc = (process.env.GITHUB_TOKEN ?? "").trim();
  if (fromProc) return { token: fromProc, source: "process_env" };
  return { token: null, source: "missing" };
}

// ---------------------------------------------------------------------------
// Main execute
// ---------------------------------------------------------------------------

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const { runId, agent, config, context, onLog, onMeta } = ctx;

  const model = asString(config.model, DEFAULT_MODEL);
  const timeoutSec = asNumber(config.timeoutSec, DEFAULT_TIMEOUT_SEC);
  const promptTemplate = asString(config.promptTemplate, DEFAULT_PROMPT_TEMPLATE);
  const cwd = asString(config.cwd, process.cwd());
  const instructionsFilePath = asString(config.instructionsFilePath, "").trim();
  const maxTokens = asNumber(config.maxTokens, 0);
  const temperature = asNumber(config.temperature, -1);

  const envConfig = parseObject(config.env);
  const { token, source: tokenSource } = resolveGitHubToken(envConfig);

  // Build user prompt
  const wakePrompt = renderPaperclipWakePrompt(context.paperclipWake, {
    resumedSession: false,
  });
  const sessionHandoff = asString(context.paperclipSessionHandoffMarkdown, "").trim();
  const templateData = {
    agentId: agent.id,
    companyId: agent.companyId,
    runId,
    company: { id: agent.companyId },
    agent,
    run: { id: runId, source: "on_demand" },
    context,
  };
  const renderedPrompt = renderTemplate(promptTemplate, templateData);
  const userPrompt = joinPromptSections([wakePrompt, sessionHandoff, renderedPrompt]);

  // Read system instructions file if configured
  let systemInstructions = "";
  if (instructionsFilePath) {
    try {
      systemInstructions = await fs.readFile(instructionsFilePath, "utf-8");
      const dir = path.dirname(instructionsFilePath) + "/";
      systemInstructions +=
        `\n\nThe above agent instructions were loaded from ${instructionsFilePath}. ` +
        `Resolve any relative file references from ${dir}.`;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      await onLog(
        "stderr",
        `[github-models] Warning: could not read instructions file "${instructionsFilePath}": ${reason}\n`,
      );
    }
  }

  // Build messages
  const messages: ChatMessage[] = [];
  if (systemInstructions.trim()) {
    messages.push({ role: "system", content: systemInstructions.trim() });
  }
  messages.push({ role: "user", content: userPrompt });

  const requestBody: ChatCompletionRequest = { model, messages, stream: false };
  if (maxTokens > 0) requestBody.max_tokens = maxTokens;
  if (temperature >= 0) requestBody.temperature = temperature;

  const url = GITHUB_MODELS_BASE_URL + GITHUB_MODELS_CHAT_PATH;

  if (onMeta) {
    await onMeta({
      adapterType: ADAPTER_TYPE,
      command: "fetch",
      cwd,
      commandNotes: [
        `POST ${url}`,
        `model: ${model}`,
        token
          ? `GITHUB_TOKEN resolved from ${tokenSource}`
          : "GITHUB_TOKEN NOT SET",
      ],
      env: token ? { GITHUB_TOKEN: token.slice(0, 8) + "...", SOURCE: tokenSource } : {},
      prompt: userPrompt,
      promptMetrics: {
        promptChars: userPrompt.length,
        systemChars: systemInstructions.length,
        messagesCount: messages.length,
      },
      context,
    });
  }

  if (!token) {
    await onLog("stderr", "[github-models] Error: GITHUB_TOKEN not configured.\n");
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage:
        "GITHUB_TOKEN not configured. Set it in adapterConfig.env.GITHUB_TOKEN or the server process environment.",
      errorCode: "github_models_no_token",
    };
  }

  // HTTP call with timeout
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutSec * 1000);
  let rawResponse: Response;

  try {
    rawResponse = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "github-models-paperclip-adapter/0.5",
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === "AbortError") {
      return {
        exitCode: null,
        signal: "SIGALRM",
        timedOut: true,
        errorMessage: `Timed out after ${timeoutSec}s`,
        errorCode: "timeout",
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: `Network error calling GitHub Models API: ${message}`,
      errorCode: "github_models_network_error",
    };
  }
  clearTimeout(timer);

  let body: ChatCompletionResponse;
  let rawText = "";
  try {
    rawText = await rawResponse.text();
    body = JSON.parse(rawText) as ChatCompletionResponse;
  } catch {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: `GitHub Models API returned non-JSON response (HTTP ${rawResponse.status})`,
      errorCode: "github_models_bad_response",
      resultJson: { rawText: rawText.slice(0, 500) },
    };
  }

  if (!rawResponse.ok || body.error) {
    const apiMsg = body.error?.message ?? `HTTP ${rawResponse.status}`;
    await onLog("stderr", `[github-models] API error: ${apiMsg}\n`);
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: `GitHub Models API error: ${apiMsg}`,
      errorCode:
        rawResponse.status === 401 || rawResponse.status === 403
          ? "github_models_auth_failed"
          : "github_models_api_error",
    };
  }

  const choice = body.choices?.[0];
  const assistantText = choice?.message?.content ?? "";
  await onLog("stdout", assistantText + "\n");

  const usage = body.usage
    ? {
        inputTokens: body.usage.prompt_tokens ?? 0,
        outputTokens: body.usage.completion_tokens ?? 0,
      }
    : undefined;

  return {
    exitCode: 0,
    signal: null,
    timedOut: false,
    usage,
    provider: PROVIDER_SLUG,
    biller: BILLER_SLUG,
    model: body.model ?? model,
    billingType: "unknown",
    costUsd: null,
    summary: assistantText.slice(0, 500),
    resultJson: {
      id: body.id,
      model: body.model ?? model,
      finish_reason: choice?.finish_reason ?? "stop",
      content: assistantText,
      usage: body.usage,
    },
  };
}
