import { useState } from 'react';
import { Armchair, ChefHat, Clock3 } from 'lucide-react';
import { api, Empty, Field, money, Notice, useAction, useData, values, type Config } from './ui';

export type DiningTable = { id: string; name: string; tickets: { id: string; status: string }[] };
export type Ticket = {
  id: string; tableId?: string; table?: { name: string }; status: string; createdAt: string;
  orderType: string; instructions: string; lines: { productId: string; name: string; quantity: string }[];
};
type Shift = { id: string; userId: string; openedAt: string; closedAt?: string; openingCash: string; closingCash?: string; membership: { user: { name: string } } };

export function Tables({ config, admin, openOrders }: { config: Config; admin: boolean; openOrders: () => void }) {
  const query = useData<DiningTable[]>('tables', config.id);
  const action = useAction(config.id);
  return <section className="stack">
    {(query.error || action.error) && <Notice>{action.error || query.error?.message}</Notice>}
    {admin && <form className="panel form-grid" onSubmit={event => {
      event.preventDefault(); const form = event.currentTarget; const data = values(event);
      void action.run(() => api('tables', config.id, 'POST', data), () => form.reset());
    }}><Field label="Table name"><input name="name" required maxLength={100}/></Field><div><button className="primary" disabled={action.busy}>Add table</button></div></form>}
    <div className="metrics">{query.data?.map(table => <article className="panel stack" key={table.id}><Armchair size={22}/><h2>{table.name}</h2><small>{table.tickets.length ? 'Occupied · ' + table.tickets[0].status.toLowerCase() : 'Available'}</small>{table.tickets.length > 0 && <button onClick={openOrders}>View open orders</button>}</article>)}</div>
    {query.data?.length === 0 && <Empty>No tables have been added.</Empty>}
  </section>;
}
export function Orders({ config, settle, kitchen }: { config: Config; settle: (ticket: Ticket) => void; kitchen: boolean }) {
  const query = useData<Ticket[]>('tickets', config.id);
  const tables = useData<DiningTable[]>('tables', config.id, config.modules.some(module => module.key === 'tables'));
  const action = useAction(config.id);
  const [transfer, setTransfer] = useState('');
  const statuses = ['QUEUED', 'PREPARING', 'READY'];
  return <section className="stack">
    <div className="toolbar"><p>{kitchen ? 'Preparation queue' : 'Open orders awaiting payment'}</p><button onClick={() => void query.refetch()}>Refresh</button></div>
    {(query.error || action.error) && <Notice>{action.error || query.error?.message}</Notice>}
    {query.data?.length === 0 && <Empty>No open orders.</Empty>}
    <div className="ticket-grid">{statuses.map(status => <div className="stack" key={status}><h2>{status[0] + status.slice(1).toLowerCase()}</h2>{query.data?.filter(ticket => ticket.status === status).map(ticket => <article className="panel stack" key={ticket.id}>
      <div className="panel-title"><div><h2>{ticket.table?.name ?? ticket.orderType.toLowerCase()}</h2><small>#{ticket.id.slice(0, 8)} · {new Date(ticket.createdAt).toLocaleTimeString()}</small></div><ChefHat size={20}/></div>
      <ul>{ticket.lines.map((line, index) => <li key={line.productId + index}>{line.quantity} × {line.name}</li>)}</ul>
      {ticket.instructions && <p>{ticket.instructions}</p>}
      <div className="actions">
        {status !== 'READY' && <button disabled={action.busy} onClick={() => void action.run(() => api('tickets/' + ticket.id, config.id, 'PATCH', { status: status === 'QUEUED' ? 'PREPARING' : 'READY' }))}>{status === 'QUEUED' ? 'Start preparation' : 'Mark ready'}</button>}
        {!kitchen && <button className="primary" onClick={() => settle(ticket)}>Open checkout</button>}
        {!kitchen && ticket.tableId && <button onClick={() => setTransfer(transfer === ticket.id ? '' : ticket.id)}>Transfer table</button>}
        {!kitchen && <button disabled={action.busy} onClick={() => { if (window.confirm('Cancel this unpaid order?')) void action.run(() => api('tickets/' + ticket.id, config.id, 'PATCH', { status: 'CANCELLED' })); }}>Cancel order</button>}
      </div>
      {transfer === ticket.id && <form className="stack" onSubmit={event => { event.preventDefault(); const data = values(event); void action.run(() => api('tickets/' + ticket.id, config.id, 'PATCH', data), () => setTransfer('')); }}>
        <Field label="Destination table"><select name="tableId" required><option value="">Choose an available table</option>{tables.data?.filter(t => !t.tickets.length).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
        <button disabled={action.busy}>Confirm transfer</button>
      </form>}
    </article>)}</div>)}</div>
  </section>;
}
export function Shifts({ config, employee }: { config: Config; employee: string }) {
  const query = useData<Shift[]>('shifts', config.id);
  const action = useAction(config.id);
  const own = query.data?.find(shift => !shift.closedAt && shift.userId === employee);
  return <section className="panel stack">
    <div className="panel-title"><h2>Cash drawer shifts</h2><Clock3 size={19}/></div>
    {(query.error || action.error) && <Notice>{action.error || query.error?.message}</Notice>}
    <form key={own?.id ?? 'open'} className="form-grid" onSubmit={event => {
      event.preventDefault(); const data = values(event);
      void action.run(() => api(own ? 'shifts/' + own.id : 'shifts', config.id, own ? 'PATCH' : 'POST', data));
    }}><Field label={own ? 'Counted closing cash' : 'Opening cash'}><input required type="number" min="0" step=".01" name={own ? 'closingCash' : 'openingCash'}/></Field><div><button className="primary" disabled={action.busy || query.isPending}>{own ? 'Close shift' : 'Open shift'}</button></div></form>
    <div className="table-wrap"><table><thead><tr><th>Employee</th><th>Opened</th><th>Opening cash</th><th>Closed</th><th>Closing cash</th></tr></thead><tbody>{query.data?.map(shift => <tr key={shift.id}><td>{shift.membership.user.name}</td><td>{new Date(shift.openedAt).toLocaleString()}</td><td>{money(shift.openingCash, config.currency)}</td><td>{shift.closedAt ? new Date(shift.closedAt).toLocaleString() : 'Open'}</td><td>{shift.closingCash ? money(shift.closingCash, config.currency) : '—'}</td></tr>)}</tbody></table></div>
  </section>;
}

