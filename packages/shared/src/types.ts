import {
  LiquidationStatus,
  PositionSide,
  PositionStatus,
  SettlementStatus
} from "./enums.js";

export type Address = `0x${string}`;
export type MarketSource = "polymarket";

export interface SupportedMarketOutcome {
  id: string;
  name: string;
  tokenId: string | null;
  price: number | null;
  winner: boolean | null;
}

export interface SupportedMarket {
  id: string;
  slug: string;
  conditionId: string | null;
  question: string;
  description: string | null;
  active: boolean;
  closed: boolean;
  archived: boolean;
  endDate: string | null;
  source: MarketSource;
  outcomes: SupportedMarketOutcome[];
}

export interface MarketPriceSnapshot {
  marketId: string;
  outcomeTokenId: string;
  outcome: string | null;
  bestBid: number | null;
  bestAsk: number | null;
  midpoint: number | null;
  markPrice: number | null;
  lastTradePrice: number | null;
  updatedAt: string;
  stale: boolean;
 }

export interface Market {
  id: string;
  slug: string;
  question: string;
  outcome: string;
  active: boolean;
  bestBid: number | null;
  bestAsk: number | null;
  markPrice: number | null;
  lastTradePrice: number | null;
  updatedAt: string | null;
}

export interface MarginAccount {
  userAddress: Address;
  settledBalance: number;
  usedMargin: number;
  freeCollateral: number;
  equity: number;
  marginRatio: number;
  updatedAt: string;
}

export interface Position {
  id: string;
  userAddress: Address;
  marketId: string;
  side: PositionSide;
  size: number;
  notional: number;
  leverage: number;
  entryPrice: number;
  markPrice: number;
  liquidationPrice: number;
  initialMargin: number;
  maintenanceMargin: number;
  unrealizedPnl: number;
  realizedPnl: number;
  status: PositionStatus;
  openedAt: string;
  updatedAt: string;
}

export interface Settlement {
  id: string;
  userAddress: Address;
  amount: number;
  pnl: number;
  status: SettlementStatus;
  transactionHash: Address | null;
  createdAt: string;
  updatedAt: string;
}

export interface Liquidation {
  id: string;
  userAddress: Address;
  positionId: string;
  marketId: string;
  markPrice: number;
  liquidationPrice: number;
  penalty: number;
  status: LiquidationStatus;
  triggeredAt: string;
  updatedAt: string;
}
