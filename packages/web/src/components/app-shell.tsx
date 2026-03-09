"use client";

import { useQueries, useQuery } from "@tanstack/react-query";
import type { MarketPriceSnapshot } from "@hypermarket/shared";
import { useDeferredValue, useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { webEnv } from "../lib/env";
import { AccountSummaryCard } from "./terminal/account-summary-card";
import { getHeadlinePrice, orderSides } from "./terminal/formatters";
import { MarketDetailPanel } from "./terminal/market-detail-panel";
import { MarketsSidebar } from "./terminal/markets-sidebar";
import { OrderTicketCard } from "./terminal/order-ticket-card";
import { PositionsTableCard } from "./terminal/positions-table-card";
import { TerminalHeader } from "./terminal/terminal-header";
import type {
  MarketPricesResponse,
  MarketsResponse,
  TerminalMarket
} from "./terminal/types";

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${webEnv.engineUrl}${path}`, {
    headers: {
      accept: "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Engine request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

export function AppShell() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const injectedConnector = connectors[0];

  const [selectedMarketId, setSelectedMarketId] = useState<string | null>(null);
  const [marketFilter, setMarketFilter] = useState("");
  const [ticketSide, setTicketSide] = useState<(typeof orderSides)[number]>("Long");
  const [leverage, setLeverage] = useState(3);
  const deferredMarketFilter = useDeferredValue(marketFilter);

  const marketsQuery = useQuery({
    queryKey: ["markets"],
    queryFn: () => fetchJson<MarketsResponse>("/markets"),
    refetchInterval: 15_000
  });

  const markets = marketsQuery.data?.markets ?? [];

  useEffect(() => {
    if (!markets.length) {
      if (selectedMarketId !== null) {
        setSelectedMarketId(null);
      }
      return;
    }

    if (!selectedMarketId || !markets.some((market) => market.id === selectedMarketId)) {
      setSelectedMarketId(markets[0]?.id ?? null);
    }
  }, [markets, selectedMarketId]);

  const marketPriceQueries = useQueries({
    queries: markets.map((market) => ({
      queryKey: ["market-prices", market.id],
      queryFn: () =>
        fetchJson<MarketPricesResponse>(`/markets/${encodeURIComponent(market.id)}/prices`),
      refetchInterval: 5_000
    }))
  });

  const marketPricesById = new Map<string, MarketPriceSnapshot[]>();
  marketPriceQueries.forEach((query, index) => {
    const marketId = markets[index]?.id;
    if (!marketId) {
      return;
    }

    marketPricesById.set(marketId, query.data?.prices ?? []);
  });

  const terminalMarkets: TerminalMarket[] = markets.map((market) => {
    const prices = marketPricesById.get(market.id) ?? [];

    return {
      ...market,
      prices,
      bestOutcome: getHeadlinePrice(market, prices)
    };
  });

  const normalizedFilter = deferredMarketFilter.trim().toLowerCase();
  const filteredMarkets = !normalizedFilter
    ? terminalMarkets
    : terminalMarkets.filter((market) => {
        return (
          market.question.toLowerCase().includes(normalizedFilter) ||
          market.slug.toLowerCase().includes(normalizedFilter)
        );
      });

  const selectedMarket =
    terminalMarkets.find((market) => market.id === selectedMarketId) ??
    filteredMarkets[0] ??
    null;
  const selectedPrices: MarketPriceSnapshot[] = selectedMarket
    ? marketPricesById.get(selectedMarket.id) ?? []
    : [];
  const selectedMarketPricesQuery = selectedMarket
    ? marketPriceQueries[markets.findIndex((market) => market.id === selectedMarket.id)]
    : null;

  const bestBid = selectedPrices.reduce<number | null>((current, price) => {
    if (price.bestBid === null) {
      return current;
    }

    return current === null ? price.bestBid : Math.max(current, price.bestBid);
  }, null);

  const bestAsk = selectedPrices.reduce<number | null>((current, price) => {
    if (price.bestAsk === null) {
      return current;
    }

    return current === null ? price.bestAsk : Math.min(current, price.bestAsk);
  }, null);

  const connectedSummary =
    isConnected && address
      ? `${address.slice(0, 6)}...${address.slice(-4)}`
      : "Connect an injected wallet to prepare account reads and order signing.";

  return (
    <main className="relative overflow-hidden">
      <div className="mesh" />
      <div className="mx-auto flex min-h-screen max-w-[1560px] flex-col px-4 pb-10 pt-4 sm:px-6 lg:px-8">
        <TerminalHeader
          canConnect={Boolean(injectedConnector)}
          connectedSummary={connectedSummary}
          connectorName={injectedConnector?.name}
          isConnected={isConnected}
          isPending={isPending}
          onConnect={() => {
            if (injectedConnector) {
              connect({ connector: injectedConnector });
            }
          }}
          onDisconnect={() => disconnect()}
        />

        <section className="grid gap-4 pt-4 xl:grid-cols-[320px_minmax(0,1fr)_340px]">
          <MarketsSidebar
            engineUrl={webEnv.engineUrl}
            isError={marketsQuery.isError}
            isLoading={marketsQuery.isLoading}
            marketFilter={marketFilter}
            markets={filteredMarkets}
            marketsLoadedCount={markets.length}
            onFilterChange={setMarketFilter}
            onSelectMarket={setSelectedMarketId}
            selectedMarketId={selectedMarket?.id ?? null}
          />

          <section className="grid gap-4">
            <MarketDetailPanel
              bestAsk={bestAsk}
              bestBid={bestBid}
              isPricesLoading={Boolean(selectedMarketPricesQuery?.isLoading)}
              selectedMarket={selectedMarket}
              selectedPrices={selectedPrices}
            />
            <PositionsTableCard />
          </section>

          <aside className="grid gap-4">
            <AccountSummaryCard
              engineUrl={webEnv.engineUrl}
              isConnected={isConnected}
            />
            <OrderTicketCard
              leverage={leverage}
              onLeverageChange={setLeverage}
              onSideChange={setTicketSide}
              selectedMarket={selectedMarket}
              ticketSide={ticketSide}
            />
          </aside>
        </section>
      </div>
    </main>
  );
}
