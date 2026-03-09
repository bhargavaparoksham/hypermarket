"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";
import { webEnv } from "../lib/env";

const statusCards = [
  {
    label: "Execution Engine",
    value: "Online-ready",
    detail: "API and worker phases are in place; web is now bootstrapped."
  },
  {
    label: "Settlement Layer",
    value: "Vault synced",
    detail: "On-chain settled balances mirror into engine account state."
  },
  {
    label: "Hedge Layer",
    value: "Deferred live execution",
    detail: "Decisioning is built; live Polymarket submission stays deferred."
  }
] as const;

const stackCards = [
  "Next.js App Router",
  "Tailwind CSS",
  "wagmi + viem",
  "React Query providers"
] as const;

export function AppShell() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  const injectedConnector = connectors[0];

  return (
    <main className="relative overflow-hidden">
      <div className="mesh" />
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 pb-12 pt-6 sm:px-6 lg:px-8">
        <header className="animate-rise rounded-[2rem] border border-[var(--line)] bg-[var(--panel)] px-5 py-4 shadow-card backdrop-blur md:px-7">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-[var(--muted)]">
                Hypermarket
              </p>
              <h1 className="mt-3 font-[var(--font-display)] text-4xl leading-none sm:text-5xl">
                Leveraged prediction markets,
                <span className="ml-2 text-[var(--accent)]">bootstrapped.</span>
              </h1>
            </div>

            <div className="flex flex-col items-start gap-3 rounded-[1.5rem] border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-4 md:min-w-80">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">
                  Wallet
                </p>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  {isConnected && address
                    ? `${address.slice(0, 6)}...${address.slice(-4)}`
                    : "Connect an injected wallet to verify provider wiring."}
                </p>
              </div>

              {isConnected ? (
                <button
                  className="rounded-full bg-[var(--ink)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[var(--tide)]"
                  onClick={() => disconnect()}
                  type="button"
                >
                  Disconnect
                </button>
              ) : (
                <button
                  className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!injectedConnector || isPending}
                  onClick={() => {
                    if (injectedConnector) {
                      connect({ connector: injectedConnector });
                    }
                  }}
                  type="button"
                >
                  {isPending && injectedConnector
                    ? `Connecting ${injectedConnector.name}...`
                    : "Connect Wallet"}
                </button>
              )}
            </div>
          </div>
        </header>

        <section className="grid gap-4 pt-6 lg:grid-cols-[1.2fr_0.8fr]">
          <article className="animate-rise rounded-[2rem] border border-[var(--line)] bg-[var(--panel-strong)] p-6 shadow-card backdrop-blur [animation-delay:120ms]">
            <p className="text-xs uppercase tracking-[0.28em] text-[var(--muted)]">
              Phase 8.1
            </p>
            <h2 className="mt-3 font-[var(--font-display)] text-3xl leading-tight">
              App Router shell with network, vault, and wallet context ready for the trading UI.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--muted)]">
              This is the first real web surface in the repo. It establishes layout,
              providers, and environment wiring so the next pass can focus on markets,
              ticketing, and account panels instead of bootstrap work.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {stackCards.map((item, index) => (
                <div
                  className="rounded-[1.5rem] border border-[var(--line)] bg-white/70 px-4 py-4 text-sm text-[var(--ink)] shadow-sm animate-rise"
                  key={item}
                  style={{ animationDelay: `${220 + index * 90}ms` }}
                >
                  {item}
                </div>
              ))}
            </div>
          </article>

          <aside className="animate-rise rounded-[2rem] border border-[var(--line)] bg-[var(--tide)] p-6 text-white shadow-card [animation-delay:220ms]">
            <p className="text-xs uppercase tracking-[0.28em] text-white/65">
              Runtime
            </p>
            <dl className="mt-5 space-y-5 text-sm">
              <div>
                <dt className="text-white/65">Engine URL</dt>
                <dd className="mt-1 break-all font-medium">{webEnv.engineUrl}</dd>
              </div>
              <div>
                <dt className="text-white/65">Chain ID</dt>
                <dd className="mt-1 font-medium">{webEnv.chainId}</dd>
              </div>
              <div>
                <dt className="text-white/65">Vault</dt>
                <dd className="mt-1 break-all font-medium">
                  {webEnv.vaultAddress ?? "Not configured yet"}
                </dd>
              </div>
              <div>
                <dt className="text-white/65">WalletConnect</dt>
                <dd className="mt-1 font-medium">
                  {webEnv.walletConnectProjectId ? "Configured" : "Optional for now"}
                </dd>
              </div>
            </dl>
          </aside>
        </section>

        <section className="grid gap-4 pt-6 md:grid-cols-3">
          {statusCards.map((card, index) => (
            <article
              className="animate-rise rounded-[2rem] border border-[var(--line)] bg-[var(--panel)] p-5 shadow-card backdrop-blur"
              key={card.label}
              style={{ animationDelay: `${320 + index * 110}ms` }}
            >
              <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">
                {card.label}
              </p>
              <h3 className="mt-3 font-[var(--font-display)] text-2xl">
                {card.value}
              </h3>
              <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
                {card.detail}
              </p>
            </article>
          ))}
        </section>

        <section className="grid gap-4 pt-6 lg:grid-cols-[0.9fr_1.1fr]">
          <article className="animate-rise rounded-[2rem] border border-[var(--line)] bg-[var(--panel-strong)] p-6 shadow-card [animation-delay:520ms]">
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">
              Next up
            </p>
            <ol className="mt-4 space-y-4 text-sm leading-7 text-[var(--muted)]">
              <li>1. Add the live markets sidebar and market detail panel.</li>
              <li>2. Wire account and positions reads from the engine API.</li>
              <li>3. Drop in the order ticket and leverage controls.</li>
            </ol>
          </article>

          <article className="animate-rise rounded-[2rem] border border-[var(--line)] bg-[var(--panel)] p-6 shadow-card [animation-delay:620ms]">
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">
              MVP note
            </p>
            <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
              Automatic live hedging is intentionally deferred for the first end-to-end MVP.
              The app bootstrap is a better use of time now because it unlocks actual deposit,
              trade, close, and settlement flows for users.
            </p>
          </article>
        </section>
      </div>
    </main>
  );
}
