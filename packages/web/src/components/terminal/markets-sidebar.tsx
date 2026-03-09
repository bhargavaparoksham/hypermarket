"use client";

import type { TerminalMarket } from "./types";
import { formatDate, formatPercent, marketStatusLabel, outcomeLabel } from "./formatters";

interface MarketsSidebarProps {
  markets: TerminalMarket[];
  marketsLoadedCount: number;
  marketFilter: string;
  onFilterChange: (value: string) => void;
  selectedMarketId: string | null;
  onSelectMarket: (marketId: string) => void;
  isLoading: boolean;
  isError: boolean;
  engineUrl: string;
}

export function MarketsSidebar({
  markets,
  marketsLoadedCount,
  marketFilter,
  onFilterChange,
  selectedMarketId,
  onSelectMarket,
  isLoading,
  isError,
  engineUrl
}: MarketsSidebarProps) {
  return (
    <aside className="animate-rise rounded-[2rem] border border-[var(--line)] bg-[var(--panel)] p-4 shadow-card backdrop-blur [animation-delay:120ms]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">
            Markets
          </p>
          <h2 className="mt-2 font-[var(--font-display)] text-3xl">Watchlist</h2>
        </div>
        <span className="rounded-full bg-[var(--sand)] px-3 py-1 text-xs font-medium text-[var(--ink)]">
          {marketsLoadedCount} loaded
        </span>
      </div>

      <label className="mt-4 block">
        <span className="sr-only">Filter markets</span>
        <input
          className="w-full rounded-[1.2rem] border border-[var(--line)] bg-white/80 px-4 py-3 text-sm outline-none transition focus:border-[var(--accent)]"
          onChange={(event) => onFilterChange(event.target.value)}
          placeholder="Filter by question or slug"
          type="search"
          value={marketFilter}
        />
      </label>

      <div className="mt-4 space-y-3">
        {isLoading ? (
          <div className="rounded-[1.5rem] border border-dashed border-[var(--line)] px-4 py-10 text-sm text-[var(--muted)]">
            Loading allowlisted markets from the engine.
          </div>
        ) : null}

        {isError ? (
          <div className="rounded-[1.5rem] border border-[rgba(200,76,47,0.24)] bg-[rgba(200,76,47,0.08)] px-4 py-4 text-sm text-[var(--ink)]">
            Market reads failed. Check the engine server at {engineUrl}.
          </div>
        ) : null}

        {!isLoading && !markets.length ? (
          <div className="rounded-[1.5rem] border border-dashed border-[var(--line)] px-4 py-10 text-sm text-[var(--muted)]">
            No markets match the current filter.
          </div>
        ) : null}

        {markets.map((market) => {
          const active = selectedMarketId === market.id;
          const headlinePrice = market.bestOutcome;

          return (
            <button
              className={`market-card w-full rounded-[1.5rem] border px-4 py-4 text-left transition ${
                active
                  ? "border-[var(--accent)] bg-[rgba(200,76,47,0.08)] shadow-sm"
                  : "border-[var(--line)] bg-white/70 hover:border-[var(--moss)] hover:bg-white"
              }`}
              key={market.id}
              onClick={() => onSelectMarket(market.id)}
              type="button"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="rounded-full bg-[var(--ink)] px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-white">
                  {marketStatusLabel(market)}
                </span>
                <span className="text-sm font-medium text-[var(--accent)]">
                  {headlinePrice
                    ? formatPercent(headlinePrice.markPrice ?? headlinePrice.midpoint)
                    : "--"}
                </span>
              </div>

              <p className="mt-3 text-sm font-medium leading-6 text-[var(--ink)]">
                {market.question}
              </p>
              <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                {headlinePrice ? outcomeLabel(headlinePrice) : "Awaiting price feed"}
              </p>
              <p className="mt-3 text-xs text-[var(--muted)]">
                Ends {formatDate(market.endDate)}
              </p>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
