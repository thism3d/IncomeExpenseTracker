import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ArrowLeftRight, FileAudio, FileText, Image as ImageIcon, Loader2, Paperclip,
    Plus, Search, Trash2, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/ws';
import { cn, formatBytes, formatMoney } from '@/lib/utils';
import { CategoryIcon } from '@/lib/icons';
import { FileThumbnail } from '@/components/FilePreview';
import type { Account, Attachment, Category, PaymentMethod, Transaction, TxItem, TxType } from '@/lib/types';
import {
    Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
    DialogTitle, Input, Label, Select, SelectContent, SelectItem, SelectTrigger,
    SelectValue, Textarea,
} from '@/components/ui';

const TYPES: Array<{ value: TxType; label: string; hint: string }> = [
    { value: 'EXPENSE', label: 'Expense', hint: 'Money out' },
    { value: 'INCOME', label: 'Income', hint: 'Money in' },
    { value: 'TRANSFER', label: 'Transfer', hint: 'Between your accounts' },
];

const RECURRENCE = [
    { value: 'NONE', label: 'Does not repeat' },
    { value: 'DAILY', label: 'Every day' },
    { value: 'WEEKLY', label: 'Every week' },
    { value: 'MONTHLY', label: 'Every month' },
    { value: 'YEARLY', label: 'Every year' },
];

const KIND_ICON = { IMAGE: ImageIcon, PDF: FileText, DOC: FileText, AUDIO: FileAudio, OTHER: Paperclip } as const;

