/**
 * GitHub Models Paperclip adapter — main entry.
 *
 * v0.0.1: scaffold. Real implementation pending.
 */

import {
  ADAPTER_LABEL,
  ADAPTER_TYPE,
  DEFAULT_MODEL,
  DEFAULT_PROMPT_TEMPLATE,
  DEFAULT_TIMEOUT_SEC,
  GITHUB_MODELS_BASE_URL,
} from "./shared/constants.js";

export const type = ADAPTER_TYPE;
export const label = ADAPTER_LABEL;

export const models = [];

export const agentConfigurationDoc = `# GitHub Models Adapter Configuration

Free LLM access via GitHub's Models API. Requires a fine-grained PAT with
\`models:read\` scope.

## Required env

- \`GITHUB_TOKEN\` — fine-grained PAT with Models read scope

## Core configuration

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| model | string | gpt-4o-mini | Model id from GitHub Models catalog |
| timeoutSec | number | 300 | Execution timeout |

## Available models

See \`FREE_MODELS\` in src/shared/constants.ts or full catalog at
github.com/marketplace/models
`;

// TODO(Dev Team): implement createServerAdapter() factory matching
// the openrouter-paperclip-adapter pattern.
