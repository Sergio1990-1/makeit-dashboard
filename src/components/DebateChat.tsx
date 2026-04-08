import { useState, useEffect, useRef, useMemo } from "react";
import { useDebateStatus } from "../hooks/useDebateStatus";
import type { DebateMessage, DebateParticipant, DebateResultResponse } from "../types/debate";

/* ── Provider meta ── */

const PROVIDER_META: Record<string, { color: string; icon: string; label: string }> = {
  anthropic: { color: "#D97706", icon: "A", label: "Claude" },
  openai:    { color: "#10A37F", icon: "O", label: "GPT-4o" },
  gemini:    { color: "#4285F4", icon: "G", label: "Gemini Pro" },
};

const ROLE_LABEL: Record<string, string> = {
  architect: "Architect",
  critic: "Critic",
  practitioner: "Practitioner",
};

const ROUND_LABEL: Record<string, string> = {
  proposal: "Proposals",
  critique: "Critique",
  synthesis: "Synthesis",
};

/* ── Helpers ── */

function senderName(sender: DebateMessage["sender"]): string {
  if (sender === "user") return "You (Moderator)";
  if (sender === "system") return "System";
  const meta = PROVIDER_META[sender.provider];
  const role = ROLE_LABEL[sender.role] ?? sender.role;
  return `${meta?.label ?? sender.provider} (${role})`;
}

function senderColor(sender: DebateMessage["sender"]): string {
  if (sender === "user") return "var(--color-text-secondary)";
  if (sender === "system") return "var(--color-text-muted)";
  return PROVIDER_META[sender.provider]?.color ?? "var(--color-text)";
}

function senderAvatar(sender: DebateMessage["sender"]): { letter: string; bg: string } {
  if (sender === "user") return { letter: "U", bg: "var(--color-primary)" };
  if (sender === "system") return { letter: "S", bg: "var(--color-text-muted)" };
  const meta = PROVIDER_META[sender.provider];
  return { letter: meta?.icon ?? "?", bg: meta?.color ?? "#666" };
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function simpleMarkdown(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\n/g, "<br/>");
}

function stageLabel(stage: string): string {
  const map: Record<string, string> = {
    context_gathering: "Context Gathering",
    round_1: "Round 1",
    round_2: "Round 2",
    round_3: "Round 3",
    synthesis: "Synthesis",
    finalizing: "Finalizing",
  };
  return map[stage] ?? stage;
}

/* ── Components ── */

interface Props {
  debateId: string;
  onBack: () => void;
}

