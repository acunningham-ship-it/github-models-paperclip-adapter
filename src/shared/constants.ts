/**
 * GitHub Models adapter — shared constants.
 */

export const ADAPTER_TYPE = "github_models";
export const ADAPTER_LABEL = "GitHub Models (free API)";
export const PROVIDER_SLUG = "github_models";
export const BILLER_SLUG = "github_models";

export const GITHUB_MODELS_BASE_URL = "https://models.inference.ai.azure.com";
export const GITHUB_MODELS_CHAT_PATH = "/chat/completions";
export const GITHUB_MODELS_LIST_PATH = "/models";

export const DEFAULT_MODEL = "gpt-4o-mini";
export const DEFAULT_TIMEOUT_SEC = 300;

export const DEFAULT_PROMPT_TEMPLATE =
  "You are agent {{agent.id}} ({{agent.name}}). Continue your Paperclip work.";

/**
 * Models known to be free on GitHub Models (subject to daily quota).
 * Full catalog: https://github.com/marketplace/models
 */
export const FREE_MODELS = [
  "gpt-4o",
  "gpt-4o-mini",
  "o1-preview",
  "o1-mini",
  "Meta-Llama-3.1-405B-Instruct",
  "Meta-Llama-3.1-70B-Instruct",
  "Llama-3.3-70B",
  "Phi-3.5-MoE-instruct",
  "Phi-3.5-mini-instruct",
  "Mistral-Large-2407",
  "Codestral-2501",
  "DeepSeek-V3",
] as const;
