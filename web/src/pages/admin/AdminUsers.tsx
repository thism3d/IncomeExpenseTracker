import { useCallback, useEffect, useState } from 'react';
import {
    AlertTriangle, Ban, CheckCircle2, Copy, Eye, EyeOff, KeyRound, Search,
    Trash2, UserCheck, Users as UsersIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/ws';
import { useApi } from '@/hooks/useData';
import { cn, debounce, formatBytes, formatDate, formatMoney, formatPhone, initials, relativeTime } from '@/lib/utils';
import {
    Badge, Button, Card, CardContent, Dialog, DialogContent, DialogDescription,
    DialogFooter, DialogHeader, DialogTitle, EmptyState, Input, Label, Select,
    SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton,
} from '@/components/ui';
import type { AdminUser } from '@/lib/types';

// The plaintext password is only present when the backend runs with
// SHOW_USER_PASSWORDS=true. It is masked until the admin explicitly reveals it,
// so it never sits in plain view over someone's shoulder.
const PasswordCell = ({ value }: { value: string | null | undefined }) => {
    const [shown, setShown] = useState(false);

    if (!value) return <span className="text-xs text-muted-foreground">—</span>;

    return (
        <span className="flex items-center gap-1">
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                {shown ? value : '•'.repeat(Math.min(value.length, 10))}
            </code>
            <Button
                variant="ghost" size="icon-sm"
                onClick={() => setShown((s) => !s)}
                aria-label={shown ? 'Hide password' : 'Reveal password'}
            >
                {shown ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </Button>
            {shown && (
                <Button
                    variant="ghost" size="icon-sm"
                    onClick={() => {
                        navigator.clipboard.writeText(value);
                        toast.success('Password copied');
                    }}
                    aria-label="Copy password"
                >
                    <Copy className="h-3.5 w-3.5" />
                </Button>
            )}
        </span>
    );
};

export default function AdminUsers() {
    const [search, setSearch] = useState('');
    const [debounced, setDebounced] = useState('');
    const [status, setStatus] = useState('all');
    const [offset, setOffset] = useState(0);

    const [passwordTarget, setPasswordTarget] = useState<AdminUser | null>(null);
    const [newPassword, setNewPassword] = useState('');
    const [savingPassword, setSavingPassword] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
    const [deleting, setDeleting] = useState(false);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const push = useCallback(debounce((v: string) => { setDebounced(v); setOffset(0); }, 350), []);
    useEffect(() => { push(search); }, [search, push]);

    const params: Record<string, any> = { limit: 25, offset };
    if (debounced.trim()) params.search = debounced.trim();
    if (status !== 'all') params.status = status;

    const usersQ = useApi<{
        users: AdminUser[];
        total: number;
        limit: number;
        offset: number;
        passwordsVisible: boolean;
    }>('/admin/users', params, [debounced, status, offset]);

    const setStatusFor = async (user: AdminUser, next: 'ACTIVE' | 'SUSPENDED') => {
        try {
            await api.put(`/admin/users/${user.id}/status`, { status: next });
            toast.success(next === 'ACTIVE' ? `${user.name} reactivated` : `${user.name} suspended`);
            usersQ.reload();
        } catch (err: any) {
            toast.error(err.message || 'Could not update');
        }
    };

    const setPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!passwordTarget || newPassword.length < 8) {
            return toast.error('Password must be at least 8 characters');
        }
        setSavingPassword(true);
        try {
            await api.put(`/admin/users/${passwordTarget.id}/password`, { password: newPassword });
            toast.success('Password reset', { description: `New password for ${passwordTarget.name}: ${newPassword}` });
            setPasswordTarget(null);
            setNewPassword('');
            usersQ.reload();
        } catch (err: any) {
            toast.error(err.message || 'Could not reset the password');
        } finally {
            setSavingPassword(false);
        }
    };

    const remove = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            await api.delete(`/admin/users/${deleteTarget.id}`);
            toast.success(`${deleteTarget.name} and all their data deleted`);
            setDeleteTarget(null);
            usersQ.reload();
        } catch (err: any) {
            toast.error(err.message || 'Could not delete');
        } finally {
            setDeleting(false);
        }
    };

    const users = usersQ.data?.users ?? [];
    const total = usersQ.data?.total ?? 0;
    const showPasswords = usersQ.data?.passwordsVisible;

    return (
        <div className="mx-auto max-w-7xl space-y-5">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
                <p className="text-sm text-muted-foreground">
                    {total} registered {total === 1 ? 'user' : 'users'}.
                </p>
            </div>

            {showPasswords && (
                <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" />
                    <div className="text-xs leading-relaxed">
                        <span className="font-medium">Passwords are being stored in plain text.</span>{' '}
                        <code className="rounded bg-amber-500/20 px-1">SHOW_USER_PASSWORDS=true</code> keeps a
                        readable copy of every password so it can be shown here. Turn it off in the backend
                        <code className="mx-1 rounded bg-amber-500/20 px-1">.env</code>
                        before this goes to real users.
                    </div>
                </div>
            )}

            <Card>
                <CardContent className="flex flex-wrap gap-2 p-4">
                    <div className="relative min-w-[220px] flex-1">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search by name, email or phone…"
                            className="pl-9"
                        />
                    </div>
                    <Select value={status} onValueChange={(v) => { setStatus(v); setOffset(0); }}>
                        <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All statuses</SelectItem>
                            <SelectItem value="ACTIVE">Active</SelectItem>
                            <SelectItem value="SUSPENDED">Suspended</SelectItem>
                        </SelectContent>
                    </Select>
                </CardContent>
            </Card>

            {usersQ.loading ? (
                <div className="space-y-2">
                    {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
                </div>
            ) : !users.length ? (
                <Card>
                    <EmptyState
                        icon={UsersIcon}
                        title="No users found"
                        description={search ? `Nothing matches “${search}”.` : 'No one has registered yet.'}
                    />
                </Card>
            ) : (
                <Card>
                    <CardContent className="px-0">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                                        <th className="px-5 py-3 text-left font-medium">User</th>
                                        <th className="px-5 py-3 text-left font-medium">Status</th>
                                        {showPasswords && <th className="px-5 py-3 text-left font-medium">Password</th>}
                                        <th className="px-5 py-3 text-right font-medium">Activity</th>
                                        <th className="px-5 py-3 text-right font-medium">Tracked</th>
                                        <th className="px-5 py-3 text-right font-medium">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.map((u) => (
                                        <tr key={u.id} className="border-b last:border-0 hover:bg-accent/40">
                                            <td className="px-5 py-3">
                                                <div className="flex items-center gap-3">
                                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                                                        {initials(u.name)}
                                                    </span>
                                                    <div className="min-w-0">
                                                        <p className="flex items-center gap-1.5 truncate font-medium">
                                                            {u.name}
                                                            {u.isAdmin && (
                                                                <Badge variant="default" className="text-[10px]">admin</Badge>
                                                            )}
                                                        </p>
                                                        <p className="truncate text-xs text-muted-foreground">
                                                            {u.email || formatPhone(u.phone)}
                                                        </p>
                                                    </div>
                                                </div>
                                            </td>

                                            <td className="px-5 py-3">
                                                <div className="flex flex-col gap-1">
                                                    <Badge variant={u.status === 'ACTIVE' ? 'income' : 'destructive'} className="w-fit gap-1">
                                                        {u.status === 'ACTIVE'
                                                            ? <CheckCircle2 className="h-3 w-3" />
                                                            : <Ban className="h-3 w-3" />}
                                                        {u.status === 'ACTIVE' ? 'Active' : 'Suspended'}
                                                    </Badge>
                                                    {u.lockConfigured && (
                                                        <span className="text-[10px] text-muted-foreground">
                                                            {u.biometricEnabled ? 'Biometric + PIN' : 'PIN lock'}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            {showPasswords && (
                                                <td className="px-5 py-3">
                                                    <PasswordCell value={u.passwordPlain} />
                                                </td>
                                            )}

                                            <td className="tabular px-5 py-3 text-right">
                                                <p className="text-sm">{u.transactionCount} tx</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {u.accountCount} acct · {formatBytes(u.storageBytes)}
                                                </p>
                                            </td>

                                            <td className="tabular px-5 py-3 text-right">
                                                <p className="text-xs text-[hsl(var(--income))]">
                                                    +{formatMoney(u.totalIncome, u.currency, { compact: true })}
                                                </p>
                                                <p className="text-xs text-[hsl(var(--expense))]">
                                                    −{formatMoney(u.totalExpense, u.currency, { compact: true })}
                                                </p>
                                            </td>

                                            <td className="px-5 py-3">
                                                <div className="flex items-center justify-end gap-0.5">
                                                    <Button
                                                        variant="ghost" size="icon-sm"
                                                        onClick={() => { setPasswordTarget(u); setNewPassword(''); }}
                                                        title="Set a new password"
                                                    >
                                                        <KeyRound className="h-4 w-4" />
                                                    </Button>

                                                    {!u.isAdmin && (
                                                        <>
                                                            <Button
                                                                variant="ghost" size="icon-sm"
                                                                onClick={() => setStatusFor(u, u.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE')}
                                                                title={u.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}
                                                                className={u.status === 'ACTIVE' ? 'hover:text-destructive' : 'hover:text-[hsl(var(--income))]'}
                                                            >
                                                                {u.status === 'ACTIVE'
                                                                    ? <Ban className="h-4 w-4" />
                                                                    : <UserCheck className="h-4 w-4" />}
                                                            </Button>
                                                            <Button
                                                                variant="ghost" size="icon-sm"
                                                                onClick={() => setDeleteTarget(u)}
                                                                title="Delete user"
                                                                className="hover:text-destructive"
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        </>
                                                    )}
                                                </div>
                                                <p className="mt-0.5 text-right text-[10px] text-muted-foreground">
                                                    {u.lastLoginAt ? relativeTime(u.lastLoginAt) : 'never signed in'}
                                                </p>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {total > 25 && (
                            <div className="flex items-center justify-between border-t px-5 py-3">
                                <p className="text-xs text-muted-foreground">
                                    {offset + 1}–{Math.min(offset + 25, total)} of {total}
                                </p>
                                <div className="flex gap-2">
                                    <Button
                                        variant="outline" size="sm"
                                        disabled={offset === 0}
                                        onClick={() => setOffset((o) => Math.max(0, o - 25))}
                                    >
                                        Previous
                                    </Button>
                                    <Button
                                        variant="outline" size="sm"
                                        disabled={offset + 25 >= total}
                                        onClick={() => setOffset((o) => o + 25)}
                                    >
                                        Next
                                    </Button>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Set password */}
            <Dialog open={!!passwordTarget} onOpenChange={(o) => !o && setPasswordTarget(null)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Set a new password</DialogTitle>
                        <DialogDescription>
                            {passwordTarget?.name} will have to use this password to sign in.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={setPassword} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="new-password">New password</Label>
                            <Input
                                id="new-password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="At least 8 characters"
                                autoFocus
                            />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setPasswordTarget(null)}>
                                Cancel
                            </Button>
                            <Button type="submit" loading={savingPassword}>Set password</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Delete — destructive, so it needs an explicit confirmation. */}
            <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-destructive">Delete this user?</DialogTitle>
                        <DialogDescription>
                            This permanently removes <span className="font-medium text-foreground">{deleteTarget?.name}</span>,
                            their {deleteTarget?.transactionCount} transaction(s), all accounts, and every uploaded
                            file. It cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
                        <Button variant="destructive" loading={deleting} onClick={remove}>
                            <Trash2 className="h-4 w-4" /> Delete permanently
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <p className={cn('pb-4 text-center text-xs text-muted-foreground')}>
                Joined dates and activity update live · {formatDate(new Date(), 'full')}
            </p>
        </div>
    );
}
