import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const CATEGORIES = [
  "Privacy & data sharing",
  "Payments & automatic renewals",
  "Cancellation & refunds",
  "User content & ownership",
  "Account suspension & termination",
  "Advertising & tracking",
  "Liability limitations",
  "Arbitration & disputes",
  "AI & data usage permissions",
  "Other",
] as const;

const RISKS = ["high", "medium", "low"] as const;
const CONFIDENCE_LEVELS = ["high", "medium", "low"] as const;
const COMMONALITY_LEVELS = [
  "common",
  "context-dependent",
  "unusual",
] as const;

const COVERAGE_STATUSES = [
  "complete",
  "partial",
  "uncertain",
] as const;

const ClauseSchema = z.object({
  title: z.string(),
  category: z.string(),
  risk: z.string(),
  confidence: z.string(),
  commonality: z.string(),
  industryContext: z.string(),
  plainLanguage: z.string(),
  whyItMatters: z.string(),
  quote: z.string(),
});

const AnalysisSchema = z.object({
  serviceName: z.string(),
  summary: z.string(),
  overallRisk: z.string(),
  riskScore: z.number(),
  riskRationale: z.string(),
  coverageStatus: z.string(),
  coverageNote: z.string(),
  uncertainties: z.array(z.string()),
  clauses: z.array(ClauseSchema),
});

export type Clause = z.infer<typeof ClauseSchema> & {
  quoteVerified: boolean;
};

export type Analysis = Omit<
  z.infer<typeof AnalysisSchema>,
  "clauses"
> & {
  analysisVersion: number;
  documentText: string;
  clauses: Clause[];
};

/* -------------------------------------------------- */
/* Quote verification                                 */
/* -------------------------------------------------- */

function normalizeWithMap(input: string) {
  const out: string[] = [];
  const map: number[] = [];

  let previousWasSpace = false;

  for (let i = 0; i < input.length; i += 1) {
    let char = input[i]!;

    if (/\s/.test(char)) {
      if (previousWasSpace) {
        continue;
      }

      out.push(" ");
      map.push(i);
      previousWasSpace = true;
      continue;
    }

    if (
      char === "\u2018" ||
      char === "\u2019" ||
      char === "\u02bc"
    ) {
      char = "'";
    }

    if (char === "\u201c" || char === "\u201d") {
      char = '"';
    }

    if (char === "\u2013" || char === "\u2014") {
      char = "-";
    }

    out.push(char.toLowerCase());
    map.push(i);

    previousWasSpace = false;
  }

  return {
    norm: out.join(""),
    map,
  };
}

function normalizeQuote(input: string) {
  return normalizeWithMap(input).norm.trim();
}

function locateQuote(
  source: string,
  quote: string,
): string | null {
  if (source.includes(quote)) {
    return quote;
  }

  const { norm, map } = normalizeWithMap(source);
  const needle = normalizeQuote(quote);

  if (!needle) {
    return null;
  }

  const candidates = [needle];

  if (needle.length > 80) {
    candidates.push(needle.slice(0, 80));
  }

  if (needle.length > 40) {
    candidates.push(needle.slice(0, 40));
  }

  for (const candidate of candidates) {
    const index = norm.indexOf(candidate);

    if (index === -1) {
      continue;
    }

    const start = map[index]!;
    const end =
      map[index + candidate.length - 1]! + 1;

    return source.slice(start, end);
  }

  return null;
}

/* -------------------------------------------------- */
/* Input                                               */
/* -------------------------------------------------- */

const InputSchema = z.object({
  mode: z.enum(["text", "url"]),
  value: z.string().min(1),
});

function htmlToText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(
      /<\/(p|div|li|h[1-6]|tr|section|br)>/gi,
      "\n",
    )
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

/* -------------------------------------------------- */
/* Analysis prompt                                     */
/* -------------------------------------------------- */

