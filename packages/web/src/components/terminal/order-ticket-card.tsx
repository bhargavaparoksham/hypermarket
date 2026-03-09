"use client";

import type { TerminalMarket } from "./types";
import { compactNumber, leverageMarks, orderSides } from "./formatters";

interface OrderTicketCardProps {
  selectedMarket: TerminalMarket | null;
  ticketSide: (typeof orderSides)[number];
  leverage: number;
  onSideChange: (side: (typeof orderSides)[number]) => void;
  onLeverageChange: (value: number) => void;
}

export function OrderTicketCard({
  selectedMarket,
  ticketSide,
  leverage,
  onSideChange,
  onLeverageChange
}: OrderTicketCardProps) {
  return (
    <article className="animate-rise rounded-[2rem] border border-[var(--line)] bg-[var(--panel-strong)] p-5 shadow-card backdrop-blur [animation-delay:260ms]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">
            Ticket
          </p>
          <h2 className="mt-2 font-[var(--font-display)] text-3xl">Order entry</h2>
        </div>
        <span className="rounded-full bg-[var(--sand)] px-3 py-1 text-xs font-medium text-[var(--ink)]">
          Shell
        </span>
      </div>

      <div className="mt-5 grid gap-4">
        <div className="grid grid-cols-2 gap-3">
          {orderSides.map((side) => (
            <button
              className={`rounded-[1.4rem] border px-4 py-3 text-sm font-medium transition ${
                ticketSide === side
                  ? "border-[var(--accent)] bg-[rgba(200,76,47,0.1)] text-[var(--accent)]"
                  : "border-[var(--line)] bg-white/80 text-[var(--ink)] hover:border-[var(--moss)]"
              }`}
              key={side}
              onClick={() => onSideChange(side)}
              type="button"
            >
              {side}
            </button>
          ))}
        </div>

        <div className="rounded-[1.4rem] border border-[var(--line)] bg-white/80 px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
              Selected Market
            </p>
            <span className="text-xs font-medium text-[var(--accent)]">
              {ticketSide}
            </span>
          </div>
          <p className="mt-3 text-sm leading-6 text-[var(--ink)]">
            {selectedMarket?.question ??
              "Select a market from the watchlist to stage a ticket."}
          </p>
        </div>

        <div className="rounded-[1.4rem] border border-[var(--line)] bg-white/80 px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
              Leverage
            </p>
            <span className="font-[var(--font-display)] text-3xl text-[var(--ink)]">
              {leverage}x
            </span>
          </div>
          <input
            className="mt-4 w-full accent-[var(--accent)]"
            max={10}
            min={1}
            onChange={(event) => onLeverageChange(Number(event.target.value))}
            step={1}
            type="range"
            value={leverage}
          />
          <div className="mt-3 flex items-center justify-between text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
            {leverageMarks.map((mark) => (
              <span key={mark}>{mark}x</span>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <TicketMetric label="Indicative Notional" value={`$${compactNumber(leverage * 250)}`} />
          <TicketMetric label="Margin Need" value={`$${compactNumber(250)}`} />
        </div>

        <div className="rounded-[1.4rem] border border-dashed border-[var(--line)] px-4 py-4 text-sm leading-7 text-[var(--muted)]">
          Ticket state is local-only in this pass. When order submission lands,
          this card can wire size, limit price, slippage, and submit actions onto
          the existing shell.
        </div>
      </div>
    </article>
  );
}

function TicketMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.4rem] border border-[var(--line)] bg-white/80 px-4 py-4">
      <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-2 font-[var(--font-display)] text-3xl text-[var(--ink)]">
        {value}
      </p>
    </div>
  );
}
