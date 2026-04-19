# github-models-paperclip-adapter

> Paperclip adapter for GitHub's free Models API. No Copilot subscription needed.

## What it does

Lets Paperclip agents use GitHub's free [Models API](https://github.com/marketplace/models) (gpt-4o, Llama 3.1 405B, Phi-3.5, Mistral, DeepSeek, Codestral, etc.) without paying for Claude or OpenRouter.

**Why it exists:** Hermes-paperclip-adapter has a `provider` override bug. OpenRouter's free tier is unreliable for production. GitHub Models gives you 10+ frontier models for free with a daily quota — but no Paperclip adapter exists for it. Until now.

## Status

🚧 **v0.0.1 — scaffold only.** Implementation in progress.

This repo exists ahead of the [Agent htop](https://github.com/acunningham-ship-it/agent-htop) launch as the free LLM backbone htop's research/analysis agents will use. v1.0 ships shortly after htop's launch.

## Models supported (free via GitHub Models)

- `gpt-4o`, `gpt-4o-mini`, `o1-preview`, `o1-mini`
- `Llama-3.1-405B-Instruct`, `Llama-3.3-70B`
- `Phi-3.5-MoE`, `Phi-3.5-mini`
- `Mistral-Large-2407`, `Codestral-2501`
- `DeepSeek-V3`, `DeepSeek-R1`

(Full list: github.com/marketplace/models)

## Authentication

Requires a fine-grained GitHub PAT with the `models:read` Account permission.

Create at: https://github.com/settings/personal-access-tokens

```bash
export GITHUB_TOKEN=github_pat_...
```

## Installation (when v1 ships)

```bash
npm install -g github-models-paperclip-adapter
# Then register in ~/.paperclip/instances/default/config.json
```

Or for development:

```bash
git clone https://github.com/acunningham-ship-it/github-models-paperclip-adapter
cd github-models-paperclip-adapter
npm install
npm run build
```

Then symlink/install in your Paperclip plugins dir.

## Agent configuration example

```json
{
  "name": "Researcher",
  "adapterType": "github_models",
  "adapterConfig": {
    "model": "gpt-4o-mini",
    "timeoutSec": 600,
    "maxTurnsPerRun": 30
  }
}
```

## Architecture

| Component | Purpose |
|---|---|
| `src/index.ts` | Adapter factory exported to Paperclip plugin loader |
| `src/server/execute.ts` | Streaming OpenAI-compat HTTP client → GitHub Models endpoint |
| `src/server/parse.ts` | Session state codec (resume from prior turn) |
| `src/server/detect-model.ts` | Validate model exists + is available on free tier |
| `src/shared/constants.ts` | `ADAPTER_TYPE`, model defaults, GitHub Models base URL |
| `src/ui/index.ts` | Optional UI parser for Paperclip dashboard |

Implementation pattern derived from [openrouter-paperclip-adapter](https://github.com/acunningham-ship-it/openrouter-paperclip-adapter) and [hermes-paperclip-adapter](https://github.com/NousResearch/hermes-paperclip-adapter).

## Roadmap

- **v0.0.1** (now) — scaffold + README
- **v0.5.0** — execute.ts non-streaming MVP, single-turn working
- **v0.8.0** — streaming + session resume
- **v0.9.0** — tool calling support
- **v1.0.0** — production-ready, launches alongside Agent htop

## License

MIT — Armani Cunningham, 2026.
