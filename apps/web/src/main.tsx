import { lazy, Suspense, useEffect, useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { ArrowUpRight, Boxes, ChartNoAxesCombined, CircleDollarSign, ClipboardList, Grid2X2, LayoutDashboard, LogOut, Menu, Moon, Package, ReceiptText, Settings2, ShoppingBag, Sun, Tags, Users, Wallet, X } from 'lucide-react';
import { presets } from '../../../packages/shared/business';
import { api, Empty, Field, Notice, useAction, useData, values, type Business, type Config } from './ui';
import { Catalog, Contacts, Records, Sales, Settings } from './admin';
import { Pos } from './pos';
import { Orders, Shifts, Tables, type Ticket } from './operations';
import './style.css';

const Dashboard = lazy(() => import('./dashboard'));

type Identity = { id: string; name: string; email: string; memberships: { role: string; business: Business }[] };
const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 10000 } } });
function usePath() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const listener = () => setPath(location.pathname);
    window.addEventListener('popstate', listener);
    return () => window.removeEventListener('popstate', listener);
  }, []);
  return { path, go: (next: string) => { if (next !== path) history.pushState({}, '', next); setPath(next); } };
}
function Brand() { return <div className="brand"><span><Grid2X2 size={21}/></span><strong>POS Eye</strong></div>; }

