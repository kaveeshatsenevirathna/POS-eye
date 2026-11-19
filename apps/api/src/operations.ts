import type { Express } from 'express';
import { z } from 'zod';
import { access } from './auth';
import { basket, quote } from './checkout';
import { atomic, db, Failure } from './db';

const label = z.string().trim().min(1).max(100);
const cash = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/);
const open = ['QUEUED', 'PREPARING', 'READY'];

async function requireModule(businessId: string, key: string) {
  if (!await db.enabledModule.findUnique({ where: { businessId_key: { businessId, key } } })) throw new Failure(403, 'This module is disabled');
}
export function operations(app: Express) {
  app.get('/api/tables', async (req, res) => {
    const { businessId } = await access(req);
    await requireModule(businessId, 'tables');
    res.json(await db.restaurantTable.findMany({
      where: { businessId, active: true }, orderBy: { name: 'asc' },
      include: { tickets: { where: { status: { in: open } }, select: { id: true, status: true } } },
    }));
  });
  app.post('/api/tables', async (req, res) => {
    const { businessId } = await access(req, true);
    await requireModule(businessId, 'tables');
    res.status(201).json(await db.restaurantTable.create({ data: { businessId, name: label.parse(req.body?.name) } }));
  });
  app.get('/api/tickets', async (req, res) => {
    const { businessId } = await access(req);
    await requireModule(businessId, 'kitchen');
    res.json(await db.kitchenTicket.findMany({
      where: { businessId, status: { in: open } }, include: { table: { select: { name: true } } },
      orderBy: { createdAt: 'asc' }, take: 250,
    }));
  });
  app.post('/api/tickets', async (req, res) => {
    const a = await access(req);
    await requireModule(a.businessId, 'kitchen');
    const input = basket.pick({ lines: true }).extend({
      orderType: z.enum(['DINE_IN', 'TAKEAWAY', 'DELIVERY']),
      tableId: z.uuid().optional(), instructions: z.string().trim().max(400).default(''),
    }).parse(req.body);
    if (input.orderType === 'DINE_IN') {
      await requireModule(a.businessId, 'tables');
      if (!input.tableId) throw new Failure(422, 'Choose a table');
    } else if (input.tableId) throw new Failure(422, 'A table is only valid for dine-in');
    await quote(a, { lines: input.lines, discount: 0 });
    const ticket = await atomic(async tx => {
      if (input.tableId && !await tx.restaurantTable.findFirst({ where: { id: input.tableId, businessId: a.businessId, active: true } })) throw new Failure(422, 'Table is unavailable');
      const products = await tx.product.findMany({ where: { businessId: a.businessId, active: true, id: { in: input.lines.map(line => line.productId) } } });
      const names = new Map(products.map(product => [product.id, product.name]));
      if (input.lines.some(line => !names.has(line.productId))) throw new Failure(422, 'A product is unavailable');
      return tx.kitchenTicket.create({ data: { ...input, lines: input.lines.map(line => ({ ...line, name: names.get(line.productId)! })), businessId: a.businessId, cashierId: a.userId } });
    });
    res.status(201).json(ticket);
  });
  app.patch('/api/tickets/:id', async (req, res) => {
    const { businessId, userId, role } = await access(req);
    await requireModule(businessId, 'kitchen');
    const id = z.uuid().parse(req.params.id);
    const input = z.object({ status: z.enum(['PREPARING', 'READY', 'CANCELLED']).optional(), tableId: z.uuid().optional() }).refine(value => Boolean(value.status) !== Boolean(value.tableId)).parse(req.body);
    if (input.tableId) await requireModule(businessId, 'tables');
    await atomic(async tx => {
      const ticket = await tx.kitchenTicket.findFirst({ where: { businessId, id } });
      if (!ticket) throw new Failure(404, 'Order not found');
      if (input.status === 'CANCELLED' && role !== 'ADMIN' && ticket.cashierId !== userId) throw new Failure(403, 'Only the order creator or an admin can cancel this order');
      const expected = input.status === 'PREPARING' ? ['QUEUED'] : input.status === 'READY' ? ['PREPARING'] : open;
      if (!expected.includes(ticket.status)) throw new Failure(409, 'Order status changed. Refresh and try again.');
      if (input.tableId && (ticket.orderType !== 'DINE_IN' || !await tx.restaurantTable.findFirst({ where: { businessId, id: input.tableId, active: true } }))) throw new Failure(422, 'Table is unavailable');
      await tx.kitchenTicket.update({ where: { businessId_id: { businessId, id } }, data: input });
    });
    res.sendStatus(204);
  });
  app.get('/api/shifts', async (req, res) => {
    const a = await access(req);
    res.json(await db.employeeShift.findMany({
      where: { businessId: a.businessId, ...(a.role === 'STAFF' && { userId: a.userId }) },
      include: { membership: { select: { user: { select: { name: true } } } } },
      orderBy: { openedAt: 'desc' }, take: 100,
    }));
  });
  app.post('/api/shifts', async (req, res) => {
    const a = await access(req);
    const openingCash = cash.parse(req.body?.openingCash);
    res.status(201).json(await db.employeeShift.create({ data: { businessId: a.businessId, userId: a.userId, openingCash } }));
  });
  app.patch('/api/shifts/:id', async (req, res) => {
    const a = await access(req);
    const closingCash = cash.parse(req.body?.closingCash);
    const result = await db.employeeShift.updateMany({
      where: { id: z.uuid().parse(req.params.id), businessId: a.businessId, closedAt: null, ...(a.role === 'STAFF' && { userId: a.userId }) },
      data: { closingCash, closedAt: new Date() },
    });
    if (!result.count) throw new Failure(404, 'Open shift not found');
    res.sendStatus(204);
  });
}
