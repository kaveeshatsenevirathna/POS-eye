import { Prisma } from './generated/client';
export const decimal = (value: string | number | Prisma.Decimal) => new Prisma.Decimal(value);
export const round = (value: Prisma.Decimal) => value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
export function totals(rawGross: Prisma.Decimal, discountRate: string | number | Prisma.Decimal, taxRate: string | number | Prisma.Decimal, inclusive: boolean) {
  const gross = round(rawGross);
  const discount = round(gross.mul(discountRate).div(100));
  const net = gross.minus(discount);
  const rate = decimal(taxRate);
  const tax = round(net.mul(rate).div(inclusive ? rate.plus(100) : 100));
  return { gross, discount, tax, revenue: inclusive ? net.minus(tax) : net, total: inclusive ? net : net.plus(tax) };
}

