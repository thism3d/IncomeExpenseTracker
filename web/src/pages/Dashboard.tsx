import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    ArrowDownLeft, ArrowLeftRight, ArrowUpRight, ChevronRight, Plus, Receipt, Wallet,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { useApi, useLiveRefresh } from '@/hooks/useData';
import { cn, formatMoney, formatDate } from '@/lib/utils';
import { CategoryIcon } from '@/lib/icons';
import { budgetStatus } from '@/lib/viz';
import { CategoryDonut, PaymentMethodBars, TrendChart } from '@/components/charts';
import { TransactionDialog } from '@/components/TransactionDialog';
import { AccountBar } from '@/components/AccountBar';
import {
    Button, Card, CardContent, CardHeader, CardTitle, EmptyState, Select,
    SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton,
} from '@/components/ui';
import type {
    Account, BudgetRow, Category, CategorySlice, Overview, PaymentMethod,
    PaymentMethodStat, Period, Transaction, TrendPoint, TxType,
} from '@/lib/types';

const PERIODS: Array<{ value: Period; label: string }> = [
    { value: 'daily', label: 'Today' },
    { value: 'weekly', label: 'This week' },
    { value: 'monthly', label: 'This month' },
    { value: 'yearly', label: 'This year' },
];

const StatTile = ({
    label,
    value,
    tone = 'neutral',
    icon: Icon,
    sub,
}: {
    label: string;
    value: string;
    tone?: 'income' | 'expense' | 'neutral';
    icon: React.ComponentType<{ className?: string }>;
    sub?: string;
}) => (
    <Card>
        <CardContent className="p-5">
            <div className="flex items-start justify-between">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
                <span
                    className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-lg',
                        tone === 'income' && 'bg-[hsl(var(--income))]/10 text-[hsl(var(--income))]',
                        tone === 'expense' && 'bg-[hsl(var(--expense))]/10 text-[hsl(var(--expense))]',
                        tone === 'neutral' && 'bg-primary/10 text-primary'
                    )}
                >
                    <Icon className="h-4 w-4" />
                </span>
            </div>
            {/* The hero figure is the point of the tile — nothing competes with it. */}
            <p
                className={cn(
                    'tabular mt-3 text-2xl font-semibold tracking-tight',
                    tone === 'income' && 'text-[hsl(var(--income))]',
                    tone === 'expense' && 'text-[hsl(var(--expense))]'
                )}
            >
                {value}
            </p>
            {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
        </CardContent>
    </Card>
);

const TransactionRow = ({
    tx,
    currency,
    onClick,
}: {
    tx: Transaction;
    currency: string;
    onClick: () => void;
}) => {
    const isIncome = tx.type === 'INCOME';
    const isTransfer = tx.type === 'TRANSFER';
    const color = tx.category?.color || (isTransfer ? '#64748B' : isIncome ? '#0a7d63' : '#c8322f');

    return (
        <button
            onClick={onClick}
            className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-accent"
        >
            <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                style={{ background: `${color}1f`, color }}
            >
                {isTransfer
                    ? <ArrowLeftRight className="h-[18px] w-[18px]" />
                    : <CategoryIcon icon={tx.category?.icon} className="h-[18px] w-[18px]" />}
            </span>

            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                    {isTransfer
                        ? `${tx.accountName} → ${tx.toAccountName}`
                        : tx.category?.name || (isIncome ? 'Income' : 'Expense')}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                    {[tx.note, tx.paymentMethod?.name, formatDate(tx.occurredAt)].filter(Boolean).join(' · ')}
                </p>
            </div>

            <div className="shrink-0 text-right">
                <p
                    className={cn(
                        'tabular text-sm font-semibold',
                        isIncome && 'text-[hsl(var(--income))]',
                        !isIncome && !isTransfer && 'text-[hsl(var(--expense))]'
                    )}
                >
                    {isTransfer ? '' : isIncome ? '+' : '−'}
                    {formatMoney(tx.amount, currency)}
                </p>
                {(tx.attachmentCount > 0 || tx.itemCount > 0) && (
                    <p className="text-[11px] text-muted-foreground">
                        {[
                            tx.itemCount > 0 && `${tx.itemCount} item${tx.itemCount > 1 ? 's' : ''}`,
                            tx.attachmentCount > 0 && `${tx.attachmentCount} file${tx.attachmentCount > 1 ? 's' : ''}`,
                        ].filter(Boolean).join(' · ')}
                    </p>
                )}
            </div>
        </button>
    );
};