const toLocalInput = (iso: string) => {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// A searchable picker for categories / payment methods, with an inline "create"
// row so the user never has to leave the form to add a missing option.
function TaxonomyPicker({
    label,
    options,
    value,
    onChange,
    onCreate,
    placeholder,
    creating,
}: {
    label: string;
    options: Array<Category | PaymentMethod>;
    value: string | null;
    onChange: (id: string) => void;
    onCreate: (name: string) => Promise<void>;
    placeholder: string;
    creating: boolean;
}) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const boxRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onClick = (e: MouseEvent) => {
            if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onClick);
        return () => document.removeEventListener('mousedown', onClick);
    }, [open]);

    const selected = options.find((o) => o.id === value);
    const filtered = useMemo(
        () => options.filter((o) => o.name.toLowerCase().includes(search.trim().toLowerCase())),
        [options, search]
    );
    const exact = filtered.some((o) => o.name.toLowerCase() === search.trim().toLowerCase());

    return (
        <div className="space-y-2">
            <Label>{label}</Label>
            <div ref={boxRef} className="relative">
                <button
                    type="button"
                    onClick={() => setOpen((o) => !o)}
                    className="flex h-10 w-full items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                    {selected ? (
                        <>
                            <span
                                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
                                style={{ background: `${selected.color}1f`, color: selected.color }}
                            >
                                <CategoryIcon icon={selected.icon} className="h-3.5 w-3.5" />
                            </span>
                            <span className="truncate">{selected.name}</span>
                        </>
                    ) : (
                        <span className="text-muted-foreground">{placeholder}</span>
                    )}
                </button>

                {open && (
                    <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border bg-popover shadow-lg">
                        <div className="flex items-center gap-2 border-b px-3 py-2">
                            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <input
                                autoFocus
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search or type to add…"
                                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                            />
                        </div>

                        <div className="max-h-56 overflow-y-auto scrollbar-thin p-1">
                            {filtered.map((o) => (
                                <button
                                    key={o.id}
                                    type="button"
                                    onClick={() => { onChange(o.id); setOpen(false); setSearch(''); }}
                                    className={cn(
                                        'flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-accent',
                                        o.id === value && 'bg-accent'
                                    )}
                                >
                                    <span
                                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
                                        style={{ background: `${o.color}1f`, color: o.color }}
                                    >
                                        <CategoryIcon icon={o.icon} className="h-4 w-4" />
                                    </span>
                                    <span className="truncate">{o.name}</span>
                                </button>
                            ))}

                            {search.trim() && !exact && (
                                <button
                                    type="button"
                                    disabled={creating}
                                    onClick={async () => {
                                        await onCreate(search.trim());
                                        setOpen(false);
                                        setSearch('');
                                    }}
                                    className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm text-primary transition-colors hover:bg-accent"
                                >
                                    {creating
                                        ? <Loader2 className="h-4 w-4 animate-spin" />
                                        : <Plus className="h-4 w-4" />}
                                    Add “{search.trim()}”
                                </button>
                            )}

                            {!filtered.length && !search.trim() && (
                                <p className="px-2 py-6 text-center text-sm text-muted-foreground">Nothing here yet</p>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export function TransactionDialog({
    open,
    onOpenChange,
    accounts,
    categories,
    paymentMethods,
    currency,
    initialType = 'EXPENSE',
    initialDate,
    editing,
    onSaved,
    onTaxonomyChanged,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    accounts: Account[];
    categories: Category[];
    paymentMethods: PaymentMethod[];
    currency: string;
    initialType?: TxType;
    initialDate?: Date;
    editing?: Transaction | null;
    onSaved: () => void;
    onTaxonomyChanged: () => void;
}) {
    const [type, setType] = useState<TxType>(initialType);
    const [accountId, setAccountId] = useState('');
    const [toAccountId, setToAccountId] = useState('');
    const [amount, setAmount] = useState('');
    const [categoryId, setCategoryId] = useState<string | null>(null);
    const [paymentMethodId, setPaymentMethodId] = useState<string | null>(null);
    const [note, setNote] = useState('');
    const [occurredAt, setOccurredAt] = useState(() => toLocalInput(new Date().toISOString()));
    const [recurrence, setRecurrence] = useState('NONE');
    const [reminderAt, setReminderAt] = useState('');
    const [items, setItems] = useState<TxItem[]>([]);
    const [attachments, setAttachments] = useState<Attachment[]>([]);

    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [creatingTaxonomy, setCreatingTaxonomy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    // Hydrate the form: an edit loads the full record (items + attachments only
    // come back on the detail route), a create resets to defaults.
    useEffect(() => {
        if (!open) return;

        if (editing) {
            setType(editing.type);
            setAccountId(editing.accountId);
            setToAccountId(editing.toAccountId || '');
            setAmount(String(editing.amount));
            setCategoryId(editing.categoryId);
            setPaymentMethodId(editing.paymentMethodId);
            setNote(editing.note || '');
            setOccurredAt(toLocalInput(editing.occurredAt));
            setRecurrence(editing.recurrence);
            setReminderAt(editing.reminderAt ? toLocalInput(editing.reminderAt) : '');

            api.get<{ transaction: Transaction }>(`/transactions/${editing.id}`)
                .then((res) => {
                    setItems(res.data.transaction.items || []);
                    setAttachments(res.data.transaction.attachments || []);
                })
                .catch(() => { /* the header data is already on screen; items can stay empty */ });
        } else {
            setType(initialType);
            setAccountId(accounts.find((a) => a.isDefault)?.id || accounts[0]?.id || '');
            setToAccountId('');
            setAmount('');
            setCategoryId(null);
            setPaymentMethodId(paymentMethods.find((p) => p.name === 'Cash')?.id || null);
            setNote('');
            setOccurredAt(toLocalInput((initialDate || new Date()).toISOString()));
            setRecurrence('NONE');
            setReminderAt('');
            setItems([]);
            setAttachments([]);
        }
        setError(null);
    }, [open, editing, initialType, initialDate, accounts, paymentMethods]);

    const typeCategories = useMemo(
        () => categories.filter((c) => c.type === (type === 'TRANSFER' ? 'EXPENSE' : type)),
        [categories, type]
    );

    // The items grid is authoritative when it has rows: the amount becomes the sum
    // of the lines, so a bill and its total can never disagree.
    const itemsTotal = useMemo(
        () => items.reduce((sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.rate) || 0), 0),
        [items]
    );
    useEffect(() => {
        if (items.length) setAmount(itemsTotal.toFixed(2));
    }, [itemsTotal, items.length]);

    const createCategory = useCallback(async (name: string) => {
        setCreatingTaxonomy(true);
        try {
            const res = await api.post<{ category: Category }>('/categories', {
                type: type === 'TRANSFER' ? 'EXPENSE' : type,
                name,
            });
            setCategoryId(res.data.category.id);
            onTaxonomyChanged();
            toast.success(`Category “${name}” added`);
        } catch (err: any) {
            toast.error(err.message || 'Could not add that category');
        } finally {
            setCreatingTaxonomy(false);
        }
    }, [type, onTaxonomyChanged]);

    const createPaymentMethod = useCallback(async (name: string) => {
        setCreatingTaxonomy(true);
        try {
            const res = await api.post<{ paymentMethod: PaymentMethod }>('/payment-methods', { name });
            setPaymentMethodId(res.data.paymentMethod.id);
            onTaxonomyChanged();
            toast.success(`Payment method “${name}” added`);
        } catch (err: any) {
            toast.error(err.message || 'Could not add that payment method');
        } finally {
            setCreatingTaxonomy(false);
        }
    }, [onTaxonomyChanged]);

    const upload = async (files: FileList | null) => {
        if (!files?.length) return;
        setUploading(true);
        try {
            const form = new FormData();
            Array.from(files).forEach((f) => form.append('files', f));
            const res = await api.upload<{ attachments: Attachment[] }>('/files', form);
            setAttachments((prev) => [...prev, ...res.data.attachments]);
            toast.success(`${res.data.attachments.length} file(s) attached`);
        } catch (err: any) {
            toast.error(err.message || 'Upload failed');
        } finally {
            setUploading(false);
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    const removeAttachment = async (id: string) => {
        // Only detach locally when editing — the file itself stays in the Drive
        // until the user deletes it there.
        setAttachments((prev) => prev.filter((a) => a.id !== id));
        if (!editing) {
            await api.delete(`/files/${id}`).catch(() => {});
        }
    };

    const save = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        const value = Number(amount);
        if (!accountId) return setError('Choose an account');
        if (!value || value <= 0) return setError('Enter an amount greater than zero');
        if (type === 'TRANSFER' && !toAccountId) return setError('Choose the account to transfer into');
        if (type === 'TRANSFER' && toAccountId === accountId) return setError('Pick two different accounts');

        const body: Record<string, unknown> = {
            type,
            accountId,
            amount: value,
            note: note.trim() || null,
            occurredAt: new Date(occurredAt).toISOString(),
            recurrence,
            reminderAt: reminderAt ? new Date(reminderAt).toISOString() : null,
            items: items
                .filter((i) => i.name.trim())
                .map((i) => ({
                    name: i.name.trim(),
                    quantity: Number(i.quantity) || 1,
                    unit: i.unit?.trim() || null,
                    rate: Number(i.rate) || 0,
                })),
            attachmentIds: attachments.map((a) => a.id),
        };

        if (type === 'TRANSFER') {
            body.toAccountId = toAccountId;
            body.categoryId = null;
        } else {
            body.categoryId = categoryId;
            body.paymentMethodId = paymentMethodId;
        }

        setSaving(true);
        try {
            if (editing) {
                await api.put(`/transactions/${editing.id}`, body);
                toast.success('Transaction updated');
            } else {
                await api.post('/transactions', body);
                toast.success(type === 'INCOME' ? 'Income saved' : type === 'EXPENSE' ? 'Expense saved' : 'Transfer saved');
            }
            onSaved();
            onOpenChange(false);
        } catch (err: any) {
            setError(err.message || 'Could not save');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{editing ? 'Edit transaction' : 'Add transaction'}</DialogTitle>
                    <DialogDescription>
                        Attach bills, receipts, documents or voice notes — they are kept in your Drive.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={save} className="space-y-5" noValidate>
                    {/* Type */}
                    {!editing && (
                        <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted p-1">
                            {TYPES.map((t) => (
                                <button
                                    key={t.value}
                                    type="button"
                                    onClick={() => setType(t.value)}
                                    className={cn(
                                        'rounded-md px-3 py-2 text-sm font-medium transition-colors',
                                        type === t.value
                                            ? t.value === 'INCOME'
                                                ? 'bg-[hsl(var(--income))] text-white shadow-sm'
                                                : t.value === 'EXPENSE'
                                                ? 'bg-[hsl(var(--expense))] text-white shadow-sm'
                                                : 'bg-background shadow-sm'
                                            : 'text-muted-foreground hover:text-foreground'
                                    )}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Amount */}
                    <div className="space-y-2">
                        <Label htmlFor="amount">Amount</Label>
                        <div className="relative">
                            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg font-medium text-muted-foreground">
                                {currency === 'BDT' ? '৳' : currency}
                            </span>
                            <Input
                                id="amount"
                                type="number"
                                step="0.01"
                                min="0"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                disabled={items.length > 0}
                                placeholder="0.00"
                                className="tabular h-14 pl-10 text-2xl font-semibold"
                            />
                        </div>
                        {items.length > 0 && (
                            <p className="text-xs text-muted-foreground">
                                Calculated from {items.length} item{items.length > 1 ? 's' : ''} below.
                            </p>
                        )}
                    </div>

                    {/* Accounts */}
                    <div className={cn('grid gap-4', type === 'TRANSFER' ? 'sm:grid-cols-2' : 'sm:grid-cols-2')}>
                        <div className="space-y-2">
                            <Label>{type === 'TRANSFER' ? 'From account' : 'Account'}</Label>
                            <Select value={accountId} onValueChange={setAccountId}>
                                <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                                <SelectContent>
                                    {accounts.map((a) => (
                                        <SelectItem key={a.id} value={a.id}>
                                            {a.name} · {formatMoney(a.balance, currency, { compact: true })}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {type === 'TRANSFER' ? (
                            <div className="space-y-2">
                                <Label className="flex items-center gap-1.5">
                                    <ArrowLeftRight className="h-3.5 w-3.5" /> To account
                                </Label>
                                <Select value={toAccountId} onValueChange={setToAccountId}>
                                    <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                                    <SelectContent>
                                        {accounts.filter((a) => a.id !== accountId).map((a) => (
                                            <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        ) : (
                            <TaxonomyPicker
                                label="Payment method"
                                options={paymentMethods}
                                value={paymentMethodId}
                                onChange={setPaymentMethodId}
                                onCreate={createPaymentMethod}
                                placeholder="How was it paid?"
                                creating={creatingTaxonomy}
                            />
                        )}
                    </div>

                    {type !== 'TRANSFER' && (
                        <TaxonomyPicker
                            label="Category"
                            options={typeCategories}
                            value={categoryId}
                            onChange={setCategoryId}
                            onCreate={createCategory}
                            placeholder="Choose a category"
                            creating={creatingTaxonomy}
                        />
                    )}

                    {/* When */}
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="occurredAt">Date &amp; time</Label>
                            <Input
                                id="occurredAt"
                                type="datetime-local"
                                value={occurredAt}
                                onChange={(e) => setOccurredAt(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Repeats</Label>
                            <Select value={recurrence} onValueChange={setRecurrence}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {RECURRENCE.map((r) => (
                                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {recurrence !== 'NONE' && (
                        <div className="space-y-2 rounded-xl border bg-muted/40 p-3">
                            <Label htmlFor="reminderAt" className="text-xs">Remind me (optional)</Label>
                            <Input
                                id="reminderAt"
                                type="datetime-local"
                                value={reminderAt}
                                onChange={(e) => setReminderAt(e.target.value)}
                            />
                            <p className="text-xs text-muted-foreground">
                                You will get a notification, and the entry will be recorded automatically on schedule.
                            </p>
                        </div>
                    )}

                    {/* Items */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label>Items {items.length > 0 && <span className="text-muted-foreground">({items.length})</span>}</Label>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setItems((p) => [...p, { name: '', quantity: 1, unit: '', rate: 0 }])}
                            >
                                <Plus className="h-3.5 w-3.5" /> Add item
                            </Button>
                        </div>

                        {items.length > 0 && (
                            <div className="space-y-2 rounded-xl border p-3">
                                <div className="hidden gap-2 px-1 text-xs font-medium text-muted-foreground sm:grid sm:grid-cols-[1fr_70px_70px_90px_90px_32px]">
                                    <span>Item</span><span>Qty</span><span>Unit</span>
                                    <span>Rate</span><span className="text-right">Total</span><span />
                                </div>

                                {items.map((item, i) => {
                                    const total = (Number(item.quantity) || 0) * (Number(item.rate) || 0);
                                    const patch = (p: Partial<TxItem>) =>
                                        setItems((prev) => prev.map((x, j) => (j === i ? { ...x, ...p } : x)));
                                    return (
                                        <div key={i} className="grid gap-2 sm:grid-cols-[1fr_70px_70px_90px_90px_32px] sm:items-center">
                                            <Input
                                                value={item.name}
                                                onChange={(e) => patch({ name: e.target.value })}
                                                placeholder="Item name"
                                                className="h-9"
                                            />
                                            <Input
                                                type="number" step="0.001" min="0"
                                                value={item.quantity}
                                                onChange={(e) => patch({ quantity: Number(e.target.value) })}
                                                placeholder="Qty"
                                                className="tabular h-9"
                                            />
                                            <Input
                                                value={item.unit || ''}
                                                onChange={(e) => patch({ unit: e.target.value })}
                                                placeholder="pcs"
                                                className="h-9"
                                            />
                                            <Input
                                                type="number" step="0.01" min="0"
                                                value={item.rate}
                                                onChange={(e) => patch({ rate: Number(e.target.value) })}
                                                placeholder="Rate"
                                                className="tabular h-9"
                                            />
                                            <div className="tabular flex h-9 items-center justify-end px-1 text-sm font-medium">
                                                {formatMoney(total, currency)}
                                            </div>
                                            <Button
                                                type="button" variant="ghost" size="icon-sm"
                                                onClick={() => setItems((prev) => prev.filter((_, j) => j !== i))}
                                                className="text-muted-foreground hover:text-destructive"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    );
                                })}

                                <div className="flex items-center justify-between border-t pt-2.5">
                                    <span className="text-sm font-medium">Total</span>
                                    <span className="tabular text-base font-semibold">{formatMoney(itemsTotal, currency)}</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Attachments */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label>Bills &amp; attachments</Label>
                            <Button
                                type="button" variant="ghost" size="sm"
                                loading={uploading}
                                onClick={() => fileRef.current?.click()}
                            >
                                <Paperclip className="h-3.5 w-3.5" /> Attach
                            </Button>
                            <input
                                ref={fileRef}
                                type="file"
                                multiple
                                hidden
                                accept="image/*,application/pdf,.doc,.docx,.odt,.txt,audio/*"
                                onChange={(e) => upload(e.target.files)}
                            />
                        </div>

                        {attachments.length > 0 ? (
                            <div className="grid gap-2 sm:grid-cols-2">
                                {attachments.map((a) => {
                                    const Icon = KIND_ICON[a.kind] || Paperclip;
                                    return (
                                        <div key={a.id} className="flex items-center gap-2.5 rounded-lg border p-2.5">
                                            {/* The file route is authenticated, so a bare <img src>
                                                would 401 — FileThumbnail fetches with the token and
                                                renders a blob URL, falling back to the icon. */}
                                            <span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                                                <FileThumbnail
                                                    file={a}
                                                    className="absolute inset-0 h-full w-full object-cover"
                                                />
                                                <Icon className="h-4 w-4 text-muted-foreground" />
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-xs font-medium">{a.name}</p>
                                                <p className="text-[11px] text-muted-foreground">{formatBytes(a.size)}</p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => removeAttachment(a.id)}
                                                className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-destructive"
                                            >
                                                <X className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={() => fileRef.current?.click()}
                                className="flex w-full flex-col items-center gap-1.5 rounded-xl border border-dashed py-6 text-center transition-colors hover:border-primary hover:bg-accent/40"
                            >
                                <Paperclip className="h-5 w-5 text-muted-foreground" />
                                <span className="text-sm text-muted-foreground">
                                    Attach photos, PDFs, documents or audio
                                </span>
                            </button>
                        )}
                    </div>

                    {/* Note */}
                    <div className="space-y-2">
                        <Label htmlFor="note">Note</Label>
                        <Textarea
                            id="note"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="What was this for?"
                            rows={2}
                        />
                    </div>

                    {error && (
                        <p className="rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive" role="alert">
                            {error}
                        </p>
                    )}

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" loading={saving}>
                            {editing ? 'Save changes' : 'Save transaction'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
