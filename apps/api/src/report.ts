import { atomic, db, Failure } from './db';
import { decimal, round } from './money';

export async function refundOrder(businessId: string, actorId: string, orderId: string, reason: string, restocked: boolean) {
  return atomic(async tx => {
    const order = await tx.order.findFirst({ where: { businessId, id: orderId }, include: { refund: true, items: true, payments: true } });
    if (!order) throw new Failure(404, 'Sale not found');
    if (order.refund) throw new Failure(409, 'Sale was already refunded');
    if (order.payments.some(payment => payment.method !== 'CASH')) throw new Failure(422, 'Only cash sales can be refunded here');
    const refund = await tx.refund.create({ data: { businessId, actorId, orderId, reason, restocked } });
    if (restocked) {
      for (const item of order.items.filter(item => item.stockDeducted)) {
        await tx.product.update({ where: { businessId_id: { businessId, id: item.productId } }, data: { stock: { increment: item.quantity } } });
        await tx.inventoryMovement.create({ data: { businessId, actorId, productId: item.productId, delta: item.quantity, reason: 'Refund ' + refund.id } });
      }
    }
    await tx.auditLog.create({ data: { businessId, actorId, action: 'sale.refunded', target: orderId } });
    return refund;
  });
}
export async function report(businessId: string, start: Date, end: Date, timezone: string) {
  const date = { gte: start, lt: end };
  const [sales, refunds, expenses, activeProducts, stock] = await Promise.all([
    db.order.findMany({ where: { businessId, createdAt: date }, include: { items: true, payments: true } }),
    db.refund.findMany({ where: { businessId, createdAt: date }, include: { order: { include: { items: true } } } }),
    db.expense.aggregate({ where: { businessId, createdAt: date }, _sum: { amount: true } }),
    db.product.count({ where: { businessId, active: true } }),
    db.product.count({ where: { businessId, active: true, stock: { lte: db.product.fields.reorder } } }),
  ]);
  let gross = decimal(0), discounts = decimal(0), tax = decimal(0), revenue = decimal(0), refundTotal = decimal(0), cogs = decimal(0);
  let missingCosts = false;
  const daily = new Map<string, ReturnType<typeof decimal>>();
  const products = new Map<string, { label: string; quantity: ReturnType<typeof decimal> }>();
  const categories = new Map<string, ReturnType<typeof decimal>>();
  const payments = new Map<string, ReturnType<typeof decimal>>();
  const cashiers = new Map<string, ReturnType<typeof decimal>>();
  const hourly = new Map<string, ReturnType<typeof decimal>>();
  const hourFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', hourCycle: 'h23' });
  function accumulate(map: Map<string, ReturnType<typeof decimal>>, key: string, value: ReturnType<typeof decimal>) {
    map.set(key, (map.get(key) ?? decimal(0)).plus(value));
  }
  function summary(map: Map<string, ReturnType<typeof decimal>>) {
    return [...map].map(([label, value]) => ({ label, value: round(value).toNumber() }));
  }
  const dayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
  function addDay(date: Date, value: ReturnType<typeof decimal>) {
    const day = dayFormatter.format(date);
    daily.set(day, (daily.get(day) ?? decimal(0)).plus(value));
  }
  for (const sale of sales) {
    gross = gross.plus(sale.gross);
    discounts = discounts.plus(sale.discount);
    tax = tax.plus(sale.tax);
    revenue = revenue.plus(sale.revenue);
    addDay(sale.createdAt, sale.revenue);
    accumulate(cashiers, sale.cashierId, sale.revenue);
    accumulate(hourly, hourFormatter.format(sale.createdAt), decimal(1));
    for (const payment of sale.payments) accumulate(payments, payment.method, payment.amount);
    for (const item of sale.items) {
      const previous = products.get(item.productId);
      products.set(item.productId, { label: item.name, quantity: (previous?.quantity ?? decimal(0)).plus(item.quantity) });
      accumulate(categories, item.category ?? 'Uncategorized', item.price.mul(item.quantity));
      if (item.cost === null) missingCosts = true;
      else cogs = cogs.plus(item.cost.mul(item.quantity));
    }
  }
  for (const refund of refunds) {
    refundTotal = refundTotal.plus(refund.order.total);
    tax = tax.minus(refund.order.tax);
    revenue = revenue.minus(refund.order.revenue);
    addDay(refund.createdAt, refund.order.revenue.negated());
    if (refund.restocked) for (const item of refund.order.items.filter(item => item.stockDeducted)) {
      if (item.cost === null) missingCosts = true;
      else cogs = cogs.minus(item.cost.mul(item.quantity));
    }
  }
  const staff = await db.businessMembership.findMany({
    where: { businessId, userId: { in: [...cashiers.keys()] } },
    select: { userId: true, user: { select: { name: true } } },
  });
  const names = new Map(staff.map(member => [member.userId, member.user.name]));
  cogs = round(cogs);
  const operatingExpenses = expenses._sum.amount ?? decimal(0);
  const grossProfit = revenue.minus(cogs);
  const netSales = revenue.plus(tax);
  return { gross, discounts, tax, revenue, netSales, refundTotal, cogs, missingCosts, grossProfit, estimatedNetProfit: grossProfit.minus(operatingExpenses), operatingExpenses, transactions: sales.length, activeProducts, lowStock: stock,
    averageOrderValue: sales.length ? round(sales.reduce((sum, sale) => sum.plus(sale.total), decimal(0)).div(sales.length)) : decimal(0),
    paymentMix: summary(payments), categorySales: summary(categories), hourlyTransactions: summary(hourly).sort((a, b) => a.label.localeCompare(b.label)),
    cashierRevenue: summary(cashiers).map(entry => ({ ...entry, label: names.get(entry.label) ?? entry.label })),
    topProducts: [...products.values()].sort((a, b) => b.quantity.comparedTo(a.quantity)).slice(0, 12).map(item => ({ label: item.label, value: item.quantity.toNumber() })),
    daily: [...daily].sort(([a], [b]) => a.localeCompare(b)).map(([day, value]) => ({ day, revenue: value.toNumber() })),
  };
}



