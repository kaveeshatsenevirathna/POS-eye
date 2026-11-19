import { useEffect, useRef, useState } from 'react';
import { Barcode, CreditCard, Minus, Plus, Search, ShoppingBasket, Trash2 } from 'lucide-react';
import { create } from 'zustand';
import type { DiningTable, Ticket } from './operations';
import { api, Empty, Field, money, Notice, receipt, useAction, useData, type Category, type Config, type Product, type Sale } from './ui';

type Cart = Record<string, string>;
const useCart = create<{ cart: Cart; held: Cart | null; update: (id: string, count: string) => void; reset: () => void; hold: () => void; resume: () => void }>(set => ({
  cart: {}, held: null,
  update: (id, count) => set(state => {
    const cart = { ...state.cart };
    if (Number(count) <= 0) delete cart[id];
    else cart[id] = count;
    return { cart };
  }),
  reset: () => set({ cart: {}, held: null }),
  hold: () => set(state => ({ cart: {}, held: state.cart })),
  resume: () => set(state => ({ cart: state.held ?? {}, held: null })),
}));
type Quote = { total: string; gross: string; tax: string; discount: string };
type Payment = { method: string; amount: string; tendered?: string; reference?: string };
type Request = { requestKey: string; ticketId?: string; customerId?: string; lines: { productId: string; quantity: string }[]; discount: number; payments: Payment[] };