export default function Dashboard() {
    const { user } = useAuth();
    const { mode } = useTheme();
    const currency = user?.currency || 'BDT';

    const [accountId, setAccountId] = useState<string>('');
    const [period, setPeriod] = useState<Period>('monthly');
    const [dialogOpen, setDialogOpen] = useState(false);
    const [dialogType, setDialogType] = useState<TxType>('EXPENSE');
    const [editing, setEditing] = useState<Transaction | null>(null);

    const scope = accountId ? { accountId } : {};

    const accountsQ = useApi<{ accounts: Account[] }>('/accounts');
    const categoriesQ = useApi<{ categories: Category[] }>('/categories');
    const methodsQ = useApi<{ paymentMethods: PaymentMethod[] }>('/payment-methods');
    const overviewQ = useApi<Overview>('/reports/overview', scope, [accountId]);
    const trendQ = useApi<{ points: TrendPoint[]; range: { grain: string } }>(
        '/reports/trend', { period, ...scope }, [period, accountId]
    );
    const catQ = useApi<{ categories: CategorySlice[] }>(
        '/reports/categories', { period, type: 'EXPENSE', ...scope }, [period, accountId]
    );
    const pmQ = useApi<{ paymentMethods: PaymentMethodStat[] }>(
        '/reports/payment-methods', { period, ...scope }, [period, accountId]
    );
    const budgetQ = useApi<{ overall: BudgetRow | null; categories: BudgetRow[] }>('/reports/budget');
    const recentQ = useApi<{ transactions: Transaction[] }>(
        '/transactions', { limit: 8, ...scope }, [accountId]
    );

    const reloadAll = useCallback(() => {
        accountsQ.reload();
        overviewQ.reload();
        trendQ.reload();
        catQ.reload();
        pmQ.reload();
        budgetQ.reload();
        recentQ.reload();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [accountId, period]);

    // Another device (the phone) adding a transaction refreshes this screen live.
    useLiveRefresh(reloadAll);

    const accounts = accountsQ.data?.accounts ?? [];
    const overview = overviewQ.data;
    const totals = overview?.[period === 'daily' ? 'daily' : period === 'weekly' ? 'weekly' : period === 'yearly' ? 'yearly' : 'monthly'];
    const budget = budgetQ.data?.overall;

    const openAdd = (type: TxType) => {
        setEditing(null);
        setDialogType(type);
        setDialogOpen(true);
    };

    const greeting = useMemo(() => {
        const h = new Date().getHours();
        return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    }, []);

    return (
        <div className="mx-auto max-w-7xl space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">
                        {greeting}, {user?.name?.split(' ')[0]}
                    </h1>
                    <p className="text-sm text-muted-foreground">Here is where your money stands.</p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
                        <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            {PERIODS.map((p) => (
                                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Button onClick={() => openAdd('EXPENSE')}>
                        <Plus /> Add transaction
                    </Button>
                </div>
            </div>

            <AccountBar
                accounts={accounts}
                loading={accountsQ.loading}
                selected={accountId}
                onSelect={setAccountId}
                currency={currency}
                onChanged={reloadAll}
            />

            {/* Stat tiles */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {overviewQ.loading || !overview || !totals ? (
                    Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[118px]" />)
                ) : (
                    <>
                        <StatTile
                            label="Balance"
                            value={formatMoney(overview.balance, currency)}
                            icon={Wallet}
                            sub={accountId ? accounts.find((a) => a.id === accountId)?.name : 'Across all accounts'}
                        />
                        <StatTile
                            label={`Income · ${PERIODS.find((p) => p.value === period)?.label}`}
                            value={formatMoney(totals.income, currency)}
                            tone="income"
                            icon={ArrowDownLeft}
                        />
                        <StatTile
                            label={`Expense · ${PERIODS.find((p) => p.value === period)?.label}`}
                            value={formatMoney(totals.expense, currency)}
                            tone="expense"
                            icon={ArrowUpRight}
                        />
                        <StatTile
                            label="Net"
                            value={formatMoney(totals.net, currency, { sign: totals.net > 0 })}
                            tone={totals.net >= 0 ? 'income' : 'expense'}
                            icon={Receipt}
                            sub={`${totals.net >= 0 ? 'Saved' : 'Overspent'} this ${period.replace('ly', '')}`}
                        />
                    </>
                )}
            </div>

            {/* Quick actions */}
            <div className="grid gap-3 sm:grid-cols-3">
                {([
                    { type: 'INCOME' as TxType, label: 'Add income', icon: ArrowDownLeft, cls: 'text-[hsl(var(--income))] bg-[hsl(var(--income))]/10' },
                    { type: 'EXPENSE' as TxType, label: 'Add expense', icon: ArrowUpRight, cls: 'text-[hsl(var(--expense))] bg-[hsl(var(--expense))]/10' },
                    { type: 'TRANSFER' as TxType, label: 'Transfer', icon: ArrowLeftRight, cls: 'text-primary bg-primary/10' },
                ]).map((a) => (
                    <button
                        key={a.type}
                        onClick={() => openAdd(a.type)}
                        className="flex items-center gap-3 rounded-xl border bg-card p-4 text-left shadow-sm transition-colors hover:bg-accent"
                    >
                        <span className={cn('flex h-10 w-10 items-center justify-center rounded-xl', a.cls)}>
                            <a.icon className="h-5 w-5" />
                        </span>
                        <span className="text-sm font-medium">{a.label}</span>
                        <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
                    </button>
                ))}
            </div>

            {/* Charts. `min-w-0` on the grid items is load-bearing: a grid item
                defaults to min-width:auto and refuses to shrink below its content,
                which is what made the charts render clipped on a tablet until a
                resize forced a remeasure. */}
            <div className="grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
                <Card className="lg:col-span-2">
                    <CardHeader className="flex-row items-center justify-between">
                        <CardTitle className="text-base">Income vs expense</CardTitle>
                        <Link to="/reports" className="text-xs font-medium text-primary hover:underline">
                            Full report
                        </Link>
                    </CardHeader>
                    <CardContent>
                        {trendQ.loading ? (
                            <Skeleton className="h-[260px]" />
                        ) : (
                            <TrendChart
                                points={trendQ.data?.points ?? []}
                                mode={mode}
                                currency={currency}
                                grain={trendQ.data?.range.grain}
                            />
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Where it went</CardTitle>
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
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 [&>*]:min-w-0">
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
                            />
                        )}
                    </CardContent>
                </Card>

                {/* Budget — a state, so it wears status tokens, with the number spelled
                    out beside the bar (never colour alone). */}
                <Card>
                    <CardHeader className="flex-row items-center justify-between">
                        <CardTitle className="text-base">Monthly budget</CardTitle>
                        <Link to="/budgets" className="text-xs font-medium text-primary hover:underline">
                            Manage
                        </Link>
                    </CardHeader>
                    <CardContent>
                        {budgetQ.loading ? (
                            <Skeleton className="h-[200px]" />
                        ) : !budget ? (
                            <EmptyState
                                icon={Wallet}
                                title="No budget set"
                                description="Set a monthly limit to track how much is left."
                                action={
                                    <Button asChild size="sm" variant="outline">
                                        <Link to="/budgets">Set a budget</Link>
                                    </Button>
                                }
                            />
                        ) : (
                            <div className="space-y-4">
                                {(() => {
                                    const state = budgetStatus(budget.percentUsed);
                                    const barCls =
                                        state === 'critical' ? 'bg-[hsl(var(--expense))]'
                                        : state === 'warning' ? 'bg-amber-500'
                                        : 'bg-[hsl(var(--income))]';
                                    return (
                                        <>
                                            <div>
                                                <div className="mb-1.5 flex items-baseline justify-between">
                                                    <span className="tabular text-2xl font-semibold">
                                                        {formatMoney(budget.spent, currency)}
                                                    </span>
                                                    <span className="text-sm text-muted-foreground">
                                                        of {formatMoney(budget.budget, currency)}
                                                    </span>
                                                </div>
                                                <div className="h-2 overflow-hidden rounded-full bg-muted">
                                                    <div
                                                        className={cn('h-full rounded-full transition-all', barCls)}
                                                        style={{ width: `${Math.min(budget.percentUsed, 100)}%` }}
                                                    />
                                                </div>
                                                <p className="mt-1.5 text-xs text-muted-foreground">
                                                    {budget.percentUsed.toFixed(0)}% used
                                                    {budget.remaining >= 0
                                                        ? ` · ${formatMoney(budget.remaining, currency)} left`
                                                        : ` · ${formatMoney(Math.abs(budget.remaining), currency)} over`}
                                                </p>
                                            </div>

                                            <div className="grid grid-cols-2 gap-3 border-t pt-3">
                                                <div>
                                                    <p className="text-xs text-muted-foreground">Per day so far</p>
                                                    <p className="tabular text-sm font-semibold">
                                                        {formatMoney(budget.perDayAverage, currency)}
                                                    </p>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-muted-foreground">Left per day</p>
                                                    <p className="tabular text-sm font-semibold">
                                                        {formatMoney(Math.max(0, budget.perDayRemaining), currency)}
                                                    </p>
                                                </div>
                                            </div>
                                        </>
                                    );
                                })()}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Recent transactions */}
                <Card>
                    <CardHeader className="flex-row items-center justify-between">
                        <CardTitle className="text-base">Recent</CardTitle>
                        <Link to="/transactions" className="text-xs font-medium text-primary hover:underline">
                            See all
                        </Link>
                    </CardHeader>
                    <CardContent className="px-3">
                        {recentQ.loading ? (
                            <div className="space-y-2">
                                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14" />)}
                            </div>
                        ) : !recentQ.data?.transactions.length ? (
                            <EmptyState
                                icon={Receipt}
                                title="No transactions yet"
                                description="Add your first income or expense."
                                action={<Button size="sm" onClick={() => openAdd('EXPENSE')}>Add transaction</Button>}
                            />
                        ) : (
                            <div className="space-y-0.5">
                                {recentQ.data.transactions.map((tx) => (
                                    <TransactionRow
                                        key={tx.id}
                                        tx={tx}
                                        currency={currency}
                                        onClick={() => { setEditing(tx); setDialogOpen(true); }}
                                    />
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            <TransactionDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                accounts={accounts}
                categories={categoriesQ.data?.categories ?? []}
                paymentMethods={methodsQ.data?.paymentMethods ?? []}
                currency={currency}
                initialType={dialogType}
                editing={editing}
                onSaved={reloadAll}
                onTaxonomyChanged={() => { categoriesQ.reload(); methodsQ.reload(); }}
            />
        </div>
    );
}
