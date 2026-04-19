/**
 * GitHub Models Paperclip adapter — main entry.
 *
 * v0.5.0: non-streaming single-turn MVP.
 * Uses GitHub's free Models API (OpenAI-compatible) with a fine-grained PAT.
 */

import type { ServerAdapterModule, AdapterConfigSchema } from "@paperclipai/adapter-utils";
import {
  ADAPTER_LABEL,
  ADAPTER_TYPE,
  DEFAULT_MODEL,
  DEFAULT_TIMEOUT_SEC,
  FREE_MODELS,
} from "./shared/constants.js";
import { execute, testEnvironment, detectModel } from "./server/index.js";

export const type = ADAPTER_TYPE;
export const label = ADAPTER_LABEL;

export const agentConfigurationDoc = `# GitHub Models Adapter Configuration

Free LLM access via GitHub's Models API. Requires a fine-grained PAT with
\`models:read\` scope.

## Required env

- \`GITHUB_TOKEN\` — fine-grained PAT with models:read scope
  Create at: github.com/settings/tokens (fine-grained, models:read permission)

## Core configuration

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| model | string | ${DEFAULT_MODEL} | Model id from GitHub Models catalog |
| timeoutSec | number | ${DEFAULT_TIMEOUT_SEC} | Execution timeout (seconds) |
| maxTokens | number | 0 | Max output tokens (0 = provider default) |
| cwd | string | process.cwd() | Working directory |
| instructionsFilePath | string | — | Path to agent AGENTS.md instructions file |

## Available free models

${FREE_MODELS.map((m) => `- \`${m}\``).join("\n")}

Full catalog: github.com/marketplace/models
`;

export const supportsInstructionsBundle = true;

function getConfigSchema(): AdapterConfigSchema {
  return {
    fields: [
      {
        key: "model",
        label: "Model",
        type: "combobox",
        default: DEFAULT_MODEL,
        options: FREE_MODELS.map((id) => ({ label: id, value: id })),
        hint: "GitHub Models model ID. See github.com/marketplace/models for the full catalog.",
      },
      {
        key: "timeoutSec",
        label: "Timeout (seconds)",
        type: "number",
        default: DEFAULT_TIMEOUT_SEC,
        hint: "Maximum seconds to wait for a response.",
      },
      {
        key: "maxTokens",
        label: "Max output tokens",
        type: "number",
        default: 0,
        hint: "Maximum tokens in the response. 0 = use provider default.",
      },
      {
        key: "cwd",
        label: "Working directory",
        type: "text",
        hint: "Absolute path to the agent's working directory.",
      },
    ],
  };
}

const adapter: ServerAdapterModule = {
  type: ADAPTER_TYPE,
  execute,
  testEnvironment,
  detectModel,
  getConfigSchema,
  supportsInstructionsBundle,
  agentConfigurationDoc,
};

export default adapter;
export { execute, testEnvironment, detectModel, getConfigSchema };
