export interface LiquidationJobData {
  liquidationId: string;
  userId: string;
  positionId: string;
  marketId: string;
  triggerPrice: number;
}

export interface SettlementJobData {
  settlementId: string;
  userId: string;
  amount: number;
  pnl: number;
}
