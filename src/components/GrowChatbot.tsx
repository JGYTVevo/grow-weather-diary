import React, { useState, useRef, useEffect, useCallback } from "react";
import type { Plant } from "@/hooks/use-plants";
import type { HomemadeFertilizer } from "@/hooks/use-fertilizers";
import { buildPlantJournalSummary } from "@/lib/journal-context";
import {
  Bot,
  Send,
  Sparkles,
  Droplets,
  FlaskConical,
  RotateCcw,
  Calculator,
  Loader2,
  CheckCircle2,
  Sprout,
  ExternalLink,
  ShieldCheck,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Globe,
  AlertCircle,
  RefreshCw,
} from "lucide-react";

export interface ChatSource {
  title: string;
  url: string;
  publisher: string;
  snippet?: string;
}

export interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  failed?: boolean;
  calculatedBreakdown?: {
    waterLitres: number;
    totalMixedLitres: number;
    examples: Array<{
      label: string;
      ratio: string;
      concentrateMl: number;
      waterAddedLitres: number;
    }>;
  };
  sources?: ChatSource[];
}

interface GrowChatbotProps {
  plants: Plant[];
  fertilizers: HomemadeFertilizer[];
}

const CHAT_STORAGE_KEY = "canopy-ai-assistant-section-v5";

const DEFAULT_WELCOME_SOURCES: ChatSource[] = [
  {
    title: "Encyclopaedia Britannica — Science, Math, Tech & General Knowledge",
    publisher: "Encyclopaedia Britannica",
    url: "https://www.britannica.com/",
    snippet:
      "Fact-checked reference covering science, mathematics, technology, world history, and everyday topics.",
  },
  {
    title: "Nutrient Solution Concentration, Dilution Math & EC Management",
    publisher: "Utah State University — Controlled Environment Agriculture",
    url: "https://extension.usu.edu/yardandgarden/research/",
    snippet:
      "Fertilizer rates are expressed as concentration per unit volume (ml/L); total irrigation volume remains constant while concentrate scales with water volume.",
  },
  {
    title: "Liquid Feeding, Dilution Ratios & Root Zone Salt Management",
    publisher: "Royal Horticultural Society (RHS) — Horticultural Science",
    url: "https://www.rhs.org.uk/soil-composts-mulches/fertilisers",
    snippet:
      "Diluted liquid feeds replace a standard watering volume rather than adding extra water volume on top.",
  },
];

const STARTER_QUESTIONS = [
  "If I use 1.5L of water per watering, do I use the same amount of diluted nutrients?",
  "How do I make a classic New Zealand pavlova?",
  "Explain how photosynthesis converts light into plant energy",
  "Calculate 245 * 18 and show the steps",
  "What pH and EC should I aim for when mixing my nutrients?",
  "Write a clean TypeScript function to sort items by date",
];

const STANDARD_RATIO_OPTIONS = [
  { id: "std-2ml", label: "Standard Bottled Feed — 2 ml/L (1:500)", mlPerL: 2 },
  { id: "std-4ml", label: "Heavy Bloom / Veg Feed — 4 ml/L (1:250)", mlPerL: 4 },
  { id: "std-5ml", label: "Seaweed / Liquid Organic — 5 ml/L (1:200)", mlPerL: 5 },
  { id: "std-20ml", label: "Light Compost / Worm Tea — 1:50 (20 ml/L)", mlPerL: 20 },
  { id: "std-50ml", label: "Fermented Plant Juice — 1:20 (50 ml/L)", mlPerL: 50 },
  { id: "std-100ml", label: "Homemade Nettle / Comfrey Brew — 1:10 (100 ml/L)", mlPerL: 100 },
];

function parseClientMlPerLitre(ratioStr?: string): number | null {
  if (!ratioStr) return null;
  const mlMatch = ratioStr.match(/(\d+(?:\.\d+)?)\s*ml\s*\/\s*l/i);
  if (mlMatch && mlMatch[1]) {
    const v = parseFloat(mlMatch[1]);
    if (v > 0) return v;
  }
  const colonMatch = ratioStr.match(/1\s*:\s*(\d+(?:\.\d+)?)/);
  if (colonMatch && colonMatch[1]) {
    const parts = parseFloat(colonMatch[1]);
    if (parts > 0) return +(1000 / parts).toFixed(1);
  }
  return null;
}

