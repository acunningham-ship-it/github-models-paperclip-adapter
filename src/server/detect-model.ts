/**
 * Model detection for the OpenRouter adapter.
 *
 * Fetches the full OpenRouter catalog and returns models sorted by
 * blended input+output price (cheapest first). The Paperclip UI uses
 * this to populate the model dropdown with live pricing.
 */

import { DEFAULT_MODEL, OPENROUTER_MODELS_URL, PROVIDER_SLUG } from "../shared/constants.js";

export interface DetectedModel {
  model: string;
  provider: string;
  source: string;
  candidates?: string[];
  models?: Array<{
    id: string;
    label: string;
    inputPricePerM?: number;
    outputPricePerM?: number;
    contextLength?: number;
  }>;
}

interface OpenRouterModel {
  id?: string;
  name?: string;
  context_length?: number;
  pricing?: {
    prompt?: string | number;
    completion?: string | number;
  };
}

interface OpenRouterModelsResponse {
  data?: OpenRouterModel[];
}

const DETECTION_TIMEOUT_MS = 10_000;

function resolveApiKey(): string | null {
  const fromOpenRouter = (process.env.OPENROUTER_API_KEY ?? "").trim();
  if (fromOpenRouter) return fromOpenRouter;
  const fromAnthropic = (process.env.ANTHROPIC_API_KEY ?? "").trim();
  if (fromAnthropic) return fromAnthropic;
  return null;
}

function priceToNum(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : Infinity;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : Infinity;
  }
  return Infinity;
}

function formatPrice(perM: number): string {
  if (!Number.isFinite(perM)) return "?";
  if (perM === 0) return "free";
  if (perM < 0.1) return `$${perM.toFixed(3)}/M`;
  return `$${perM.toFixed(2)}/M`;
}

export async function detectModel(): Promise<DetectedModel | null> {
  const apiKey = resolveApiKey();
  const headers: Record<string, string> = {
    accept: "application/json",
    "user-agent": "openrouter-paperclip-adapter/0.2",
  };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;

  let response: Response;
  try {
    response = await fetch(OPENROUTER_MODELS_URL, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(DETECTION_TIMEOUT_MS),
    });
  } catch {
    return null;
  }

  if (!response.ok) return null;

  let body: OpenRouterModelsResponse | null = null;
  try {
    body = (await response.json()) as OpenRouterModelsResponse;
  } catch {
    return null;
  }

  if (!body || !Array.isArray(body.data)) return null;

  // Normalize + compute blended price per model (prompt + completion per 1M tokens)
  type Scored = {
    id: string;
    name: string;
    blended: number;
    inputPerM: number;
    outputPerM: number;
    ctx: number;
  };
  const scored: Scored[] = [];
  for (const m of body.data) {
    if (!m || typeof m.id !== "string" || !m.id) continue;
    const inputPer = priceToNum(m.pricing?.prompt) * 1_000_000; // OR pricing is $/token
    const outputPer = priceToNum(m.pricing?.completion) * 1_000_000;
    // Blended assumes 2:1 input:output ratio (typical for agent workloads)
    const blended = Number.isFinite(inputPer) && Number.isFinite(outputPer)
      ? (inputPer * 2 + outputPer) / 3
      : Infinity;
    scored.push({
      id: m.id,
      name: typeof m.name === "string" && m.name ? m.name : m.id,
      blended,
      inputPerM: inputPer,
      outputPerM: outputPer,
      ctx: typeof m.context_length === "number" ? m.context_length : 0,
    });
  }
  scored.sort((a, b) => a.blended - b.blended);

  const models = scored.map((s) => ({
    id: s.id,
    label: `${s.name} — in:${formatPrice(s.inputPerM)} out:${formatPrice(s.outputPerM)}${s.ctx ? ` · ${Math.round(s.ctx / 1000)}K ctx` : ""}`,
    inputPricePerM: Number.isFinite(s.inputPerM) ? s.inputPerM : undefined,
    outputPricePerM: Number.isFinite(s.outputPerM) ? s.outputPerM : undefined,
    contextLength: s.ctx || undefined,
  }));

  return {
    model: DEFAULT_MODEL,
    provider: PROVIDER_SLUG,
    source: "openrouter_models_endpoint",
    candidates: scored.map((s) => s.id),
    models,
  };
}
