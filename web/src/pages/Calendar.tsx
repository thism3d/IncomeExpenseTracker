import { useCallback, useMemo, useState } from 'react';
import { ArrowLeftRight, ChevronLeft, ChevronRight, Plus, Receipt } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useApi, useLiveRefresh } from '@/hooks/useData';
import { cn, formatDate, formatMoney } from '@/lib/utils';
import { CategoryIcon } from '@/lib/icons';
import { TransactionDialog } from '@/components/TransactionDialog';
import {
    Button, Card, CardContent, CardHeader, CardTitle, EmptyState, Skeleton,
} from '@/components/ui';
import type {
    Account, CalendarDay, Category, PaymentMethod, Transaction, TxType,
} from '@/lib/types';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const dayKey = (d: Date | string) => {
    const date = typeof d === 'string' ? new Date(d) : d;
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export default function CalendarPage() {
    const { user } = useAuth();
    const currency = user?.currency || 'BDT';

    const [cursor, setCursor] = useState(() => new Date());
    const [selected, setSelected] = useState<Date>(() => new Date());
    const [dialogOpen, setDialogOpen] = useState(false);
    const [dialogType, setDialogType] = useState<TxType>('EXPENSE');
    const [editing, setEditing] = useState<Transaction | null>(null);

    const month = monthKey(cursor);

    const accountsQ = useApi<{ accounts: Account[] }>('/accounts');
    const categoriesQ = useApi<{ categories: Category[] }>('/categories');
    const methodsQ = useApi<{ paymentMethods: PaymentMethod[] }>('/payment-methods');

    const calQ = useApi<{ days: CalendarDay[]; totals: { income: number; expense: number; balance: number } }>(
        '/reports/calendar', { month }, [month]
    );

    const dayStart = new Date(selected); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(selected); dayEnd.setHours(23, 59, 59, 999);

    const dayQ = useApi<{ transactions: Transaction[] }>(
        '/transactions',
        { from: dayStart.toISOString(), to: dayEnd.toISOString(), limit: 50 },
        [dayStart.getTime()]
    );

    const reload = useCallback(() => {
        calQ.reload();
        dayQ.reload();
        accountsQ.reload();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [month, dayStart.getTime()]);

    useLiveRefresh(reload);

    const byDay = useMemo(() => {
        const map = new Map<string, CalendarDay>();
        for (const d of calQ.data?.days ?? []) map.set(dayKey(d.date), d);
        return map;
    }, [calQ.data]);

    // Build the month grid, Monday-first, padded to whole weeks.
    const cells = useMemo(() => {
        const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
        const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
        const lead = (first.getDay() + 6) % 7;   // Sunday=0 -> 6, Monday=1 -> 0

        const out: Array<Date | null> = Array(lead).fill(null);
        for (let d = 1; d <= last.getDate(); d++) {
            out.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
        }
        while (out.length % 7 !== 0) out.push(null);
        return out;
    }, [cursor]);

    const totals = calQ.data?.totals;
    const today = dayKey(new Date());

    const openAdd = (type: TxType) => {
        setEditing(null);
        setDialogType(type);
        setDialogOpen(true);
    };

    return (
        <div className="mx-auto max-w-6xl space-y-5">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
                <p className="text-sm text-muted-foreground">
                    Tap any day to see what happened, or add an entry dated to it.
                </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
                <Card>
                    <CardHeader className="flex-row items-center justify-between space-y-0">
                        <CardTitle className="text-base">
                            {cursor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
                        </CardTitle>
                        <div className="flex items-center gap-1">
                            <Button
                                variant="ghost" size="icon-sm"
                                onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
                                aria-label="Previous month"
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="ghost" size="sm" className="text-xs"
                                onClick={() => { const now = new Date(); setCursor(now); setSelected(now); }}
                            >
                                Today
                            </Button>
                            <Button
                                variant="ghost" size="icon-sm"
                                onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
                                aria-label="Next month"
                            >
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </CardHeader>

                    <CardContent>
                        <div className="mb-2 grid grid-cols-7 gap-1">
                            {WEEKDAYS.map((d) => (
                                <div key={d} className="py-1 text-center text-[11px] font-medium text-muted-foreground">
                                    {d}
                                </div>
                            ))}
                        </div>

                        {calQ.loading ? (
                            <Skeleton className="h-[320px]" />
                        ) : (
                            <div className="grid grid-cols-7 gap-1">
                                {cells.map((date, i) => {
                                    if (!date) return <div key={i} />;

                                    const key = dayKey(date);
                                    const data = byDay.get(key);
                                    const isSelected = key === dayKey(selected);
                                    const isToday = key === today;

                                    return (
                                        <button
                                            key={key}
                                            onClick={() => setSelected(date)}
                                            className={cn(
                                                'flex min-h-[68px] flex-col gap-0.5 rounded-lg border p-1.5 text-left transition-colors',
                                                isSelected
                                                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                                                    : 'border-transparent hover:bg-accent',
                                                !data && 'text-muted-foreground'
                                            )}
                                        >
                                            <span
                                                className={cn(
                                                    'tabular text-xs font-medium',
                                                    isToday && 'flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground'
                                                )}
                                            >
                                                {date.getDate()}
                                            </span>

                                            {/* The day's money is shown as text, not a colour-only dot. */}
                                            {data && (
                                                <span className="tabular mt-auto space-y-0.5 text-[10px] leading-tight">
                                                    {data.income > 0 && (
                                                        <span className="block truncate text-[hsl(var(--income))]">
                                                            +{formatMoney(data.income, currency, { compact: true })}
                                                        </span>
                                                    )}
                                                    {data.expense > 0 && (
                                                        <span className="block truncate text-[hsl(var(--expense))]">
                                                            −{formatMoney(data.expense, currency, { compact: true })}
                                                        </span>
                                                    )}
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {totals && (
                            <div className="mt-4 grid grid-cols-3 gap-3 border-t pt-4">
                                <div>
                                    <p className="text-xs text-muted-foreground">Income</p>
                                    <p className="tabular text-sm font-semibold text-[hsl(var(--income))]">
                                        {formatMoney(totals.income, currency)}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">Expense</p>
                                    <p className="tabular text-sm font-semibold text-[hsl(var(--expense))]">
                                        {formatMoney(totals.expense, currency)}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">Balance</p>
                                    <p
                                        className={cn(
                                            'tabular text-sm font-semibold',
                                            totals.balance >= 0 ? 'text-[hsl(var(--income))]' : 'text-[hsl(var(--expense))]'
                                        )}
                                    >
                                        {formatMoney(totals.balance, currency, { sign: totals.balance > 0 })}
                                    </p>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* The selected day */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">{formatDate(selected, 'long')}</CardTitle>
                        <div className="flex gap-2 pt-1">
                            <Button size="sm" variant="outline" className="flex-1" onClick={() => openAdd('INCOME')}>
                                <Plus className="h-3.5 w-3.5" /> Income
                            </Button>
                            <Button size="sm" variant="outline" className="flex-1" onClick={() => openAdd('EXPENSE')}>
                                <Plus className="h-3.5 w-3.5" /> Expense
                            </Button>
                        </div>
                    </CardHeader>

                    <CardContent className="px-3">
                        {dayQ.loading ? (
                            <div className="space-y-2">
                                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14" />)}
                            </div>
                        ) : !dayQ.data?.transactions.length ? (
                            <EmptyState
                                icon={Receipt}
                                title="Nothing on this day"
                                description="Add an income or expense dated to it."
                            />
                        ) : (
                            <div className="space-y-0.5">
                                {dayQ.data.transactions.map((tx) => {
                                    const isIncome = tx.type === 'INCOME';
                                    const isTransfer = tx.type === 'TRANSFER';
                                    const color = tx.category?.color || (isTransfer ? '#64748B' : isIncome ? '#0a7d63' : '#c8322f');

                                    return (
                                        <button
                                            key={tx.id}
                                            onClick={() => { setEditing(tx); setDialogOpen(true); }}
                                            className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-accent"
                                        >
                                            <span
                                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                                                style={{ background: `${color}1f`, color }}
                                            >
                                                {isTransfer
                                                    ? <ArrowLeftRight className="h-4 w-4" />
                                                    : <CategoryIcon icon={tx.category?.icon} className="h-4 w-4" />}
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-sm font-medium">
                                                    {isTransfer
                                                        ? `${tx.accountName} → ${tx.toAccountName}`
                                                        : tx.category?.name || (isIncome ? 'Income' : 'Expense')}
                                                </p>
                                                <p className="truncate text-xs text-muted-foreground">
                                                    {[tx.note, formatDate(tx.occurredAt, 'time')].filter(Boolean).join(' · ')}
                                                </p>
                                            </div>
                                            <span
                                                className={cn(
                                                    'tabular shrink-0 text-sm font-semibold',
                                                    isIncome && 'text-[hsl(var(--income))]',
                                                    !isIncome && !isTransfer && 'text-[hsl(var(--expense))]'
                                                )}
                                            >
                                                {isTransfer ? '' : isIncome ? '+' : '−'}
                                                {formatMoney(tx.amount, currency)}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            <TransactionDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                accounts={accountsQ.data?.accounts ?? []}
                categories={categoriesQ.data?.categories ?? []}
                paymentMethods={methodsQ.data?.paymentMethods ?? []}
                currency={currency}
                initialType={dialogType}
                // A new entry from the calendar defaults to the day you tapped.
                initialDate={selected}
                editing={editing}
                onSaved={reload}
                onTaxonomyChanged={() => { categoriesQ.reload(); methodsQ.reload(); }}
            />
        </div>
    );
}
