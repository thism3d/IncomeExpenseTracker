import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeftRight, Filter, Loader2, Plus, Receipt, Search, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { useApi, useLiveRefresh } from '@/hooks/useData';
import { api } from '@/lib/ws';
import { cn, debounce, formatDate, formatMoney } from '@/lib/utils';
import { CategoryIcon } from '@/lib/icons';
import { TransactionDialog } from '@/components/TransactionDialog';
import {
    Badge, Button, Card, CardContent, EmptyState, Input, Select, SelectContent,
    SelectItem, SelectTrigger, SelectValue, Skeleton,
} from '@/components/ui';
import type {
    Account, Category, PaymentMethod, Transaction, TxType,
} from '@/lib/types';

interface Cursor { cursor: string; cursorId: string }

export default function Transactions() {
    const { user } = useAuth();
    const currency = user?.currency || 'BDT';

    const accountsQ = useApi<{ accounts: Account[] }>('/accounts');
    const categoriesQ = useApi<{ categories: Category[] }>('/categories');
    const methodsQ = useApi<{ paymentMethods: PaymentMethod[] }>('/payment-methods');

    const [rows, setRows] = useState<Transaction[]>([]);
    const [cursor, setCursor] = useState<Cursor | null>(null);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);

    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [type, setType] = useState<string>('all');
    const [accountId, setAccountId] = useState<string>('all');
    const [categoryId, setCategoryId] = useState<string>('all');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [showFilters, setShowFilters] = useState(false);

    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<Transaction | null>(null);

    const sentinel = useRef<HTMLDivElement>(null);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const pushSearch = useCallback(debounce((v: string) => setDebouncedSearch(v), 350), []);
    useEffect(() => { pushSearch(search); }, [search, pushSearch]);

    const filters = useCallback(() => {
        const p: Record<string, any> = { limit: 25 };
        if (debouncedSearch.trim()) p.search = debouncedSearch.trim();
        if (type !== 'all') p.type = type;
        if (accountId !== 'all') p.accountId = accountId;
        if (categoryId !== 'all') p.categoryId = categoryId;
        if (from) p.from = new Date(from).toISOString();
        if (to) p.to = new Date(`${to}T23:59:59`).toISOString();
        return p;
    }, [debouncedSearch, type, accountId, categoryId, from, to]);

    const loadFirst = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get<{ transactions: Transaction[]; hasMore: boolean; nextCursor: Cursor | null }>(
                '/transactions', filters()
            );
            setRows(res.data.transactions);
            setCursor(res.data.nextCursor);
            setHasMore(res.data.hasMore);
        } catch (err: any) {
            toast.error(err.message || 'Could not load transactions');
        } finally {
            setLoading(false);
        }
    }, [filters]);

    // Keyset pagination: ask for everything strictly older than the last row we
    // hold. Stable while new transactions arrive at the top, unlike OFFSET.
    const loadMore = useCallback(async () => {
        if (!cursor || loadingMore || !hasMore) return;
        setLoadingMore(true);
        try {
            const res = await api.get<{ transactions: Transaction[]; hasMore: boolean; nextCursor: Cursor | null }>(
                '/transactions', { ...filters(), cursor: cursor.cursor, cursorId: cursor.cursorId }
            );
            setRows((prev) => [...prev, ...res.data.transactions]);
            setCursor(res.data.nextCursor);
            setHasMore(res.data.hasMore);
        } catch (err: any) {
            toast.error(err.message || 'Could not load more');
        } finally {
            setLoadingMore(false);
        }
    }, [cursor, hasMore, loadingMore, filters]);

    useEffect(() => { loadFirst(); }, [loadFirst]);
    useLiveRefresh(loadFirst);

    // Infinite scroll: fetch the next page as the sentinel comes into view.
    useEffect(() => {
        const node = sentinel.current;
        if (!node) return;
        const observer = new IntersectionObserver(
            (entries) => { if (entries[0].isIntersecting) loadMore(); },
            { rootMargin: '240px' }
        );
        observer.observe(node);
        return () => observer.disconnect();
    }, [loadMore]);

    const remove = async (tx: Transaction) => {
        try {
            await api.delete(`/transactions/${tx.id}`);
            setRows((prev) => prev.filter((r) => r.id !== tx.id));
            toast.success('Transaction deleted');
        } catch (err: any) {
            toast.error(err.message || 'Could not delete');
        }
    };

    const clearFilters = () => {
        setSearch(''); setType('all'); setAccountId('all');
        setCategoryId('all'); setFrom(''); setTo('');
    };

    const activeFilters = [
        type !== 'all', accountId !== 'all', categoryId !== 'all', !!from, !!to,
    ].filter(Boolean).length;

    // Group by day so a long ledger stays readable.
    const groups: Array<{ date: string; rows: Transaction[] }> = [];
    for (const tx of rows) {
        const day = new Date(tx.occurredAt).toDateString();
        const last = groups[groups.length - 1];
        if (last && last.date === day) last.rows.push(tx);
        else groups.push({ date: day, rows: [tx] });
    }

    return (
        <div className="mx-auto max-w-5xl space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">Transactions</h1>
                    <p className="text-sm text-muted-foreground">Everything you have recorded, newest first.</p>
                </div>
                <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
                    <Plus /> Add transaction
                </Button>
            </div>

            {/* Filters live in one row above the list. */}
            <Card>
                <CardContent className="space-y-3 p-4">
                    <div className="flex flex-wrap gap-2">
                        <div className="relative min-w-[200px] flex-1">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search notes, categories, items…"
                                className="pl-9"
                            />
                        </div>

                        <Select value={type} onValueChange={setType}>
                            <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All types</SelectItem>
                                <SelectItem value="INCOME">Income</SelectItem>
                                <SelectItem value="EXPENSE">Expense</SelectItem>
                                <SelectItem value="TRANSFER">Transfer</SelectItem>
                            </SelectContent>
                        </Select>

                        <Button
                            variant={showFilters || activeFilters ? 'default' : 'outline'}
                            onClick={() => setShowFilters((s) => !s)}
                        >
                            <Filter /> Filters
                            {activeFilters > 0 && (
                                <span className="ml-1 rounded-full bg-background/25 px-1.5 text-xs">{activeFilters}</span>
                            )}
                        </Button>
                    </div>

                    {showFilters && (
                        <div className="grid gap-3 border-t pt-3 sm:grid-cols-2 lg:grid-cols-4">
                            <Select value={accountId} onValueChange={setAccountId}>
                                <SelectTrigger><SelectValue placeholder="Account" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All accounts</SelectItem>
                                    {(accountsQ.data?.accounts ?? []).map((a) => (
                                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            <Select value={categoryId} onValueChange={setCategoryId}>
                                <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All categories</SelectItem>
                                    {(categoriesQ.data?.categories ?? []).map((c) => (
                                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
                            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />

                            {activeFilters > 0 && (
                                <Button variant="ghost" size="sm" onClick={clearFilters} className="justify-self-start">
                                    <X className="h-3.5 w-3.5" /> Clear filters
                                </Button>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            {loading ? (
                <div className="space-y-2">
                    {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
                </div>
            ) : !rows.length ? (
                <Card>
                    <EmptyState
                        icon={Receipt}
                        title={activeFilters || search ? 'Nothing matches those filters' : 'No transactions yet'}
                        description={
                            activeFilters || search
                                ? 'Try widening your search or clearing the filters.'
                                : 'Record your first income or expense to get started.'
                        }
                        action={
                            activeFilters || search
                                ? <Button variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button>
                                : <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>Add transaction</Button>
                        }
                    />
                </Card>
            ) : (
                <div className="space-y-4">
                    {groups.map((group) => {
                        const dayIncome = group.rows.filter((r) => r.type === 'INCOME').reduce((s, r) => s + r.amount, 0);
                        const dayExpense = group.rows.filter((r) => r.type === 'EXPENSE').reduce((s, r) => s + r.amount, 0);

                        return (
                            <div key={group.date}>
                                <div className="mb-2 flex items-center justify-between px-1">
                                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                        {formatDate(group.date, 'day')}
                                    </span>
                                    <span className="tabular flex gap-3 text-xs">
                                        {dayIncome > 0 && (
                                            <span className="text-[hsl(var(--income))]">
                                                +{formatMoney(dayIncome, currency, { compact: true })}
                                            </span>
                                        )}
                                        {dayExpense > 0 && (
                                            <span className="text-[hsl(var(--expense))]">
                                                −{formatMoney(dayExpense, currency, { compact: true })}
                                            </span>
                                        )}
                                    </span>
                                </div>

                                <Card>
                                    <CardContent className="p-1.5">
                                        {group.rows.map((tx) => {
                                            const isIncome = tx.type === 'INCOME';
                                            const isTransfer = tx.type === 'TRANSFER';
                                            const color = tx.category?.color || (isTransfer ? '#64748B' : isIncome ? '#0a7d63' : '#c8322f');

                                            return (
                                                <div
                                                    key={tx.id}
                                                    className="group flex items-center gap-3 rounded-lg px-2.5 py-2.5 transition-colors hover:bg-accent"
                                                >
                                                    <button
                                                        onClick={() => { setEditing(tx); setDialogOpen(true); }}
                                                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
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
                                                                {[
                                                                    tx.note,
                                                                    tx.paymentMethod?.name,
                                                                    tx.accountName,
                                                                    formatDate(tx.occurredAt, 'time'),
                                                                ].filter(Boolean).join(' · ')}
                                                            </p>
                                                            {(tx.itemCount > 0 || tx.attachmentCount > 0 || tx.recurrence !== 'NONE') && (
                                                                <div className="mt-1 flex flex-wrap gap-1">
                                                                    {tx.itemCount > 0 && (
                                                                        <Badge variant="secondary" className="text-[10px]">
                                                                            {tx.itemCount} item{tx.itemCount > 1 ? 's' : ''}
                                                                        </Badge>
                                                                    )}
                                                                    {tx.attachmentCount > 0 && (
                                                                        <Badge variant="secondary" className="text-[10px]">
                                                                            {tx.attachmentCount} file{tx.attachmentCount > 1 ? 's' : ''}
                                                                        </Badge>
                                                                    )}
                                                                    {tx.recurrence !== 'NONE' && (
                                                                        <Badge variant="secondary" className="text-[10px]">
                                                                            {tx.recurrence.toLowerCase()}
                                                                        </Badge>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </button>

                                                    <div className="flex shrink-0 items-center gap-1">
                                                        <span
                                                            className={cn(
                                                                'tabular text-sm font-semibold',
                                                                isIncome && 'text-[hsl(var(--income))]',
                                                                !isIncome && !isTransfer && 'text-[hsl(var(--expense))]'
                                                            )}
                                                        >
                                                            {isTransfer ? '' : isIncome ? '+' : '−'}
                                                            {formatMoney(tx.amount, currency)}
                                                        </span>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon-sm"
                                                            onClick={() => remove(tx)}
                                                            className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                                                            aria-label="Delete transaction"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </CardContent>
                                </Card>
                            </div>
                        );
                    })}

                    <div ref={sentinel} className="flex justify-center py-4">
                        {loadingMore && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
                        {!hasMore && rows.length > 8 && (
                            <p className="text-xs text-muted-foreground">That is everything.</p>
                        )}
                    </div>
                </div>
            )}

            <TransactionDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                accounts={accountsQ.data?.accounts ?? []}
                categories={categoriesQ.data?.categories ?? []}
                paymentMethods={methodsQ.data?.paymentMethods ?? []}
                currency={currency}
                initialType={(type !== 'all' ? type : 'EXPENSE') as TxType}
                editing={editing}
                onSaved={loadFirst}
                onTaxonomyChanged={() => { categoriesQ.reload(); methodsQ.reload(); }}
            />
        </div>
    );
}
