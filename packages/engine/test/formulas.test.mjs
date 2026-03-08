import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateAccountMetrics,
  calculateEquity,
  calculateFreeCollateral,
  calculateInitialMargin,
  calculateLiquidationPrice,
  calculateMaintenanceMargin,
  calculateMarginRatio,
  calculatePositionNotional,
  calculateTradeFee,
  calculateUnrealizedPnl
} from "../dist/services/risk-formulas.js";

test("computes position notional and margin requirements", () => {
  const notional = calculatePositionNotional("100", "0.55");
  const initialMargin = calculateInitialMargin(notional, "5");
  const maintenanceMargin = calculateMaintenanceMargin(notional);

  assert.equal(notional.toString(), "55");
  assert.equal(initialMargin.toString(), "11");
  assert.equal(maintenanceMargin.toString(), "2.75");
});

test("computes unrealized pnl for long and short positions", () => {
  assert.equal(
    calculateUnrealizedPnl("LONG", "0.50", "0.55", "100").toString(),
    "5"
  );
  assert.equal(
    calculateUnrealizedPnl("SHORT", "0.60", "0.52", "50").toString(),
    "4"
  );
});

test("computes the reference liquidation price for a 10x long at 0.50", () => {
  assert.equal(calculateLiquidationPrice("LONG", "0.50", "10").toString(), "0.455");
});

test("computes fees, equity, free collateral, and margin ratio", () => {
  const fee = calculateTradeFee("100");
  const equity = calculateEquity("1000", "20", fee);
  const freeCollateral = calculateFreeCollateral(equity, "250", "5");
  const marginRatio = calculateMarginRatio("250", equity);

  assert.equal(fee.toString(), "0.1");
  assert.equal(equity.toString(), "1019.9");
  assert.equal(freeCollateral.toString(), "764.9");
  assert.equal(marginRatio.toString(), "0.24512207079125404451");
});

test("computes aggregate account metrics with configurable fees and buffer", () => {
  const metrics = calculateAccountMetrics("1000", "250", "20", {
    fees: "1.5",
    freeCollateralBuffer: "10"
  });

  assert.equal(metrics.equity.toString(), "1018.5");
  assert.equal(metrics.freeCollateral.toString(), "758.5");
  assert.equal(metrics.marginRatio.toString(), "0.24545900834560628375");
});

test("margin ratio returns 1 when equity is zero or negative", () => {
  assert.equal(calculateMarginRatio("10", "0").toString(), "1");
  assert.equal(calculateMarginRatio("10", "-5").toString(), "1");
});
