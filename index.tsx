import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clipboard,
  Download,
  FileSearch,
  FileText,
  FileUp,
  Link2,
  Loader2,
  MessageSquare,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";

import {
  analyzeTerms,
  askDocument,
  type Analysis,
  type Clause,
  type DocumentAnswer,
} from "@/lib/decoded.functions";
import { extractPdfText } from "@/lib/pdf-text";
import { RiskBadge } from "@/components/RiskBadge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import logo from "@/assets/decoded-logo.webp";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Decoded — Evidence-Linked Terms Analysis" },
      {
        name: "description",
        content:
          "Analyze Terms and Conditions with risk scoring, personal action lists, and every finding linked to its exact source wording.",
      },
      { property: "og:title", content: "Decoded — Evidence-Linked Terms Analysis" },
      {
        property: "og:description",
        content: "Turn dense agreements into traceable findings, risk scores, and a personal review list.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const RISK_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };
const SAMPLE_TERMS = `SampleCloud Terms of Service

By using SampleCloud, you agree to these terms. Your subscription automatically renews every month at the then-current price unless you cancel at least 48 hours before the renewal date. Payments are non-refundable except where required by law.

We collect account information, device identifiers, approximate location, browsing activity, and interactions with advertisements. We may share this information with advertising partners, analytics providers, and affiliated companies to personalize services and measure campaigns.

You retain ownership of content you upload. However, you grant SampleCloud a worldwide, royalty-free, transferable and sublicensable license to host, reproduce, modify, distribute, and use that content to operate, improve, and train automated systems.

We may suspend or terminate your account at any time if we believe you violated these terms or created risk for the service. We may remove access without prior notice. You are responsible for downloading your content before termination.

To the fullest extent allowed by law, SampleCloud is not liable for lost profits, lost data, business interruption, or indirect damages. Any dispute must be resolved through binding individual arbitration, and you waive the right to participate in a class action.`;

function Index() {
  const run = useServerFn(analyzeTerms);
  const [mode, setMode] = useState<"text" | "url" | "file">("text");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [focusQuote, setFocusQuote] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const [copyState, setCopyState] = useState("Copy summary");
  const sourceRef = useRef<HTMLDivElement>(null);
  const recoveredStaleAnalysis = useRef(false);

  const mutation = useMutation({
    mutationFn: (vars: { mode: "text" | "url"; value: string }) => run({ data: vars }),
    onSuccess: () => {
      setActiveCategory(null);
      setFocusQuote(null);
      setReviewed(new Set());
    },
  });

  const analysis = mutation.data as Analysis | undefined;

  useEffect(() => {
    if (
      !analysis
      || analysis.analysisVersion === 2
      || analysis.clauses.length > 0
      || recoveredStaleAnalysis.current
    ) return;

    const hasLegacyOmission = analysis.uncertainties.some((item) =>
      /findings? (?:were|was) omitted/i.test(item),
    );
    if (!hasLegacyOmission || !analysis.documentText.trim()) return;

    recoveredStaleAnalysis.current = true;
    mutation.mutate({ mode: "text", value: analysis.documentText });
  }, [analysis, mutation]);
  const categories = useMemo(
    () => (analysis ? Array.from(new Set(analysis.clauses.map((clause) => clause.category))) : []),
    [analysis],
  );
  const clauses = useMemo(() => {
    if (!analysis) return [] as Clause[];
    return [...analysis.clauses]
      .sort((a, b) => (RISK_ORDER[a.risk] ?? 3) - (RISK_ORDER[b.risk] ?? 3))
      .filter((clause) => !activeCategory || clause.category === activeCategory);
  }, [analysis, activeCategory]);

  const metrics = useMemo(() => {
    if (!analysis) return null;
    const high = analysis.clauses.filter((clause) => clause.risk === "high").length;
    const words = analysis.documentText.trim().split(/\s+/).length;
    const sentences = Math.max(1, analysis.documentText.split(/[.!?]+/).filter(Boolean).length);
    const wordsPerSentence = words / sentences;
    return {
      high,
      words,
      riskScore: analysis.riskScore,
      readability: wordsPerSentence > 24 ? "Dense" : wordsPerSentence > 17 ? "Moderate" : "Clear",
      coverage: analysis.coverageStatus === "complete" ? "Complete" : analysis.coverageStatus === "partial" ? "Partial" : "Uncertain",
    };
  }, [analysis, categories]);

  const submit = () => {
    const value = mode === "url" ? url : text;
    if (value.trim()) mutation.mutate({ mode: mode === "url" ? "url" : "text", value });
  };

  const reset = () => {
    mutation.reset();
    setFocusQuote(null);
    setSearch("");
    setReviewed(new Set());
  };

  const showInSource = (quote: string) => {
    setFocusQuote(quote);
    requestAnimationFrame(() => {
      sourceRef.current?.querySelector("mark")?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (window.innerWidth < 1024) sourceRef.current?.scrollIntoView({ behavior: "smooth" });
    });
  };

  const reportText = useMemo(() => {
    if (!analysis) return "";
    const findings = analysis.clauses
      .map((clause, index) => `${index + 1}. [${clause.risk.toUpperCase()} SEVERITY · ${clause.confidence.toUpperCase()} CONFIDENCE] ${clause.title}\n${clause.plainLanguage}\nPractical impact: ${clause.whyItMatters}\nIndustry context (${clause.commonality}): ${clause.industryContext}\nSource: “${clause.quote}”`)
      .join("\n\n");
    const uncertainty = analysis.uncertainties.length ? analysis.uncertainties.map((item) => `- ${item}`).join("\n") : "No material uncertainties identified.";
    return `DECODED AGREEMENT REPORT\n${analysis.serviceName}\nOverall severity: ${analysis.overallRisk.toUpperCase()} (${analysis.riskScore}/100)\nCoverage: ${analysis.coverageStatus.toUpperCase()}\n\nSCORE RATIONALE\n${analysis.riskRationale}\n\nCOVERAGE\n${analysis.coverageNote}\n\nSUMMARY\n${analysis.summary}\n\nUNCERTAINTIES\n${uncertainty}\n\nFINDINGS\n${findings}\n\nGenerated by Decoded. Informational only, not legal advice.`;
  }, [analysis]);

  const copyReport = async () => {
    await navigator.clipboard.writeText(reportText);
    setCopyState("Copied");
    window.setTimeout(() => setCopyState("Copy summary"), 1800);
  };

  const downloadReport = () => {
    if (!analysis) return;
    const blob = new Blob([reportText], { type: "text/plain;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `${analysis.serviceName.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "decoded"}-report.txt`;
    anchor.click();
    URL.revokeObjectURL(href);
  };

  const toggleReviewed = (key: string) => {
    setReviewed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-card/90 backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 max-w-[1500px] items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <img
  src={logo}
  alt="Decoded"
  className="h-8 w-auto max-w-36 object-contain object-left sm:h-9 sm:max-w-44"
/>
            <p className="hidden border-l border-border pl-3 text-xs font-medium text-muted-foreground sm:block">Evidence, not guesswork</p>
            {analysis && (
              <>
                <div className="mx-2 hidden h-7 w-px bg-border md:block" />
                <p className="hidden max-w-64 truncate text-sm font-medium md:block">{analysis.serviceName}</p>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {analysis && (
              <>
                <Button variant="ghost" size="sm" onClick={copyReport} title="Copy report to clipboard">
                  {copyState === "Copied" ? <Check /> : <Clipboard />}
                  <span className="hidden sm:inline">{copyState}</span>
                </Button>
                <Button variant="outline" size="sm" onClick={downloadReport} title="Download report">
                  <Download /> <span className="hidden sm:inline">Export</span>
                </Button>
                <Button size="sm" onClick={reset}><Plus /> New analysis</Button>
              </>
            )}
          </div>
        </div>
      </header>

      {!analysis ? (
        <InputWorkspace
          mode={mode}
          setMode={setMode}
          text={text}
          setText={setText}
          url={url}
          setUrl={setUrl}
          submit={submit}
          isPending={mutation.isPending}
          error={mutation.isError ? (mutation.error as Error).message : null}
        />
      ) : (
        <div className="mx-auto grid max-w-[1500px] lg:h-[calc(100vh-4rem)] lg:grid-cols-[minmax(0,1fr)_29rem]">
          <section className="order-2 min-w-0 border-border bg-background lg:order-1 lg:overflow-y-auto lg:border-r">
            <div className="mx-auto max-w-4xl p-4 sm:p-7 lg:p-10">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Original agreement</p>
                  <h1 className="mt-1 font-display text-2xl font-bold">{analysis.serviceName}</h1>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search document" className="bg-card pl-9" />
                </div>
              </div>
              <div ref={sourceRef} className="min-h-[70vh] rounded-lg border border-border bg-card p-6 shadow-[0_18px_50px_-38px_var(--foreground)] sm:p-10">
                <div className="mb-8 flex items-center justify-between border-b border-border pb-4">
                  <p className="text-sm font-medium">Source text</p>
                  <p className="text-xs text-muted-foreground">{metrics?.words.toLocaleString()} words analyzed</p>
                </div>
                <div className="whitespace-pre-wrap text-[15px] leading-8 text-card-foreground">
                  <SourceText text={analysis.documentText} highlight={focusQuote} search={search} />
                </div>
              </div>
            </div>
          </section>

          <aside className="order-1 min-w-0 bg-card lg:order-2 lg:overflow-y-auto">
            <div className="border-b border-border p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-bold uppercase text-muted-foreground">Intelligence overview</p>
                <RiskBadge risk={analysis.overallRisk} />
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <Metric label="Risk score" value={`${metrics?.riskScore}`} suffix="/100" tone="alert" />
                <Metric label="Readability" value={metrics?.readability ?? "—"} />
                <Metric label="Coverage" value={metrics?.coverage ?? "—"} />
              </div>
              <div className="mt-4 rounded-lg bg-foreground p-5 text-background shadow-lg">
                <div className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="size-4 text-primary" /> Plain-language brief</div>
                <p className="mt-2 text-sm leading-relaxed opacity-80">{analysis.summary}</p>
              </div>
              <div className="mt-4 space-y-3 rounded-md border border-border bg-secondary/60 p-4">
                <div>
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">Why this score</p>
                  <p className="mt-1 text-xs leading-relaxed">{analysis.riskRationale}</p>
                </div>
                <div className="border-t border-border pt-3">
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">Coverage & uncertainty</p>
                  <p className="mt-1 text-xs leading-relaxed">{analysis.coverageNote}</p>
                  {analysis.uncertainties.length > 0 && (
                    <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {analysis.uncertainties.map((item) => <li key={item}>• {item}</li>)}
                    </ul>
                  )}
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 divide-x divide-border rounded-md border border-border py-3 text-center">
                <MiniStat value={analysis.clauses.length} label="Findings" />
                <MiniStat value={metrics?.high ?? 0} label="High impact" />
                <MiniStat value={reviewed.size} label="Reviewed" />
              </div>
            </div>

            <div className="border-b border-border px-5 py-4 sm:px-6">
              <div className="flex gap-2 overflow-x-auto pb-1">
                <Button variant={activeCategory === null ? "default" : "outline"} size="sm" onClick={() => setActiveCategory(null)}>All</Button>
                {categories.map((category) => (
                  <Button key={category} variant={activeCategory === category ? "default" : "outline"} size="sm" onClick={() => setActiveCategory(category)} className="shrink-0">
                    {category}
                  </Button>
                ))}
              </div>
            </div>

            <AskPanel documentText={analysis.documentText} onLocate={showInSource} />

            <div className="space-y-3 p-5 sm:p-6">

              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-bold">What affects you</h2>
                <span className="text-xs text-muted-foreground">{clauses.length} shown</span>
              </div>
              {clauses.length === 0 && (
                <div className="rounded-lg border border-dashed border-border bg-secondary/50 p-5 text-sm leading-relaxed text-muted-foreground">
                  {analysis.clauses.length === 0
                    ? "No specific clauses were extracted from this text. It may be a navigation page or an excerpt rather than the full agreement — try pasting the complete terms."
                    : "No findings in this category. Choose “All” to see every finding."}
                </div>
              )}
              {clauses.map((clause, index) => {
                const key = `${clause.title}-${index}`;
                const isReviewed = reviewed.has(key);
                return (
                  <article key={key} className={cn("rounded-lg border bg-card p-4 transition-colors", isReviewed ? "border-risk-low/50" : "border-border")}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <RiskBadge risk={clause.risk} />
                          <span className="rounded-md border border-border bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">{clause.confidence} confidence</span>
                        </div>
                        <h3 className="mt-2 font-display text-base font-bold leading-snug">{clause.title}</h3>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => toggleReviewed(key)} title={isReviewed ? "Mark as not reviewed" : "Mark as reviewed"} className={cn("shrink-0", isReviewed && "bg-risk-low/10 text-risk-low")}>
                        <CheckCircle2 />
                      </Button>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed">{clause.plainLanguage}</p>
                    <div className="mt-3 rounded-md bg-secondary px-3 py-2">
                      <p className="flex gap-2 text-xs leading-relaxed text-muted-foreground"><Target className="mt-0.5 size-3.5 shrink-0 text-primary" />{clause.whyItMatters}</p>
                    </div>
                    <div className="mt-3 border-l-2 border-risk-medium pl-3">
                      <p className="text-[10px] font-bold uppercase text-muted-foreground">{clause.commonality.replace("-", " ")} in practice</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{clause.industryContext}</p>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <span className="truncate text-[11px] font-semibold uppercase text-muted-foreground">{clause.category}</span>
                      {clause.quoteVerified ? (
                        <Button variant="link" size="sm" className="h-auto shrink-0 px-0" onClick={() => showInSource(clause.quote)}>Locate evidence</Button>
                      ) : (
                        <span className="shrink-0 text-[11px] text-muted-foreground" title="The cited wording could not be matched exactly in the text you supplied.">Evidence not located</span>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}

function InputWorkspace({ mode, setMode, text, setText, url, setUrl, submit, isPending, error }: {
  mode: "text" | "url" | "file";
  setMode: (mode: "text" | "url" | "file") => void;
  text: string;
  setText: (value: string) => void;
  url: string;
  setUrl: (value: string) => void;
  submit: () => void;
  isPending: boolean;
  error: string | null;
}) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileBusy, setFileBusy] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setFileError(null);
    setFileBusy(true);
    setFileName(file.name);
    try {
      const extracted = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
        ? await extractPdfText(file)
        : await file.text();
      if (extracted.trim().length < 400) {
        setFileError("We couldn't read enough text from that file. It may be a scanned image — try pasting the text instead.");
        setText("");
        return;
      }
      setText(extracted);
    } catch {
      setFileError("That file couldn't be read. Try a different PDF or paste the text instead.");
      setText("");
    } finally {
      setFileBusy(false);
    }
  };

  return (
    <div className="mx-auto grid max-w-[1500px] lg:min-h-[calc(100vh-4rem)] lg:grid-cols-[minmax(0,1fr)_26rem]">
      <section className="relative flex items-center overflow-hidden px-5 py-12 sm:px-10 lg:px-16">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-primary/40" />
        <div className="w-full max-w-4xl">
          <p className="mb-4 flex items-center gap-2 text-sm font-semibold text-primary"><ShieldCheck className="size-4" /> Independent agreement review</p>
          <h1 className="max-w-3xl font-display text-4xl font-bold leading-tight sm:text-6xl">Know what changes for you before you agree.</h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">Decoded creates a traceable review: each warning links back to exact contract wording, with risk coverage and a personal follow-up list.</p>

          <div className="mt-9 rounded-lg border border-border bg-card shadow-[0_24px_70px_-44px_var(--foreground)]">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
              <div className="flex overflow-x-auto rounded-md bg-secondary p-1">
                <Button variant={mode === "text" ? "outline" : "ghost"} size="sm" onClick={() => setMode("text")} className={cn("shrink-0", mode === "text" && "bg-card")}><FileText /> Paste text</Button>
                <Button variant={mode === "url" ? "outline" : "ghost"} size="sm" onClick={() => setMode("url")} className={cn("shrink-0", mode === "url" && "bg-card")}><Link2 /> Use a link</Button>
                <Button variant={mode === "file" ? "outline" : "ghost"} size="sm" onClick={() => setMode("file")} className={cn("shrink-0", mode === "file" && "bg-card")}><FileUp /> Upload file</Button>
              </div>
              <span className="hidden text-xs text-muted-foreground sm:block">Nothing is stored</span>
            </div>
            <div className="p-4 sm:p-5">
              {mode === "text" && (
                <Textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="Paste Terms & Conditions, a privacy policy, EULA, or subscription agreement…" className="min-h-56 resize-y border-0 bg-secondary/50 p-4 shadow-none focus-visible:ring-1" />
              )}
              {mode === "url" && (
                <div className="py-8"><Input value={url} onChange={(event) => setUrl(event.target.value)} onKeyDown={(event) => event.key === "Enter" && submit()} placeholder="https://example.com/terms" inputMode="url" className="h-12" /></div>
              )}
              {mode === "file" && (
                <label
                  className="flex min-h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-border bg-secondary/40 p-6 text-center transition-colors hover:border-primary/50"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => { event.preventDefault(); void handleFile(event.dataTransfer.files?.[0]); }}
                >
                  <input type="file" accept=".pdf,.txt,.md,application/pdf,text/plain" className="sr-only" onChange={(event) => void handleFile(event.target.files?.[0] ?? undefined)} />
                  {fileBusy ? <Loader2 className="size-6 animate-spin text-primary" /> : <FileUp className="size-6 text-primary" />}
                  <p className="text-sm font-medium">{fileBusy ? "Reading your document…" : fileName ?? "Drop a PDF or text file here, or click to choose"}</p>
                  <p className="text-xs text-muted-foreground">
                    {!fileBusy && text ? `${text.trim().split(/\s+/).length.toLocaleString()} words ready to analyze` : "PDF, TXT or Markdown — the file never leaves your device unread"}
                  </p>
                </label>
              )}
              {fileError && mode === "file" && <p className="mt-3 text-sm text-destructive">{fileError}</p>}
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button onClick={submit} disabled={isPending || fileBusy || !(mode === "url" ? url : text).trim()} size="lg">
                  {isPending ? <><Loader2 className="animate-spin" /> Building evidence map…</> : <><FileSearch /> Analyze agreement</>}
                </Button>
                {mode === "text" && !text && <Button variant="ghost" onClick={() => setText(SAMPLE_TERMS)}>Try a sample</Button>}
                <p className="text-xs text-muted-foreground">Information only — not legal advice.</p>
              </div>
              {error && <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
            </div>
          </div>

        </div>
      </section>

     <aside className="border-t border-border bg-foreground px-6 py-10 text-background lg:border-l lg:border-t-0 lg:px-8 lg:py-14">
  <p className="text-xs font-bold uppercase opacity-60">
    Why use Decoded
  </p>

  <div className="mt-7 space-y-8">
    <ValuePoint
      icon={Target}
      number="01"
      title="Evidence-linked findings"
    >
      Every explanation connects to the exact sentence in the agreement.
    </ValuePoint>

    <ValuePoint
      icon={AlertTriangle}
      number="02"
      title="Consistent risk coverage"
    >
      Nine high-impact areas are checked every time, not only what you
      remember to ask.
    </ValuePoint>

    <ValuePoint
      icon={CheckCircle2}
      number="03"
      title="A review you can act on"
    >
      Mark findings as reviewed and export a structured record for later.
    </ValuePoint>
  </div>

  <div className="mt-10 border-t border-background/20 pt-6">
    <p className="font-display text-xl font-bold text-white">
      Built for the moment before “I Agree.”
    </p>

    <p className="mt-2 text-sm leading-relaxed opacity-65">
      No prompts to engineer. No unsupported summary without the source
      beside it.
    </p>
  </div>
</aside>
    </div>
  );
}

function ValuePoint({ icon: Icon, number, title, children }: { icon: typeof Target; number: string; title: string; children: string }) {
  return <div className="grid grid-cols-[2rem_1fr] gap-3"><div className="flex size-8 items-center justify-center rounded-md bg-background/10"><Icon className="size-4 text-risk-medium" /></div><div><p className="text-[10px] font-semibold opacity-45">{number}</p><h2 className="mt-1 font-display font-bold">{title}</h2><p className="mt-1 text-sm leading-relaxed opacity-65">{children}</p></div></div>;
}

function Metric({ label, value, suffix, tone }: { label: string; value: string; suffix?: string; tone?: "alert" }) {
  return <div className={cn("rounded-md border p-3", tone === "alert" ? "border-risk-high/20 bg-risk-high/8" : "border-border bg-secondary/60")}><p className="text-[10px] font-bold uppercase text-muted-foreground">{label}</p><p className={cn("mt-1 text-xl font-bold", tone === "alert" && "text-risk-high")}>{value}<span className="ml-0.5 text-xs font-medium text-muted-foreground">{suffix}</span></p></div>;
}

function MiniStat({ value, label }: { value: number; label: string }) {
  return <div><p className="text-lg font-bold">{value}</p><p className="text-[10px] uppercase text-muted-foreground">{label}</p></div>;
}

function SourceText({ text, highlight, search }: { text: string; highlight: string | null; search: string }) {
  const needle = highlight || (search.trim().length > 1 ? search.trim() : null);
  if (!needle) return <>{text}</>;
  const index = text.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase());
  if (index === -1) return <><p className="mb-5 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">No exact match found in the source text.</p>{text}</>;
  return <>{text.slice(0, index)}<mark className="rounded-sm bg-risk-medium/30 px-0.5 text-foreground ring-2 ring-risk-medium/20">{text.slice(index, index + needle.length)}</mark>{text.slice(index + needle.length)}</>;
}
const SUGGESTED_QUESTIONS = [
  "Can I get a refund?",
  "How do I cancel?",
  "Who can see my data?",
  "Can they use my content?",
];

function AskPanel({ documentText, onLocate }: { documentText: string; onLocate: (quote: string) => void }) {
  const ask = useServerFn(askDocument);
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<{ question: string; answer: DocumentAnswer }[]>([]);

  const mutation = useMutation({
    mutationFn: (value: string) => ask({ data: { documentText, question: value } }),
    onSuccess: (answer, value) => {
      setTurns((current) => [...current, { question: value, answer: answer as DocumentAnswer }]);
      setQuestion("");
    },
  });

  const send = (value: string) => {
    const trimmed = value.trim();
    if (trimmed.length > 1 && !mutation.isPending) mutation.mutate(trimmed);
  };

  return (
    <div className="border-b border-border p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <MessageSquare className="size-4 text-primary" />
        <h2 className="font-display text-lg font-bold">Ask this agreement</h2>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Answers come only from the text you supplied, with the wording to check.</p>

      {turns.length > 0 && (
        <div className="mt-4 space-y-3">
          {turns.map((turn, index) => (
            <div key={`${turn.question}-${index}`} className="rounded-lg border border-border bg-secondary/50 p-3">
              <p className="text-xs font-semibold">{turn.question}</p>
              <p className="mt-2 text-sm leading-relaxed">{turn.answer.answer}</p>
              {!turn.answer.answered && (
                <p className="mt-2 text-[11px] font-semibold uppercase text-muted-foreground">Not covered by this document</p>
              )}
              {turn.answer.quotes.length > 0 && (
                <div className="mt-2 space-y-1">
                  {turn.answer.quotes.map((quote) => (
                    <button
                      key={quote.text}
                      type="button"
                      disabled={!quote.verified}
                      onClick={() => onLocate(quote.text)}
                      className={cn(
                        "block w-full border-l-2 border-risk-medium pl-2 text-left text-[11px] leading-relaxed text-muted-foreground",
                        quote.verified ? "hover:text-foreground" : "opacity-70",
                      )}
                      title={quote.verified ? "Show this wording in the document" : "This wording could not be matched exactly."}
                    >
                      “{quote.text}”
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {mutation.isPending && (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Checking the document…</p>
      )}
      {mutation.isError && (
        <p className="mt-4 text-sm text-destructive">{(mutation.error as Error).message}</p>
      )}

      {turns.length === 0 && !mutation.isPending && (
        <div className="mt-4 flex flex-wrap gap-2">
          {SUGGESTED_QUESTIONS.map((item) => (
            <Button key={item} variant="outline" size="sm" onClick={() => send(item)} className="text-xs">{item}</Button>
          ))}
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <Input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && send(question)}
          placeholder="Ask about refunds, data, cancellation…"
          className="bg-secondary/50"
        />
        <Button size="icon" onClick={() => send(question)} disabled={mutation.isPending || question.trim().length < 2} title="Ask">
          <Send />
        </Button>
      </div>
    </div>
  );
}
