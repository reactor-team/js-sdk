"use client";

import { useState, useEffect, useRef } from "react";

const PASSCODE = process.env.NEXT_PUBLIC_PASSCODE ?? "letsgolingbot";
const STORAGE_KEY = "lingbot-unlocked";

export function PasscodeGate({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState(false);
  const [checked, setChecked] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === "1") setUnlocked(true);
    } catch {}
    setChecked(true);
  }, []);

  useEffect(() => {
    if (checked && !unlocked) inputRef.current?.focus();
  }, [checked, unlocked]);

  if (!checked) return null;
  if (unlocked) return <>{children}</>;

  function submit() {
    if (value === PASSCODE) {
      try { localStorage.setItem(STORAGE_KEY, "1"); } catch {}
      setUnlocked(true);
    } else {
      setError(true);
      setValue("");
      setTimeout(() => setError(false), 1200);
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ backgroundColor: "#000" }}>
      <style>{`
        .dot-grid {
          background-image: radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px);
          background-size: 28px 28px;
        }
        @keyframes shake {
          0%,100% { transform: translateX(0); }
          20%,60% { transform: translateX(-6px); }
          40%,80% { transform: translateX(6px); }
        }
        .shake { animation: shake 0.4s ease; }
      `}</style>
      <div className="dot-grid absolute inset-0 pointer-events-none" />
      <div className="absolute inset-0 pointer-events-none" style={{
        background: "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(199,192,153,0.12), transparent)"
      }} />

      <div className="relative z-10 flex flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/30">Lingbot</span>
          <span className="font-mono text-white/60 text-sm">Enter passcode to continue</span>
        </div>

        <div className={`flex flex-col gap-3 ${error ? "shake" : ""}`}>
          <input
            ref={inputRef}
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="passcode"
            autoComplete="off"
            spellCheck={false}
            className="bg-white/5 border rounded px-4 py-2.5 text-white font-mono text-sm placeholder-white/20 focus:outline-none text-center w-56"
            style={{
              borderColor: error ? "rgba(239,68,68,0.5)" : "rgba(255,255,255,0.12)",
              transition: "border-color 0.2s",
            }}
          />
          <button
            onClick={submit}
            className="rounded px-4 py-2 font-mono text-xs uppercase tracking-widest transition-colors"
            style={{
              background: "rgba(255,255,255,0.08)",
              color: "rgba(255,255,255,0.6)",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
            onMouseOver={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.13)")}
            onMouseOut={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
          >
            Enter
          </button>
          {error && (
            <span className="font-mono text-[11px] text-red-400/70 text-center">Incorrect passcode</span>
          )}
        </div>
      </div>
    </div>
  );
}
