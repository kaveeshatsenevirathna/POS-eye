import type { Express } from 'express';
import { z } from 'zod';
import { access } from './auth';
import { atomic, db, Failure } from './db';

const record = z.object({
  name: z.string().trim().min(1).max(100), email: z.union([z.email().max(254), z.literal('')]),
  phone: z.string().trim().max(40), notes: z.string().trim().max(500), active: z.boolean(),
});
export function contacts(app: Express) {
  for (const key of ['customers', 'suppliers'] as const) {
    const isCustomer = key === 'customers';
    app.get('/api/' + key, async (req, res) => {
      const { businessId, role } = await access(req, !isCustomer);
      if (!await db.enabledModule.findUnique({ where: { businessId_key: { businessId, key } } })) throw new Failure(403, 'This module is disabled');
      if (isCustomer && role !== 'ADMIN') {
        res.json(await db.customer.findMany({ where: { businessId, active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 500 }));
        return;
      }
      const query = { where: { businessId }, orderBy: { name: 'asc' as const }, take: 500 };
      res.json(isCustomer ? await db.customer.findMany(query) : await db.supplier.findMany(query));
    });
    app.put('/api/' + key + '/:id', async (req, res) => {
      const { businessId, userId } = await access(req, true);
      const id = req.params.id === 'new' ? null : z.uuid().parse(req.params.id);
      const data = record.parse(req.body);
      const saved = await atomic(async tx => {
        if (!await tx.enabledModule.findUnique({ where: { businessId_key: { businessId, key } } })) throw new Failure(403, 'This module is disabled');
        const where = { businessId_id: { businessId, id: id ?? '' } };
        const result = isCustomer
          ? (id ? await tx.customer.update({ where, data }) : await tx.customer.create({ data: { ...data, businessId } }))
          : (id ? await tx.supplier.update({ where, data }) : await tx.supplier.create({ data: { ...data, businessId } }));
        await tx.auditLog.create({ data: { businessId, actorId: userId, action: key + (id ? '.updated' : '.created'), target: result.id } });
        return result;
      });
      res.json(saved);
    });
  }
}
