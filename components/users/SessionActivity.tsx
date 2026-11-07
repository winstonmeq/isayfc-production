"use client";
import { useEffect } from "react";

export function SessionActivity() {
  useEffect(() => {
    let lastSent = 0;
    const activity = () => {
      if (document.visibilityState !== "visible" || Date.now() - lastSent < 60000) return;
      lastSent = Date.now();
      void fetch("/api/session-activity", { method: "POST", credentials: "same-origin" }).catch(() => {});
    };
    activity();
    const events = ["pointerdown", "keydown", "scroll", "focus"] as const;
    for (const name of events) window.addEventListener(name, activity, { passive: true });
    return () => { for (const name of events) window.removeEventListener(name, activity); };
  }, []);
  return null;
}
