import { useState, useCallback, useRef } from "react";
import type { ChatMessage, ProjectData, SummaryMetrics, Issue } from "../types";
import { sendChatMessage, type ClaudeMessage } from "../utils/claude";
import { getClaudeKey, getToken } from "../utils/config";

interface ChatContext {
  projects: ProjectData[];
  summary: SummaryMetrics;
  blockedIssues: Issue[];
}

const TOOL_LABELS: Record<string, string> = {
  read_project_docs: "Читаю документацию...",
  create_issue: "Создаю issue...",
  close_issue: "Закрываю issue...",
  add_labels: "Добавляю лейблы...",
  add_comment: "Пишу комментарий...",
  list_repo_issues: "Анализирую issues...",
  create_milestone: "Создаю milestone...",
  update_milestone: "Обновляю milestone...",
  assign_issue_to_milestone: "Привязываю issue к milestone...",
  list_milestones: "Загружаю milestones...",
};

export function useChat(context: ChatContext) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Use ref for context to avoid recreating sendMessage on every render
  const contextRef = useRef(context);
  contextRef.current = context;

  // Keep messages ref in sync to avoid stale closures in async handlers
  const messagesRef = useRef<ChatMessage[]>([]);

  // Guard against double submissions
  const sendingRef = useRef(false);

  const sendMessage = useCallback(
    async (text: string) => {
      // Pre-flight checks
      const apiKey = getClaudeKey();
      if (!apiKey) {
        setError("Claude API key не указан");
        return;
      }
      const ghToken = getToken();
      if (!ghToken) {
        setError("GitHub token не указан — AI-помощник не сможет работать с issues");
        return;
      }

      // Debounce guard
      if (sendingRef.current) return;
      sendingRef.current = true;

      const userMsg: ChatMessage = { role: "user", content: text, timestamp: new Date() };
      messagesRef.current = [...messagesRef.current, userMsg];
      setMessages(messagesRef.current);
      setLoading(true);
      setError(null);
      setToolStatus(null);

      try {
        const history: ClaudeMessage[] = messagesRef.current.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const response = await sendChatMessage(apiKey, history, contextRef.current, (toolName) => {
          setToolStatus(TOOL_LABELS[toolName] ?? `Использую ${toolName}...`);
        });

        const assistantMsg: ChatMessage = { role: "assistant", content: response, timestamp: new Date() };
        messagesRef.current = [...messagesRef.current, assistantMsg];
        setMessages(messagesRef.current);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ошибка Claude API");
      } finally {
        setLoading(false);
        setToolStatus(null);
        sendingRef.current = false;
      }
    },
    [] // stable — uses refs for context and functional state for messages
  );

  const clearChat = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return { messages, loading, toolStatus, error, sendMessage, clearChat };
}
