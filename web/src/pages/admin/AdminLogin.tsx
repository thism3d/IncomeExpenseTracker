import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/ws';
import { useAuth } from '@/context/AuthContext';
import { Button, Input, Label } from '@/components/ui';
import type { User } from '@/lib/types';

export default function AdminLogin() {
    const { login } = useAuth();
    const navigate = useNavigate();

    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [show, setShow] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            const res = await api.post<{ user: User; token: string }>('/auth/login', {
                identifier: identifier.trim(),
                password,
            });
            // The server enforces this on every admin route; the check here is only
            // so a normal user gets a clear message instead of an empty console.
            if (!res.data.user.isAdmin) {
                setError('That account does not have admin access.');
                return;
            }
            login(res.data.token, res.data.user);
            toast.success('Signed in to the admin console');
            navigate('/admin', { replace: true });
        } catch (err: any) {
            setError(err.message || 'Could not sign you in');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-6">
            <div className="w-full max-w-sm animate-fade-in">
                <div className="mb-8 flex flex-col items-center text-center">
                    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary">
                        <ShieldCheck className="h-7 w-7 text-primary-foreground" />
                    </div>
                    <h1 className="text-xl font-semibold text-white">Admin Console</h1>
                    <p className="mt-1 text-sm text-zinc-500">SISIRBINDU TRACKERAPP</p>
                </div>

                <form onSubmit={submit} className="space-y-4" noValidate>
                    <div className="space-y-2">
                        <Label htmlFor="identifier" className="text-zinc-300">Email</Label>
                        <Input
                            id="identifier"
                            value={identifier}
                            onChange={(e) => setIdentifier(e.target.value)}
                            placeholder="admin@example.com"
                            autoComplete="username"
                            autoFocus
                            className="border-zinc-800 bg-zinc-900 text-white placeholder:text-zinc-600"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="password" className="text-zinc-300">Password</Label>
                        <div className="relative">
                            <Input
                                id="password"
                                type={show ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                autoComplete="current-password"
                                className="border-zinc-800 bg-zinc-900 pr-10 text-white placeholder:text-zinc-600"
                            />
                            <button
                                type="button"
                                onClick={() => setShow((s) => !s)}
                                className="absolute right-0 top-0 flex h-10 w-10 items-center justify-center text-zinc-500 hover:text-zinc-300"
                            >
                                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                    </div>

                    {error && (
                        <p className="rounded-lg bg-destructive/15 px-3 py-2.5 text-sm text-destructive" role="alert">
                            {error}
                        </p>
                    )}

                    <Button type="submit" className="w-full" size="lg" loading={loading}>
                        Sign in
                    </Button>
                </form>

                <p className="mt-8 text-center text-xs text-zinc-600">
                    Restricted area. All actions are logged.
                </p>
            </div>
        </div>
    );
}
