import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { AuthLayout } from '@/components/AuthLayout';
import { OtpInput } from '@/components/OtpInput';
import { Button, Input, Label } from '@/components/ui';
import { api } from '@/lib/ws';
import { useAuth } from '@/context/AuthContext';
import type { User } from '@/lib/types';

export default function ForgotPassword() {
    const { login } = useAuth();
    const navigate = useNavigate();

    const [sent, setSent] = useState(false);
    const [identifier, setIdentifier] = useState('');
    const [destination, setDestination] = useState('');
    const [code, setCode] = useState('');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [show, setShow] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [cooldown, setCooldown] = useState(0);

    useEffect(() => {
        if (cooldown <= 0) return;
        const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
        return () => clearTimeout(t);
    }, [cooldown]);

    const request = async (e?: React.FormEvent) => {
        e?.preventDefault();
        setError(null);
        if (!identifier.trim()) return setError('Enter your email or phone number');

        setLoading(true);
        try {
            const res = await api.post<{ destination: string }>('/auth/forgot-password', {
                identifier: identifier.trim(),
            });
            setDestination(res.data.destination);
            setSent(true);
            setCooldown(60);
            // The response is deliberately identical whether or not the account
            // exists, so this message must not promise that it does.
            toast.success('If that account exists, a reset code is on its way');
        } catch (err: any) {
            setError(err.message || 'Could not send the reset code');
        } finally {
            setLoading(false);
        }
    };

    const reset = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (code.length !== 6) return setError('Enter the 6-digit code');
        if (password.length < 8) return setError('Password must be at least 8 characters');
        if (password !== confirm) return setError('Passwords do not match');

        setLoading(true);
        try {
            const res = await api.post<{ user: User; token: string }>('/auth/reset-password', {
                identifier: identifier.trim(),
                code,
                password,
            });
            // The reset response carries a fresh token, so the user lands signed in
            // rather than being bounced back to the login form.
            login(res.data.token, res.data.user);
            toast.success('Password updated');
            navigate('/', { replace: true });
        } catch (err: any) {
            setError(err.message || 'Could not reset your password');
            setCode('');
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthLayout
            title={sent ? 'Reset your password' : 'Forgot your password?'}
            subtitle={
                sent
                    ? `Enter the code sent to ${destination} and choose a new password`
                    : 'We will send a reset code to your email or phone'
            }
            footer={
                <Link to="/login" className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline">
                    <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
                </Link>
            }
        >
            {!sent ? (
                <form onSubmit={request} className="space-y-4" noValidate>
                    <div className="space-y-2">
                        <Label htmlFor="identifier">Email or phone</Label>
                        <Input
                            id="identifier"
                            value={identifier}
                            onChange={(e) => setIdentifier(e.target.value)}
                            placeholder="01712345678 or you@example.com"
                            autoFocus
                        />
                    </div>

                    {error && (
                        <p className="rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive" role="alert">
                            {error}
                        </p>
                    )}

                    <Button type="submit" className="w-full" size="lg" loading={loading}>
                        Send reset code
                    </Button>
                </form>
            ) : (
                <form onSubmit={reset} className="space-y-4" noValidate>
                    <div className="space-y-2">
                        <Label>Verification code</Label>
                        <OtpInput value={code} onChange={setCode} disabled={loading} />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="password">New password</Label>
                        <div className="relative">
                            <Input
                                id="password"
                                type={show ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="At least 8 characters"
                                autoComplete="new-password"
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

                    <div className="space-y-2">
                        <Label htmlFor="confirm">Confirm new password</Label>
                        <Input
                            id="confirm"
                            type={show ? 'text' : 'password'}
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                            autoComplete="new-password"
                        />
                    </div>

                    {error && (
                        <p className="rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive" role="alert">
                            {error}
                        </p>
                    )}

                    <Button type="submit" className="w-full" size="lg" loading={loading}>
                        Reset password &amp; sign in
                    </Button>

                    <div className="flex items-center justify-between text-sm">
                        <button
                            type="button"
                            onClick={() => { setSent(false); setCode(''); setError(null); }}
                            className="text-muted-foreground hover:text-foreground"
                        >
                            Use a different account
                        </button>
                        <button
                            type="button"
                            disabled={cooldown > 0 || loading}
                            onClick={() => request()}
                            className="font-medium text-primary hover:underline disabled:pointer-events-none disabled:text-muted-foreground"
                        >
                            {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
                        </button>
                    </div>
                </form>
            )}
        </AuthLayout>
    );
}
