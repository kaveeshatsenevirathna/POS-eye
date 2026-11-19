import { randomUUID } from 'node:crypto';
import { db } from '../apps/api/src/db';
import { passwordHash } from '../apps/api/src/auth';
import { checkout } from '../apps/api/src/checkout';
import { totals, decimal } from '../apps/api/src/money';
import { presets } from '../packages/shared/business';

const demos = [
  { type: 'restaurant', name: 'Juniper Kitchen', category: 'Lunch', items: [{ name: 'Charred mushroom bowl', price: '14.50' }, { name: 'Tomato sourdough toast', price: '9.75' }] },
  { type: 'cafe', name: 'Stillwater Coffee', category: 'Coffee', items: [{ name: 'Flat white', price: '4.50' }, { name: 'Cold brew', price: '5.25' }] },
  { type: 'bookshop', name: 'Dog-Eared Books', category: 'Fiction', items: [{ name: 'Pride and Prejudice', price: '12.00', metadata: { author: 'Jane Austen', isbn: '9780141439518', publisher: 'Penguin Classics' } }, { name: 'Jane Eyre', price: '13.75', metadata: { author: 'Charlotte Bronte', isbn: '9780141441146', publisher: 'Penguin Classics' } }] },
  { type: 'retail', name: 'Fieldwork Supply', category: 'Accessories', items: [{ name: 'Canvas tote', price: '18.50' }, { name: 'Woven belt', price: '24.00' }] },
] as const;
async function seed() {
  if (process.env.NODE_ENV === 'production' || process.env.ALLOW_DEMO_SEED !== 'true') throw new Error('Demo seed requires explicit local opt-in');
  const admin = await db.user.upsert({ where: { email: 'admin@omnipos.test' }, update: {}, create: { email: 'admin@omnipos.test', name: 'Demo Administrator', passwordHash: passwordHash('OmniPOS-demo-admin!'), demo: true } });
  const staff = await db.user.upsert({ where: { email: 'cashier@omnipos.test' }, update: {}, create: { email: 'cashier@omnipos.test', name: 'Demo Cashier', passwordHash: passwordHash('OmniPOS-demo-staff!'), demo: true } });
  if (!admin.demo || !staff.demo) throw new Error('Demo emails are already in use by non-demo accounts');
  for (const demo of demos) {
    if (await db.business.findFirst({ where: { name: demo.name, demo: true } })) continue;
    const business = await db.business.create({ data: {
      name: demo.name, type: demo.type, demo: true, currency: 'USD', timezone: 'UTC',
      settings: { create: { taxRate: 8, receiptFooter: 'Thanks for shopping with us.' } },
      modules: { create: presets[demo.type].map(key => ({ key })) },
      memberships: { create: [{ userId: admin.id, role: 'ADMIN' }, { userId: staff.id, role: 'STAFF' }] },
    } });
    if (demo.type === 'restaurant') await db.restaurantTable.createMany({ data: ['Window 1', 'Window 2', 'Patio 1', 'Patio 2'].map(name => ({ businessId: business.id, name })) });
    const category = await db.category.create({ data: { businessId: business.id, name: demo.category } });
    for (const [index, item] of demo.items.entries()) {
      const product = await db.$transaction(async tx => {
        const product = await tx.product.create({ data: {
          businessId: business.id, categoryId: category.id, name: item.name, price: item.price, cost: decimal(item.price).mul(.45).toDecimalPlaces(2),
          stock: 60, reorder: 5, metadata: 'metadata' in item ? { ...item.metadata } : {}, sku: demo.type.toUpperCase() + '-' + (index + 1),
        } });
        await tx.inventoryMovement.create({ data: { businessId: business.id, productId: product.id, actorId: admin.id, delta: 60, reason: 'Opening inventory' } });
        return product;
      });
      for (let day = 1; day <= 14; day++) {
        const quantity = index + day % 3 + 1;
        const total = totals(product.price.mul(quantity), 0, 8, false).total.toFixed(2);
        const sale = await checkout({ businessId: business.id, userId: staff.id, role: 'STAFF' }, {
          requestKey: randomUUID(), lines: [{ productId: product.id, quantity: String(quantity) }], discount: 0,
          payments: [{ method: 'CASH', amount: total, tendered: total }],
        });
        await db.order.update({ where: { id: sale.id }, data: { createdAt: new Date(Date.now() - day * 86400000) } });
      }
    }
  }
}
seed().finally(() => db.$disconnect()).catch(error => { console.error(error); process.exitCode = 1; });


