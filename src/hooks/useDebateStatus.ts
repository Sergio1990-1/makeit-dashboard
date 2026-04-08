import { useState, useEffect, useCallback, useRef } from "react";
import { getDebateStatus, getDebateResult, sendDebateMessage } from "../utils/debate";
import type { DebateStatus, DebateMessage, DebateResultResponse } from "../types/debate";

const POLL_MS = 3000;
const MAX_CONSECUTIVE_ERRORS = 5;

export function useDebateStatus(id: string | null) {
  const [status, setStatus] = useState<DebateStatus | null>(null);
  const [messages, setMessages] = useState<DebateMessage[]>([]);
  const [result, setResult] = useState<DebateResultResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sendingRef = useRef(false);

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    stopPolling();

    // Reset state for new debate id
    setStatus(null);
    setMessages([]);
    setResult(null);
    setError(null);
    setLoading(false);

    if (!id) return;

    let cancelled = false;
    let first = true;
    let errorCount = 0;
    const debateId = id;

    const poll = async () => {
      // Skip poll while sendMessage is in-flight to avoid race
      if (sendingRef.current) return;

      if (first) {
        first = false;
        setLoading(true);
      }
      try {
        const s = await getDebateStatus(debateId);
        if (cancelled) return;
        errorCount = 0;
        setStatus(s);
        setMessages(s.messages);
        setError(null);
        setLoading(false);

        if (s.status === "done") {
          stopPolling();
          try {
            const r = await getDebateResult(debateId);
            if (!cancelled) setResult(r);
          } catch (err) {
            if (!cancelled) setError(err instanceof Error ? err.message : "Ошибка загрузки результата");
          }
        } else if (s.status === "error") {
          stopPolling();
        }
      } catch (err) {
        if (cancelled) return;
        errorCount += 1;
        setError(err instanceof Error ? err.message : "Ошибка статуса дебата");
        setLoading(false);
        if (errorCount >= MAX_CONSECUTIVE_ERRORS) {
          stopPolling();
        }
      }
    };

    void poll();
    pollRef.current = setInterval(() => void poll(), POLL_MS);

    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [id, stopPolling]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!id) return;
      sendingRef.current = true;
      try {
        await sendDebateMessage(id, { content });
        const s = await getDebateStatus(id);
        setStatus(s);
        setMessages(s.messages);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка отправки сообщения");
      } finally {
        sendingRef.current = false;
      }
    },
    [id],
  );

  return { status, messages, result, loading, error, sendMessage };
}
