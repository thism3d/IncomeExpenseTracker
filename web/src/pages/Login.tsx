import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { AuthLayout } from '@/components/AuthLayout';
import { Button, Input, Label } from '@/components/ui';
import { api } from '@/lib/ws';
import { useAuth } from '@/context/AuthContext';
import type { User } from '@/lib/types';

export default function Login() {
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

        if (!identifier.trim()) return setError('Enter your email or phone number');
        if (!password) return setError('Enter your password');

        setLoading(true);
        try {
            const res = await api.post<{ user: User; token: string }>('/auth/login', {
                identifier: identifier.trim(),
                password,
            });
            login(res.data.token, res.data.user);
            toast.success(`Welcome back, ${res.data.user.name.split(' ')[0]}`);
            navigate(res.data.user.isAdmin ? '/admin' : '/', { replace: true });
        } catch (err: any) {
            setError(err.message || 'Could not sign you in');
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthLayout
            title="Welcome back"
            subtitle="Sign in to your SisirBindu account"
            footer={
                <>
                    New here?{' '}
                    <Link to="/register" className="font-medium text-primary hover:underline">
                        Create an account
                    </Link>
                </>
            }
        >
            <form onSubmit={submit} className="space-y-4" noValidate>
                <div className="space-y-2">
                    <Label htmlFor="identifier">Email or phone</Label>
                    <Input
                        id="identifier"
                        value={identifier}
                        onChange={(e) => setIdentifier(e.target.value)}
                        placeholder="01712345678 or you@example.com"
                        autoComplete="username"
                        autoFocus
                    />
                    <p className="text-xs text-muted-foreground">
                        Bangladeshi numbers work in any format — 01…, +880…, or 880…
                    </p>
                </div>

                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <Label htmlFor="password">Password</Label>
                        <Link to="/forgot-password" className="text-xs font-medium text-primary hover:underline">
                            Forgot password?
                        </Link>
                    </div>
                    <div className="relative">
                        <Input
                            id="password"
                            type={show ? 'text' : 'password'}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            autoComplete="current-password"
                            className="pr-10"
                        />
                        <button
                            type="button"
                            onClick={() => setShow((s) => !s)}
                            className="absolute right-0 top-0 flex h-10 w-10 items-center justify-center text-muted-foreground hover:text-foreground"
                            aria-label={show ? 'Hide password' : 'Show password'}
                        >
                            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                    </div>
                </div>

                {error && (
                    <p className="rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive" role="alert">
                        {error}
                    </p>
                )}

                <Button type="submit" className="w-full" size="lg" loading={loading}>
                    Sign in
                </Button>
            </form>
        </AuthLayout>
    );
}
