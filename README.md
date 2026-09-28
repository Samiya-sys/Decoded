# Decoded

Decoded turns Terms & Conditions, Terms of Service, EULAs, and privacy policies into plain-language, evidence-linked findings.

## Run locally

1. Install Node.js 20+.
2. Install dependencies:

```bash
npm install
```

3. Copy `.env.example` to `.env` and add your OpenRouter API key:

```env
OPENROUTER_API_KEY=your_openrouter_api_key_here
```

You can also optionally set the model (defaults to `openai/gpt-oss-120b:free`):

```env
OPENROUTER_MODEL=openai/gpt-oss-120b:free
```

4. Start the development server:

```bash
npm run dev
```

Then open the local URL shown by Vite.

## Build

```bash
npm run build
npm run preview
```

## AI provider

The browser never receives the API key. Analysis and document questions run through TanStack Start server functions, which call the [OpenRouter](https://openrouter.ai) API directly from the server. OpenRouter gives access to hundreds of models (including free tiers) with large context windows and generous output limits.

Get a free API key at [https://openrouter.ai/keys](https://openrouter.ai/keys).

The application still requires an AI provider for AI analysis. Without an external AI provider, the UI and document-processing features can run, but AI analysis cannot.
