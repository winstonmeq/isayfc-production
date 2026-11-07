"use client";
import { useEffect, useState } from "react";

export type ErrorRecoveryProps = { error: Error & { digest?: string }; reset: () => void; unstable_retry?: () => void; root?: boolean };
export function ErrorRecovery({ error, reset, unstable_retry, root = false }: ErrorRecoveryProps) {
  const [reference, setReference] = useState("");
  useEffect(() => {
    const id = globalThis.crypto?.randomUUID?.() || `error-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    setReference(id);
    void fetch("/api/system-errors", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reference: id, digest: error.digest, path: window.location.pathname, source: root ? "ROOT" : "PAGE" }) }).catch(() => {});
  }, [error, root]);
  const button = { border: "1px solid #cbd5e1", borderRadius: 8, padding: "10px 16px", cursor: "pointer", background: "#fff", color: "#0f172a", fontSize: 14 };
  return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, boxSizing: "border-box", background: "#f4f7fa", color: "#0f172a", fontFamily: "Arial, sans-serif" }}>
    <section role="alert" style={{ maxWidth: 520, padding: 32, border: "1px solid #e2e8f0", borderRadius: 16, background: "white" }}>
      <h1 style={{ fontSize: 24 }}>Unable to display this page</h1>
      <p>Please try loading the page again. If this happened while saving, check the transaction list before submitting again—the transaction may already be saved.</p>
      <p style={{ fontSize: 13, color: "#64748b", overflowWrap: "anywhere" }}>Reference: {reference || error.digest || "Preparing…"}{error.digest && reference ? ` · Server: ${error.digest}` : ""}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 20 }}>
        <button type="button" style={button} onClick={() => { if (unstable_retry) unstable_retry(); else reset(); }}>Try again</button>
        <button type="button" style={button} onClick={() => window.location.reload()}>Reload</button>
        <a style={{ ...button, textDecoration: "none" }} href="/login">Sign in</a>
      </div>
      <p style={{ fontSize: 13, color: "#64748b" }}>If it repeats, give this reference to your administrator. Unsaved entries may need to be entered again.</p>
    </section>
  </main>;
}
