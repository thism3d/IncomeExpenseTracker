import { useEffect, useState } from 'react';
import { Check, Layers, MoreVertical, Pencil, Plus, Search, Star, Trash2, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/ws';
import { cn, formatMoney } from '@/lib/utils';
import type { Account } from '@/lib/types';
import {
    Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
    DialogTitle, DropdownMenu, DropdownMenuContent, DropdownMenuItem,
    DropdownMenuSeparator, DropdownMenuTrigger, Input, Label, Skeleton,
} from '@/components/ui';

// The account switcher from the README: add, rename, search, and set a default.
// "All accounts" is the aggregate view and is always first.
export const AccountBar = ({
    accounts,
    loading,
    selected,
    onSelect,
    currency,
    onChanged,
}: {
    accounts: Account[];
    loading: boolean;
    selected: string;
    onSelect: (id: string) => void;
    currency: string;
    onChanged: () => void;
}) => {
    const [search, setSearch] = useState('');
    const [dialog, setDialog] = useState<'add' | 'edit' | null>(null);
    const [target, setTarget] = useState<Account | null>(null);
    const [name, setName] = useState('');
    const [opening, setOpening] = useState('0');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (dialog === 'edit' && target) {
            setName(target.name);
            setOpening(String(target.openingBalance));
        } else if (dialog === 'add') {
            setName('');
            setOpening('0');
        }
        setError(null);
    }, [dialog, target]);

    const visible = accounts.filter((a) =>
        a.name.toLowerCase().includes(search.trim().toLowerCase())
    );
    const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);

    const save = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (!name.trim()) return setError('Give the account a name');

        setSaving(true);
        try {
            const body = { name: name.trim(), openingBalance: Number(opening) || 0 };
            if (dialog === 'edit' && target) {
                await api.put(`/accounts/${target.id}`, body);
                toast.success('Account updated');
            } else {
                await api.post('/accounts', body);
                toast.success('Account added');
            }
            setDialog(null);
            onChanged();
        } catch (err: any) {
            setError(err.message || 'Could not save the account');
        } finally {
            setSaving(false);
        }
    };

    const remove = async (account: Account) => {
        try {
            await api.delete(`/accounts/${account.id}`);
            toast.success('Account deleted');
            if (selected === account.id) onSelect('');
            onChanged();
        } catch (err: any) {
            // A populated account can't be deleted — the API says so, and the
            // message explains what to do instead.
            toast.error(err.message || 'Could not delete the account');
        }
    };

    const makeDefault = async (account: Account) => {
        await api.post(`/accounts/${account.id}/default`);
        toast.success(`${account.name} is now your default account`);
        onChanged();
    };

    if (loading) {
        return (
            <div className="flex gap-2 overflow-hidden">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-[72px] w-48 shrink-0" />)}
            </div>
        );
    }

    return (
        <>
            <div className="space-y-3">
                <div className="flex items-center gap-2">
                    <div className="relative flex-1 max-w-xs">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search accounts"
                            className="h-9 pl-9"
                        />
                    </div>
                    <Button variant="outline" size="sm" onClick={() => { setTarget(null); setDialog('add'); }}>
                        <Plus className="h-4 w-4" /> Account
                    </Button>
                </div>

                <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-thin">
                    <button
                        onClick={() => onSelect('')}
                        className={cn(
                            'flex min-w-[176px] shrink-0 flex-col gap-1 rounded-xl border p-3.5 text-left transition-colors',
                            !selected ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'bg-card hover:bg-accent'
                        )}
                    >
                        <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                            <Layers className="h-3.5 w-3.5" /> All accounts
                        </span>
                        <span className="tabular text-lg font-semibold">
                            {formatMoney(totalBalance, currency)}
                        </span>
                    </button>

                    {visible.map((a) => (
                        <div
                            key={a.id}
                            className={cn(
                                'group relative flex min-w-[176px] shrink-0 flex-col gap-1 rounded-xl border p-3.5 transition-colors',
                                selected === a.id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'bg-card hover:bg-accent'
                            )}
                        >
                            <button onClick={() => onSelect(a.id)} className="flex flex-col gap-1 text-left">
                                <span className="flex items-center gap-2 pr-6 text-xs font-medium text-muted-foreground">
                                    <Wallet className="h-3.5 w-3.5 shrink-0" />
                                    <span className="truncate">{a.name}</span>
                                    {a.isDefault && <Star className="h-3 w-3 shrink-0 fill-current text-amber-500" />}
                                </span>
                                <span className="tabular text-lg font-semibold">
                                    {formatMoney(a.balance, currency)}
                                </span>
                            </button>

                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <button className="absolute right-1.5 top-1.5 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent group-hover:opacity-100 data-[state=open]:opacity-100">
                                        <MoreVertical className="h-3.5 w-3.5" />
                                    </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => { setTarget(a); setDialog('edit'); }}>
                                        <Pencil /> Rename
                                    </DropdownMenuItem>
                                    {!a.isDefault && (
                                        <DropdownMenuItem onClick={() => makeDefault(a)}>
                                            <Check /> Set as default
                                        </DropdownMenuItem>
                                    )}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                        className="text-destructive focus:text-destructive"
                                        onClick={() => remove(a)}
                                    >
                                        <Trash2 /> Delete
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    ))}

                    {search && !visible.length && (
                        <div className="flex items-center px-4 text-sm text-muted-foreground">
                            No account matches “{search}”
                        </div>
                    )}
                </div>
            </div>

            <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>{dialog === 'edit' ? 'Rename account' : 'New account'}</DialogTitle>
                        <DialogDescription>
                            {dialog === 'edit'
                                ? 'Change the name or correct the opening balance.'
                                : 'Separate your personal, office, or client money.'}
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={save} className="space-y-4" noValidate>
                        <div className="space-y-2">
                            <Label htmlFor="acc-name">Account name</Label>
                            <Input
                                id="acc-name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Office Account"
                                autoFocus
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="acc-opening">Opening balance</Label>
                            <Input
                                id="acc-opening"
                                type="number"
                                step="0.01"
                                value={opening}
                                onChange={(e) => setOpening(e.target.value)}
                                className="tabular"
                            />
                            <p className="text-xs text-muted-foreground">
                                What was already in this account before you started tracking.
                            </p>
                        </div>

                        {error && (
                            <p className="rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">{error}</p>
                        )}

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
                            <Button type="submit" loading={saving}>
                                {dialog === 'edit' ? 'Save' : 'Add account'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    );
};
