import { useState } from 'react';
import { Download, FileSpreadsheet, FileText, Printer, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { useApi } from '@/hooks/useData';
import { api } from '@/lib/ws';
import { cn, formatDate, formatMoney } from '@/lib/utils';
import { CategoryIcon } from '@/lib/icons';
import { CategoryBars, CategoryDonut, PaymentMethodBars, TrendChart } from '@/components/charts';
import {
    Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Select,
    SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton, Tabs, TabsList, TabsTrigger,
} from '@/components/ui';
import type {
    Account, CategorySlice, PaymentMethodStat, Period, TrendPoint,
} from '@/lib/types';

const PERIODS: Array<{ value: Period; label: string }> = [
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'yearly', label: 'Yearly' },
];

interface Summary {
    range: { from: string; to: string };
    income: number;
    expense: number;
    net: number;
    previousBalance: number;
    balance: number;
    incomeCount: number;
    expenseCount: number;
}

export default function Reports() {
    const { user } = useAuth();
    const { mode } = useTheme();
    const currency = user?.currency || 'BDT';

    const [period, setPeriod] = useState<Period>('monthly');
    const [accountId, setAccountId] = useState('all');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [breakdown, setBreakdown] = useState<'EXPENSE' | 'INCOME'>('EXPENSE');
    const [exporting, setExporting] = useState<'pdf' | 'excel' | 'print' | null>(null);

    const scope: Record<string, any> = { period };
    if (accountId !== 'all') scope.accountId = accountId;
    if (from) scope.from = new Date(from).toISOString();
    if (to) scope.to = new Date(`${to}T23:59:59`).toISOString();

    const deps = [period, accountId, from, to];

    const accountsQ = useApi<{ accounts: Account[] }>('/accounts');
    const summaryQ = useApi<Summary>('/reports/summary', scope, deps);
    const trendQ = useApi<{ points: TrendPoint[]; range: { grain: string } }>('/reports/trend', scope, deps);
    const catQ = useApi<{ categories: CategorySlice[]; total: number }>(
        '/reports/categories', { ...scope, type: breakdown }, [...deps, breakdown]
    );
    const pmQ = useApi<{ paymentMethods: PaymentMethodStat[] }>('/reports/payment-methods', scope, deps);

    const exportReport = async (format: 'pdf' | 'excel') => {
        setExporting(format);
        try {
            const params = new URLSearchParams({ format, period });
            if (accountId !== 'all') params.set('accountId', accountId);
            if (from) params.set('from', new Date(from).toISOString());
            if (to) params.set('to', new Date(`${to}T23:59:59`).toISOString());

            const stamp = new Date().toISOString().slice(0, 10);
            await api.download(
                `/reports/export?${params}`,
                `SisirBindu-Statement-${stamp}.${format === 'pdf' ? 'pdf' : 'xlsx'}`
            );
            toast.success(`${format === 'pdf' ? 'PDF' : 'Excel'} statement downloaded`);
        } catch (err: any) {
            toast.error(err.message || 'Export failed');
        } finally {
            setExporting(null);
        }
    };

    /**
     * Print the statement.
     *
     * Deliberately prints the *server-generated PDF*, not the page: what comes out
     * of the printer is then byte-identical to the file the accountant receives,
     * with the same layout, page breaks and totals. Printing the DOM would produce
     * a different document that happens to look similar.
     */
    const print = async () => {
        setExporting('print');
        try {
            const params = new URLSearchParams({ format: 'pdf', period });
            if (accountId !== 'all') params.set('accountId', accountId);
            if (from) params.set('from', new Date(from).toISOString());
            if (to) params.set('to', new Date(`${to}T23:59:59`).toISOString());

            await api.print(`/reports/export?${params}`);
        } catch (err: any) {
            toast.error(err.message || 'Could not print the statement');
        } finally {
            setExporting(null);
        }
    };

    const s = summaryQ.data;

    return (
        <div className="mx-auto max-w-7xl space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
                    <p className="text-sm text-muted-foreground">
                        Income-tax-ready statements. Print, or export as PDF or Excel.
                    </p>
                </div>

                <div className="flex flex-wrap gap-2">
                    <Button
                        variant="outline"
                        loading={exporting === 'print'}
                        onClick={print}
                    >
                        <Printer /> Print
                    </Button>
                    <Button
                        variant="outline"
                        loading={exporting === 'pdf'}
                        onClick={() => exportReport('pdf')}
                    >
                        <FileText /> PDF
                    </Button>
                    <Button
                        loading={exporting === 'excel'}
                        onClick={() => exportReport('excel')}
                    >
                        <FileSpreadsheet /> Excel
                    </Button>
                </div>
            </div>

            {/* One filter row above the charts. */}
            <Card>
                <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="space-y-1.5">
                        <Label className="text-xs">Period</Label>
                        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {PERIODS.map((p) => (
                                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs">Account</Label>
                        <Select value={accountId} onValueChange={setAccountId}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All accounts</SelectItem>
                                {(accountsQ.data?.accounts ?? []).map((a) => (
                                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs" htmlFor="from">From</Label>
                        <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs" htmlFor="to">To</Label>
                        <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                    </div>
                </CardContent>
            </Card>

            {/* Summary */}
            {summaryQ.loading || !s ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[112px]" />)}
                </div>
            ) : (
                <>
                    <p className="text-xs text-muted-foreground">
                        {formatDate(s.range.from, 'long')} — {formatDate(s.range.to, 'long')}
                    </p>

                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {([
                            { label: 'Opening balance', value: s.previousBalance, icon: Wallet, tone: 'neutral', sub: 'Carried into this period' },
                            { label: 'Total income', value: s.income, icon: TrendingUp, tone: 'income', sub: `${s.incomeCount} entr${s.incomeCount === 1 ? 'y' : 'ies'}` },
                            { label: 'Total expense', value: s.expense, icon: TrendingDown, tone: 'expense', sub: `${s.expenseCount} entr${s.expenseCount === 1 ? 'y' : 'ies'}` },
                            { label: 'Closing balance', value: s.balance, icon: Wallet, tone: s.net >= 0 ? 'income' : 'expense', sub: `Net ${formatMoney(s.net, currency, { sign: s.net > 0 })}` },
                        ] as Array<{ label: string; value: number; icon: typeof Wallet; tone: 'income' | 'expense' | 'neutral'; sub: string }>).map((tile) => (
                            <Card key={tile.label}>
                                <CardContent className="p-5">
                                    <div className="flex items-start justify-between">
                                        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                            {tile.label}
                                        </span>
                                        <span
                                            className={cn(
                                                'flex h-8 w-8 items-center justify-center rounded-lg',
                                                tile.tone === 'income' && 'bg-[hsl(var(--income))]/10 text-[hsl(var(--income))]',
                                                tile.tone === 'expense' && 'bg-[hsl(var(--expense))]/10 text-[hsl(var(--expense))]',
                                                tile.tone === 'neutral' && 'bg-primary/10 text-primary'
                                            )}
                                        >
                                            <tile.icon className="h-4 w-4" />
                                        </span>
                                    </div>
                                    <p
                                        className={cn(
                                            'tabular mt-3 text-2xl font-semibold tracking-tight',
                                            tile.tone === 'income' && 'text-[hsl(var(--income))]',
                                            tile.tone === 'expense' && 'text-[hsl(var(--expense))]'
                                        )}
                                    >
                                        {formatMoney(tile.value, currency)}
                                    </p>
                                    <p className="mt-1 text-xs text-muted-foreground">{tile.sub}</p>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </>
            )}

            {/* Trend */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Income vs expense over time</CardTitle>
                </CardHeader>
                <CardContent>
                    {trendQ.loading ? (
                        <Skeleton className="h-[300px]" />
                    ) : (
                        <TrendChart
                            points={trendQ.data?.points ?? []}
                            mode={mode}
                            currency={currency}
                            grain={trendQ.data?.range.grain}
                            height={300}
                        />
                    )}
                </CardContent>
            </Card>

            {/* Breakdown */}
            {/* min-w-0 keeps the grid items from refusing to shrink below their
                content, which is what clipped the charts on a tablet. */}
            <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
                <Card>
                    <CardHeader className="flex-row items-center justify-between space-y-0">
                        <CardTitle className="text-base">By category</CardTitle>
                        <Tabs value={breakdown} onValueChange={(v) => setBreakdown(v as 'EXPENSE' | 'INCOME')}>
                            <TabsList className="h-8">
                                <TabsTrigger value="EXPENSE" className="h-6 text-xs">Expense</TabsTrigger>
                                <TabsTrigger value="INCOME" className="h-6 text-xs">Income</TabsTrigger>
                            </TabsList>
                        </Tabs>
                    </CardHeader>
                    <CardContent>
                        {catQ.loading ? (
                            <Skeleton className="h-[260px]" />
                        ) : (
                            <CategoryDonut
                                slices={catQ.data?.categories ?? []}
                                mode={mode}
                                currency={currency}
                            />
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Top {breakdown === 'EXPENSE' ? 'expenses' : 'income sources'}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {catQ.loading ? (
                            <Skeleton className="h-[260px]" />
                        ) : (
                            <CategoryBars
                                slices={catQ.data?.categories ?? []}
                                mode={mode}
                                currency={currency}
                            />
                        )}
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Payment methods</CardTitle>
                </CardHeader>
                <CardContent>
                    {pmQ.loading ? (
                        <Skeleton className="h-[260px]" />
                    ) : (
                        <PaymentMethodBars
                            methods={pmQ.data?.paymentMethods ?? []}
                            mode={mode}
                            currency={currency}
                            height={Math.max(220, (pmQ.data?.paymentMethods.length ?? 1) * 52)}
                        />
                    )}
                </CardContent>
            </Card>

            {/* The table view — the relief channel for the sub-3:1 chart slots, and
                the thing an accountant will actually read. */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Category detail</CardTitle>
                </CardHeader>
                <CardContent className="px-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                                    <th className="px-5 py-2.5 text-left font-medium">Category</th>
                                    <th className="px-5 py-2.5 text-right font-medium">Entries</th>
                                    <th className="px-5 py-2.5 text-right font-medium">Share</th>
                                    <th className="px-5 py-2.5 text-right font-medium">Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(catQ.data?.categories ?? []).map((c) => (
                                    <tr key={c.id ?? c.name} className="border-b last:border-0 hover:bg-accent/50">
                                        <td className="px-5 py-2.5">
                                            <span className="flex items-center gap-2.5">
                                                <span
                                                    className="flex h-7 w-7 items-center justify-center rounded-md"
                                                    style={{ background: `${c.color}1f`, color: c.color }}
                                                >
                                                    <CategoryIcon icon={c.icon} className="h-3.5 w-3.5" />
                                                </span>
                                                {c.name}
                                            </span>
                                        </td>
                                        <td className="tabular px-5 py-2.5 text-right text-muted-foreground">{c.count}</td>
                                        <td className="tabular px-5 py-2.5 text-right text-muted-foreground">
                                            {c.percent.toFixed(1)}%
                                        </td>
                                        <td
                                            className={cn(
                                                'tabular px-5 py-2.5 text-right font-semibold',
                                                breakdown === 'INCOME' ? 'text-[hsl(var(--income))]' : 'text-[hsl(var(--expense))]'
                                            )}
                                        >
                                            {formatMoney(c.total, currency)}
                                        </td>
                                    </tr>
                                ))}
                                {!catQ.data?.categories.length && (
                                    <tr>
                                        <td colSpan={4} className="px-5 py-10 text-center text-muted-foreground">
                                            Nothing recorded in this period.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                            {!!catQ.data?.total && (
                                <tfoot>
                                    <tr className="border-t-2 font-semibold">
                                        <td className="px-5 py-3">Total</td>
                                        <td />
                                        <td />
                                        <td className="tabular px-5 py-3 text-right">
                                            {formatMoney(catQ.data.total, currency)}
                                        </td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                </CardContent>
            </Card>

            <Card className="border-primary/30 bg-primary/5">
                <CardContent className="flex flex-wrap items-center gap-4 p-5">
                    <Download className="h-5 w-5 shrink-0 text-primary" />
                    <div className="flex-1">
                        <p className="text-sm font-medium">Ready for the tax office</p>
                        <p className="text-xs text-muted-foreground">
                            The PDF is a formatted statement with your summary, breakdowns and full ledger.
                            The Excel workbook has live formulas so figures recompute when you filter rows.
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" loading={exporting === 'print'} onClick={print}>
                            <Printer className="h-4 w-4" /> Print
                        </Button>
                        <Button variant="outline" size="sm" loading={exporting === 'pdf'} onClick={() => exportReport('pdf')}>
                            <FileText className="h-4 w-4" /> PDF
                        </Button>
                        <Button size="sm" loading={exporting === 'excel'} onClick={() => exportReport('excel')}>
                            <FileSpreadsheet className="h-4 w-4" /> Excel
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
