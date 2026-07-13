import { useState } from 'react';
import { AlertTriangle, CheckCircle2, PiggyBank, Plus, Trash2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { useApi, useLiveRefresh } from '@/hooks/useData';
import { api } from '@/lib/ws';
import { cn, formatMoney } from '@/lib/utils';
import { CategoryIcon } from '@/lib/icons';
import { budgetStatus } from '@/lib/viz';
import {
    Button, Card, CardContent, Dialog, DialogContent,
    DialogDescription, DialogFooter, DialogHeader, DialogTitle, EmptyState, Input,
    Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton,
} from '@/components/ui';
import type { BudgetRow, Category } from '@/lib/types';

// Budget usage is a STATE, so it wears status tokens — and every one of them
// ships with an icon and a label, so the meaning never rests on colour alone.
const STATE_UI = {
    good: { icon: CheckCircle2, label: 'On track', bar: 'bg-[hsl(var(--income))]', text: 'text-[hsl(var(--income))]' },
    warning: { icon: AlertTriangle, label: 'Nearly spent', bar: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-500' },
    critical: { icon: XCircle, label: 'Over budget', bar: 'bg-[hsl(var(--expense))]', text: 'text-[hsl(var(--expense))]' },
} as const;

const BudgetCard = ({
    row,
    currency,
    onDelete,
    onEdit,
}: {
    row: BudgetRow;
    currency: string;
    onDelete: () => void;
    onEdit: () => void;
}) => {
    const state = budgetStatus(row.percentUsed);
    const ui = STATE_UI[state];
    const Icon = ui.icon;

    return (
        <Card className="group">
            <CardContent className="space-y-3 p-5">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                        <span
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                            style={
                                row.category
                                    ? { background: `${row.category.color}1f`, color: row.category.color }
                                    : undefined
                            }
                        >
                            {row.category
                                ? <CategoryIcon icon={row.category.icon} className="h-4 w-4" />
                                : <PiggyBank className="h-4 w-4 text-primary" />}
                        </span>
                        <div className="min-w-0">
                            <p className="truncate text-sm font-medium">
                                {row.category?.name ?? 'Overall budget'}
                            </p>
                            <p className={cn('flex items-center gap-1 text-xs', ui.text)}>
                                <Icon className="h-3 w-3" />
                                {ui.label}
                            </p>
                        </div>
                    </div>

                    <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label="Edit budget">
                            <Plus className="h-3.5 w-3.5 rotate-45" />
                        </Button>
                        <Button
                            variant="ghost" size="icon-sm" onClick={onDelete}
                            className="text-muted-foreground hover:text-destructive"
                            aria-label="Remove budget"
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </div>

                <div>
                    <div className="mb-1.5 flex items-baseline justify-between">
                        <span className="tabular text-xl font-semibold">{formatMoney(row.spent, currency)}</span>
                        <span className="text-xs text-muted-foreground">of {formatMoney(row.budget, currency)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                            className={cn('h-full rounded-full transition-all', ui.bar)}
                            style={{ width: `${Math.min(row.percentUsed, 100)}%` }}
                        />
                    </div>
                    <p className="tabular mt-1.5 text-xs text-muted-foreground">
                        {row.percentUsed.toFixed(0)}% used ·{' '}
                        {row.remaining >= 0
                            ? `${formatMoney(row.remaining, currency)} left`
                            : `${formatMoney(Math.abs(row.remaining), currency)} over`}
                    </p>
                </div>

                <div className="grid grid-cols-2 gap-3 border-t pt-3 text-xs">
                    <div>
                        <p className="text-muted-foreground">Per day so far</p>
                        <p className="tabular font-semibold">{formatMoney(row.perDayAverage, currency)}</p>
                    </div>
                    <div>
                        <p className="text-muted-foreground">Left per day</p>
                        <p className="tabular font-semibold">
                            {formatMoney(Math.max(0, row.perDayRemaining), currency)}
                        </p>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};

export default function Budgets() {
    const { user } = useAuth();
    const currency = user?.currency || 'BDT';

    const [open, setOpen] = useState(false);
    const [categoryId, setCategoryId] = useState('overall');
    const [amount, setAmount] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const budgetQ = useApi<{ overall: BudgetRow | null; categories: BudgetRow[] }>('/reports/budget');
    const categoriesQ = useApi<{ categories: Category[] }>('/categories', { type: 'EXPENSE' });

    useLiveRefresh(budgetQ.reload);

    const save = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        const value = Number(amount);
        if (!value || value <= 0) return setError('Enter a budget amount greater than zero');

        setSaving(true);
        try {
            await api.put('/budgets', {
                categoryId: categoryId === 'overall' ? null : categoryId,
                period: 'MONTHLY',
                amount: value,
            });
            toast.success('Budget saved');
            setOpen(false);
            setAmount('');
            setCategoryId('overall');
            budgetQ.reload();
        } catch (err: any) {
            setError(err.message || 'Could not save the budget');
        } finally {
            setSaving(false);
        }
    };

    const remove = async (row: BudgetRow) => {
        try {
            await api.delete(`/budgets/${row.id}`);
            toast.success('Budget removed');
            budgetQ.reload();
        } catch (err: any) {
            toast.error(err.message || 'Could not remove');
        }
    };

    const edit = (row: BudgetRow) => {
        setCategoryId(row.categoryId ?? 'overall');
        setAmount(String(row.budget));
        setOpen(true);
    };

    const overall = budgetQ.data?.overall;
    const categories = budgetQ.data?.categories ?? [];
    const hasAny = !!overall || categories.length > 0;

    return (
        <div className="mx-auto max-w-5xl space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">Budgets</h1>
                    <p className="text-sm text-muted-foreground">
                        Set a monthly ceiling overall, or per category. You are alerted at 90%.
                    </p>
                </div>
                <Button onClick={() => { setCategoryId('overall'); setAmount(''); setOpen(true); }}>
                    <Plus /> Set a budget
                </Button>
            </div>

            {budgetQ.loading ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-[220px]" />)}
                </div>
            ) : !hasAny ? (
                <Card>
                    <EmptyState
                        icon={PiggyBank}
                        title="No budgets yet"
                        description="Set a monthly limit and watch how much is left, and what you can still spend per day."
                        action={<Button size="sm" onClick={() => setOpen(true)}>Set your first budget</Button>}
                    />
                </Card>
            ) : (
                <div className="space-y-5">
                    {overall && (
                        <div>
                            <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Overall
                            </h2>
                            <BudgetCard
                                row={overall}
                                currency={currency}
                                onDelete={() => remove(overall)}
                                onEdit={() => edit(overall)}
                            />
                        </div>
                    )}

                    {categories.length > 0 && (
                        <div>
                            <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                By category
                            </h2>
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                {categories.map((row) => (
                                    <BudgetCard
                                        key={row.id}
                                        row={row}
                                        currency={currency}
                                        onDelete={() => remove(row)}
                                        onEdit={() => edit(row)}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Set a monthly budget</DialogTitle>
                        <DialogDescription>
                            Setting a budget for a category that already has one replaces it.
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={save} className="space-y-4" noValidate>
                        <div className="space-y-2">
                            <Label>Applies to</Label>
                            <Select value={categoryId} onValueChange={setCategoryId}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="overall">Overall (all spending)</SelectItem>
                                    {(categoriesQ.data?.categories ?? []).map((c) => (
                                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="budget-amount">Monthly limit</Label>
                            <div className="relative">
                                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                                    {currency === 'BDT' ? '৳' : currency}
                                </span>
                                <Input
                                    id="budget-amount"
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    placeholder="0.00"
                                    className="tabular pl-9"
                                    autoFocus
                                />
                            </div>
                        </div>

                        {error && (
                            <p className="rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">{error}</p>
                        )}

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                            <Button type="submit" loading={saving}>Save budget</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
