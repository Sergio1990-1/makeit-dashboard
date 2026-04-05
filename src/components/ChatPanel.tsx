import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import type { ChatMessage, ProjectData, SummaryMetrics, Issue } from "../types";
import { useChat } from "../hooks/useChat";
import { getClaudeKey, setClaudeKey, clearClaudeKey } from "../utils/config";

marked.setOptions({ breaks: true, gfm: true });

interface Props {
  open: boolean;
  onClose: () => void;
  projects: ProjectData[];
  summary: SummaryMetrics;
  blockedIssues: Issue[];
  onDataChanged?: () => void;
}

const QUICK_ACTIONS = [
  { label: "Утренний брифинг", prompt: "Дай утренний брифинг: что горит, топ-3 задачи на сегодня, финансы." },
  { label: "Что дальше?", prompt: "Что мне делать дальше? Учти приоритеты, дедлайны и stale проекты." },
  { label: "Кому счёт?", prompt: "По каким проектам нужно выставить счёт или напомнить об оплате?" },
  { label: "Статус для клиента", prompt: "Напиши краткий статус-апдейт для клиента PINS по проекту Sewing-ERP." },
];

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const html = useMemo(() => {
    if (msg.role === "user") return null;
    const raw = marked.parse(msg.content) as string;
    return DOMPurify.sanitize(raw);
  }, [msg.content, msg.role]);

  return (
    <div className={`chat-msg chat-msg-${msg.role}`}>
      {msg.role === "user" ? (
        <div className="chat-msg-content">{msg.content}</div>
      ) : (
        <div className="chat-msg-content chat-md" dangerouslySetInnerHTML={{ __html: html! }} />
      )}
      <span className="chat-msg-time">
        {msg.timestamp.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
      </span>
    </div>
  );
}

export function ChatPanel({ open, onClose, projects, summary, blockedIssues, onDataChanged }: Props) {
  const [input, setInput] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [hasKey, setHasKey] = useState(!!getClaudeKey());
  const messagesEnd = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { messages, loading, toolStatus, error, sendMessage, clearChat } = useChat({
    projects,
    summary,
    blockedIssues,
    onDataChanged,
  });

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const resetTextarea = useCallback(() => {
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !loading) {
      sendMessage(input.trim());
      setInput("");
      resetTextarea();
    }
  };

  const handleQuickAction = (prompt: string) => {
    if (!loading) sendMessage(prompt);
  };

  const handleSaveKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (keyInput.trim()) {
      setClaudeKey(keyInput.trim());
      setKeyInput("");
      setHasKey(true);
    }
  };

  const handleClearKey = () => {
    clearClaudeKey();
    setHasKey(false);
  };

  if (!open) return null;

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <span className="chat-title">AI Помощник</span>
        <div className="chat-header-actions">
          {hasKey && (
            <button onClick={handleClearKey} className="chat-btn-clear" title="Сбросить API ключ">
              🔑
            </button>
          )}
          {messages.length > 0 && (
            <button onClick={clearChat} className="chat-btn-clear" title="Очистить чат">
              ×
            </button>
          )}
          <button onClick={onClose} className="chat-btn-close">
            ✕
          </button>
        </div>
      </div>

      {!hasKey ? (
        <div className="chat-key-form">
          <p>Введите Anthropic API key для работы AI-помощника</p>
          <form onSubmit={handleSaveKey}>
            <input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="sk-ant-..."
              className="input"
            />
            <button type="submit" className="btn btn-primary">
              Сохранить
            </button>
          </form>
        </div>
      ) : (
        <>
          <div className="chat-messages">
            {messages.length === 0 && (
              <div className="chat-empty">
                <p>Привет! Я AI-помощник MakeIT.</p>
                <p>Спроси что-нибудь или выбери быстрое действие:</p>
                <div className="chat-quick-actions">
                  {QUICK_ACTIONS.map((a) => (
                    <button
                      key={a.label}
                      onClick={() => handleQuickAction(a.prompt)}
                      className="chat-quick-btn"
                      disabled={loading}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((msg, i) => (
              <MessageBubble key={i} msg={msg} />
            ))}
            {loading && (
              <div className="chat-loading">
                {toolStatus || "Думаю..."}
              </div>
            )}
            {error && <div className="chat-error">{error}</div>}
            <div ref={messagesEnd} />
          </div>

          <form onSubmit={handleSubmit} className="chat-input-row">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (input.trim() && !loading) {
                    handleSubmit(e);
                  }
                }
              }}
              placeholder="Спросить AI..."
              className="chat-input"
              disabled={loading}
              rows={1}
            />
            <button type="submit" disabled={loading || !input.trim()} className="chat-send">
              →
            </button>
          </form>
        </>
      )}
    </div>
  );
}
