/**
 * UI module entry — exported via package.json "./ui-parser".
 * Self-contained: the parser is defined inline (no relative imports)
 * because Paperclip serves this file directly to the browser.
 */
import type { TranscriptEntry } from "@paperclipai/adapter-utils";

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function asNumber(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function tryParseJson(line: string): Record<string, unknown> | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed[0] !== "{") return null;
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function renderToolResultContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) {
    try {
      return JSON.stringify(content);
    } catch {
      return String(content);
    }
  }
  const parts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const b = block as Record<string, unknown>;
    if (b.type === "text" && typeof b.text === "string") {
      parts.push(b.text);
    } else if (typeof b.content === "string") {
      parts.push(b.content);
    } else {
      try {
        parts.push(JSON.stringify(b));
      } catch {
        /* ignore */
      }
    }
  }
  return parts.join("\n");
}

export function parseStdoutLine(
  line: string,
  ts: string,
): TranscriptEntry[] {
  const event = tryParseJson(line);
  if (!event) {
    const stripped = line.trim();
    if (!stripped) return [];
    return [{ kind: "stdout", ts, text: stripped }];
  }

  const type = asString(event.type);
  const out: TranscriptEntry[] = [];

  if (type === "system" && asString(event.subtype) === "init") {
    out.push({
      kind: "init",
      ts,
      model: asString(event.model, "?"),
      sessionId: asString(event.session_id, ""),
    });
    return out;
  }

  if (type === "assistant") {
    const message = (event.message as Record<string, unknown>) ?? {};
    const content = Array.isArray(message.content) ? message.content : [];
    for (const entry of content) {
      if (!entry || typeof entry !== "object") continue;
      const block = entry as Record<string, unknown>;
      const btype = asString(block.type);
      if (btype === "text") {
        const text = asString(block.text).trim();
        if (text) out.push({ kind: "assistant", ts, text });
      } else if (btype === "thinking") {
        const text = asString(block.thinking).trim();
        if (text) out.push({ kind: "thinking", ts, text });
      } else if (btype === "tool_use") {
        out.push({
          kind: "tool_call",
          ts,
          name: asString(block.name, "tool"),
          input: block.input ?? {},
          toolUseId: asString(block.id, ""),
        });
      }
    }
    return out;
  }

  if (type === "user") {
    const message = (event.message as Record<string, unknown>) ?? {};
    const content = Array.isArray(message.content) ? message.content : [];
    for (const entry of content) {
      if (!entry || typeof entry !== "object") continue;
      const block = entry as Record<string, unknown>;
      if (asString(block.type) !== "tool_result") continue;
      out.push({
        kind: "tool_result",
        ts,
        toolUseId: asString(block.tool_use_id, ""),
        toolName: asString(block.tool_name),
        content: renderToolResultContent(block.content),
        isError: Boolean(block.is_error),
      });
    }
    return out;
  }

  if (type === "result") {
    const usage = (event.usage as Record<string, unknown>) ?? {};
    const errorsRaw = Array.isArray(event.errors) ? event.errors : [];
    const errors = errorsRaw
      .map((e) => {
        if (typeof e === "string") return e;
        if (e && typeof e === "object") {
          const o = e as Record<string, unknown>;
          return asString(o.message, "") || asString(o.error, "") || asString(o.code, "") || "";
        }
        return "";
      })
      .filter(Boolean);
    out.push({
      kind: "result",
      ts,
      text: asString(event.result).trim(),
      inputTokens: asNumber(usage.input_tokens),
      outputTokens: asNumber(usage.output_tokens),
      cachedTokens: asNumber(usage.cache_read_input_tokens),
      costUsd: asNumber(event.total_cost_usd),
      subtype: asString(event.subtype),
      isError: Boolean(event.is_error),
      errors,
    });
    return out;
  }

  // Unknown event type — surface the raw chunk so nothing is lost.
  out.push({ kind: "stdout", ts, text: line.trim() });
  return out;
}
