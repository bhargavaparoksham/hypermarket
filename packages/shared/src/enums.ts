export enum PositionSide {
  Long = "LONG",
  Short = "SHORT"
}

export enum PositionStatus {
  Open = "OPEN",
  Closing = "CLOSING",
  Closed = "CLOSED",
  Liquidating = "LIQUIDATING",
  Liquidated = "LIQUIDATED"
}

export enum SettlementStatus {
  Pending = "PENDING",
  Submitted = "SUBMITTED",
  Confirmed = "CONFIRMED",
  Failed = "FAILED"
}

export enum LiquidationStatus {
  Queued = "QUEUED",
  InProgress = "IN_PROGRESS",
  Settled = "SETTLED",
  Failed = "FAILED"
}
