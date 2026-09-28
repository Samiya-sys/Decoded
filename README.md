# Decoded

Decoded turns Terms & Conditions, Terms of Service, EULAs, and privacy policies into plain-language, evidence-linked findings.

## Run locally

1. Install Node.js 20+.
2. Install dependencies:

```bash
npm install
```

3. Copy `.env.example` to `.env` and add your Google Gemini API key:

```env
GEMINI_API_KEY=your_gemini_api_key_here
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

The browser never receives the API key. Analysis and document questions run through TanStack Start server functions, which call the Google Gemini API directly from the server.

The application still requires an AI provider for AI analysis. Without an external AI provider, the UI and document-processing features can run, but AI analysis cannot.
