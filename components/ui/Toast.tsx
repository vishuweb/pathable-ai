"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

interface Toast {
  id: number;
  text: string;
  tone: "ok" | "error";
}

const ToastContext = createContext<(text: string, tone?: Toast["tone"]) => void>(() => {});

/** Short confirmations. Announced to screen readers from a live region that is always on the page, and never the only record of an error that needs action. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);
  const show = useCallback(
    (text: string, tone: Toast["tone"] = "ok") => {
      const id = ++next.current;
      setToasts((all) => [...all.slice(-2), { id, text, tone }]);
      // Long enough to read at a slow pace (WCAG 2.2.1 allows dismissal by hand as well).
      const timer = setTimeout(() => dismiss(id), 8000);
      timers.current.add(timer);
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`}>
            <Icon name={t.tone === "ok" ? "check" : "alert"} />
            <span>{t.text}</span>
            <button type="button" className="toast-close" onClick={() => dismiss(t.id)}>
              <Icon name="x" size={16} />
              <span className="visually-hidden">Dismiss</span>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
