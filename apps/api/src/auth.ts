import { randomBytes, createHash, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { db, Failure } from './db';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export function passwordHash(password: string, salt = randomBytes(16).toString('hex')) {
  return salt + ':' + scryptSync(password, salt, 64).toString('hex');
}
export function validPassword(password: string, stored: string) {
  const actual = passwordHash(password, stored.split(':')[0]);
  return timingSafeEqual(Buffer.from(stored), Buffer.from(actual));
}
const cookie = { httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/' };
const maxAge = 12 * 60 * 60 * 1000;
export async function createSession(response: Response, userId: string) {
  const token = randomBytes(32).toString('hex');
  await db.session.create({ data: { userId, tokenHash: hash(token), expiresAt: new Date(Date.now() + maxAge) } });
  response.cookie('omnipos_session', token, { ...cookie, maxAge });
}
function sessionKey(request: Request) {
  const match = request.headers.cookie?.match(/(?:^|;\s*)omnipos_session=([0-9a-f]{64})(?:;|$)/);
  return match ? hash(match[1]) : '';
}
export async function endSession(request: Request, response: Response) {
  await db.session.deleteMany({ where: { tokenHash: sessionKey(request) } });
  response.clearCookie('omnipos_session', cookie);
}
export async function identity(request: Request) {
  const session = await db.session.findUnique({ where: { tokenHash: sessionKey(request) }, include: { user: true } });
  if (!session || session.expiresAt <= new Date() || !session.user.active || (process.env.NODE_ENV === 'production' && session.user.demo)) throw new Failure(401, 'Sign in to continue');
  return session.user;
}
export async function access(request: Request, admin = false) {
  const user = await identity(request);
  const businessId = request.header('x-business-id');
  if (!businessId || !/^[0-9a-f-]{36}$/i.test(businessId)) throw new Failure(400, 'Select a business');
  const membership = await db.businessMembership.findFirst({ where: { businessId, userId: user.id, active: true }, include: { business: true } });
  if (!membership || (admin && membership.role !== 'ADMIN') || (process.env.NODE_ENV === 'production' && membership.business.demo)) throw new Failure(403, 'Access denied');
  return { businessId, userId: user.id, role: membership.role, business: membership.business };
}
