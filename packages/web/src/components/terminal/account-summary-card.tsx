"use client";

interface AccountSummaryCardProps {
  engineUrl: string;
  isConnected: boolean;
}

export function AccountSummaryCard({
  engineUrl,
  isConnected
}: AccountSummaryCardProps) {
  return (
    <article className="animate-rise rounded-[2rem] border border-[var(--line)] bg-[var(--tide)] p-5 text-white shadow-card [animation-delay:160ms]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-white/65">
            Account
          </p>
          <h2 className="mt-2 font-[var(--font-display)] text-3xl">Summary</h2>
        </div>
        <span className="rounded-full bg-white/12 px-3 py-1 text-xs font-medium text-white">
          Read-only
        </span>
      </div>

      <div className="mt-5 grid gap-3">
        <div className="rounded-[1.4rem] border border-white/12 bg-white/8 px-4 py-4">
          <p className="text-xs uppercase tracking-[0.18em] text-white/65">
            Engine URL
          </p>
          <p className="mt-2 break-all text-sm font-medium">{engineUrl}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <SummaryMetric label="Settled Balance" value="--" />
          <SummaryMetric label="Free Collateral" value="--" />
        </div>
        <div className="rounded-[1.4rem] border border-white/12 bg-white/8 px-4 py-4 text-sm leading-7 text-white/78">
          {isConnected
            ? "Wallet is connected. Account balances will populate once the engine exposes user account reads."
            : "Connect a wallet to prepare account-scoped reads when the engine account endpoint lands."}
        </div>
      </div>
    </article>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.4rem] border border-white/12 bg-white/8 px-4 py-4">
      <p className="text-xs uppercase tracking-[0.18em] text-white/65">{label}</p>
      <p className="mt-2 font-[var(--font-display)] text-3xl">{value}</p>
    </div>
  );
}
