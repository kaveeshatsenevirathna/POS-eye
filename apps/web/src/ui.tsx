import { useState, type FormEvent, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

export type Business = { id: string; name: string; currency: string; type: string; timezone: string; demo: boolean };
export type Config = Business & { modules: { key: string }[]; settings: {
  taxRate: string; taxInclusive: boolean; allowOversell: boolean; allowManualCard: boolean; staffDiscountLimit: string;
  accent: string; receiptHeader: string; receiptFooter: string; receiptWidth: number; address: string; phone: string; email: string;
} };
export type Category = { id: string; name: string };
export type Product = {
  id: string; supplierId?: string | null; name: string; description: string; categoryId: string | null; sku: string | null; barcode: string | null;
  image: string | null; price: string; cost?: string | null; stock: string; reorder: string;
  metadata: Record<string, string>; active: boolean;
};
export type Sale = {
  id: string; customerName?: string; createdAt: string; total: string; currency: string; refund: { reason: string } | null;
  items: { id: string; quantity: string; name: string; price: string }[];
  payments: { method: string; amount: string; tendered?: string }[];
};
export async function api<T>(path: string, business = '', method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch('/api/' + path, {
    method, headers: { ...(business && { 'x-business-id': business }), ...(body !== undefined && { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error ?? 'Request failed (' + response.status + ')');
  }
  if (response.status === 204 || !response.headers.get('content-type')?.includes('application/json')) return undefined as T;
  return response.json() as Promise<T>;
}
export function useData<T>(path: string, id: string, enabled = true) {
  return useQuery({ queryKey: [id, path], queryFn: () => api<T>(path, id), enabled });
}
export const money = (value: string | number, currency: string) => new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(value));
export function Notice({ children }: { children: ReactNode }) { return <div className="notice" role="alert">{children}</div>; }
export function Empty({ children }: { children: ReactNode }) { return <div className="empty">{children}</div>; }
export function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="field">{label}{children}</label>; }
export function values(event: FormEvent<HTMLFormElement>) { return Object.fromEntries(new FormData(event.currentTarget)); }
export function useAction(id: string) {
  const query = useQueryClient();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function run<T>(action: () => Promise<T>, success?: (value: T) => void) {
    setError('');
    setBusy(true);
    try { const value = await action(); success?.(value); void query.invalidateQueries({ queryKey: [id] }); }
    catch (err) { setError(err instanceof Error ? err.message : 'Request failed'); }
    finally { setBusy(false); }
  }
  return { run, busy, error };
}
export function saveFile(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export async function receipt(id: string, saleId: string, mode: 'download' | 'print' = 'download') {
  const preview = mode === 'print' ? window.open('about:blank', '_blank') : null;
  if (mode === 'print' && !preview) throw new Error('Allow pop-ups to open the printable receipt');
  if (preview) preview.opener = null;
  try {
    const response = await fetch('/api/sales/' + saleId + '/receipt.pdf', { headers: { 'x-business-id': id } });
    if (!response.ok) throw new Error('Receipt could not be loaded');
    const blob = await response.blob();
    if (preview) {
      const url = URL.createObjectURL(blob);
      preview.location.replace(url);
      setTimeout(() => URL.revokeObjectURL(url), 300000);
    } else saveFile('receipt-' + saleId.slice(0, 8) + '.pdf', blob);
  } catch (error) {
    preview?.close();
    throw error;
  }
}


export function csv(rows: (string | number)[][]) {
  return new Blob([rows.map(row => row.map(cell => {
    const raw = String(cell);
    const value = /^[=+@-]/.test(raw) && isNaN(Number(raw)) ? "'" + raw : raw;
    return '"' + value.replaceAll('"', '""') + '"';
  }).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
}