export function Pos({ config, initialTicket, onTicketDone }: { config: Config; initialTicket?: Ticket; onTicketDone: () => void }) {
  const id = config.id;
  const { cart, held, update, reset, hold, resume } = useCart();
  useEffect(() => {
    reset();
    const quantities: Record<string, number> = {};
    for (const line of initialTicket?.lines ?? []) quantities[line.productId] = (quantities[line.productId] ?? 0) + Number(line.quantity);
    for (const [product, quantity] of Object.entries(quantities)) update(product, String(quantity));
  }, [id, initialTicket, reset, update]);
  const products = useData<Product[]>('products', id);
  const categories = useData<Category[]>('categories', id);
  const action = useAction(id);
  const kitchen = config.modules.some(module => module.key === 'kitchen');
  const tableMode = config.modules.some(module => module.key === 'tables');
  const tables = useData<DiningTable[]>('tables', id, tableMode && kitchen);
  const customerMode = config.modules.some(module => module.key === 'customers');
  const customers = useData<{ id: string; name: string; active?: boolean }[]>('customers', id, customerMode);
  const [customer, setCustomer] = useState('');
  const [orderType, setOrderType] = useState('TAKEAWAY');
  const [tableId, setTableId] = useState('');
  const [instructions, setInstructions] = useState('');
  const [sent, setSent] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [discount, setDiscount] = useState(0);
  const [quoted, setQuote] = useState<Quote | null>(null);
  const [tendered, setTendered] = useState('');
  const [method, setMethod] = useState('CASH');
  const [card, setCard] = useState('');
  const [reference, setReference] = useState('');
  const [sale, setSale] = useState<Sale | null>(null);
  const [pending, setPending] = useState<Request | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    function focus(event: KeyboardEvent) { if (event.key === 'F2') { event.preventDefault(); searchRef.current?.focus(); } }
    window.addEventListener('keydown', focus);
    return () => window.removeEventListener('keydown', focus);
  }, []);
  const tracking = config.modules.some(module => module.key === 'inventory');
  const barcode = config.modules.some(module => module.key === 'barcode');
  const weighted = config.modules.some(module => module.key === 'weighted');
  const visible = products.data?.filter(product => (!category || product.categoryId === category) &&
    [product.name, product.sku, product.barcode, product.metadata.isbn, product.metadata.author].some(value => value?.toLowerCase().includes(search.toLowerCase())));
  const lines = Object.entries(cart).map(([productId, quantity]) => ({ productId, quantity }));
  function add(product: Product) { if (!initialTicket && !quoted) update(product.id, String(Number(cart[product.id] ?? 0) + 1)); }
  function submitPayment() {
    if (!quoted) return;
    const cardAmount = method === 'MANUAL_CARD' ? Number(quoted.total) : method === 'SPLIT' ? Number(card) : 0;
    const balance = Number(quoted.total) - cardAmount;
    const payments: Payment[] = [];
    if (balance > 0) payments.push({ method: 'CASH', amount: balance.toFixed(2), tendered });
    if (cardAmount > 0) payments.push({ method: 'MANUAL_CARD', amount: cardAmount.toFixed(2), reference });
    const payload = pending ?? { requestKey: crypto.randomUUID(), ticketId: initialTicket?.id, customerId: customer || undefined, lines, discount, payments };
    setPending(payload);
    void action.run(() => api<Sale>('checkout', id, 'POST', payload), result => {
      for (const line of lines) update(line.productId, '0');
      onTicketDone(); setCustomer(''); setSale(result); setPending(null); setQuote(null); setDiscount(0); setReference(''); setCard('');
    });
  }
  if (products.isError) return <Notice>{products.error.message}</Notice>;
  return <div className="pos-grid">
    <section>
      <div className="search"><Search size={18}/><input ref={searchRef} placeholder={barcode ? 'Search products or scan a barcode' : 'Search products'} value={search} onChange={e => setSearch(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && barcode) { const match = products.data?.find(product => [product.barcode, product.metadata.isbn].includes(search) && search); if (match) { add(match); setSearch(''); } } }}/>{barcode && <Barcode size={20}/>}<kbd>F2</kbd></div>
      <div className="tabs"><button className={!category ? 'selected' : ''} onClick={() => setCategory('')}>All products</button>{categories.data?.map(c => <button className={category === c.id ? 'selected' : ''} key={c.id} onClick={() => setCategory(c.id)}>{c.name}</button>)}</div>
      <div className="product-grid">{visible?.map((product, index) => <button key={product.id} className="product" disabled={!!initialTicket || !!quoted || (tracking && !config.settings.allowOversell && Number(product.stock) <= 0)} onClick={() => add(product)}>
        <div className={'product-picture tint-' + index % 4}>{product.image ? <img src={product.image} alt=""/> : <ShoppingBasket size={30}/>}</div>
        <strong>{product.name}</strong><div><span>{money(product.price, config.currency)}</span>{tracking && <small>{product.stock} left</small>}</div>
      </button>)}</div>
      {products.isPending && <Empty>Loading products...</Empty>}
      {visible?.length === 0 && <Empty>No products match your search.</Empty>}
    </section>
    <aside className="panel cart"><div className="panel-title"><div><h2>Current order</h2><small>{lines.length} products</small></div><ShoppingBasket size={21}/></div>
      {sent && <div className="success">Order #{sent} sent to the preparation queue.<button onClick={() => setSent('')}>Dismiss</button></div>}
      {initialTicket && <div className="success">Paying order #{initialTicket.id.slice(0, 8)} <button disabled={!!pending || action.busy} onClick={() => { setQuote(null); onTicketDone(); }}>Leave order</button></div>}
      {sale && <div className="success"><strong>Sale completed</strong><button onClick={() => void action.run(() => receipt(id, sale.id))}>Download receipt PDF</button><button onClick={() => void action.run(() => receipt(id, sale.id, 'print'))}>Print receipt</button><button onClick={() => setSale(null)}>Dismiss</button></div>}
      {action.error && <Notice>{action.error}</Notice>}
      {!lines.length && <Empty>Add a product to start a sale.</Empty>}
      {lines.map(line => {
        const product = products.data?.find(p => p.id === line.productId);
        return <div className="cart-line" key={line.productId}><div><strong>{product?.name ?? 'Unavailable product'}</strong><small>{money(Number(line.quantity) * Number(product?.price ?? 0), config.currency)}</small></div>
          <div className="quantity"><button aria-label="Decrease quantity" disabled={!!initialTicket || !!quoted} onClick={() => update(line.productId, String(Number(line.quantity) - 1))}><Minus size={15}/></button>{weighted && !quoted && !initialTicket ? <input aria-label="Quantity" type="number" min="0.001" step="0.001" value={line.quantity} onChange={e => update(line.productId, e.target.value)}/> : <span>{line.quantity}</span>}<button aria-label="Increase quantity" disabled={!!initialTicket || !!quoted} onClick={() => update(line.productId, String(Number(line.quantity) + 1))}><Plus size={15}/></button>
          <button aria-label="Remove item" disabled={!!initialTicket || !!quoted} onClick={() => update(line.productId, '0')}><Trash2 size={15}/></button></div>
        </div>;
      })}
      {!quoted && <>
        {customerMode && <Field label="Customer"><select value={customer} onChange={event => setCustomer(event.target.value)}><option value="">Walk-in customer</option>{customers.data?.filter(item => item.active !== false).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>}
        <Field label="Discount (%)"><input type="number" min="0" max="100" value={discount} onChange={e => setDiscount(Number(e.target.value))}/></Field>
        {!initialTicket && <div className="actions"><button disabled={!lines.length || !!held} onClick={hold}>Hold cart</button><button disabled={!!lines.length || !held} onClick={resume}>Resume cart</button></div>}
        {kitchen && !initialTicket && lines.length > 0 && <div className="stack">
          <Field label="Order type"><select value={orderType} onChange={event => setOrderType(event.target.value)}><option value="TAKEAWAY">Takeaway</option><option value="DELIVERY">Delivery</option>{tableMode && <option value="DINE_IN">Dine-in</option>}</select></Field>
          {orderType === 'DINE_IN' && <Field label="Table"><select value={tableId} onChange={event => setTableId(event.target.value)}><option value="">Choose a table</option>{tables.data?.filter(table => !table.tickets.length).map(table => <option value={table.id} key={table.id}>{table.name}</option>)}</select></Field>}
          <Field label="Preparation instructions"><input value={instructions} maxLength={400} onChange={event => setInstructions(event.target.value)}/></Field>
          <button disabled={action.busy || (orderType === 'DINE_IN' && !tableId)} onClick={() => void action.run(() => api<Ticket>('tickets', id, 'POST', { lines, orderType, instructions, ...(orderType === 'DINE_IN' && { tableId }) }), ticket => {
            for (const line of lines) update(line.productId, '0');
            setSent(ticket.id.slice(0, 8)); setDiscount(0); setTableId(''); setInstructions('');
          })}>Send to preparation queue</button>
        </div>}
        <button className="primary wide" disabled={!lines.length || action.busy} onClick={() => void action.run(() => api<Quote>('quote', id, 'POST', { lines, discount }), value => { setQuote(value); setTendered(value.total); })}><CreditCard size={17}/> Review payment</button></>}
      {quoted && <form className="stack" onSubmit={event => { event.preventDefault(); submitPayment(); }}>
        <dl className="totals"><dt>Subtotal</dt><dd>{money(quoted.gross, config.currency)}</dd><dt>Discount</dt><dd>{money(quoted.discount, config.currency)}</dd><dt>Tax{config.settings.taxInclusive ? ' included' : ''}</dt><dd>{money(quoted.tax, config.currency)}</dd><dt>Total</dt><dd>{money(quoted.total, config.currency)}</dd></dl>
        {!pending && Number(quoted.total) > 0 && <>
          <Field label="Payment method"><select value={method} onChange={e => setMethod(e.target.value)}><option value="CASH">Cash</option>{config.settings.allowManualCard && <><option value="MANUAL_CARD">External card terminal (manual)</option><option value="SPLIT">Cash + external card terminal</option></>}</select></Field>
          {method === 'SPLIT' && <Field label="Card portion"><input required type="number" step=".01" min=".01" max={Number(quoted.total) - .01} value={card} onChange={e => setCard(e.target.value)}/></Field>}
          {method !== 'CASH' && <Field label="Approved terminal transaction reference"><input required maxLength={80} value={reference} onChange={e => setReference(e.target.value)}/></Field>}
          {method !== 'MANUAL_CARD' && <><Field label="Cash received"><input required type="number" step=".01" min="0" value={tendered} onChange={e => setTendered(e.target.value)}/></Field><small>Change {money(Math.max(0, Number(tendered) - Number(quoted.total) + (method === 'SPLIT' ? Number(card) : 0)), config.currency)}</small></>}
        </>}
        {pending && <p>Retry uses the same checkout reference. Check Sales before starting a new payment attempt.</p>}
        <div className="actions"><button type="button" disabled={action.busy} onClick={() => { if (!pending || window.confirm('Verify the sale status before abandoning this attempt. Continue?')) { setQuote(null); setPending(null); } }}>Back</button><button className="primary" disabled={action.busy}>{pending ? 'Retry checkout' : 'Complete sale'}</button></div>
      </form>}
    </aside>
  </div>;
}



