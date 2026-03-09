"use client";

export function PositionsTableCard() {
  return (
    <article className="animate-rise rounded-[2rem] border border-[var(--line)] bg-[var(--panel)] p-6 shadow-card backdrop-blur [animation-delay:320ms]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">
            Positions
          </p>
          <h2 className="mt-2 font-[var(--font-display)] text-3xl">Open exposure</h2>
        </div>
        <span className="rounded-full bg-[var(--sand)] px-3 py-1 text-xs font-medium text-[var(--ink)]">
          Shell
        </span>
      </div>

      <div className="mt-5 overflow-hidden rounded-[1.5rem] border border-[var(--line)] bg-white/70">
        <div className="grid grid-cols-[1.4fr_0.8fr_0.8fr_0.8fr_0.8fr] gap-3 border-b border-[var(--line)] px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
          <span>Market</span>
          <span>Side</span>
          <span>Size</span>
          <span>PnL</span>
          <span>Status</span>
        </div>
        <div className="px-4 py-8 text-sm text-[var(--muted)]">
          Account and position endpoints are not exposed by the engine HTTP surface
          yet. This table is intentionally in place so the next pass can drop live
          rows into the existing layout instead of redesigning the terminal.
        </div>
      </div>
    </article>
  );
}
