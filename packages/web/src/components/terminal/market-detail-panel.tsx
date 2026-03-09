"use client";

import type { MarketPriceSnapshot } from "@hypermarket/shared";
import type { TerminalMarket } from "./types";
import {
  compactIdentifier,
  formatDate,
  formatPercent,
  formatSnapshotTime,
  marketStatusLabel,
  outcomeLabel
} from "./formatters";

interface MarketDetailPanelProps {
  selectedMarket: TerminalMarket | null;
  selectedPrices: MarketPriceSnapshot[];
  bestBid: number | null;
  bestAsk: number | null;
  isPricesLoading: boolean;
}

export function MarketDetailPanel({
  selectedMarket,
  selectedPrices,
  bestBid,
  bestAsk,
  isPricesLoading
}: MarketDetailPanelProps) {
  return (
    <article className="animate-rise rounded-[2rem] border border-[var(--line)] bg-[var(--panel-strong)] p-6 shadow-card backdrop-blur [animation-delay:220ms]">
      {selectedMarket ? (
        <>
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">
                Market Detail
              </p>
              <h2 className="mt-3 font-[var(--font-display)] text-4xl leading-tight">
                {selectedMarket.question}
              </h2>
              <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
                {selectedMarket.description ??
                  "No market description came back from the engine yet. This panel is wired to live market metadata and price snapshots."}
              </p>
            </div>

            <div className="grid min-w-[240px] gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <div className="rounded-[1.5rem] border border-[var(--line)] bg-white/80 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted)]">
                  Best Bid
                </p>
                <p className="mt-2 font-[var(--font-display)] text-3xl">
                  {formatPercent(bestBid)}
                </p>
              </div>
              <div className="rounded-[1.5rem] border border-[var(--line)] bg-white/80 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted)]">
                  Best Ask
                </p>
                <p className="mt-2 font-[var(--font-display)] text-3xl">
                  {formatPercent(bestAsk)}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <div className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--ink)] px-4 py-4 text-white">
              <p className="text-xs uppercase tracking-[0.22em] text-white/60">
                Market Status
              </p>
              <p className="mt-2 font-[var(--font-display)] text-3xl">
                {marketStatusLabel(selectedMarket)}
              </p>
            </div>
            <div className="rounded-[1.5rem] border border-[var(--line)] bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted)]">
                Engine Market ID
              </p>
              <p className="mt-2 text-sm font-medium text-[var(--ink)]">
                {compactIdentifier(selectedMarket.id)}
              </p>
            </div>
            <div className="rounded-[1.5rem] border border-[var(--line)] bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted)]">
                Resolution Window
              </p>
              <p className="mt-2 text-sm font-medium text-[var(--ink)]">
                {formatDate(selectedMarket.endDate)}
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-3 xl:grid-cols-2">
            {selectedPrices.length > 0 ? (
              selectedPrices.map((price) => (
                <div
                  className="rounded-[1.6rem] border border-[var(--line)] bg-white/80 p-4"
                  key={price.outcomeTokenId}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted)]">
                        Outcome
                      </p>
                      <h3 className="mt-2 font-[var(--font-display)] text-3xl">
                        {outcomeLabel(price)}
                      </h3>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        price.stale
                          ? "bg-[rgba(200,76,47,0.12)] text-[var(--accent)]"
                          : "bg-[rgba(116,140,105,0.18)] text-[var(--ink)]"
                      }`}
                    >
                      {price.stale ? "Stale" : "Live"}
                    </span>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <MetricCard label="Mark" value={formatPercent(price.markPrice ?? price.midpoint)} />
                    <MetricCard label="Last Trade" value={formatPercent(price.lastTradePrice)} />
                    <MetricCard label="Bid" value={formatPercent(price.bestBid)} />
                    <MetricCard label="Ask" value={formatPercent(price.bestAsk)} />
                  </div>

                  <p className="mt-4 text-xs text-[var(--muted)]">
                    Snapshot {formatSnapshotTime(price.updatedAt)}
                  </p>
                </div>
              ))
            ) : (
              <div className="rounded-[1.6rem] border border-dashed border-[var(--line)] px-4 py-10 text-sm text-[var(--muted)] xl:col-span-2">
                {isPricesLoading
                  ? "Loading live price snapshots for the selected market."
                  : "Price snapshots are not available yet for this market."}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="rounded-[1.6rem] border border-dashed border-[var(--line)] px-4 py-16 text-sm text-[var(--muted)]">
          No market selected yet.
        </div>
      )}
    </article>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.2rem] bg-[var(--canvas)] px-3 py-3">
      <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-2 text-xl font-semibold text-[var(--ink)]">{value}</p>
    </div>
  );
}
