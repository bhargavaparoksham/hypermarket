import { Decimal } from "@prisma/client/runtime/library";

export type DecimalValue = Decimal | number | string;

export function toDecimal(value: DecimalValue): Decimal {
  return value instanceof Decimal ? value : new Decimal(value);
}

export function decimalMax(left: Decimal, right: Decimal): Decimal {
  return left.greaterThan(right) ? left : right;
}

export const DECIMAL_ZERO = new Decimal("0");
export const DECIMAL_ONE = new Decimal("1");
