import { useState } from 'react';
import {
    Check, CreditCard, Fingerprint, KeyRound, Monitor, Moon, Plus, Search,
    Shield, Sun, Tag, Trash2, User as UserIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { useApi } from '@/hooks/useData';
import { api } from '@/lib/ws';
import { cn, formatDate, formatPhone } from '@/lib/utils';
import { CategoryIcon } from '@/lib/icons';
import {
    Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input,
    Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Separator,
    Tabs, TabsContent, TabsList, TabsTrigger,
} from '@/components/ui';
import type { Category, PaymentMethod, User } from '@/lib/types';

const CURRENCIES = ['BDT', 'USD', 'EUR', 'GBP', 'INR'];

// Categories and payment methods differ only in whether they are typed, so one
// component manages both lists.
function TaxonomyManager({
    title,
    description,
    items,
    onCreate,
    onDelete,
    type,
}: {
    title: string;
    description: string;
    items: Array<Category | PaymentMethod>;
    onCreate: (name: string) => Promise<void>;
    onDelete: (id: string) => Promise<void>;
    type?: 'INCOME' | 'EXPENSE';
}) {
    const [search, setSearch] = useState('');
    const [name, setName] = useState('');
    const [creating, setCreating] = useState(false);

    const filtered = items.filter((i) => i.name.toLowerCase().includes(search.trim().toLowerCase()));

    const add = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;
        setCreating(true);
        try {
            await onCreate(name.trim());
            setName('');
        } finally {
            setCreating(false);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                <form onSubmit={add} className="flex gap-2">
                    <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={type === 'INCOME' ? 'e.g. Consultancy fee' : 'Add a new one…'}
                    />
                    <Button type="submit" loading={creating} disabled={!name.trim()}>
                        <Plus className="h-4 w-4" />
                    </Button>
                </form>

                <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search…"
                        className="h-9 pl-9"
                    />
                </div>

                <div className="max-h-72 space-y-0.5 overflow-y-auto scrollbar-thin">
                    {filtered.map((item) => (
                        <div
                            key={item.id}
                            className="group flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-accent"
                        >
                            <span
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                                style={{ background: `${item.color}1f`, color: item.color }}
                            >
                                <CategoryIcon icon={item.icon} className="h-4 w-4" />
                            </span>
                            <span className="min-w-0 flex-1 truncate text-sm">{item.name}</span>

                            {item.usageCount ? (
                                <span className="shrink-0 text-xs text-muted-foreground">{item.usageCount} used</span>
                            ) : null}
                            {item.isDefault && (
                                <Badge variant="secondary" className="shrink-0 text-[10px]">preset</Badge>
                            )}

                            <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => onDelete(item.id)}
                                className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                                aria-label={`Remove ${item.name}`}
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    ))}

                    {!filtered.length && (
                        <p className="py-8 text-center text-sm text-muted-foreground">
                            {search ? `Nothing matches “${search}”` : 'Nothing here yet'}
                        </p>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

export default function Settings() {
    const { user, setUser, logout } = useAuth();
    const { preference, setPreference } = useTheme();

    const [name, setName] = useState(user?.name ?? '');
    const [currency, setCurrency] = useState(user?.currency ?? 'BDT');
    const [savingProfile, setSavingProfile] = useState(false);

    const [currentPassword, setCurrentPassword] = useState('');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [savingPassword, setSavingPassword] = useState(false);
    const [passwordError, setPasswordError] = useState<string | null>(null);

    const categoriesQ = useApi<{ categories: Category[] }>('/categories');
    const methodsQ = useApi<{ paymentMethods: PaymentMethod[] }>('/payment-methods');

    const incomeCats = (categoriesQ.data?.categories ?? []).filter((c) => c.type === 'INCOME');
    const expenseCats = (categoriesQ.data?.categories ?? []).filter((c) => c.type === 'EXPENSE');

    const saveProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        setSavingProfile(true);
        try {
            const res = await api.put<{ user: User }>('/auth/me', { name: name.trim(), currency });
            setUser(res.data.user);
            toast.success('Profile updated');
        } catch (err: any) {
            toast.error(err.message || 'Could not save');
        } finally {
            setSavingProfile(false);
        }
    };

    const changePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setPasswordError(null);
        if (password.length < 8) return setPasswordError('New password must be at least 8 characters');
        if (password !== confirm) return setPasswordError('Passwords do not match');

        setSavingPassword(true);
        try {
            await api.put('/auth/password', { currentPassword, password });
            toast.success('Password changed');
            setCurrentPassword(''); setPassword(''); setConfirm('');
        } catch (err: any) {
            setPasswordError(err.message || 'Could not change your password');
        } finally {
            setSavingPassword(false);
        }
    };

    const createCategory = async (type: 'INCOME' | 'EXPENSE', catName: string) => {
        try {
            await api.post('/categories', { type, name: catName });
            toast.success(`“${catName}” added`);
            categoriesQ.reload();
        } catch (err: any) {
            toast.error(err.message || 'Could not add');
        }
    };

    const deleteCategory = async (id: string) => {
        try {
            const res = await api.delete<{ archived?: boolean }>(`/categories/${id}`);
            // A category in use is hidden rather than deleted, so old transactions
            // keep their label — the API says which happened.
            toast.success(res.message || 'Removed');
            categoriesQ.reload();
        } catch (err: any) {
            toast.error(err.message || 'Could not remove');
        }
    };

    return (
        <div className="mx-auto max-w-4xl space-y-5">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
                <p className="text-sm text-muted-foreground">Your profile, security, and lists.</p>
            </div>

            <Tabs defaultValue="profile">
                <TabsList>
                    <TabsTrigger value="profile"><UserIcon className="mr-1.5 h-3.5 w-3.5" /> Profile</TabsTrigger>
                    <TabsTrigger value="security"><Shield className="mr-1.5 h-3.5 w-3.5" /> Security</TabsTrigger>
                    <TabsTrigger value="categories"><Tag className="mr-1.5 h-3.5 w-3.5" /> Categories</TabsTrigger>
                    <TabsTrigger value="methods"><CreditCard className="mr-1.5 h-3.5 w-3.5" /> Payment</TabsTrigger>
                </TabsList>

                <TabsContent value="profile" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Profile</CardTitle>
                            <CardDescription>How you appear on your statements.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={saveProfile} className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="name">Full name</Label>
                                    <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
                                </div>

                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label>Email</Label>
                                        <Input value={user?.email ?? '—'} disabled />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Phone</Label>
                                        <Input value={formatPhone(user?.phone ?? null) || '—'} disabled />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label>Currency</Label>
                                    <Select value={currency} onValueChange={setCurrency}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {CURRENCIES.map((c) => (
                                                <SelectItem key={c} value={c}>{c}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <Button type="submit" loading={savingProfile}>Save changes</Button>
                            </form>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Appearance</CardTitle>
                            <CardDescription>Charts and colours adapt to the theme.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-3 gap-2">
                                {([
                                    { value: 'light', label: 'Light', icon: Sun },
                                    { value: 'dark', label: 'Dark', icon: Moon },
                                    { value: 'system', label: 'System', icon: Monitor },
                                ] as const).map((t) => (
                                    <button
                                        key={t.value}
                                        onClick={() => setPreference(t.value)}
                                        className={cn(
                                            'flex flex-col items-center gap-2 rounded-xl border p-4 transition-colors',
                                            preference === t.value
                                                ? 'border-primary bg-primary/5 ring-1 ring-primary'
                                                : 'hover:bg-accent'
                                        )}
                                    >
                                        <t.icon className="h-5 w-5" />
                                        <span className="text-sm font-medium">{t.label}</span>
                                        {preference === t.value && <Check className="h-3.5 w-3.5 text-primary" />}
                                    </button>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="security" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">App lock</CardTitle>
                            <CardDescription>
                                Your device unlock is set up in the mobile app — the web portal cannot
                                enrol a fingerprint or face.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="flex items-center gap-3 rounded-lg border p-3.5">
                                <span
                                    className={cn(
                                        'flex h-9 w-9 items-center justify-center rounded-lg',
                                        user?.biometricEnabled
                                            ? 'bg-[hsl(var(--income))]/10 text-[hsl(var(--income))]'
                                            : 'bg-muted text-muted-foreground'
                                    )}
                                >
                                    <Fingerprint className="h-4 w-4" />
                                </span>
                                <div className="flex-1">
                                    <p className="text-sm font-medium">Biometric unlock</p>
                                    <p className="text-xs text-muted-foreground">Fingerprint or face on your phone</p>
                                </div>
                                <Badge variant={user?.biometricEnabled ? 'income' : 'secondary'}>
                                    {user?.biometricEnabled ? 'Enabled' : 'Not set up'}
                                </Badge>
                            </div>

                            <div className="flex items-center gap-3 rounded-lg border p-3.5">
                                <span
                                    className={cn(
                                        'flex h-9 w-9 items-center justify-center rounded-lg',
                                        user?.hasPin
                                            ? 'bg-[hsl(var(--income))]/10 text-[hsl(var(--income))]'
                                            : 'bg-muted text-muted-foreground'
                                    )}
                                >
                                    <KeyRound className="h-4 w-4" />
                                </span>
                                <div className="flex-1">
                                    <p className="text-sm font-medium">App PIN</p>
                                    <p className="text-xs text-muted-foreground">The fallback when biometrics fail</p>
                                </div>
                                <Badge variant={user?.hasPin ? 'income' : 'secondary'}>
                                    {user?.hasPin ? 'Set' : 'Not set'}
                                </Badge>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Change password</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={changePassword} className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="current">Current password</Label>
                                    <Input
                                        id="current" type="password" autoComplete="current-password"
                                        value={currentPassword}
                                        onChange={(e) => setCurrentPassword(e.target.value)}
                                    />
                                </div>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label htmlFor="new">New password</Label>
                                        <Input
                                            id="new" type="password" autoComplete="new-password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="confirm">Confirm</Label>
                                        <Input
                                            id="confirm" type="password" autoComplete="new-password"
                                            value={confirm}
                                            onChange={(e) => setConfirm(e.target.value)}
                                        />
                                    </div>
                                </div>

                                {passwordError && (
                                    <p className="rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
                                        {passwordError}
                                    </p>
                                )}

                                <Button type="submit" loading={savingPassword}>Change password</Button>
                            </form>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
                            <div>
                                <p className="text-sm font-medium">Signed in since</p>
                                <p className="text-xs text-muted-foreground">
                                    Member since {user ? formatDate(user.createdAt, 'long') : '—'}
                                </p>
                            </div>
                            <Button variant="outline" onClick={logout}>Sign out</Button>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="categories">
                    <div className="grid gap-4 lg:grid-cols-2">
                        <TaxonomyManager
                            title="Expense categories"
                            description="Used when you record an expense."
                            items={expenseCats}
                            type="EXPENSE"
                            onCreate={(n) => createCategory('EXPENSE', n)}
                            onDelete={deleteCategory}
                        />
                        <TaxonomyManager
                            title="Income categories"
                            description="Used when you record income."
                            items={incomeCats}
                            type="INCOME"
                            onCreate={(n) => createCategory('INCOME', n)}
                            onDelete={deleteCategory}
                        />
                    </div>
                </TabsContent>

                <TabsContent value="methods">
                    <TaxonomyManager
                        title="Payment methods"
                        description="Cash, bank, card — or add your own (bKash, Nagad, cheque…)."
                        items={methodsQ.data?.paymentMethods ?? []}
                        onCreate={async (n) => {
                            try {
                                await api.post('/payment-methods', { name: n });
                                toast.success(`“${n}” added`);
                                methodsQ.reload();
                            } catch (err: any) {
                                toast.error(err.message || 'Could not add');
                            }
                        }}
                        onDelete={async (id) => {
                            try {
                                const res = await api.delete(`/payment-methods/${id}`);
                                toast.success(res.message || 'Removed');
                                methodsQ.reload();
                            } catch (err: any) {
                                toast.error(err.message || 'Could not remove');
                            }
                        }}
                    />
                </TabsContent>
            </Tabs>

            <Separator />
            <p className="pb-4 text-center text-xs text-muted-foreground">
                SISIRBINDU TRACKERAPP · Income &amp; expense tracking for the legal profession
            </p>
        </div>
    );
}
