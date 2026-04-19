/**
 * Model detection for the GitHub Models adapter.
 *
 * Returns the static FREE_MODELS list (GitHub Models does not have a public
 * catalog endpoint without authentication). In v0.8.0 we can fetch live via
 * https://models.inference.ai.azure.com/models with GITHUB_TOKEN.
 */

import { DEFAULT_MODEL, FREE_MODELS, PROVIDER_SLUG } from "../shared/constants.js";
import type { AdapterModel } from "@paperclipai/adapter-utils";

export async function detectModel(): Promise<{
  model: string;
  provider: string;
  source: string;
  candidates: string[];
  models: AdapterModel[];
} | null> {
  const models: AdapterModel[] = FREE_MODELS.map((id) => ({
    id,
    label: `${id} — free (GitHub Models)`,
  }));
  return {
    model: DEFAULT_MODEL,
    provider: PROVIDER_SLUG,
    source: "static_free_models_list",
    candidates: [...FREE_MODELS],
    models,
  };
}
