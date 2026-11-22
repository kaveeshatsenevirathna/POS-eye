import { createHash } from 'node:crypto';
import { z } from 'zod';
import { atomic, db, Failure, Prisma } from './db';
import { decimal, totals } from './money';

const amount = z.string().regex(/^\d{1,12}(\.\d{1,2})?$/);
export const basket = z.object({
  lines: z.array(z.object({ productId: z.uuid(), quantity: z.string().regex(/^\d{1,7}(\.\d{1,3})?$/).refine(v => Number(v) > 0) })).min(1).max(100),
  discount: z.number().min(0).max(100).default(0),
});
export const checkoutInput = basket.extend({
  requestKey: z.uuid(),
  ticketId: z.uuid().optional(),
  customerId: z.uuid().optional(),
  payments: z.array(z.discriminatedUnion('method', [
    z.object({ method: z.literal('CASH'), amount, tendered: amount }),
    z.object({ method: z.literal('MANUAL_CARD'), amount, reference: z.string().trim().min(1).max(80).refine(value => !/(?:\d[ -]?){13}/.test(value), 'Use the terminal approval reference only') }),
    z.object({ method: z.literal('QR'), amount, reference: z.string().trim().min(1).max(80) }),
  ])).max(8),
});
export const orderDetails = { items: true, payments: true, refund: true } as const;
type Actor = { businessId: string; userId: string; role: string };

async function priceBasket(tx: Prisma.TransactionClient, actor: Actor, input: z.infer<typeof basket>) {
  const business = await tx.business.findUniqueOrThrow({ where: { id: actor.businessId }, include: { settings: true, modules: true } });
  const settings = business.settings!;
  if (actor.role !== 'ADMIN' && decimal(input.discount).gt(settings.staffDiscountLimit)) throw new Failure(403, 'Discount exceeds cashier limit');
  const quantities = new Map<string, Prisma.Decimal>();
  for (const line of input.lines) quantities.set(line.productId, (quantities.get(line.productId) ?? decimal(0)).plus(line.quantity));
  const products = await tx.product.findMany({ where: { businessId: actor.businessId, active: true, id: { in: [...quantities.keys()] } }, include: { category: true }, orderBy: { id: 'asc' } });
  if (products.length !== quantities.size) throw new Failure(422, 'A product is unavailable');
  const inventory = business.modules.some(module => module.key === 'inventory');
  const weighted = business.modules.some(module => module.key === 'weighted');
  const items = products.map(product => {
    const quantity = quantities.get(product.id)!;
    if (!weighted && !quantity.isInteger()) throw new Failure(422, 'Fractional quantities are disabled');
    if (inventory && !settings.allowOversell && product.stock.lt(quantity)) throw new Failure(409, 'Insufficient stock for ' + product.name);
    return { businessId: actor.businessId, productId: product.id, name: product.name, category: product.category?.name, price: product.price, cost: product.cost, quantity, stockDeducted: inventory };
  });
  const rawGross = items.reduce((sum, item) => sum.plus(item.price.mul(item.quantity)), decimal(0));
  const calculations = totals(rawGross, input.discount, settings.taxRate, settings.taxInclusive);
  if (calculations.gross.gte('1000000000000') || calculations.total.gte('1000000000000')) throw new Failure(422, 'Sale exceeds the permitted transaction amount');
  return { business, settings, items, calculations };
}
export async function quote(actor: Actor, input: z.infer<typeof basket>) {
  return atomic(async tx => (await priceBasket(tx, actor, input)).calculations);
}
export async function checkout(actor: Actor, input: z.infer<typeof checkoutInput>) {
  const { businessId, userId } = actor;
  const key = { businessId_requestKey: { businessId, requestKey: input.requestKey } };
  const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  function verify<T extends { cashierId: string; fingerprint: string }>(existing: T) {
    if (existing.cashierId !== userId || existing.fingerprint !== fingerprint) throw new Failure(409, 'Checkout key is already in use');
    return existing;
  }
  try {
    return await atomic(async tx => {
      const existing = await tx.order.findUnique({ where: key, include: orderDetails });
      if (existing) return verify(existing);
      const { business, settings, items, calculations } = await priceBasket(tx, actor, input);
      if (input.ticketId) {
        const ticket = await tx.kitchenTicket.findFirst({ where: { businessId, id: input.ticketId } });
        if (!ticket || !['QUEUED', 'PREPARING', 'READY'].includes(ticket.status)) throw new Failure(409, 'Order is no longer open');
        const frozenLines = basket.shape.lines.parse(ticket.lines);
        const frozenQuantities = new Map<string, Prisma.Decimal>();
        for (const line of frozenLines) frozenQuantities.set(line.productId, (frozenQuantities.get(line.productId) ?? decimal(0)).plus(line.quantity));
        if (items.length !== frozenQuantities.size || items.some(item => !frozenQuantities.get(item.productId)?.eq(item.quantity))) throw new Failure(409, 'Basket does not match the kitchen ticket');
        await tx.kitchenTicket.update({ where: { businessId_id: { businessId, id: ticket.id } }, data: { status: 'PAID' } });
      }
      let customerName: string | undefined;
      if (input.customerId) {
        if (!business.modules.some(module => module.key === 'customers')) throw new Failure(422, 'Customer selection is disabled');
        const customer = await tx.customer.findFirst({ where: { businessId, id: input.customerId, active: true }, select: { name: true } });
        if (!customer) throw new Failure(422, 'Customer is unavailable');
        customerName = customer.name;
      }
      let paid = decimal(0);
      for (const payment of input.payments) {
        if (decimal(payment.amount).lte(0)) throw new Failure(422, 'Payment amount must be positive');
        paid = paid.plus(payment.amount);
        if (payment.method === 'CASH' && decimal(payment.tendered).lt(payment.amount)) throw new Failure(422, 'Cash tendered is insufficient');
        if (payment.method === 'MANUAL_CARD' && !settings.allowManualCard) throw new Failure(422, 'Manual card confirmation is disabled');
      }
      if (!paid.eq(calculations.total)) throw new Failure(409, 'Payments must match the current total');
      const order = await tx.order.create({ data: {
        businessId, cashierId: userId, requestKey: input.requestKey, ticketId: input.ticketId, customerId: input.customerId, customerName, fingerprint, currency: business.currency,
        receipt: { name: business.name, address: settings.address, header: settings.receiptHeader, footer: settings.receiptFooter, width: settings.receiptWidth },
        ...calculations,
      } });
      await tx.orderItem.createMany({ data: items.map(item => ({ ...item, orderId: order.id })) });
      await tx.payment.createMany({ data: input.payments.map(payment => ({ businessId, orderId: order.id, ...payment })) });
      for (const item of items.filter(item => item.stockDeducted)) {
        const changed = await tx.product.updateMany({
          where: { businessId, id: item.productId, ...(!settings.allowOversell && { stock: { gte: item.quantity } }) },
          data: { stock: { decrement: item.quantity } },
        });
        if (!changed.count) throw new Failure(409, 'Insufficient stock for ' + item.name);
        await tx.inventoryMovement.create({ data: { businessId, productId: item.productId, actorId: userId, delta: item.quantity.negated(), reason: 'Sale ' + order.id } });
      }
      return tx.order.findUniqueOrThrow({ where: { id: order.id }, include: orderDetails });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const existing = await db.order.findUnique({ where: key, include: orderDetails });
      if (existing) return verify(existing);
    }
    throw error;
  }
}




