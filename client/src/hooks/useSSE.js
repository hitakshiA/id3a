import { useCallback, useRef, useState } from 'react';

/**
 * POST + SSE consumer. The native EventSource API only supports GET, so we
 * use fetch + ReadableStream and parse SSE frames manually.
 */
export function usePostSSE() {
  const [running, setRunning] = useState(false);
  const ctrlRef = useRef(null);

  const start = useCallback(async ({ url, body, onEvent }) => {
    if (running) return;
    setRunning(true);
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    try {
      const res = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `stream open failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const frames = buf.split('\n\n');
        buf = frames.pop() ?? '';
        for (const frame of frames) {
          if (!frame.trim()) continue;
          let event = 'message', data = '';
          for (const line of frame.split('\n')) {
            if (line.startsWith('event:')) event = line.slice(6).trim();
            else if (line.startsWith('data:')) data += line.slice(5).trim();
          }
          try { onEvent?.({ event, payload: data ? JSON.parse(data) : {} }); } catch {}
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') onEvent?.({ event: 'error', payload: { error: e.message } });
    } finally {
      setRunning(false);
      ctrlRef.current = null;
    }
  }, [running]);

  const abort = useCallback(() => {
    ctrlRef.current?.abort();
    setRunning(false);
  }, []);

  return { start, abort, running };
}