const SYSTEM_PROMPT = `
You analyse Terms & Conditions, Terms of Service,
EULAs and privacy policies for ordinary people.

Rules:

- Never advise whether to accept. Inform only.

- Analyse proportionately. Arbitration, class-action
  waivers, liability limits, auto-renewal, termination
  rights, and similar standard clauses are NOT
  automatically high-risk merely because they exist.

- Judge the actual wording: scope, restrictiveness,
  clarity, practical user impact, safeguards, opt-outs,
  notice, reciprocity, and whether it is unusually
  unfavorable compared with common industry practice.

- Distinguish ordinary boilerplate from genuinely
  concerning or one-sided provisions.

- A high rating requires specific evidence of meaningful
  harm, unusually broad rights, severe restrictions,
  poor safeguards, or material surprise.

- Extract clauses that actually affect the user:
  money, data, content ownership, account loss,
  tracking, liability, dispute resolution and AI
  training.

- For every clause, "quote" MUST be copied verbatim
  from the supplied document.

- Quotes should normally be between 30 and 300
  characters.

- plainLanguage should explain the clause in one or
  two short sentences using everyday language.

- whyItMatters should describe the practical
  consequence for the user.

- industryContext should briefly explain whether the
  wording is common, context-dependent or unusual.

- commonality must be one of:
  common
  context-dependent
  unusual

- confidence must be one of:
  high
  medium
  low

- risk must be one of:
  high
  medium
  low

- riskScore must be an integer from 0 to 100.

Risk score calibration:

0-24:
Mostly protective or minimal impact.

25-44:
Mostly standard terms.

45-64:
Meaningful trade-offs.

65-79:
Several materially unfavorable terms.

80-100:
Exceptional and strongly evidenced concern.

Most ordinary agreements should not score above 64.

- riskRationale must explain the concrete factors
  driving the score.

- coverageStatus must describe whether the supplied
  document appears complete.

- uncertainties must list missing policies,
  ambiguities, absent definitions, truncated content
  or other important limitations.

- Return between 4 and 14 meaningful clauses when
  enough relevant clauses exist.

- Order clauses by severity and practical impact.

- Do not pad the result with insignificant boilerplate.

- If the text is not an agreement, explain that in the
  summary and return an empty clauses array.
`.trim();

/* -------------------------------------------------- */
/* Gemini structured-output schema                     */
/* -------------------------------------------------- */

const jsonSchema = {
  type: "object",

  properties: {
    serviceName: {
      type: "string",
    },

    summary: {
      type: "string",
    },

    overallRisk: {
      type: "string",
      enum: [...RISKS],
    },

    riskScore: {
      type: "integer",
    },

    riskRationale: {
      type: "string",
    },

    coverageStatus: {
      type: "string",
      enum: [...COVERAGE_STATUSES],
    },

    coverageNote: {
      type: "string",
    },

    uncertainties: {
      type: "array",
      items: {
        type: "string",
      },
    },

    clauses: {
      type: "array",

      items: {
        type: "object",

        properties: {
          title: {
            type: "string",
          },

          category: {
            type: "string",
            enum: [...CATEGORIES],
          },

          risk: {
            type: "string",
            enum: [...RISKS],
          },

          confidence: {
            type: "string",
            enum: [...CONFIDENCE_LEVELS],
          },

          commonality: {
            type: "string",
            enum: [...COMMONALITY_LEVELS],
          },

          industryContext: {
            type: "string",
          },

          plainLanguage: {
            type: "string",
          },

          whyItMatters: {
            type: "string",
          },

          quote: {
            type: "string",
          },
        },

        required: [
          "title",
          "category",
          "risk",
          "confidence",
          "commonality",
          "industryContext",
          "plainLanguage",
          "whyItMatters",
          "quote",
        ],
      },
    },
  },

  required: [
    "serviceName",
    "summary",
    "overallRisk",
    "riskScore",
    "riskRationale",
    "coverageStatus",
    "coverageNote",
    "uncertainties",
    "clauses",
  ],
};