export function DebateChat({ debateId, onBack }: Props) {
  const { status, messages, result, loading, error, sendMessage } = useDebateStatus(debateId);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatAreaRef = useRef<HTMLDivElement>(null);

  /* Auto-scroll */
  useEffect(() => {
    if (autoScroll && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, autoScroll]);

  /* Detect manual scroll-up to disable auto-scroll */
  useEffect(() => {
    const el = chatAreaRef.current;
    if (!el) return;
    const onScroll = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
      setAutoScroll(atBottom);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  /* Group messages by round for dividers */
  const groupedMessages = useMemo(() => {
    const groups: { roundKey: string | null; msgs: DebateMessage[] }[] = [];
    let currentRound: string | null = null;

    for (const msg of messages) {
      const roundKey = msg.round != null && msg.round_type
        ? `${msg.round}-${msg.round_type}`
        : null;

      if (roundKey !== currentRound) {
        currentRound = roundKey;
        groups.push({ roundKey, msgs: [msg] });
      } else {
        groups[groups.length - 1].msgs.push(msg);
      }
    }
    return groups;
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setInput("");
    try {
      await sendMessage(text);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isRunning = status?.status === "running";
  const isDone = status?.status === "done";
  const isError = status?.status === "error";

  return (
    <div className="dc-container">
      {/* ── Header ── */}
      <div className="dc-header">
        <div className="dc-header-left">
          <button className="btn btn-sm" onClick={onBack}>&larr; Назад</button>
          <div className="dc-header-info">
            <span className="dc-header-id" title={debateId}>
              {debateId.slice(0, 8)}...
            </span>
            {status && (
              <span className={`debate-badge badge-${status.status}`}>
                {status.status === "running" ? "Running" : status.status === "done" ? "Done" : status.status === "error" ? "Error" : "Queued"}
              </span>
            )}
          </div>
        </div>

        {status && isRunning && (
          <div className="dc-progress">
            <div className="dc-progress-bar">
              <div
                className="dc-progress-fill"
                style={{ width: `${status.progress}%` }}
              />
            </div>
            <span className="dc-progress-text">
              {stageLabel(status.stage)} &middot; R{status.current_round}/3 &middot; {status.progress}%
            </span>
          </div>
        )}

        {status && isRunning && status.current_speaker && (
          <ParticipantsBar
            currentSpeaker={status.current_speaker}
            messages={messages}
          />
        )}
      </div>

      {/* ── Loading / Error ── */}
      {loading && (
        <div className="dc-loading">Загрузка дебата...</div>
      )}
      {error && <div className="error-banner" style={{ margin: "0 16px" }}>{error}</div>}

      {/* ── Chat Area ── */}
      <div className="dc-chat-area" ref={chatAreaRef}>
        {groupedMessages.map((group, gi) => (
          <div key={gi}>
            {group.roundKey && group.msgs[0].round != null && group.msgs[0].round_type && (
              <div className="dc-round-divider">
                <span>Round {group.msgs[0].round}: {ROUND_LABEL[group.msgs[0].round_type] ?? group.msgs[0].round_type}</span>
              </div>
            )}
            {group.msgs.map((msg) => (
              <ChatMessage
                key={msg.id}
                message={msg}
                isCurrentSpeaker={
                  isRunning &&
                  typeof msg.sender === "object" &&
                  status?.current_speaker === `${msg.sender.provider}:${msg.sender.role}`
                }
              />
            ))}
          </div>
        ))}

        {/* Typing indicator */}
        {isRunning && status?.current_speaker && (
          <TypingIndicator speaker={status.current_speaker} />
        )}

        {/* ── Consensus block ── */}
        {isDone && result && (
          <ConsensusBlock result={result} />
        )}

        {/* ── Error block ── */}
        {isError && (
          <div className="dc-error-block">
            <span>Дебат завершился с ошибкой</span>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* ── Input ── */}
      {(isRunning || status?.status === "queued") && (
        <div className="dc-input-bar">
          <textarea
            className="dc-input"
            placeholder="Вмешаться в дебат как модератор..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={sending}
          />
          <button
            className="btn btn-sm btn-primary"
            onClick={handleSend}
            disabled={!input.trim() || sending}
          >
            {sending ? "..." : "Send"}
          </button>
        </div>
      )}
    </div>
  );
}

/* ── ChatMessage ── */

function ChatMessage({ message, isCurrentSpeaker }: { message: DebateMessage; isCurrentSpeaker: boolean }) {
  const isUser = message.sender === "user";
  const isSystem = message.sender === "system";
  const avatar = senderAvatar(message.sender);
  const color = senderColor(message.sender);
  const name = senderName(message.sender);

  return (
    <div className={`dc-message ${isUser ? "dc-message--user" : ""} ${isSystem ? "dc-message--system" : ""} ${isCurrentSpeaker ? "dc-message--speaking" : ""}`}>
      <div className="dc-avatar" style={{ background: avatar.bg }}>
        {avatar.letter}
      </div>
      <div className="dc-message-body">
        <div className="dc-message-meta">
          <span className="dc-sender" style={{ color }}>{name}</span>
          <span className="dc-time">{formatTime(message.timestamp)}</span>
        </div>
        <div
          className="dc-content"
          dangerouslySetInnerHTML={{ __html: simpleMarkdown(message.content) }}
        />
      </div>
    </div>
  );
}

/* ── TypingIndicator ── */

function TypingIndicator({ speaker }: { speaker: string }) {
  const [provider, role] = speaker.split(":");
  const meta = PROVIDER_META[provider];
  const roleLabel = ROLE_LABEL[role] ?? role;
  const avatar = { letter: meta?.icon ?? "?", bg: meta?.color ?? "#666" };

  return (
    <div className="dc-message dc-message--typing">
      <div className="dc-avatar" style={{ background: avatar.bg }}>
        {avatar.letter}
      </div>
      <div className="dc-message-body">
        <span className="dc-sender" style={{ color: meta?.color ?? "inherit" }}>
          {meta?.label ?? provider} ({roleLabel})
        </span>
        <div className="dc-typing-dots">
          <span /><span /><span />
        </div>
      </div>
    </div>
  );
}

/* ── ParticipantsBar ── */

function ParticipantsBar({ currentSpeaker, messages }: { currentSpeaker: string; messages: DebateMessage[] }) {
  const participants = useMemo(() => {
    const seen = new Map<string, DebateParticipant>();
    for (const msg of messages) {
      if (typeof msg.sender === "object") {
        const key = `${msg.sender.provider}:${msg.sender.role}`;
        if (!seen.has(key)) seen.set(key, msg.sender);
      }
    }
    return [...seen.entries()];
  }, [messages]);

  if (participants.length === 0) return null;

  return (
    <div className="dc-participants">
      {participants.map(([key, p]) => {
        const meta = PROVIDER_META[p.provider];
        const isActive = key === currentSpeaker;
        return (
          <div
            key={key}
            className={`dc-participant ${isActive ? "dc-participant--active" : ""}`}
            title={`${meta?.label ?? p.provider} (${ROLE_LABEL[p.role] ?? p.role})`}
          >
            <div className="dc-participant-dot" style={{ background: meta?.color ?? "#666" }} />
            <span>{ROLE_LABEL[p.role] ?? p.role}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ── ConsensusBlock ── */

function ConsensusBlock({ result }: { result: DebateResultResponse }) {
  const [showDissent, setShowDissent] = useState(false);
  const dr = result.debate_result;
  const costs = result.cost_summary;

  return (
    <div className="dc-consensus">
      <div className="dc-consensus-header">Consensus</div>
      <div
        className="dc-consensus-text"
        dangerouslySetInnerHTML={{ __html: simpleMarkdown(dr.consensus) }}
      />

      {dr.dissenting_opinions.length > 0 && (
        <div className="dc-dissent">
          <button
            className="dc-dissent-toggle"
            onClick={() => setShowDissent(!showDissent)}
          >
            {showDissent ? "▾" : "▸"} Dissenting opinions ({dr.dissenting_opinions.length})
          </button>
          {showDissent && (
            <div className="dc-dissent-list">
              {dr.dissenting_opinions.map((d, i) => (
                <div key={i} className="dc-dissent-item" dangerouslySetInnerHTML={{ __html: simpleMarkdown(d) }} />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="dc-cost-summary">
        <div className="dc-cost-header">Cost breakdown</div>
        <div className="dc-cost-grid">
          {Object.entries(costs.cost_per_provider).map(([provider, cost]) => {
            const meta = PROVIDER_META[provider];
            return (
              <div key={provider} className="dc-cost-row">
                <span style={{ color: meta?.color ?? "inherit" }}>
                  {meta?.label ?? provider}
                </span>
                <span className="dc-cost-value">${Number(cost).toFixed(4)}</span>
              </div>
            );
          })}
          <div className="dc-cost-row dc-cost-total">
            <span>Total</span>
            <span className="dc-cost-value">${costs.total_cost.toFixed(4)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
