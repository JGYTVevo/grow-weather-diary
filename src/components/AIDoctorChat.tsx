import React, { useState, useEffect, useRef } from "react";
import {
  sendDoctorChatMessage,
  type DoctorChatMessage,
  type DoctorChatContext,
} from "@/lib/gemini";
import type { Plant } from "@/hooks/use-plants";
import {
  Send,
  Bot,
  User,
  Sparkles,
  Trash2,
  Copy,
  Check,
  Sprout,
  AlertCircle,
  HelpCircle,
  RefreshCw,
  PlusCircle,
  ArrowRight,
  ShieldAlert,
} from "lucide-react";

const CHAT_STORAGE_KEY = "growbuddy-doctor-chat-history-v2";

export interface AIDoctorChatProps {
  plants?: Plant[];
  activePlantId?: string | null;
  initialContext?: DoctorChatContext;
  onLogAdviceToPlant?: (
    plantIds: string[],
    logData: { note: string; photo?: string },
  ) => Promise<void> | void;
}

export const AIDoctorChat: React.FC<AIDoctorChatProps> = ({
  plants = [],
  activePlantId = null,
  initialContext,
  onLogAdviceToPlant,
}) => {
  const [selectedPlantId, setSelectedPlantId] = useState<string>(() => {
    if (activePlantId) return activePlantId;
    if (plants.length > 0) return plants[0]!.id;
    return "";
  });

  const activePlant = plants.find((p) => p.id === selectedPlantId);

  // Maintain active diagnostic context (can be populated from visual scan)
  const [context, setContext] = useState<DoctorChatContext>(() => {
    if (initialContext) return initialContext;
    return {
      plantName: activePlant?.name || "My Plant",
      stage: activePlant?.stage || "Vegetative",
      medium: activePlant?.medium || "Soil",
    };
  });

  // Keep context in sync if initialContext or activePlant changes
  useEffect(() => {
    if (initialContext) {
      setContext(initialContext);
    } else if (activePlant) {
      setContext((prev) => ({
        ...prev,
        plantName: activePlant.name,
        stage: activePlant.stage,
        medium: activePlant.medium,
      }));
    }
  }, [initialContext, activePlant]);

  const [messages, setMessages] = useState<DoctorChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem(CHAT_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }

    // Default welcome message
    const plantName = initialContext?.plantName || activePlant?.name || "your plants";
    const condition = initialContext?.activeCondition;

    return [
      {
        id: "welcome-1",
        role: "model",
        text: `### 👨‍⚕️ Welcome to GrowBuddy AI Doctor Chat!

I'm your dedicated botanical pathologist and cannabis cultivation consultant.

${
  condition
    ? `I have your latest scan results for **${plantName}** (${condition}). Ask me for targeted organic remediation steps, recovery timelines, or preventative measures!`
    : `Ask me anything about **pests, nutrient deficiencies, pH/EC lockout, lighting/VPD, organic remedies**, or day-to-day canopy care for **${plantName}**.`
}

Tap one of the quick questions below or type your inquiry!`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        source: "botanical-knowledge-base",
      },
    ];
  });

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [loggedId, setLoggedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Save history to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
    } catch {
      // ignore
    }
  }, [messages]);

  // Auto-scroll on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handlePlantChange = (newId: string) => {
    setSelectedPlantId(newId);
    const p = plants.find((x) => x.id === newId);
    if (p) {
      setContext((prev) => ({
        ...prev,
        plantName: p.name,
        stage: p.stage,
        medium: p.medium,
      }));
    }
  };

  const handleSend = async (textToSend?: string) => {
    const query = (textToSend ?? input).trim();
    if (!query || loading) return;

    const userMessage: DoctorChatMessage = {
      id: "msg-" + Date.now() + "-user",
      role: "user",
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);

    try {
      // Build conversation turns for server
      const chatTurns = updatedMessages.map((m) => ({
        role: m.role,
        text: m.text,
      }));

      const res = await sendDoctorChatMessage({
        messages: chatTurns,
        context: {
          ...context,
          plantName: context.plantName || activePlant?.name || "Plant",
          stage: context.stage || activePlant?.stage || "Vegetative",
          medium: context.medium || activePlant?.medium || "Soil",
        },
      });

      const modelMessage: DoctorChatMessage = {
        id: "msg-" + Date.now() + "-model",
        role: "model",
        text: res.text,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        source: res.source,
      };

      setMessages((prev) => [...prev, modelMessage]);
    } catch (err: unknown) {
      const errorMessage: DoctorChatMessage = {
        id: "msg-" + Date.now() + "-err",
        role: "model",
        text: `### ⚠️ Consultation Note\n\n${
          err instanceof Error ? err.message : "Unable to reach diagnostic engine."
        }\n\nPlease check your connection or retry in a few moments.`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        source: "botanical-knowledge-base",
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 50);
    }
  };

  const handleClearHistory = () => {
    if (window.confirm("Clear consultation history?")) {
      const resetMsg: DoctorChatMessage = {
        id: "welcome-reset",
        role: "model",
        text: `### 👨‍⚕️ Consultation Reset\n\nFresh session started for **${
          context.plantName || "your plant"
        }**. What symptoms or cultivation questions would you like to investigate?`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        source: "botanical-knowledge-base",
      };
      setMessages([resetMsg]);
      localStorage.removeItem(CHAT_STORAGE_KEY);
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleLogToPlant = async (id: string, text: string) => {
    if (!onLogAdviceToPlant || !selectedPlantId) return;
    const plantName = activePlant?.name || "Plant";
    const summary = text.slice(0, 160).replace(/[#*`_]/g, "");
    await onLogAdviceToPlant([selectedPlantId], {
      note: `[AI Doctor Advice for ${plantName}]: ${summary}...`,
    });
    setLoggedId(id);
    setTimeout(() => setLoggedId(null), 3000);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Quick starter suggestions based on context
  const getPromptSuggestions = () => {
    const cond = context.activeCondition?.toLowerCase() || "";
    if (cond.includes("mite") || cond.includes("pest") || cond.includes("thrip")) {
      return [
        "What organic foliar spray kills them safely?",
        "How often should I apply treatments?",
        "Can I spray this during late flowering?",
        "Will this pest spread to my other plants?",
      ];
    }
    if (cond.includes("lockout") || cond.includes("ph") || cond.includes("cal-mag")) {
      return [
        `What's the exact target pH for ${context.medium || "my substrate"}?`,
        "How do I flush salt buildup without shocking roots?",
        "How to distinguish calcium lockout from magnesium deficiency?",
        "What EC / PPM level should I feed next?",
      ];
    }
    if (cond.includes("mildew") || cond.includes("mold")) {
      return [
        "How do I kill powdery mildew without harming flowers?",
        "What humidity and airflow prevents mold recurrence?",
        "Is potassium bicarbonate safe to spray?",
        "Should I prune affected lower leaves?",
      ];
    }
    return [
      "How to fix Cal-Mag deficiency and leaf spotting?",
      `Optimal pH & EC for ${context.medium || "Soil"} in ${context.stage || "Flower"}?`,
      "How to lower VPD and heat stress?",
      "Signs of overwatering vs underwatering?",
      "When is the best time to defoliate in flower?",
    ];
  };

  // Simple Markdown renderer for structured medical answers
  const renderFormattedText = (raw: string) => {
    const lines = raw.split("\n");
    return (
      <div className="space-y-2 text-sm leading-relaxed">
        {lines.map((line, idx) => {
          const trimmed = line.trim();
          if (!trimmed) {
            return <div key={idx} className="h-1.5" />;
          }

          // Headers
          if (trimmed.startsWith("### ")) {
            return (
              <h4
                key={idx}
                className="text-base font-bold text-foreground mt-2 mb-1 flex items-center gap-1.5"
              >
                {trimmed.replace(/^###\s+/, "")}
              </h4>
            );
          }
          if (trimmed.startsWith("## ")) {
            return (
              <h3 key={idx} className="text-lg font-bold text-foreground mt-3 mb-1.5">
                {trimmed.replace(/^##\s+/, "")}
              </h3>
            );
          }
          if (trimmed.startsWith("# ")) {
            return (
              <h2 key={idx} className="text-xl font-bold text-foreground mt-3 mb-2">
                {trimmed.replace(/^#\s+/, "")}
              </h2>
            );
          }

          // Bullet points
          if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
            const content = trimmed.replace(/^[-*]\s+/, "");
            return (
              <div key={idx} className="flex items-start gap-2 pl-2">
                <span className="text-primary mt-1 text-xs">•</span>
                <span className="flex-1 text-foreground/90">{parseInlineStyles(content)}</span>
              </div>
            );
          }

          // Numbered lists
          const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
          if (numMatch) {
            return (
              <div key={idx} className="flex items-start gap-2 pl-2">
                <span className="text-xs font-bold text-primary mt-0.5">{numMatch[1]}.</span>
                <span className="flex-1 text-foreground/90">
                  {parseInlineStyles(numMatch[2] ?? "")}
                </span>
              </div>
            );
          }

          return (
            <p key={idx} className="text-foreground/90">
              {parseInlineStyles(trimmed)}
            </p>
          );
        })}
      </div>
    );
  };

  const parseInlineStyles = (text: string): React.ReactNode => {
    // Bold parsing (**bold**)
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, index) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={index} className="font-semibold text-foreground">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return part;
    });
  };

  return (
    <div className="flex flex-col h-[700px] max-h-[85vh] rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      {/* Chat Header */}
      <div className="flex flex-col gap-2 p-4 border-b border-border bg-card/60 backdrop-blur-xs">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/20 text-primary">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground">AI Doctor Consultation</h3>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Online
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Powered by Gemini 3.8 Flash & Botanical Pathologist Knowledge Base
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handleClearHistory}
              title="Clear conversation history"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Plant Context Pill Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/50 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider">
              <Sprout className="h-3 w-3 text-primary" />
              Patient:
            </span>

            {plants.length > 0 ? (
              <select
                value={selectedPlantId}
                onChange={(e) => handlePlantChange(e.target.value)}
                className="h-7 rounded-lg border border-border bg-background px-2 text-xs font-semibold text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
              >
                {plants.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.stage})
                  </option>
                ))}
              </select>
            ) : (
              <span className="font-semibold text-foreground">
                {context.plantName || "General Consultation"}
              </span>
            )}

            <span className="rounded-md bg-secondary px-2 py-0.5 text-[11px] font-medium text-foreground">
              {context.stage || "Active Stage"}
            </span>

            <span className="rounded-md bg-secondary px-2 py-0.5 text-[11px] font-medium text-foreground">
              {context.medium || "Soil"}
            </span>

            {context.activeCondition && (
              <span className="inline-flex items-center gap-1 rounded-md bg-destructive/10 text-destructive border border-destructive/20 px-2 py-0.5 text-[11px] font-semibold">
                <ShieldAlert className="h-3 w-3" />
                {context.activeCondition}
                {context.healthScore !== undefined && ` (${context.healthScore}%)`}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((m) => {
          const isUser = m.role === "user";
          return (
            <div
              key={m.id}
              className={`flex items-start gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}
            >
              {/* Avatar */}
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${
                  isUser
                    ? "bg-primary text-primary-foreground"
                    : "bg-primary/20 text-primary border border-primary/30"
                }`}
              >
                {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
              </div>

              {/* Message Bubble */}
              <div className={`max-w-[85%] space-y-1.5 ${isUser ? "items-end text-right" : ""}`}>
                <div
                  className={`rounded-2xl px-4 py-3 text-sm shadow-xs ${
                    isUser
                      ? "bg-primary text-primary-foreground rounded-tr-xs"
                      : "bg-secondary/70 text-foreground border border-border rounded-tl-xs"
                  }`}
                >
                  {isUser ? (
                    <p className="whitespace-pre-wrap">{m.text}</p>
                  ) : (
                    renderFormattedText(m.text)
                  )}
                </div>

                {/* Footer info: Timestamp, source & action buttons */}
                <div
                  className={`flex items-center gap-2 text-[10px] text-muted-foreground px-1 ${
                    isUser ? "justify-end" : "justify-start"
                  }`}
                >
                  <span>{m.timestamp}</span>

                  {!isUser && m.source && (
                    <span className="rounded-full bg-card px-1.5 py-0.5 border border-border text-[9px] font-medium">
                      {m.source === "gemini-3.8-flash" ? "⚡ Gemini 3.8 Flash" : "📚 Botanical KB"}
                    </span>
                  )}

                  {!isUser && (
                    <>
                      <button
                        onClick={() => handleCopy(m.id, m.text)}
                        title="Copy answer"
                        className="p-1 hover:text-foreground transition rounded"
                      >
                        {copiedId === m.id ? (
                          <Check className="h-3 w-3 text-emerald-500" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </button>

                      {onLogAdviceToPlant && selectedPlantId && (
                        <button
                          onClick={() => handleLogToPlant(m.id, m.text)}
                          title="Save key advice to plant diary log"
                          className="inline-flex items-center gap-0.5 hover:text-primary transition rounded text-[10px] font-medium"
                        >
                          {loggedId === m.id ? (
                            <span className="text-emerald-500 font-semibold flex items-center gap-0.5">
                              <Check className="h-3 w-3" /> Saved!
                            </span>
                          ) : (
                            <span className="flex items-center gap-0.5">
                              <PlusCircle className="h-3 w-3" /> Log to Diary
                            </span>
                          )}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* Loading Bubble */}
        {loading && (
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/20 text-primary border border-primary/30">
              <Bot className="h-4 w-4 animate-spin" />
            </div>
            <div className="rounded-2xl rounded-tl-xs bg-secondary/70 border border-border px-4 py-3 shadow-xs">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="flex gap-1">
                  <span className="h-2 w-2 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
                  <span className="h-2 w-2 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
                  <span className="h-2 w-2 rounded-full bg-primary animate-bounce" />
                </span>
                <span>Dr. GrowBuddy is diagnosing symptoms & consulting botanical formulas…</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Quick Question Chips */}
      <div className="border-t border-border bg-card/40 px-3 py-2 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1.5 w-max">
          <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1 pr-1">
            <HelpCircle className="h-3 w-3 text-primary" />
            Quick:
          </span>
          {getPromptSuggestions().map((sugg, i) => (
            <button
              key={i}
              type="button"
              disabled={loading}
              onClick={() => handleSend(sugg)}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/80 hover:bg-secondary px-2.5 py-1 text-xs text-foreground font-medium transition active:scale-95 whitespace-nowrap cursor-pointer disabled:opacity-50"
            >
              <span>{sugg}</span>
              <ArrowRight className="h-2.5 w-2.5 opacity-60" />
            </button>
          ))}
        </div>
      </div>

      {/* Input Form */}
      <div className="p-3 border-t border-border bg-card">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-end gap-2"
        >
          <div className="relative flex-1">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Ask Dr. GrowBuddy about symptoms, pests, nutrients, or ${context.plantName || "your plant"}…`}
              className="w-full resize-none rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40 leading-snug max-h-32 min-h-[44px]"
            />
          </div>

          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground font-semibold shadow-xs hover:bg-primary/90 disabled:opacity-40 transition active:scale-95 cursor-pointer"
            title="Send inquiry"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
        <p className="text-[10px] text-muted-foreground text-center mt-1.5">
          Press{" "}
          <kbd className="rounded border border-border bg-secondary px-1 text-[9px]">Enter</kbd> to
          send,{" "}
          <kbd className="rounded border border-border bg-secondary px-1 text-[9px]">
            Shift+Enter
          </kbd>{" "}
          for new line
        </p>
      </div>
    </div>
  );
};