/* -------------------------------------------------- */
/* Gemini Interactions API helpers                     */
/* -------------------------------------------------- */

const GEMINI_INTERACTIONS_URL =
  "https://generativelanguage.googleapis.com/v1beta/interactions";

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function apiErrorMessage(response: Response) {
  const body = await response.text();

  try {
    const parsed = JSON.parse(body) as {
      message?: string;

      error?: {
        message?: string;
        status?: string;
      };
    };

    return (
      parsed.error?.message ??
      parsed.message ??
      body
    );
  } catch {
    return body;
  }
}

type InteractionResponse = {
  id?: string;
  status?: string;
  output_text?: string;

  outputs?: Array<{
    type?: string;
    text?: string;
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;

  steps?: Array<{
    type?: string;
    status?: string;

    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
};

function getInteractionText(
  payload: InteractionResponse,
) {
  /*
   * Current API responses may expose output_text
   * directly.
   */
  if (
    typeof payload.output_text === "string" &&
    payload.output_text.trim()
  ) {
    return payload.output_text.trim();
  }

  /*
   * Handle outputs[] representation.
   */
  if (Array.isArray(payload.outputs)) {
    const directOutput = payload.outputs
      .map((output) => {
        if (
          typeof output.text === "string"
        ) {
          return output.text;
        }

        return (
          output.content
            ?.filter(
              (item) =>
                item.type === "text" &&
                typeof item.text === "string",
            )
            .map((item) => item.text)
            .join("") ?? ""
        );
      })
      .join("")
      .trim();

    if (directOutput) {
      return directOutput;
    }
  }

  /*
   * REST responses can expose the generated text
   * inside model_output steps.
   */
  if (Array.isArray(payload.steps)) {
    const modelSteps = payload.steps.filter(
      (step) => step.type === "model_output",
    );

    const stepOutput = modelSteps
      .flatMap((step) => step.content ?? [])
      .filter(
        (item) =>
          item.type === "text" &&
          typeof item.text === "string",
      )
      .map((item) => item.text!)
      .join("")
      .trim();

    if (stepOutput) {
      return stepOutput;
    }
  }

  return "";
}

async function callGemini(
  apiKey: string,
  input: string,
  schema: object,
) {
  const body = {
    model: "gemini-3.8-flash",

    input,

    response_format: {
      type: "text",
      mime_type: "application/json",
      schema,
    },
  };

  let response: Response | undefined;

  for (
    let attempt = 0;
    attempt < 4;
    attempt += 1
  ) {
    response = await fetch(
      GEMINI_INTERACTIONS_URL,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },

        body: JSON.stringify(body),
      },
    );

    if (response.ok) {
      break;
    }

    /*
     * Retry temporary rate-limit and server errors.
     */
    const retryable =
      response.status === 429 ||
      response.status === 500 ||
      response.status === 502 ||
      response.status === 503 ||
      response.status === 504;

    if (!retryable || attempt === 3) {
      break;
    }

    const retryAfter = Number(
      response.headers.get("Retry-After"),
    );

    const delay =
      Number.isFinite(retryAfter) &&
      retryAfter > 0
        ? retryAfter * 1000
        : 1000 * 2 ** attempt;

    await response.body?.cancel();

    await wait(delay);
  }

  if (!response) {
    throw new Error(
      "The AI service did not respond.",
    );
  }

  if (!response.ok) {
    const message =
      await apiErrorMessage(response);

    if (response.status === 429) {
      throw new Error(
        message ||
          "Gemini is receiving too many requests right now. Please try again shortly.",
      );
    }

    if (response.status === 401) {
      throw new Error(
        "The Gemini API key is invalid or unavailable.",
      );
    }

    if (response.status === 403) {
      throw new Error(
        message ||
          "Gemini API access is unavailable for this key.",
      );
    }

    if (response.status === 400) {
      throw new Error(
        message ||
          "Gemini rejected the analysis request.",
      );
    }

    throw new Error(
      message ||
        `Gemini returned error ${response.status}.`,
    );
  }

  const payload =
    (await response.json()) as InteractionResponse;

  const output = getInteractionText(payload);

  if (!output) {
    console.error(
      "Gemini returned no text output:",
      payload,
    );

    throw new Error(
      "Gemini returned an empty response. Please try again.",
    );
  }

  return output;
}

