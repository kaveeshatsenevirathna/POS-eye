import { useState } from 'react';


import { metadataFields, modules, presets } from '../../../packages/shared/business';
import { api, csv, Empty, Field, money, Notice, receipt, saveFile, useAction, useData, values, type Category, type Config, type Product, type Sale } from './ui';

export function Catalog({ config }: { config: Config }) {
  const products = useData<Product[]>('products?all=true', config.id);
  const supplierMode = config.modules.some(module => module.key === 'suppliers');
  const suppliers = useData<Contact[]>('suppliers', config.id, supplierMode);
  const categories = useData<Category[]>('categories', config.id);
  const action = useAction(config.id);
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const item = editing === 'new' ? null : editing;
  const fields = metadataFields[config.type] ?? [];
  return <section className="panel stack">
    <div className="panel-title"><h2>Product catalog</h2><button className="primary" onClick={() => setEditing('new')}>Add product</button></div>
    {(action.error || products.error) && <Notice>{action.error || products.error?.message}</Notice>}
    {editing && <form key={item?.id ?? 'new'} className="form-grid" onSubmit={event => {
      event.preventDefault(); const v = values(event);
      const metadata = Object.fromEntries(fields.filter(key => v[key]).map(key => [key, v[key]]));
      void action.run(() => api('products/' + (item?.id ?? 'new'), config.id, 'PUT', { name: v.name, description: v.description, price: v.price, cost: v.cost || null, categoryId: v.categoryId || null, ...(supplierMode && (v.supplierId || null) !== (item?.supplierId ?? null) && { supplierId: v.supplierId || null }), sku: v.sku || null, barcode: v.barcode || null, image: v.image || null, active: v.active === 'on', reorder: v.reorder, metadata }), () => setEditing(null));
    }}>
      <Field label="Product name"><input name="name" required defaultValue={item?.name}/></Field>
      <Field label="Description"><input name="description" defaultValue={item?.description}/></Field>
      <Field label="Price"><input name="price" required type="number" min="0" step=".01" defaultValue={item?.price}/></Field>
      <Field label="Unit cost"><input name="cost" type="number" min="0" step=".01" defaultValue={item?.cost ?? ''}/></Field>
      <Field label="Category"><select name="categoryId" defaultValue={item?.categoryId ?? ''}><option value="">Uncategorized</option>{categories.data?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      {supplierMode && <Field label="Supplier"><select name="supplierId" defaultValue={item?.supplierId ?? ''}><option value="">No supplier assigned</option>{suppliers.data?.filter(s => s.active || s.id === item?.supplierId).map(s => <option key={s.id} value={s.id}>{s.name}{s.active ? '' : ' (archived)'}</option>)}</select></Field>}
      <Field label="SKU"><input name="sku" defaultValue={item?.sku ?? ''}/></Field>
      <Field label="Barcode"><input name="barcode" defaultValue={item?.barcode ?? ''}/></Field>
      <Field label="Image HTTPS URL"><input name="image" type="url" defaultValue={item?.image ?? ''}/></Field>
      <Field label="Reorder level"><input name="reorder" type="number" min="0" step=".001" defaultValue={item?.reorder ?? '0'}/></Field>
      {fields.map(field => <Field key={field} label={field}><input name={field} defaultValue={item?.metadata[field]}/></Field>)}
      <label className="check"><input name="active" type="checkbox" defaultChecked={item?.active ?? true}/> Active</label>
      <div className="actions"><button type="button" onClick={() => setEditing(null)}>Cancel</button><button className="primary" disabled={action.busy}>Save product</button></div>
    </form>}
    <div className="table-wrap"><table><thead><tr><th>Product</th><th>SKU</th><th>Price</th><th>Stock</th><th>Status</th><th/></tr></thead><tbody>{products.data?.map(p => <tr key={p.id}><td>{p.name}</td><td>{p.sku || '—'}</td><td>{money(p.price, config.currency)}</td><td>{p.stock}</td><td>{p.active ? 'Active' : 'Archived'}</td><td><button onClick={() => setEditing(p)}>Edit</button></td></tr>)}</tbody></table></div>
    {products.data?.length === 0 && <Empty>Add a product to start building your catalog.</Empty>}
  </section>;
}
export function Records({ config, screen }: { config: Config; screen: string }) {
  const paths: Record<string, string> = { categories: 'categories', inventory: 'inventory', employees: 'employees', expenses: 'expenses', 'audit-logs': 'audit' };
  const path = paths[screen];
  const data = useData<Record<string, unknown>[]>(path, config.id);
  const products = useData<Product[]>('products', config.id);
  const action = useAction(config.id);
  const [category, setCategory] = useState<Category | null>(null);
  const fields: Record<string, [string, string, string][]> = {
    categories: [['name', 'Category name', 'text']], inventory: [['delta', 'Quantity change (+ / −)', 'number'], ['reason', 'Movement reason', 'text']],
    expenses: [['name', 'Expense', 'text'], ['category', 'Category', 'text'], ['amount', 'Amount', 'number']],
    employees: [['name', 'Full name', 'text'], ['email', 'Email', 'email'], ['password', 'Initial password (12+ characters)', 'password']],
  };
  const recordRows = data.data?.map(row => {
    if (screen === 'employees') return [row.user as { id: string; name: string; email: string }, String(row.role), Boolean(row.active)] as const;
    return null;
  });
  return <section className="panel stack">
    {(data.error || action.error) && <Notice>{action.error || data.error?.message}</Notice>}
    {fields[screen] && <form key={category?.id ?? 'new'} className="form-grid" onSubmit={event => {
      event.preventDefault(); const v = values(event); const form = event.currentTarget;
      void action.run(() => api(category ? path + '/' + category.id : path, config.id, category ? 'PATCH' : 'POST', v), () => { form.reset(); setCategory(null); });
    }}>
      {screen === 'inventory' && <Field label="Product"><select name="productId" required><option value="">Select product</option>{products.data?.map(p => <option value={p.id} key={p.id}>{p.name} ({p.stock})</option>)}</select></Field>}
      {fields[screen].map(([key, label, type]) => <Field key={key} label={label}><input name={key} required type={type} step={type === 'number' ? 'any' : undefined} defaultValue={key === 'name' ? category?.name : undefined}/></Field>)}
      {screen === 'employees' && <Field label="Role"><select name="role"><option>STAFF</option><option>ADMIN</option></select></Field>}
      <div className="actions">{category && <button type="button" onClick={() => setCategory(null)}>Cancel</button>}<button className="primary" disabled={action.busy}>{category ? 'Save category' : screen === 'inventory' ? 'Record movement' : 'Add record'}</button></div>
    </form>}
    <div className="table-wrap"><table><tbody>{data.data?.map((row, index) => <tr key={String(row.id ?? index)}>
      {screen === 'categories' && <><td>{String(row.name)}</td><td><button onClick={() => setCategory(row as Category)}>Edit</button></td></>}
      {screen === 'inventory' && <><td>{(row.product as { name: string }).name}</td><td>{String(row.delta)}</td><td>{String(row.reason)}</td></>}
      {screen === 'expenses' && <><td>{String(row.name)}</td><td>{String(row.category)}</td><td>{money(String(row.amount), config.currency)}</td></>}
      {screen === 'audit-logs' && <><td>{String(row.action)}</td><td>{String(row.target)}</td><td>{String(row.actorId)}</td></>}
      {row.createdAt != null && <td>{new Date(String(row.createdAt)).toLocaleString()}</td>}
      {recordRows?.[index] && (() => {
        const [employee, role, active] = recordRows[index];
        return <><td>{employee.name}</td><td>{employee.email}</td><td>{role}</td><td><button disabled={action.busy} onClick={() => void action.run(() => api('employees/' + employee.id, config.id, 'PATCH', { active: !active }))}>{active ? 'Disable membership' : 'Enable membership'}</button></td></>;
      })()}
    </tr>)}</tbody></table></div>
    {data.data?.length === 0 && <Empty>No records yet.</Empty>}
  </section>;
}
export function Sales({ config, admin, refunds = false }: { config: Config; admin: boolean; refunds?: boolean }) {
  const data = useData<Sale[]>('sales', config.id);
  const action = useAction(config.id);
  const [selection, setSelection] = useState<Sale | null>(null);
  const sales = data.data?.filter(sale => !refunds || sale.refund);
  return <section className="panel stack"><div className="panel-title"><h2>{refunds ? 'Completed refunds' : 'Transaction ledger'}</h2>{admin && <button disabled={!sales?.length} onClick={() => saveFile('sales.csv', csv([['ID', 'Date', 'Total', 'Currency', 'Status'], ...(sales ?? []).map(s => [s.id, s.createdAt, s.total, s.currency, s.refund ? 'Refunded' : 'Completed'])]))}>Export CSV</button>}</div>
    {(data.error || action.error) && <Notice>{action.error || data.error?.message}</Notice>}
    {selection && <form className="form-grid" key={selection.id} onSubmit={event => {
      event.preventDefault(); const v = values(event);
      void action.run(() => api('sales/' + selection.id + '/refund', config.id, 'POST', { reason: v.reason, restocked: v.restocked === 'on' }), () => setSelection(null));
    }}>
      <Field label={'Full cash refund · ' + money(selection.total, selection.currency)}><input name="reason" placeholder="Reason" required/></Field>
      <label className="check"><input type="checkbox" name="restocked"/> Items have been inspected and can be restocked</label>
      <div className="actions"><button type="button" onClick={() => setSelection(null)}>Cancel</button><button className="primary" disabled={action.busy}>Record refund</button></div>
    </form>}
    <div className="table-wrap"><table><thead><tr><th>Sale</th><th>Date</th><th>Status</th><th>Total</th><th>Actions</th></tr></thead><tbody>{sales?.map(s => <tr key={s.id}><td><details><summary>#{s.id.slice(0, 8)}{s.customerName && " · " + s.customerName}</summary>{s.items.map(i => <p key={i.id}>{i.quantity} × {i.name} @ {money(i.price, s.currency)}</p>)}</details></td><td>{new Date(s.createdAt).toLocaleString()}</td><td>{s.refund ? 'Refunded' : 'Completed'}</td><td>{money(s.total, s.currency)}</td><td className="actions"><button onClick={() => void action.run(() => receipt(config.id, s.id))}>Receipt PDF</button>{admin && !s.refund && s.payments.every(p => p.method === 'CASH') && <button onClick={() => setSelection(s)}>Refund</button>}</td></tr>)}</tbody></table></div>
    {sales?.length === 0 && <Empty>{refunds ? 'No refunds recorded.' : 'No completed sales yet.'}</Empty>}
  </section>;
}
export function Settings({ config }: { config: Config }) {
  const action = useAction(config.id);
  const [type, setType] = useState(config.type as keyof typeof presets);
  const [enabled, setEnabled] = useState(config.modules.map(m => m.key));
  const [saved, setSaved] = useState(false);
  const proposed: readonly string[] = presets[type];
  return <section className="panel stack"><div className="panel-title"><h2>Business configuration</h2></div>
    {action.error && <Notice>{action.error}</Notice>}{saved && <div className="success">Settings saved.</div>}
    <form className="form-grid" onSubmit={event => {
      event.preventDefault(); const v = values(event); setSaved(false);
      void action.run(() => api('config', config.id, 'PUT', {
        business: { name: v.name, type, currency: v.currency, timezone: v.timezone },
        settings: { taxRate: Number(v.taxRate), taxInclusive: v.taxInclusive === 'on', allowOversell: v.allowOversell === 'on', allowManualCard: v.allowManualCard === 'on', staffDiscountLimit: Number(v.staffDiscountLimit), accent: v.accent, receiptHeader: v.receiptHeader, receiptFooter: v.receiptFooter, receiptWidth: Number(v.receiptWidth), address: v.address, phone: v.phone, email: v.email },
        modules: enabled,
      }), () => setSaved(true));
    }}>
      <Field label="Business name"><input name="name" required defaultValue={config.name}/></Field>
      <Field label="Business type"><select value={type} onChange={e => setType(e.target.value as keyof typeof presets)}>{Object.keys(presets).map(key => <option key={key}>{key}</option>)}</select></Field>
      {type !== config.type && <div className="notice">Preset for {type}: {proposed.join(', ')}. Historical sales retain their original details. <button type="button" onClick={() => setEnabled([...proposed])}>Apply preset</button></div>}
      <Field label="Currency code"><input name="currency" required maxLength={3} defaultValue={config.currency}/></Field>
      <Field label="IANA time zone"><input name="timezone" required defaultValue={config.timezone}/></Field>
      <Field label="Address"><input name="address" defaultValue={config.settings.address}/></Field>
      <Field label="Phone"><input name="phone" defaultValue={config.settings.phone}/></Field>
      <Field label="Business email"><input name="email" type="email" defaultValue={config.settings.email}/></Field>
      <Field label="Accent color"><input name="accent" type="color" defaultValue={config.settings.accent}/></Field>
      <Field label="Tax rate (%)"><input name="taxRate" type="number" step=".001" min="0" max="100" defaultValue={config.settings.taxRate}/></Field>
      <Field label="Maximum staff discount (%)"><input name="staffDiscountLimit" type="number" step=".001" min="0" max="100" defaultValue={config.settings.staffDiscountLimit}/></Field>
      <Field label="Receipt header"><input name="receiptHeader" defaultValue={config.settings.receiptHeader}/></Field>
      <Field label="Receipt footer"><input name="receiptFooter" defaultValue={config.settings.receiptFooter}/></Field>
      <Field label="Thermal paper"><select name="receiptWidth" defaultValue={config.settings.receiptWidth}><option value="58">58 mm</option><option value="80">80 mm</option></select></Field>
      <label className="check"><input name="taxInclusive" type="checkbox" defaultChecked={config.settings.taxInclusive}/> Prices include tax</label>
      <label className="check"><input name="allowOversell" type="checkbox" defaultChecked={config.settings.allowOversell}/> Allow overselling</label>
      <label className="check"><input name="allowManualCard" type="checkbox" defaultChecked={config.settings.allowManualCard}/> Allow external card terminal confirmation</label>
      <fieldset className="module-grid"><legend>Available modules</legend>{modules.filter(key => ['inventory', 'barcode', 'weighted', 'tables', 'kitchen', 'customers', 'suppliers'].includes(key)).map(key => <label className="check" key={key}><input type="checkbox" checked={enabled.includes(key)} onChange={e => setEnabled(e.target.checked ? [...enabled, key] : enabled.filter(k => k !== key))}/> {key}</label>)}</fieldset>
      <div className="actions"><button className="primary" disabled={action.busy}>Save settings</button></div>
    </form></section>;
}





type Contact = { id: string; name: string; email: string; phone: string; notes: string; active: boolean };
export function Contacts({ config, collection }: { config: Config; collection: 'customers' | 'suppliers' }) {
  const query = useData<Contact[]>(collection, config.id);
  const action = useAction(config.id);
  const [editing, setEditing] = useState<Contact | 'new' | null>(null);
  const item = editing === 'new' ? null : editing;
  const singular = collection === 'customers' ? 'customer' : 'supplier';
  return <section className="panel stack">
    <div className="panel-title"><h2>{collection === 'customers' ? 'Customer directory' : 'Supplier directory'}</h2><button className="primary" onClick={() => setEditing('new')}>Add {singular}</button></div>
    {(action.error || query.error) && <Notice>{action.error || query.error?.message}</Notice>}
    {editing && <form className="form-grid" key={item?.id ?? 'new'} onSubmit={event => {
      event.preventDefault(); const data = values(event);
      void action.run(() => api(collection + '/' + (item?.id ?? 'new'), config.id, 'PUT', { ...data, active: data.active === 'on' }), () => setEditing(null));
    }}>
      <Field label="Name"><input name="name" required maxLength={100} defaultValue={item?.name}/></Field>
      <Field label="Email"><input name="email" type="email" defaultValue={item?.email}/></Field>
      <Field label="Phone"><input name="phone" type="tel" maxLength={40} defaultValue={item?.phone}/></Field>
      <Field label="Notes"><input name="notes" maxLength={500} defaultValue={item?.notes}/></Field>
      <label className="check"><input name="active" type="checkbox" defaultChecked={item?.active ?? true}/> Active</label>
      <div className="actions"><button type="button" onClick={() => setEditing(null)}>Cancel</button><button className="primary" disabled={action.busy}>Save {singular}</button></div>
    </form>}
    {query.data?.length === 0 && <Empty>No {collection} added yet.</Empty>}
    {Boolean(query.data?.length) && <div className="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Status</th><th/></tr></thead><tbody>{query.data?.map(record => <tr key={record.id}><td>{record.name}</td><td>{record.email}</td><td>{record.phone}</td><td>{record.active ? 'Active' : 'Archived'}</td><td><button onClick={() => setEditing(record)}>Edit</button></td></tr>)}</tbody></table></div>}
  </section>;
}


