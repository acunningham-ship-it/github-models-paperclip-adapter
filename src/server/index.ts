/**
 * Server-side barrel for the OpenRouter adapter.
 *
 * Re-exports the public adapter surface and defines the session codec
 * used to persist Claude session ids across heartbeats.
 *
 * The OpenRouter adapter speaks the same Claude Code stream-JSON
 * protocol as `claude_local`, so `sessionId` is the only field we need
 * to round-trip. We also persist `cwd` so we can detect a workspace
 * change and refuse to resume a session that was created in a
 * different directory (the underlying Claude binary anchors session
 * state to its working directory).
 */

import type { AdapterSessionCodec } from "@paperclipai/adapter-utils";

export { execute } from "./execute.js";
export { testEnvironment } from "./test.js";
export { detectModel } from "./detect-model.js";

function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export const sessionCodec: AdapterSessionCodec = {
  deserialize(raw) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
    const record = raw as Record<string, unknown>;
    const sessionId =
      readNonEmptyString(record.sessionId) ?? readNonEmptyString(record.session_id);
    if (!sessionId) return null;
    const out: Record<string, unknown> = { sessionId };
    const cwd = readNonEmptyString(record.cwd);
    if (cwd) out.cwd = cwd;
    const workspaceId = readNonEmptyString(record.workspaceId);
    if (workspaceId) out.workspaceId = workspaceId;
    const repoUrl = readNonEmptyString(record.repoUrl);
    if (repoUrl) out.repoUrl = repoUrl;
    const repoRef = readNonEmptyString(record.repoRef);
    if (repoRef) out.repoRef = repoRef;
    return out;
  },
  serialize(params) {
    if (!params) return null;
    const sessionId =
      readNonEmptyString(params.sessionId) ?? readNonEmptyString(params.session_id);
    if (!sessionId) return null;
    const out: Record<string, unknown> = { sessionId };
    const cwd = readNonEmptyString(params.cwd);
    if (cwd) out.cwd = cwd;
    const workspaceId = readNonEmptyString(params.workspaceId);
    if (workspaceId) out.workspaceId = workspaceId;
    const repoUrl = readNonEmptyString(params.repoUrl);
    if (repoUrl) out.repoUrl = repoUrl;
    const repoRef = readNonEmptyString(params.repoRef);
    if (repoRef) out.repoRef = repoRef;
    return out;
  },
  getDisplayId(params) {
    if (!params) return null;
    return readNonEmptyString(params.sessionId) ?? readNonEmptyString(params.session_id);
  },
};