function parseJsonOutput<T>(raw: string): T {
  let cleaned = raw.trim();

  /*
   * Defensive cleanup in case a model ever wraps JSON
   * in markdown despite structured output.
   */
  if (cleaned.startsWith("```")) {
    cleaned = cleaned
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");
  }

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");

    if (
      firstBrace !== -1 &&
      lastBrace > firstBrace
    ) {
      try {
        return JSON.parse(
          cleaned.slice(
            firstBrace,
            lastBrace + 1,
          ),
        ) as T;
      } catch {
        // Continue to the useful error below.
      }
    }

    console.error(
      "Could not parse Gemini JSON:",
      raw,
    );

    throw new Error(
      "Gemini returned an unreadable analysis. Please try again.",
    );
  }
}

/* -------------------------------------------------- */
/* Analyse agreement                                   */
/* -------------------------------------------------- */

export const analyzeTerms = createServerFn({
  method: "POST",
})
  .inputValidator((input: unknown) =>
    InputSchema.parse(input),
  )
  .handler(
    async ({ data }): Promise<Analysis> => {
      const apiKey =
        process.env["GEMINI_API_KEY"];

      if (!apiKey) {
        throw new Error(
          "AI is not configured. Add GEMINI_API_KEY to your server environment.",
        );
      }

      let documentText =
        data.value.trim();

      /* ---------------- URL input ---------------- */

      if (data.mode === "url") {
        let url = documentText;

        if (!/^https?:\/\//i.test(url)) {
          url = `https://${url}`;
        }

        let response: Response;

        try {
          response = await fetch(url, {
            headers: {
              "user-agent":
                "Mozilla/5.0 (compatible; DecodedBot/1.0)",
            },
          });
        } catch {
          throw new Error(
            "We couldn't reach that page. Check the link or paste the text instead.",
          );
        }

        if (!response.ok) {
          throw new Error(
            `That page returned an error (${response.status}). Try pasting the text instead.`,
          );
        }

        documentText = htmlToText(
          await response.text(),
        );
      }

      if (documentText.length < 400) {
        throw new Error(
          "That doesn't look like a full agreement. We need at least a few paragraphs of text.",
        );
      }

      const wasTruncated =
        documentText.length > 120000;

      const truncated =
        documentText.slice(0, 120000);

      const prompt = `
${SYSTEM_PROMPT}

The following is the agreement to analyse.

The supplied text ${
        wasTruncated
          ? "was truncated by the system, so coverage must be marked partial."
          : "was not truncated by the system, although it may still be an excerpt."
      }

Return only the structured analysis requested by the response schema.

AGREEMENT:

---
${truncated}
---
`.trim();

      const raw = await callGemini(
        apiKey,
        prompt,
        jsonSchema,
      );

      const parsed =
        parseJsonOutput<unknown>(raw);

      const result =
        AnalysisSchema.parse(parsed);

      /* ---------------- Verify evidence ---------------- */

      const clauses: Clause[] =
        result.clauses.map((clause) => {
          const located = locateQuote(
            truncated,
            clause.quote,
          );

          if (located) {
            return {
              ...clause,
              quote: located,
              quoteVerified: true,
            };
          }

          return {
            ...clause,
            quoteVerified: false,
          };
        });

      const unverifiedCount =
        clauses.filter(
          (clause) =>
            !clause.quoteVerified,
        ).length;

      const uncertainties = [
        ...result.uncertainties,
      ];

      if (unverifiedCount > 0) {
        uncertainties.push(
          `${unverifiedCount} finding${
            unverifiedCount === 1
              ? "'s"
              : "s'"
          } cited wording could not be matched exactly in the supplied text.`,
        );
      }

      if (wasTruncated) {
        uncertainties.push(
          "Only the first 120,000 characters were analyzed.",
        );
      }

      /*
       * The prompt asks for 0-100, but enforce it
       * ourselves rather than relying solely on AI.
       */
      const safeRiskScore = Math.max(
        0,
        Math.min(
          100,
          Math.round(result.riskScore),
        ),
      );

      return {
        ...result,

        riskScore: safeRiskScore,

        analysisVersion: 3,

        clauses,

        coverageStatus: wasTruncated
          ? "partial"
          : result.coverageStatus,

        coverageNote: wasTruncated
          ? `Partial coverage: ${result.coverageNote} Only the first 120,000 characters were analyzed.`
          : result.coverageNote,

        uncertainties,

        documentText: truncated,
      };
    },
  );

