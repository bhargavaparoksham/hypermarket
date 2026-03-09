"use client";

interface TerminalHeaderProps {
  connectedSummary: string;
  isConnected: boolean;
  isPending: boolean;
  canConnect: boolean;
  connectorName?: string;
  onConnect: () => void;
  onDisconnect: () => void;
}

export function TerminalHeader({
  connectedSummary,
  isConnected,
  isPending,
  canConnect,
  connectorName,
  onConnect,
  onDisconnect
}: TerminalHeaderProps) {
  return (
    <header className="animate-rise rounded-[2rem] border border-[var(--line)] bg-[var(--panel-strong)] px-5 py-4 shadow-card backdrop-blur md:px-7">
      <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-4xl">
          <p className="inline-flex items-center rounded-full bg-[rgba(116,140,105,0.18)] px-3 py-1 text-xs uppercase tracking-[0.28em] text-[var(--ink)] ring-1 ring-[rgba(116,140,105,0.28)]">
            Hypermarket Terminal
          </p>
          <h1 className="mt-3 font-[var(--font-display)] text-4xl leading-none sm:text-5xl">
            Trade prediction markets with
            <span className="ml-2 text-[var(--accent)]">leverage.</span>
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--muted)]">
            Hypermarket is Hyperliquid for Polymarket. Trade the biggest
            prediction markets with leverage.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-[1fr_auto] xl:min-w-[420px]">
          <div className="rounded-[1.5rem] border border-[var(--line)] bg-white/70 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">
              Wallet
            </p>
            <p className="mt-2 text-sm text-[var(--muted)]">{connectedSummary}</p>
          </div>

          {isConnected ? (
            <button
              className="rounded-[1.5rem] bg-[var(--ink)] px-4 py-3 text-sm font-medium text-white transition hover:bg-[var(--tide)]"
              onClick={onDisconnect}
              type="button"
            >
              Disconnect
            </button>
          ) : (
            <button
              className="rounded-[1.5rem] bg-[var(--accent)] px-4 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!canConnect || isPending}
              onClick={onConnect}
              type="button"
            >
              {isPending && connectorName
                ? `Connecting ${connectorName}...`
                : "Connect Wallet"}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
