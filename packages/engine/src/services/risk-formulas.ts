import { Decimal } from "@prisma/client/runtime/library";
import { RISK_PARAMETERS } from "@hypermarket/shared";
import { DECIMAL_ONE, DECIMAL_ZERO, decimalMax, toDecimal } from "./decimal.js";
import { PositionSide } from "./position-service.js";

interface AccountFormulaOptions {
  fees?: Decimal | number | string;
  freeCollateralBuffer?: Decimal | number | string;
}

export interface AccountMetrics {
  equity: Decimal;
  freeCollateral: Decimal;
  marginRatio: Decimal;
}

export function calculatePositionNotional(
  size: Decimal | number | string,
  price: Decimal | number | string
): Decimal {
  return toDecimal(size).mul(toDecimal(price));
}

export function calculateInitialMargin(
  notional: Decimal | number | string,
  leverage: Decimal | number | string
): Decimal {
  return toDecimal(notional).div(toDecimal(leverage));
}

export function calculateMaintenanceMargin(
  notional: Decimal | number | string,
  maintenanceMarginRatio:
    | Decimal
    | number
    | string = RISK_PARAMETERS.maintenanceMarginRatio
): Decimal {
  return toDecimal(notional).mul(toDecimal(maintenanceMarginRatio));
}

export function calculateTradeFee(
  notional: Decimal | number | string,
  feeRate: Decimal | number | string = RISK_PARAMETERS.tradingFeeRate
): Decimal {
  return toDecimal(notional).mul(toDecimal(feeRate));
}

export function calculateUnrealizedPnl(
  side: PositionSide,
  entryPrice: Decimal | number | string,
  markPrice: Decimal | number | string,
  size: Decimal | number | string
): Decimal {
  const entry = toDecimal(entryPrice);
  const mark = toDecimal(markPrice);
  const quantity = toDecimal(size);

  const delta = side === "LONG" ? mark.minus(entry) : entry.minus(mark);
  return delta.mul(quantity);
}

export function calculateEquity(
  settledBalance: Decimal | number | string,
  totalUnrealizedPnl: Decimal | number | string,
  fees: Decimal | number | string = DECIMAL_ZERO
): Decimal {
  return toDecimal(settledBalance)
    .plus(toDecimal(totalUnrealizedPnl))
    .minus(toDecimal(fees));
}

export function calculateFreeCollateral(
  equity: Decimal | number | string,
  usedMargin: Decimal | number | string,
  buffer: Decimal | number | string = RISK_PARAMETERS.freeCollateralBuffer
): Decimal {
  return decimalMax(
    toDecimal(equity).minus(toDecimal(usedMargin)).minus(toDecimal(buffer)),
    DECIMAL_ZERO
  );
}

export function calculateMarginRatio(
  usedMargin: Decimal | number | string,
  equity: Decimal | number | string
): Decimal {
  const used = toDecimal(usedMargin);
  const eq = toDecimal(equity);

  return eq.greaterThan(DECIMAL_ZERO) ? used.div(eq) : DECIMAL_ONE;
}

export function calculateAccountMetrics(
  settledBalance: Decimal | number | string,
  usedMargin: Decimal | number | string,
  totalUnrealizedPnl: Decimal | number | string,
  options: AccountFormulaOptions = {}
): AccountMetrics {
  const equity = calculateEquity(
    settledBalance,
    totalUnrealizedPnl,
    options.fees ?? DECIMAL_ZERO
  );
  const freeCollateral = calculateFreeCollateral(
    equity,
    usedMargin,
    options.freeCollateralBuffer ?? RISK_PARAMETERS.freeCollateralBuffer
  );

  return {
    equity,
    freeCollateral,
    marginRatio: calculateMarginRatio(usedMargin, equity)
  };
}