/* -------------------------------------------------- */
/* Ask this agreement                                  */
/* -------------------------------------------------- */

const AskInputSchema = z.object({
  documentText: z.string().min(1),
  question: z.string().min(2).max(500),
});

const AnswerSchema = z.object({
  answer: z.string(),
  answered: z.boolean(),
  quotes: z.array(z.string()),
});

export type DocumentAnswer = {
  answer: string;

  answered: boolean;

  quotes: {
    text: string;
    verified: boolean;
  }[];
};

const ASK_SYSTEM_PROMPT = `
You answer questions about one specific agreement.

Rules:

- Use ONLY the supplied agreement.

- Never rely on outside knowledge about the company.

- If the agreement does not address the question,
  set answered to false.

- If answered is false, explain plainly that the
  supplied text does not cover the question.

- Never guess.

- answer should contain 2-5 short sentences.

- Use everyday language.

- Remain neutral and informational.

- Never advise whether the user should accept,
  reject or sign the agreement.

- quotes must contain 1-3 verbatim excerpts from
  the agreement supporting the answer.

- Each quote should normally contain between
  30 and 300 characters.

- If answered is false, quotes should be an
  empty array.

- If wording is ambiguous, explain the ambiguity
  rather than pretending the interpretation is certain.
`.trim();

const askJsonSchema = {
  type: "object",

  properties: {
    answer: {
      type: "string",
    },

    answered: {
      type: "boolean",
    },

    quotes: {
      type: "array",

      items: {
        type: "string",
      },
    },
  },

  required: [
    "answer",
    "answered",
    "quotes",
  ],
};

export const askDocument = createServerFn({
  method: "POST",
})
  .inputValidator((input: unknown) =>
    AskInputSchema.parse(input),
  )
  .handler(
    async ({
      data,
    }): Promise<DocumentAnswer> => {
      const apiKey =
        process.env["GEMINI_API_KEY"];

      if (!apiKey) {
        throw new Error(
          "AI is not configured. Add GEMINI_API_KEY to your server environment.",
        );
      }

      const source =
        data.documentText.slice(
          0,
          120000,
        );

      const prompt = `
${ASK_SYSTEM_PROMPT}

AGREEMENT:

---
${source}
---

QUESTION:

${data.question}

Return only the structured answer requested by the response schema.
`.trim();

      const raw = await callGemini(
        apiKey,
        prompt,
        askJsonSchema,
      );

      const parsed =
        parseJsonOutput<unknown>(raw);

      const result =
        AnswerSchema.parse(parsed);

      return {
        answer: result.answer,

        answered: result.answered,

        quotes: result.quotes.map(
          (quote) => {
            const located =
              locateQuote(
                source,
                quote,
              );

            if (located) {
              return {
                text: located,
                verified: true,
              };
            }

            return {
              text: quote,
              verified: false,
            };
          },
        ),
      };
    },
  );