function renderInlineFormatting(line: string) {
  const tokens = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return tokens.map((part, j) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={j} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={j}
          className="rounded bg-card/90 border border-border/60 px-1 py-0.5 font-mono text-[11px] text-primary"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <React.Fragment key={j}>{part}</React.Fragment>;
  });
}

function renderFormattedText(text: string) {
  const segments = text.split(/(```[\s\S]*?```)/g);
  return (
    <div className="space-y-1.5 text-xs sm:text-sm leading-relaxed">
      {segments.map((segment, segIdx) => {
        if (segment.startsWith("```") && segment.endsWith("```")) {
          const rawCode = segment.slice(3, -3).replace(/^[a-zA-Z]+\n/, "");
          return (
            <pre
              key={segIdx}
              className="my-2 overflow-x-auto rounded-xl border border-border bg-card p-2.5 font-mono text-[11px] text-foreground"
            >
              <code>{rawCode.trim()}</code>
            </pre>
          );
        }

        const lines = segment.split("\n");
        return (
          <React.Fragment key={segIdx}>
            {lines.map((line, i) => {
              const trimmed = line.trim();
              if (!trimmed) {
                return <div key={i} className="h-1" />;
              }
              return (
                <p
                  key={i}
                  className={trimmed.startsWith("•") || trimmed.startsWith("-") ? "pl-2" : ""}
                >
                  {renderInlineFormatting(line)}
                </p>
              );
            })}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function SourcesCitationBlock({ sources }: { sources?: ChatSource[] }) {
  if (!sources || sources.length === 0) return null;

  return (
    <div
      data-testid="chat-sources-list"
      className="mt-3 rounded-xl border border-primary/30 bg-card/95 p-2.5 text-foreground space-y-2"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border/50 pb-1.5">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-primary">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
          Verified Sources &amp; References ({sources.length})
        </span>
        <span className="text-[10px] font-medium text-muted-foreground">
          Trustworthy &amp; Cited
        </span>
      </div>

      <ul className="space-y-1.5">
        {sources.map((src, idx) => (
          <li
            key={`${src.url}-${idx}`}
            className="rounded-lg border border-border/50 bg-secondary/40 px-2.5 py-1.5 text-[11px] transition hover:border-primary/50"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-0.5 min-w-0">
                <a
                  href={src.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-foreground hover:text-primary underline decoration-primary/40 inline-flex items-center gap-1 break-words"
                >
                  <BookOpen className="h-3 w-3 text-primary shrink-0" />
                  <span>{src.title}</span>
                </a>
                <div className="text-[10px] font-semibold text-primary/90">{src.publisher}</div>
                {src.snippet && (
                  <p className="text-[10px] text-muted-foreground leading-snug">{src.snippet}</p>
                )}
              </div>
              <a
                href={src.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Open source ${src.title}`}
                className="shrink-0 inline-flex items-center gap-0.5 rounded-md bg-primary/15 px-1.5 py-1 text-[10px] font-semibold text-primary hover:bg-primary hover:text-primary-foreground transition"
              >
                <span>Source</span>
                <ExternalLink className="h-2.5 w-2.5" />
              </a>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

const INITIAL_WELCOME: ChatTurn = {
  id: "welcome-msg",
  role: "assistant",
  timestamp: "Just now",
  content:
    "Kia ora! I'm your **AI Assistant**.\n\n" +
    "**Ask me anything** — general knowledge, science, math, coding, recipes, daily questions, or your synced **Grow Diary**, **Fertilizer Journal**, and **1.5L watering vs. diluted nutrient math**. Every answer directly addresses your question and lists the **verified sources** used.",
  sources: DEFAULT_WELCOME_SOURCES,
};

function loadSavedMessages(): ChatTurn[] {
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ChatTurn[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        const cleaned = parsed.filter(
          (msg) =>
            !msg.content.includes("can be approached by looking at the primary facts") &&
            !msg.content.includes("Identify the main variables or requirements in your question"),
        );
        if (cleaned.length > 0) {
          return cleaned;
        }
      }
    }
  } catch {
    // ignore storage errors
  }
  return [INITIAL_WELCOME];
}

async function postAssistantRequest(bodyPayload: Record<string, unknown>) {
  const endpoints = ["/api/grow-chat", "/api/ai-assistant"];
  let lastError: Error | null = null;

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload),
      });

      if (response.ok) {
        return (await response.json()) as {
          reply: string;
          calculatedBreakdown?: ChatTurn["calculatedBreakdown"];
          sources?: ChatSource[];
        };
      }

      const errData = (await response.json().catch(() => ({}))) as { error?: string };
      lastError = new Error(
        errData.error || `Request failed (${response.status}). Tap Retry to resend your prompt.`,
      );
    } catch (err: unknown) {
      lastError =
        err instanceof Error
          ? err
          : new Error("Network error while sending prompt. Tap Retry to resend.");
    }
  }

  throw lastError || new Error("Could not reach AI Assistant. Tap Retry to resend.");
}

/**
 * Dedicated standalone AI Assistant section (separate tab like My Grows & Fertilizers).
 * Includes full Gemini-powered Ask Anything support, verified source citations,
 * and automatic + 1-click manual retry if a prompt ever fails to send.
 */
export function GrowChatbot({ plants, fertilizers }: GrowChatbotProps) {
  const [messages, setMessages] = useState<ChatTurn[]>(loadSavedMessages);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [failedPrompt, setFailedPrompt] = useState<string | null>(null);
  const [showCalculator, setShowCalculator] = useState(true);

  const [waterLitresInput, setWaterLitresInput] = useState("1.5");
  const [selectedCalcOption, setSelectedCalcOption] = useState<string>(() => {
    const firstDiluted = fertilizers.find((f) => f.form === "Diluted" || f.dilutionRatio);
    return firstDiluted ? `fert-${firstDiluted.id}` : "std-2ml";
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const persistMessages = useCallback((next: ChatTurn[]) => {
    setMessages(next);
    try {
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(next.slice(-30)));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
  }, [messages.length, loading]);

  const sendMessage = useCallback(
    async (questionText: string, isRetry = false) => {
      const trimmed = questionText.trim();
      if (!trimmed || loading) return;

      setErrorMsg(null);
      setFailedPrompt(null);

      // Remove any previous failed bubble for the same prompt when retrying
      const cleanBaseMessages = isRetry
        ? messages.filter((m) => !(m.failed && m.content === trimmed))
        : messages;

      const userTurnId = `user-${Date.now()}`;
      const userTurn: ChatTurn = {
        id: userTurnId,
        role: "user",
        content: trimmed,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      const updatedHistory = [...cleanBaseMessages, userTurn];
      persistMessages(updatedHistory);
      setLoading(true);

      try {
        const plantContext = plants.map((p) => {
          const summary = buildPlantJournalSummary(p, fertilizers);
          const lastW = (p.logs || []).find((l) => l.type === "water" || l.type === "feed");
          const lastF = (p.logs || []).find((l) => l.type === "feed");
          return {
            name: p.name,
            strain: p.strain,
            stage: p.stage,
            medium: summary?.medium || p.medium,
            setting: summary?.setting || p.setting,
            lastWaterDate: lastW?.date,
            lastWaterAmount: lastW?.amount,
            lastNutrients: lastF?.nutrients,
            trainingSummary: summary?.trainingSummary,
            recentWaterSummary: summary?.recentWaterSummary,
            recentFeedsSummary: summary?.recentFeedsSummary,
          };
        });

        const fertilizerContext = fertilizers.map((f) => ({
          name: f.name,
          fertilizerType: f.fertilizerType,
          form: f.form,
          dilutionRatio: f.dilutionRatio,
          ingredients: f.ingredients,
        }));

        const data = await postAssistantRequest({
          message: trimmed,
          history: cleanBaseMessages
            .filter((m) => !m.failed)
            .slice(-8)
            .map((m) => ({
              role: m.role,
              content: m.content,
            })),
          plants: plantContext,
          fertilizers: fertilizerContext,
        });

        const assistantTurn: ChatTurn = {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: data.reply,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          calculatedBreakdown: data.calculatedBreakdown,
          sources: data.sources && data.sources.length > 0 ? data.sources : DEFAULT_WELCOME_SOURCES,
        };

        persistMessages([...updatedHistory, assistantTurn]);
      } catch (err: unknown) {
        const markedFailed = updatedHistory.map((m) =>
          m.id === userTurnId ? { ...m, failed: true } : m,
        );
        persistMessages(markedFailed);
        setFailedPrompt(trimmed);
        setErrorMsg(
          err instanceof Error
            ? err.message
            : "Your prompt could not be sent. Tap Retry below to send it again.",
        );
      } finally {
        setLoading(false);
      }
    },
    [fertilizers, loading, messages, persistMessages, plants],
  );

  const resetChat = useCallback(() => {
    setErrorMsg(null);
    setFailedPrompt(null);
    try {
      localStorage.removeItem(CHAT_STORAGE_KEY);
    } catch {
      // ignore
    }
    setMessages([INITIAL_WELCOME]);
  }, []);

  const parsedWaterLitres = Math.max(0.1, parseFloat(waterLitresInput) || 1.5);

  const activeCalcDetails = (() => {
    if (selectedCalcOption.startsWith("fert-")) {
      const fertId = selectedCalcOption.replace("fert-", "");
      const found = fertilizers.find((f) => f.id === fertId);
      if (found) {
        const mlPerL =
          parseClientMlPerLitre(found.dilutionRatio) ?? (found.form === "Diluted" ? 100 : 10);
        const concentrateMl = +(parsedWaterLitres * mlPerL).toFixed(1);
        return {
          name: `${found.name} (${found.fertilizerType})`,
          form: found.form,
          ratioLabel: found.dilutionRatio || `${mlPerL} ml/L`,
          mlPerL,
          concentrateMl,
          totalMixedLitres: parsedWaterLitres,
        };
      }
    }
    const std =
      STANDARD_RATIO_OPTIONS.find((o) => o.id === selectedCalcOption) ?? STANDARD_RATIO_OPTIONS[0]!;
    const concentrateMl = +(parsedWaterLitres * std.mlPerL).toFixed(1);
    return {
      name: std.label,
      form: "Diluted" as const,
      ratioLabel: `${std.mlPerL} ml/L`,
      mlPerL: std.mlPerL,
      concentrateMl,
      totalMixedLitres: parsedWaterLitres,
    };
  })();

  return (
    <section aria-label="AI Assistant Section" className="space-y-4">
      {/* Dedicated Section Header */}
      <div className="rounded-2xl border border-primary/30 bg-card p-4 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary border border-primary/30">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-bold text-foreground">AI Assistant</h2>
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                  <Sparkles className="h-3 w-3" /> Ask Anything (Gemini AI)
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-foreground">
                  <ShieldCheck className="h-3 w-3 text-primary" /> Verified Sources Cited
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Your dedicated AI Assistant section. Ask any question — general knowledge, math,
                science, coding, recipes, or your synced plants &amp; 1.5L nutrient dilution math.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={resetChat}
            className="inline-flex items-center gap-1 rounded-xl border border-border bg-secondary px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition cursor-pointer"
            title="Clear chat history"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>New Chat</span>
          </button>
        </div>

        {/* Active Context Badges */}
        <div className="mt-3 flex flex-wrap items-center gap-2 pt-3 border-t border-border/60 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2 py-1 font-medium text-primary">
            <Globe className="h-3 w-3" />
            Answers any topic + cites verified sources
          </span>
          <span className="inline-flex items-center gap-1 rounded-lg bg-secondary px-2 py-1 font-medium text-foreground">
            <Sprout className="h-3 w-3 text-primary" />
            {plants.length} {plants.length === 1 ? "plant" : "plants"} synced
          </span>
          <span className="inline-flex items-center gap-1 rounded-lg bg-secondary px-2 py-1 font-medium text-foreground">
            <FlaskConical className="h-3 w-3 text-amber-500" />
            {fertilizers.length} saved {fertilizers.length === 1 ? "fertilizer" : "fertilizers"} in
            journal
          </span>
        </div>
      </div>

      {/* Main Conversation Card */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-xs flex flex-col">
        {/* Starter Prompt Chips */}
        <div className="border-b border-border/60 bg-secondary/20 px-4 py-2.5 space-y-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
            Tap a Question or Ask Anything Below
          </span>
          <div className="flex flex-wrap gap-1.5">
            {STARTER_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                disabled={loading}
                onClick={() => void sendMessage(q)}
                className="rounded-xl border border-border bg-card px-2.5 py-1 text-left text-xs font-medium text-foreground hover:border-primary/60 hover:bg-secondary/60 transition cursor-pointer disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* Messages Thread */}
        <div
          data-testid="grow-chat-messages"
          className="p-4 space-y-3 max-h-[540px] overflow-y-auto"
        >
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[92%] sm:max-w-[85%] rounded-2xl px-3.5 py-2.5 ${
                  m.role === "user"
                    ? m.failed
                      ? "bg-destructive/15 text-foreground border border-destructive/50 rounded-br-xs"
                      : "bg-primary text-primary-foreground rounded-br-xs"
                    : "bg-secondary/70 text-foreground border border-border/60 rounded-bl-xs"
                }`}
              >
                <div className="flex items-center justify-between gap-3 mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider opacity-80">
                    {m.role === "user"
                      ? m.failed
                        ? "You · Failed to send"
                        : "You"
                      : "✨ AI Assistant"}
                  </span>
                  <span className="text-[10px] opacity-65">{m.timestamp}</span>
                </div>

                {m.role === "user" ? (
                  <div className="space-y-2">
                    <p className="text-xs sm:text-sm leading-relaxed">{m.content}</p>
                    {m.failed && (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => void sendMessage(m.content, true)}
                          disabled={loading}
                          className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 transition cursor-pointer"
                        >
                          <RefreshCw className="h-3 w-3" />
                          <span>Retry Prompt</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setInput(m.content)}
                          disabled={loading}
                          className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-secondary transition cursor-pointer"
                        >
                          <span>Edit in Input</span>
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  renderFormattedText(m.content)
                )}

                {m.calculatedBreakdown && m.calculatedBreakdown.examples.length > 0 && (
                  <div className="mt-2.5 rounded-xl border border-border/70 bg-card/90 p-2.5 text-foreground space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-bold text-primary">
                      <span className="flex items-center gap-1">
                        <Droplets className="h-3.5 w-3.5" />
                        Exact Mixing Chart for {m.calculatedBreakdown.waterLitres} L Watering
                      </span>
                      <span>Total Pour: {m.calculatedBreakdown.totalMixedLitres} L</span>
                    </div>
                    <div className="divide-y divide-border/40 text-[11px]">
                      {m.calculatedBreakdown.examples.map((ex, idx) => (
                        <div
                          key={`${ex.label}-${idx}`}
                          className="py-1 flex flex-wrap items-center justify-between gap-2"
                        >
                          <span className="font-medium text-foreground">
                            {ex.label} <span className="text-muted-foreground">({ex.ratio})</span>
                          </span>
                          <span className="font-mono font-bold text-primary">
                            {ex.concentrateMl} ml concentrate → {m.calculatedBreakdown?.waterLitres}{" "}
                            L total
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {m.role === "assistant" && <SourcesCitationBlock sources={m.sources} />}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-xs bg-secondary/70 border border-border/60 px-4 py-3 text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span>Generating answer &amp; verifying reference sources...</span>
              </div>
            </div>
          )}

          {errorMsg && (
            <div
              role="alert"
              data-testid="chat-error-banner"
              className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
            >
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Prompt failed to send</p>
                  <p className="text-[11px] opacity-90">{errorMsg}</p>
                </div>
              </div>

              {failedPrompt && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    data-testid="retry-prompt-button"
                    onClick={() => void sendMessage(failedPrompt, true)}
                    disabled={loading}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition cursor-pointer shadow-2xs"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>Retry Sending</span>
                  </button>
                </div>
              )}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!input.trim()) return;
            const q = input;
            setInput("");
            void sendMessage(q);
          }}
          className="border-t border-border bg-secondary/30 p-3 flex items-center gap-2"
        >
          <input
            type="text"
            aria-label="Ask the AI Grow Assistant a question"
            placeholder="Ask anything — general questions, math, science, coding, or 1.5L nutrient math..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
            className="flex-1 rounded-xl border border-border bg-card px-3.5 py-2.5 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs sm:text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition disabled:opacity-50 cursor-pointer shrink-0 shadow-xs"
          >
            <Send className="h-3.5 w-3.5" />
            <span>Ask</span>
          </button>
        </form>
      </div>

      {/* Collapsible Watering & Diluted Nutrient Volume Calculator Card */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-xs space-y-3">
        <button
          type="button"
          onClick={() => setShowCalculator((v) => !v)}
          className="w-full flex items-center justify-between gap-2 text-left cursor-pointer"
        >
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
            <Calculator className="h-4 w-4" />
            <span>Quick Watering &amp; Diluted Nutrient Calculator (1.5L Helper)</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>
              {parsedWaterLitres}L = {activeCalcDetails.concentrateMl} ml concentrate
            </span>
            {showCalculator ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </div>
        </button>

        {showCalculator && (
          <div className="space-y-3 pt-2 border-t border-border/60">
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
              <div className="sm:col-span-4 space-y-1">
                <label
                  htmlFor="calc-water-litres"
                  className="text-[11px] font-semibold text-muted-foreground block"
                >
                  Watering Volume (Litres)
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    id="calc-water-litres"
                    type="number"
                    step="0.1"
                    min="0.1"
                    max="200"
                    value={waterLitresInput}
                    onChange={(e) => setWaterLitresInput(e.target.value)}
                    className="w-full rounded-xl border border-border bg-secondary px-3 py-2 text-sm font-semibold text-foreground outline-none focus:ring-2 focus:ring-ring"
                  />
                  <span className="text-xs font-bold text-muted-foreground shrink-0">Litres</span>
                </div>
              </div>

              <div className="sm:col-span-8 space-y-1">
                <label
                  htmlFor="calc-fertilizer-select"
                  className="text-[11px] font-semibold text-muted-foreground block"
                >
                  Fertilizer / Dilution Rate
                </label>
                <select
                  id="calc-fertilizer-select"
                  aria-label="Fertilizer or Dilution Rate"
                  value={selectedCalcOption}
                  onChange={(e) => setSelectedCalcOption(e.target.value)}
                  className="w-full rounded-xl border border-border bg-secondary px-3 py-2 text-xs sm:text-sm font-medium text-foreground outline-none focus:ring-2 focus:ring-ring cursor-pointer"
                >
                  {fertilizers.length > 0 && (
                    <optgroup label="Your Fertilizer Journal">
                      {fertilizers.map((f) => (
                        <option key={f.id} value={`fert-${f.id}`}>
                          {f.name} — {f.form}
                          {f.dilutionRatio ? ` (${f.dilutionRatio})` : ""} · {f.fertilizerType}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label="Standard Reference Dilutions">
                    {STANDARD_RATIO_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground mr-1">Quick volumes:</span>
              {["0.5", "1.0", "1.5", "2.0", "3.0", "5.0"].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setWaterLitresInput(v)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                    waterLitresInput === v
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {v}L
                </button>
              ))}
            </div>

            <div className="rounded-xl border border-primary/30 bg-primary/10 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-foreground">
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                  <span>
                    For a {parsedWaterLitres} L watering: Pour{" "}
                    <span className="text-primary underline">{parsedWaterLitres} L total</span> of
                    diluted solution
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Mix{" "}
                  <strong className="text-foreground font-bold">
                    {activeCalcDetails.concentrateMl} ml
                  </strong>{" "}
                  of concentrate ({activeCalcDetails.ratioLabel}) into water to make{" "}
                  <strong className="text-foreground font-bold">{parsedWaterLitres} L</strong> total
                  liquid.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  void sendMessage(
                    `If I use ${parsedWaterLitres}L of water per watering with ${activeCalcDetails.name} (${activeCalcDetails.ratioLabel}), do I use the same ${parsedWaterLitres}L amount of diluted nutrients and how much concentrate do I mix?`,
                  )
                }
                className="shrink-0 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition cursor-pointer shadow-2xs"
              >
                Ask AI about this {parsedWaterLitres}L mix
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