function Login({ go, setup }: { go: (path: string) => void; setup: boolean }) {
  const action = useAction('');
  const query = useQueryClient();
  const [step, setStep] = useState(1);
  const [type, setType] = useState<keyof typeof presets>('restaurant');
  const { register, handleSubmit, formState } = useForm<{ email: string; password: string }>();
  const [draft, setDraft] = useState<Record<string, FormDataEntryValue>>({});
  const [features, setFeatures] = useState<string[]>([...presets.restaurant]);
  function launch(businessId?: string) {
    if (businessId) sessionStorage.setItem('omnipos-business', businessId);
    void query.invalidateQueries({ queryKey: ['me'] }); go('/');
  }
  return <div className="auth-layout">
    <div className="auth-art"><Brand/><div><div className="art-grid"><Grid2X2 size={108} strokeWidth={1}/></div><h1>Run your business.<br/>Own the counter.</h1><p>Sales, stock, and performance in one workspace.</p></div></div>
    <main className="auth-main"><div className="auth-card">
      <small className="eyebrow">{setup ? 'BUSINESS SETUP · STEP ' + step + ' OF 3' : 'POS EYE WORKSPACE'}</small>
      <h1>{setup ? ['Business information', 'Configure your POS', 'Create your admin account'][step - 1] : 'Welcome back'}</h1>
      <p>{setup ? 'Set up your business workspace.' : 'Sign in to open your workspace.'}</p>
      {action.error && <Notice>{action.error}</Notice>}
      {!setup ? <form className="stack" onSubmit={handleSubmit(v => action.run(() => api('login', '', 'POST', v), () => launch()))}>
        <Field label="Email"><input type="email" autoComplete="username" {...register('email', { required: true })}/></Field>
        <Field label="Password"><input type="password" autoComplete="current-password" {...register('password', { required: true })}/></Field>
        {!!Object.keys(formState.errors).length && <Notice>Enter your email and password.</Notice>}
        <button className="primary wide" disabled={action.busy}>Sign in <ArrowUpRight size={17}/></button>
      </form> : <form key={step} className="stack" onSubmit={event => {
        event.preventDefault(); const v = values(event);
        if (step < 3) { setDraft({ ...draft, ...v }); setStep(step + 1); return; }
        void action.run(() => api<{ businessId: string }>('setup', '', 'POST', {
          admin: { name: v.adminName, email: v.email, password: v.password },
          business: { name: draft.businessName, type, currency: draft.currency, timezone: draft.timezone },
          settings: { taxRate: Number(draft.taxRate ?? 0), accent: draft.accent }, modules: features,
        }), result => launch(result.businessId));
      }}>
        {step === 1 && <>
          <Field label="Business name"><input name="businessName" required defaultValue={String(draft.businessName ?? '')}/></Field>
          <Field label="Business type"><select value={type} onChange={e => { const next = e.target.value as keyof typeof presets; setType(next); setFeatures([...presets[next]]); }}>{Object.keys(presets).map(key => <option key={key}>{key}</option>)}</select></Field>
          <Field label="Currency code"><input name="currency" defaultValue={String(draft.currency ?? 'USD')} pattern="[A-Z]{3}" required/></Field>
          <Field label="IANA time zone"><input name="timezone" required defaultValue={String(draft.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone)}/></Field>
        </>}
        {step === 2 && <>
          {['inventory', 'barcode', 'weighted', 'tables', 'kitchen', 'customers', 'suppliers'].map(key => <label className="check" key={key}><input type="checkbox" checked={features.includes(key)} onChange={e => setFeatures(e.target.checked ? [...features, key] : features.filter(feature => feature !== key))}/>{key}</label>)}
          <Field label="Accent color"><input name="accent" type="color" defaultValue={String(draft.accent ?? '#a6ef85')}/></Field>
          <Field label="Tax rate (%)"><input name="taxRate" type="number" step=".001" min="0" max="100" defaultValue={String(draft.taxRate ?? '0')}/></Field>
        </>}
        {step === 3 && <>
          <Field label="Full name"><input name="adminName" required autoComplete="name"/></Field>
          <Field label="Email"><input name="email" type="email" required autoComplete="email"/></Field>
          <Field label="Password"><input name="password" type="password" minLength={12} required autoComplete="new-password"/></Field>
        </>}
        <div className="actions">{step > 1 && <button type="button" onClick={() => setStep(step - 1)}>Back</button>}<button className="primary" disabled={action.busy}>{step === 3 ? 'Launch workspace' : 'Continue'}</button></div>
      </form>}
      <button className="link" onClick={() => go(setup ? '/login' : '/setup')}>{setup ? 'Back to sign in' : 'Create a business workspace'}</button>
    </div></main>
  </div>;
}
const navigation = [
  { key: 'dashboard', label: 'Overview', Icon: LayoutDashboard, group: 'Workspace' },
  { key: 'pos', label: 'Point of Sale', Icon: ShoppingBag, group: 'Workspace' },
  { key: 'orders', label: 'Orders', Icon: ClipboardList, group: 'Workspace', module: 'kitchen' },
  { key: 'tables', label: 'Tables', Icon: Grid2X2, group: 'Workspace', module: 'tables' },
  { key: 'kitchen', label: 'Preparation queue', Icon: ReceiptText, group: 'Workspace', module: 'kitchen' },
  { key: 'shift', label: 'Shifts', Icon: Wallet, group: 'Workspace' },
  { key: 'sales', label: 'Sales', Icon: ReceiptText, group: 'Workspace' },
  { key: 'products', label: 'Products', Icon: Package, group: 'Management', admin: true },
  { key: 'categories', label: 'Categories', Icon: Tags, group: 'Management', admin: true },
  { key: 'inventory', label: 'Inventory', Icon: Boxes, group: 'Management', admin: true, module: 'inventory' },
  { key: 'customers', label: 'Customers', Icon: Users, group: 'Management', admin: true, module: 'customers' },
  { key: 'suppliers', label: 'Suppliers', Icon: Package, group: 'Management', admin: true, module: 'suppliers' },
  { key: 'employees', label: 'Employees', Icon: Users, group: 'Management', admin: true },
  { key: 'analytics', label: 'Revenue & Analytics', Icon: ChartNoAxesCombined, group: 'Finance', admin: true },
  { key: 'reports', label: 'Financial Reports', Icon: ClipboardList, group: 'Finance', admin: true },
  { key: 'expenses', label: 'Expenses', Icon: Wallet, group: 'Finance', admin: true },
  { key: 'refunds', label: 'Refunds', Icon: CircleDollarSign, group: 'Finance', admin: true },
  { key: 'settings', label: 'Business Settings', Icon: Settings2, group: 'Preferences', admin: true },
  { key: 'audit-logs', label: 'Audit Logs', Icon: ClipboardList, group: 'Preferences', admin: true },
];
function Workspace({ identity, business, role, path, go, select }: { identity: Identity; business: Business; role: string; path: string; go: (path: string) => void; select: (id: string) => void }) {
  const config = useData<Config>('config', business.id);
  const query = useQueryClient();
  const action = useAction(business.id);
  const [dark, setDark] = useState(() => localStorage.getItem('omnipos-theme') === 'dark');
  const [sidebar, setSidebar] = useState(false);
  const [checkout, setCheckout] = useState<{ businessId: string; ticket: Ticket } | null>(null);
  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; localStorage.setItem('omnipos-theme', dark ? 'dark' : 'light'); }, [dark]);
  const admin = role === 'ADMIN';
  const prefix = admin ? '/admin/' : '/staff/';
  const available = navigation.filter(item => (!item.admin || admin) && (!item.module || config.data?.modules.some(module => module.key === item.module)));
  const segment = path.startsWith(prefix) ? path.slice(prefix.length) : path === '/' ? 'dashboard' : '';
  const screen = segment === 'customization' && admin ? 'settings' : segment;
  const active = available.find(item => item.key === screen);
  const display = config.data;
  const title = active?.label ?? 'Page unavailable';
  return <div className="workspace" style={{ '--accent': display?.settings.accent ?? '#a6ef85' } as CSSProperties}>
    <aside className={'sidebar ' + (sidebar ? 'open' : '')}><div className="side-top"><Brand/><button className="mobile icon" aria-label="Close menu" onClick={() => setSidebar(false)}><X size={19}/></button></div>
      <div className="business"><div className="business-icon">{business.name.slice(0, 2).toUpperCase()}</div><div><select aria-label="Business" value={business.id} onChange={e => select(e.target.value)}>{identity.memberships.map(m => <option key={m.business.id} value={m.business.id}>{m.business.name}</option>)}</select><small>{business.demo ? 'Demo workspace' : business.type + ' workspace'}</small></div></div>
      <nav>{['Workspace', 'Management', 'Finance', 'Preferences'].map(group => {
        const items = available.filter(item => item.group === group);
        return items.length > 0 && <div className="nav-group" key={group}><span>{group}</span>{items.map(({ key, label, Icon }) => <a className={screen === key ? 'current' : ''} aria-current={screen === key ? 'page' : undefined} href={prefix + key} key={key} onClick={event => { event.preventDefault(); go(prefix + key); setSidebar(false); }}><Icon size={17}/>{label}</a>)}</div>;
      })}</nav>
      <div className="side-user"><div className="avatar">{identity.name.slice(0, 2).toUpperCase()}</div><div><strong>{identity.name}</strong><small>{admin ? 'Administrator' : 'Cashier'}</small></div><button className="icon" aria-label="Sign out" onClick={() => void action.run(() => api('logout', '', 'POST'), () => { query.clear(); go('/login'); })}><LogOut size={17}/></button></div>
    </aside>
    {sidebar && <button aria-label="Close menu overlay" className="scrim" onClick={() => setSidebar(false)}/>}
    <div className="workspace-main"><header className="topbar"><div><button className="mobile icon" aria-label="Open menu" onClick={() => setSidebar(true)}><Menu size={20}/></button><span>{display?.name ?? business.name}</span><span className="divider">/</span><strong>{title}</strong></div><button className="icon" aria-label="Toggle color theme" onClick={() => setDark(!dark)}>{dark ? <Sun size={18}/> : <Moon size={18}/>}</button></header>
    <main className="content"><div className="page-title"><div><h1>{title}</h1>{screen === 'dashboard' && <p>{admin ? 'Track sales, inventory, and business performance.' : 'Open the register or review your completed sales.'}</p>}</div>{active && screen === 'dashboard' && <button className="primary" onClick={() => go(prefix + 'pos')}>Open POS <ArrowUpRight size={16}/></button>}</div>
      {action.error && <Notice>{action.error}</Notice>}
      {config.error && <Notice>{config.error.message}</Notice>}
      {!display && !config.error && <Empty>Loading workspace...</Empty>}
      {display && !active && <Empty>This page is unavailable for your role or business configuration.</Empty>}
      {display && active && <div key={business.id + screen}>
        {screen === 'dashboard' && (admin ? <Suspense fallback={<Empty>Loading overview...</Empty>}><Dashboard config={display}/></Suspense> : <Sales config={display} admin={false}/>)}
        {screen === 'pos' && <Pos config={display} initialTicket={checkout?.businessId === business.id ? checkout.ticket : undefined} onTicketDone={() => setCheckout(null)}/>}
        {screen === 'tables' && <Tables config={display} admin={admin} openOrders={() => go(prefix + 'orders')}/>}
        {['orders', 'kitchen'].includes(screen) && <Orders config={display} kitchen={screen === 'kitchen'} settle={ticket => { setCheckout({ businessId: business.id, ticket }); go(prefix + 'pos'); }}/>}
        {screen === 'shift' && <Shifts config={display} employee={identity.id}/>}
        {(screen === 'sales' || screen === 'refunds') && <Sales config={display} admin={admin} refunds={screen === 'refunds'}/>}
        {screen === 'products' && <Catalog config={display}/>}
        {(screen === 'customers' || screen === 'suppliers') && <Contacts config={display} collection={screen}/>}
        {['categories', 'inventory', 'expenses', 'employees', 'audit-logs'].includes(screen) && <Records config={display} screen={screen}/>}
        {['analytics', 'reports'].includes(screen) && <Suspense fallback={<Empty>Loading reports...</Empty>}><Dashboard config={display} detailed/></Suspense>}
        {screen === 'settings' && <Settings config={display}/>}
      </div>}
    </main></div>
  </div>;
}
function App() {
  const { path, go } = usePath();
  const session = useQuery({ queryKey: ['me'], queryFn: () => api<Identity>('me') });
  const [selected, setSelected] = useState(() => sessionStorage.getItem('omnipos-business'));
  if (session.isPending) return <Empty>Opening POS Eye...</Empty>;
  if (!session.data) return <Login key={path === '/setup' ? 'setup' : 'login'} go={go} setup={path === '/setup'}/>;
  const membership = session.data.memberships.find(m => m.business.id === selected) ?? session.data.memberships[0];
  if (!membership) return <Empty>No active business membership.</Empty>;
  return <Workspace identity={session.data} business={membership.business} role={membership.role} path={path === '/login' || path === '/setup' ? '/' : path} go={go} select={id => {
    sessionStorage.setItem('omnipos-business', id); setSelected(id); go('/');
  }}/>;
}
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={client}><App/></QueryClientProvider>);



