/**
 * GitHub Models adapter — execute single agent run.
 *
 * v0.0.1: STUB. Real implementation TBD.
 *
 * Strategy: direct streaming OpenAI-format HTTP client targeting
 *   https://models.inference.ai.azure.com/chat/completions
 * with Bearer GITHUB_TOKEN. No CLI wrapper — full implementation
 * to live here.
 *
 * Reference: openrouter-paperclip-adapter at
 *   /home/armani/adapters/openrouter-paperclip-adapter/src/server/execute.ts
 *
 * Session codec: see parse.ts (also TBD).
 */

// TODO(Dev Team):
// 1. Implement streaming chat-completions client (use fetch with response body iteration)
// 2. Tool-call passthrough — Paperclip's tool protocol → OpenAI function calling format → back
// 3. Session resume via stored conversation history + last assistant turn id
// 4. Cost tracking (GitHub Models is free but log token usage for budgets)
// 5. Error handling: 429 (rate limit) → retry with backoff, 401 → token error, 5xx → temp fail
// 6. Test with each free model in FREE_MODELS

export async function execute(): Promise<never> {
  throw new Error("github-models-paperclip-adapter v0.0.1 is a scaffold; execute() not yet implemented");
}
