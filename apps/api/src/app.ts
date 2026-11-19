import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import PDFDocument from 'pdfkit';
import { z } from 'zod';
import { resolve } from 'node:path';
import { access, createSession, endSession, identity, passwordHash, validPassword } from './auth';
import { db, atomic, Failure, Prisma } from './db';
import { basket, checkout, checkoutInput, orderDetails, quote } from './checkout';
import { report, refundOrder } from './report';
import { decimal } from './money';
import { operations } from './operations';
import { contacts } from './contacts';
import { presets, modules, metadataFields } from '../../../packages/shared/business';

const app = express();
const production = process.env.NODE_ENV === 'production';
const origin = process.env.APP_ORIGIN ?? 'http://127.0.0.1:5173';
const name = z.string().trim().min(1).max(100);
const email = z.email().max(254).transform(v => v.toLowerCase());
const password = z.string().min(12).max(128);
const cash = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/);
const stock = z.string().regex(/^\d{1,9}(\.\d{1,3})?$/);
const type = z.enum(Object.keys(presets) as [keyof typeof presets, ...(keyof typeof presets)[]]);
const businessData = z.object({ name, type, currency: z.string().regex(/^[A-Z]{3}$/), timezone: z.string().max(64).refine(value => {
  try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; }
}) });
const profile = z.object({ name, email, password });
const settingsData = z.object({
  taxRate: z.number().min(0).max(100), taxInclusive: z.boolean(), allowOversell: z.boolean(), allowManualCard: z.boolean(),
  staffDiscountLimit: z.number().min(0).max(100), accent: z.string().regex(/^#[0-9a-f]{6}$/i),
  receiptHeader: z.string().max(200), receiptFooter: z.string().max(200), receiptWidth: z.union([z.literal(58), z.literal(80)]),
  address: z.string().max(250), phone: z.string().max(32), email: z.union([z.email(), z.literal('')]),
});
const productData = z.object({
  name, description: z.string().max(1000).default(''), categoryId: z.uuid().nullable().default(null), supplierId: z.uuid().nullable().optional(),
  sku: name.nullable().default(null), barcode: name.nullable().default(null), image: z.url({ protocol: /^https$/ }).nullable().default(null),
  price: cash, cost: cash.nullable().default(null), reorder: stock.default('0'),
  metadata: z.record(z.string().max(40), z.string().max(250)).default({}), active: z.boolean().default(true),
});
const audit = (tx: Prisma.TransactionClient, businessId: string, actorId: string, action: string, target: string) =>
  tx.auditLog.create({ data: { businessId, actorId, action, target } });
const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false });

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: { directives: { imgSrc: ["'self'", 'https:', 'data:'], styleSrc: ["'self'", "'unsafe-inline'"] } } }));
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('origin') !== origin) return next(new Failure(403, 'Invalid request origin'));
  next();
});
app.use(express.json({ limit: '128kb' }));
app.get('/api/health', async (_req, res) => {
  await db.$queryRaw`SELECT 1`;
  res.json({ status: 'ok' });
});
const dummy = passwordHash('unused-password-for-login-timing');
app.post('/api/login', loginLimit, async (req, res) => {
  const input = profile.omit({ name: true }).parse(req.body);
  const user = await db.user.findUnique({ where: { email: input.email } });
  const valid = validPassword(input.password, user?.passwordHash ?? dummy);
  if (!valid || !user?.active || (production && user.demo)) throw new Failure(401, 'Invalid email or password');
  await endSession(req, res);
  await createSession(res, user.id);
  await db.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });
  res.json({ ok: true });
});
app.post('/api/logout', async (req, res) => { await endSession(req, res); res.sendStatus(204); });
app.post('/api/setup', loginLimit, async (req, res) => {
  if (process.env.ALLOW_SIGNUP !== 'true') throw new Failure(403, 'Business signup is disabled');
  const input = z.object({ admin: profile, business: businessData, settings: settingsData.partial().default({}), modules: z.array(z.enum(modules)).optional() }).parse(req.body);
  const hashed = passwordHash(input.admin.password);
  const selected = [...new Set(input.modules ?? presets[input.business.type])];
  const result = await atomic(async tx => {
    const user = await tx.user.create({ data: { name: input.admin.name, email: input.admin.email, passwordHash: hashed } });
    const business = await tx.business.create({ data: {
      ...input.business, settings: { create: input.settings }, memberships: { create: { userId: user.id, role: 'ADMIN' } },
      modules: { create: selected.map(key => ({ key })) },
    } });
    return { userId: user.id, businessId: business.id };
  });
  await endSession(req, res);
  await createSession(res, result.userId);
  res.status(201).json({ businessId: result.businessId });
});
app.get('/api/me', async (req, res) => {
  const user = await identity(req);
  const memberships = await db.businessMembership.findMany({
    where: { userId: user.id, active: true, ...(production && { business: { demo: false } }) },
    select: { role: true, business: true },
  });
  res.json({ id: user.id, name: user.name, email: user.email, memberships });
});
app.get('/api/config', async (req, res) => {
  const a = await access(req);
  const business = await db.business.findUniqueOrThrow({ where: { id: a.businessId }, include: { settings: true, modules: true } });
  res.json(business);
});
app.put('/api/config', async (req, res) => {
  const a = await access(req, true);
  const input = z.object({ business: businessData, settings: settingsData, modules: z.array(z.enum(modules)) }).parse(req.body);
  if (input.business.currency !== a.business.currency && await db.order.count({ where: { businessId: a.businessId } })) throw new Failure(409, 'Currency is locked after the first sale');
  await atomic(async tx => {
    const current = await tx.business.findUniqueOrThrow({ where: { id: a.businessId } });
    if (input.business.currency !== current.currency && await tx.order.count({ where: { businessId: a.businessId } })) throw new Failure(409, 'Currency is locked after the first sale');
    await tx.business.update({ where: { id: a.businessId }, data: { ...input.business, settings: { update: input.settings } } });
    await tx.enabledModule.deleteMany({ where: { businessId: a.businessId } });
    await tx.enabledModule.createMany({ data: [...new Set(input.modules)].map(key => ({ businessId: a.businessId, key })) });
    await audit(tx, a.businessId, a.userId, 'business.updated', a.businessId);
  });
  res.sendStatus(204);
});
app.get('/api/categories', async (req, res) => {
  const { businessId } = await access(req);
  res.json(await db.category.findMany({ where: { businessId }, orderBy: { name: 'asc' } }));
});
app.post('/api/categories', async (req, res) => {
  const { businessId } = await access(req, true);
  res.status(201).json(await db.category.create({ data: { businessId, name: name.parse(req.body?.name) } }));
});
app.patch('/api/categories/:id', async (req, res) => {
  const { businessId } = await access(req, true);
  const result = await db.category.update({ where: { businessId_id: { businessId, id: z.uuid().parse(req.params.id) } }, data: { name: name.parse(req.body?.name) } });
  res.json(result);
});
app.get('/api/products', async (req, res) => {
  const a = await access(req);
  const all = req.query.all === 'true' && a.role === 'ADMIN';
  const products = await db.product.findMany({ where: { businessId: a.businessId, ...(!all && { active: true }) }, include: { category: true }, orderBy: { name: 'asc' } });
  res.json(products.map(({ cost, ...product }) => a.role === 'ADMIN' ? { ...product, cost } : product));
});
app.put('/api/products/:id', async (req, res) => {
  const a = await access(req, true);
  const id = req.params.id === 'new' ? null : z.uuid().parse(req.params.id);
  const data = productData.parse(req.body);
  const allowed = metadataFields[a.business.type] ?? [];
  if (Object.keys(data.metadata).some(key => !allowed.includes(key))) throw new Failure(422, 'Unsupported product attribute');
  const product = await atomic(async tx => {
    if (data.categoryId && !await tx.category.findFirst({ where: { businessId: a.businessId, id: data.categoryId } })) throw new Failure(422, 'Category is unavailable');
    if (data.supplierId && (!await tx.enabledModule.findUnique({ where: { businessId_key: { businessId: a.businessId, key: 'suppliers' } } }) ||
      !await tx.supplier.findFirst({ where: { businessId: a.businessId, id: data.supplierId, active: true } }))) throw new Failure(422, 'Supplier is unavailable');
    const where = id ? { businessId_id: { businessId: a.businessId, id } } : null;
    const existing = where ? await tx.product.findUniqueOrThrow({ where }) : null;
    const retained: Record<string, string> = {};
    for (const [key, value] of Object.entries(existing?.metadata ?? {})) {
      if (typeof value === 'string' && !allowed.includes(key)) retained[key] = value;
    }
    const saved = where
      ? await tx.product.update({ where, data: { ...data, metadata: { ...retained, ...data.metadata } } })
      : await tx.product.create({ data: { ...data, businessId: a.businessId } });
    await audit(tx, a.businessId, a.userId, id ? 'product.updated' : 'product.created', saved.id);
    return saved;
  });
  res.json(product);
});
app.get('/api/inventory', async (req, res) => {
  const { businessId } = await access(req, true);
  res.json(await db.inventoryMovement.findMany({ where: { businessId }, include: { product: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 200 }));
});
app.post('/api/inventory', async (req, res) => {
  const a = await access(req, true);
  const input = z.object({ productId: z.uuid(), delta: z.string().regex(/^-?\d{1,9}(\.\d{1,3})?$/).refine(v => Number(v) !== 0), reason: name }).parse(req.body);
  await atomic(async tx => {
    if (!await tx.enabledModule.findUnique({ where: { businessId_key: { businessId: a.businessId, key: 'inventory' } } })) throw new Failure(403, 'Inventory is disabled');
    const delta = decimal(input.delta);
    const updated = await tx.product.updateMany({ where: { businessId: a.businessId, id: input.productId, ...(delta.isNegative() && { stock: { gte: delta.negated() } }) }, data: { stock: { increment: delta } } });
    if (!updated.count) throw new Failure(409, 'Product unavailable or adjustment exceeds stock');
    await tx.inventoryMovement.create({ data: { ...input, businessId: a.businessId, actorId: a.userId } });
  });
  res.sendStatus(204);
});
app.get('/api/employees', async (req, res) => {
  const { businessId } = await access(req, true);
  res.json(await db.businessMembership.findMany({ where: { businessId }, select: { role: true, active: true, user: { select: { id: true, name: true, email: true, lastLogin: true, createdAt: true } } } }));
});
app.post('/api/employees', async (req, res) => {
  const a = await access(req, true);
  const input = profile.extend({ role: z.enum(['ADMIN', 'STAFF']) }).parse(req.body);
  const hashed = passwordHash(input.password);
  await atomic(async tx => {
    const employee = await tx.user.create({ data: { name: input.name, email: input.email, passwordHash: hashed, memberships: { create: { businessId: a.businessId, role: input.role } } } });
    await audit(tx, a.businessId, a.userId, 'employee.created', employee.id);
  });
  res.sendStatus(201);
});
app.patch('/api/employees/:id', async (req, res) => {
  const a = await access(req, true);
  const id = z.uuid().parse(req.params.id);
  const input = z.object({ active: z.boolean() }).parse(req.body);
  if (id === a.userId) throw new Failure(422, 'You cannot disable your own membership');
  await atomic(async tx => {
    await tx.businessMembership.update({ where: { businessId_userId: { businessId: a.businessId, userId: id } }, data: input });
    await audit(tx, a.businessId, a.userId, 'employee.access.updated', id);
  });
  res.sendStatus(204);
});
app.post('/api/quote', async (req, res) => res.json(await quote(await access(req), basket.parse(req.body))));
app.post('/api/checkout', async (req, res) => {
  const a = await access(req);
  const { items, fingerprint: _fingerprint, ...sale } = await checkout(a, checkoutInput.parse(req.body));
  res.json({ ...sale, items: items.map(({ cost: _cost, ...item }) => item) });
});
app.get('/api/sales', async (req, res) => {
  const a = await access(req);
  const orders = await db.order.findMany({ where: { businessId: a.businessId, ...(a.role === 'STAFF' && { cashierId: a.userId }) }, include: orderDetails, orderBy: { createdAt: 'desc' }, take: 250 });
  res.json(orders.map(({ fingerprint: _fingerprint, items, ...sale }) => ({ ...sale, items: items.map(({ cost, ...item }) => a.role === 'ADMIN' ? { ...item, cost } : item) })));
});
app.get('/api/sales/:id/receipt.pdf', async (req, res) => {
  const a = await access(req);
  const sale = await db.order.findFirst({ where: { businessId: a.businessId, id: z.uuid().parse(req.params.id), ...(a.role === 'STAFF' && { cashierId: a.userId }) }, include: orderDetails });
  if (!sale) throw new Failure(404, 'Sale not found');
  const branding = z.object({ name, address: z.string(), header: z.string(), footer: z.string(), width: z.number() }).parse(sale.receipt);
  const lines = [branding.name, branding.address, branding.header, sale.createdAt.toISOString(), 'Sale ' + sale.id,
    ...sale.items.map(item => item.quantity + ' x ' + item.name + ' @ ' + item.price.toFixed(2)),
    'Discount: ' + sale.discount.toFixed(2), 'Tax: ' + sale.tax.toFixed(2), 'Total: ' + sale.currency + ' ' + sale.total.toFixed(2),
    ...sale.payments.map(p => p.method + ' ' + p.amount.toFixed(2) + (p.tendered ? ' / change ' + p.tendered.minus(p.amount).toFixed(2) : '')), branding.footer].filter(Boolean);
  const document = new PDFDocument({ size: [branding.width * 72 / 25.4, Math.max(270, 100 + lines.reduce((height, line) => height + 16 * Math.ceil(line.length / 24), 0))], margin: 12 });
  res.type('application/pdf');
  document.pipe(res);
  document.fontSize(9);
  for (const line of lines) document.text(line, { lineGap: 3 });
  document.end();
});
app.post('/api/sales/:id/refund', async (req, res) => {
  const a = await access(req, true);
  const input = z.object({ reason: name, restocked: z.boolean() }).parse(req.body);
  res.status(201).json(await refundOrder(a.businessId, a.userId, z.uuid().parse(req.params.id), input.reason, input.restocked));
});
app.get('/api/expenses', async (req, res) => {
  const { businessId } = await access(req, true);
  res.json(await db.expense.findMany({ where: { businessId }, orderBy: { createdAt: 'desc' }, take: 200 }));
});
app.post('/api/expenses', async (req, res) => {
  const { businessId } = await access(req, true);
  res.status(201).json(await db.expense.create({ data: { businessId, ...z.object({ name, category: name, amount: cash.refine(v => Number(v) > 0) }).parse(req.body) } }));
});
app.get('/api/audit', async (req, res) => {
  const { businessId } = await access(req, true);
  res.json(await db.auditLog.findMany({ where: { businessId }, orderBy: { createdAt: 'desc' }, take: 200 }));
});
app.get('/api/report', async (req, res) => {
  const a = await access(req, true);
  const range = z.object({ start: z.iso.datetime({ offset: true }), end: z.iso.datetime({ offset: true }) }).parse(req.query);
  const start = new Date(range.start), end = new Date(range.end);
  if (end <= start || +end - +start > 367 * 86400000) throw new Failure(422, 'Select a reporting window of up to one year');
  const data = await report(a.businessId, start, end, a.business.timezone);
  if (req.query.format !== 'pdf') { res.json(data); return; }
  const document = new PDFDocument({ size: 'A4', margin: 45 });
  res.type('application/pdf');
  document.pipe(res);
  document.fontSize(22).text(a.business.name).fontSize(14).text('Financial summary');
  document.moveDown().fontSize(10).text(start.toISOString() + ' to ' + end.toISOString() + ' (exclusive)');
  document.moveDown();
  const metrics = [
    ['Gross sales', data.gross], ['Discounts', data.discounts], ['Refunds including tax', data.refundTotal],
    ['Net sales including tax', data.netSales], ['Net tax collected', data.tax], ['Revenue excluding tax', data.revenue], ['Cost of goods sold', data.cogs],
    [data.missingCosts ? 'Estimated gross profit (costs missing)' : 'Gross profit', data.grossProfit],
    ['Recorded expenses', data.operatingExpenses], ['Estimated net profit', data.estimatedNetProfit],
  ] as const;
  for (const [label, value] of metrics) document.text(label + '   ' + a.business.currency + ' ' + value.toFixed(2), { lineGap: 6 });
  document.end();
});
operations(app);
contacts(app);
app.use('/api', (_req, _res, next) => next(new Failure(404, 'Endpoint not found')));
if (production) {
  const web = resolve('dist/web');
  app.use(express.static(web));
  app.get('/{*path}', (_req, res) => res.sendFile(resolve(web, 'index.html')));
}
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof Failure) { res.status(error.status).json({ error: error.message }); return; }
  if (error instanceof z.ZodError) { res.status(422).json({ error: error.issues.map(issue => issue.path.join('.') + ' ' + issue.message).join('; ') }); return; }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002' || error.code === 'P2034') { res.status(409).json({ error: 'This record conflicts with existing data. Refresh and retry.' }); return; }
    if (error.code === 'P2025') { res.status(404).json({ error: 'Record not found' }); return; }
  }
  if (error instanceof SyntaxError) { res.status(400).json({ error: 'Invalid JSON' }); return; }
  console.error(error instanceof Error ? error.name : 'Unknown server error');
  res.status(500).json({ error: 'The operation could not be completed' });
});
export { app };








