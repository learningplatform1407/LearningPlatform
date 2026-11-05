"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

import { motion } from "@lp/ui";

type ShowToast = (message: string) => void;

const ToastContext = createContext<ShowToast | null>(null);

/** One transient message at a time, top-centre (design.md §13). Announced
 * politely to screen readers; never steals focus or blocks the page. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const show = useCallback<ShowToast>((next) => {
    clearTimeout(timer.current);
    setMessage(next);
    setVisible(true);
    timer.current = setTimeout(() => setVisible(false), motion.toastHoldMs);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className={`pointer-events-none fixed top-[76px] left-1/2 z-[80] max-w-[calc(100vw-32px)] -translate-x-1/2 rounded-full bg-foreground px-3.5 py-2 text-center text-sm font-semibold text-background transition-opacity duration-200 ${
          visible && message ? "opacity-95" : "opacity-0"
        }`}
      >
        {message}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ShowToast {
  const show = useContext(ToastContext);
  if (!show) throw new Error("useToast must be used inside ToastProvider");
  return show;
}
