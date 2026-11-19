import { useState } from 'react';
import { BarChart3, Boxes, CircleDollarSign, ReceiptText } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { csv, Empty, money, Notice, saveFile, useAction, useData, type Config } from './ui';

import { calendarRange, type Preset } from './dates';

type MetricRow = { label: string; value: number };
type Report = { paymentMix: MetricRow[]; categorySales: MetricRow[]; hourlyTransactions: MetricRow[]; cashierRevenue: MetricRow[]; topProducts: MetricRow[]; revenue: string; gross: string; tax: string; netSales: string; discounts: string; refundTotal: string; cogs: string; grossProfit: string; estimatedNetProfit: string; operatingExpenses: string; transactions: number; activeProducts: number; lowStock: number; averageOrderValue: string; missingCosts: boolean; daily: { day: string; revenue: number }[] };
export default function Dashboard({ config, detailed = false }: { config: Config; detailed?: boolean }) {
  const [preset, setPreset] = useState<Preset>('last30');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [now] = useState(() => new Date());
  const range = calendarRange(now, config.timezone, preset, customStart, customEnd);
  const { start, end, previousStart } = range ?? calendarRange(now, config.timezone, 'last30', '', '')!;
  const action = useAction(config.id);
  const query = useData<Report>('report?start=' + start.toISOString() + '&end=' + end.toISOString(), config.id, !!range);
  const previous = useData<Report>('report?start=' + previousStart.toISOString() + '&end=' + start.toISOString(), config.id, !!range);
  const toolbar = <div className="toolbar report-toolbar">
    <span>{config.demo ? 'Demo business' : config.name}</span>
    <select aria-label="Reporting period" value={preset} onChange={event => setPreset(event.target.value as Preset)}>
      <option value="today">Today</option><option value="yesterday">Yesterday</option><option value="last7">Last 7 days</option><option value="last30">Last 30 days</option>
      <option value="month">This month</option><option value="lastMonth">Last month</option><option value="last365">Last 365 days</option><option value="custom">Custom dates</option>
    </select>
    {preset === 'custom' && <div className="actions"><label className="field">Start date<input type="date" value={customStart} onChange={event => setCustomStart(event.target.value)}/></label><label className="field">End date<input type="date" value={customEnd} onChange={event => setCustomEnd(event.target.value)}/></label></div>}
  </div>;
  if (!range) return <div className="stack">{toolbar}<Empty>Choose a valid date range of up to 365 days.</Empty></div>;
  if (query.isError) return <div className="stack">{toolbar}<Notice>{query.error.message}</Notice></div>;
  if (!query.data) return <div className="stack">{toolbar}<Empty>Loading business performance...</Empty></div>;
  const data = query.data;
  const format = (amount: string | number) => money(amount, config.currency);
  const comparison = Number(previous.data?.revenue ?? 0);
  const metrics = [
    { label: 'Revenue excluding tax', value: format(data.revenue), detail: comparison > 0 ? ((Number(data.revenue) / comparison - 1) * 100).toFixed(1) + '% vs prior period' : 'Selected period', Icon: CircleDollarSign },
    { label: 'Gross profit', value: format(data.grossProfit), detail: data.missingCosts ? 'Estimated · costs missing' : 'After cost of goods', Icon: BarChart3 },
    { label: 'Transactions', value: data.transactions, detail: format(data.averageOrderValue) + ' average order', Icon: ReceiptText },
    { label: 'Active products', value: data.activeProducts, detail: data.lowStock + ' at reorder level', Icon: Boxes },
  ];
  const figures: [string, string][] = [
    ['Gross sales', data.gross], ['Discounts', data.discounts], ['Refunds incl. tax', data.refundTotal], ['Net sales incl. tax', data.netSales], ['Net tax collected', data.tax],
    ['Revenue excluding tax', data.revenue], ['Cost of goods sold', data.cogs], ['Gross profit', data.grossProfit], ['Recorded expenses', data.operatingExpenses], ['Estimated net profit', data.estimatedNetProfit],
  ];
  const breakdowns = [
    { title: 'Gross merchandise sales by category', rows: data.categorySales, monetary: true },
    { title: 'Tender recorded by payment method', rows: data.paymentMix, monetary: true },
    { title: 'Cashier sales excluding tax before refunds', rows: data.cashierRevenue, monetary: true },
    { title: 'Top products by quantity sold', rows: data.topProducts, monetary: false },
    { title: 'Completed sales by hour', rows: data.hourlyTransactions.map(row => ({ ...row, label: row.label + ':00' })), monetary: false },
  ];
  return <div className="stack dashboard">
    {action.error && <Notice>{action.error}</Notice>}
    {toolbar}
    <div className="metrics">{metrics.map(({ label, value, detail, Icon }) => <article className="panel metric" key={label}><div><span>{label}</span><Icon size={18}/></div><strong>{value}</strong><small>{detail}</small></article>)}</div>
    <div className="report-grid">
      <div className="panel chart"><div className="panel-title"><div><h2>Revenue over time</h2><small>Net of tax and refunds · {config.timezone}</small></div></div>
      {data.daily.length ? <ResponsiveContainer width="100%" height={275}><AreaChart data={data.daily}><defs><linearGradient id="revenue" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#69a859" stopOpacity=".35"/><stop offset="100%" stopColor="#69a859" stopOpacity=".015"/></linearGradient></defs><CartesianGrid vertical={false} stroke="var(--line)"/><XAxis dataKey="day" tickLine={false}/><YAxis tickLine={false} width={68}/><Tooltip formatter={(value) => format(Number(value))}/><Area type="monotone" dataKey="revenue" stroke="#69a859" strokeWidth={2} fill="url(#revenue)"/></AreaChart></ResponsiveContainer> : <Empty>Revenue will appear after your first completed sale.</Empty>}</div>
      <div className="panel"><div className="panel-title"><div><h2>Financial summary</h2><small>{detailed ? 'Selected reporting period' : 'Sales and operating costs'}</small></div><button onClick={() => saveFile('financial-report.csv', csv([['Metric', config.currency], ...figures]))}>CSV</button><button disabled={action.busy} onClick={() => void action.run(async () => {
        const response = await fetch('/api/report?format=pdf&start=' + start.toISOString() + '&end=' + end.toISOString(), { headers: { 'x-business-id': config.id } });
        if (!response.ok) throw new Error('Could not download report');
        saveFile('financial-report.pdf', await response.blob());
      })}>PDF</button></div><dl className="totals">{figures.map(([key, amount]) => <div className="figure" key={key}><dt>{key}</dt><dd>{format(amount)}</dd></div>)}</dl></div>
    </div>
    {detailed && <div className="ticket-grid">{breakdowns.map(({ title, rows, monetary }) => <article className="panel" key={title}>
      <div className="panel-title"><h2>{title}</h2></div>
      {rows.length === 0 ? <Empty>No sales in this period.</Empty> : <ResponsiveContainer width="100%" height={230}><BarChart data={rows}>
        <CartesianGrid vertical={false} stroke="var(--line)"/><XAxis dataKey="label" tickLine={false} interval="preserveStartEnd"/><YAxis tickLine={false}/><Tooltip formatter={value => monetary ? format(Number(value)) : Number(value)}/><Bar dataKey="value" fill="#69a859" radius={[5, 5, 0, 0]}/>
      </BarChart></ResponsiveContainer>}
    </article>)}</div>}
  </div>;
}



