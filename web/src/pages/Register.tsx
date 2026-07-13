import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Eye, EyeOff, Mail, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { AuthLayout } from '@/components/AuthLayout';
import { OtpInput } from '@/components/OtpInput';
import { Button, Input, Label } from '@/components/ui';
import { api } from '@/lib/ws';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import type { User } from '@/lib/types';

type Step = 'identifier' | 'otp' | 'password';

const STEPS: Step[] = ['identifier', 'otp', 'password'];

export default function Register() {
    const { login } = useAuth();
    const navigate = useNavigate();

    const [step, setStep] = useState<Step>('identifier');
    const [mode, setMode] = useState<'phone' | 'email'>('phone');
    const [identifier, setIdentifier] = useState('');
    const [destination, setDestination] = useState('');
    const [code, setCode] = useState('');
    const [ticket, setTicket] = useState('');
    const [name, setName] = useState('');
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

    const sendOtp = async (e?: React.FormEvent) => {
        e?.preventDefault();
        setError(null);
        if (!identifier.trim()) {
            return setError(mode === 'phone' ? 'Enter your mobile number' : 'Enter your email address');
        }

        setLoading(true);
        try {
            const res = await api.post<{ destination: string; channel: string }>(
                '/auth/register/send-otp', { identifier: identifier.trim() }
            );
            setDestination(res.data.destination);
            setStep('otp');
            setCooldown(60);
            setCode('');
            toast.success(`Code sent to ${res.data.destination}`);
        } catch (err: any) {
            setError(err.message || 'Could not send the code');
        } finally {
            setLoading(false);
        }
    };

    const verifyOtp = async (submitted?: string) => {
        const value = submitted ?? code;
        setError(null);
        if (value.length !== 6) return setError('Enter the 6-digit code');

        setLoading(true);
        try {
            const res = await api.post<{ ticket: string }>('/auth/register/verify-otp', {
                identifier: identifier.trim(),
                code: value,
            });
            setTicket(res.data.ticket);
            setStep('password');
        } catch (err: any) {
            setError(err.message || 'Verification failed');
            setCode('');
        } finally {
            setLoading(false);
        }
    };

    const finish = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (name.trim().length < 2) return setError('Enter your full name');
        if (password.length < 8) return setError('Password must be at least 8 characters');
        if (password !== confirm) return setError('Passwords do not match');

        setLoading(true);
        try {
            const res = await api.post<{ user: User; token: string }>('/auth/register/set-password', {
                ticket,
                name: name.trim(),
                password,
            });
            login(res.data.token, res.data.user);
            toast.success('Account created', {
                description: 'Your default Personal account and categories are ready.',
            });
            navigate('/', { replace: true });
        } catch (err: any) {
            setError(err.message || 'Could not create your account');
            // The verification ticket only lives 15 minutes — send them back to the
            // start rather than leaving a dead form on screen.
            if (err.code === 'INVALID_TICKET') {
                setStep('identifier');
                setCode('');
                setTicket('');
            }
        } finally {
            setLoading(false);
        }
    };

    const stepIndex = STEPS.indexOf(step);

    return (
        <AuthLayout
            title="Create your account"
            subtitle={
                step === 'identifier' ? 'We will send you a verification code'
                : step === 'otp' ? `Enter the code we sent to ${destination}`
                : 'Set your name and a password'
            }
            footer={
                step === 'identifier' ? (
                    <>
                        Already registered?{' '}
                        <Link to="/login" className="font-medium text-primary hover:underline">
                            Sign in
                        </Link>
                    </>
                ) : undefined
            }
        >
            {/* Progress: three dots, the current one filled. */}
            <div className="mb-6 flex items-center gap-2">
                {STEPS.map((s, i) => (
                    <div
                        key={s}
                        className={cn(
                            'h-1.5 flex-1 rounded-full transition-colors',
                            i <= stepIndex ? 'bg-primary' : 'bg-muted'
                        )}
                    />
                ))}
            </div>

            {step === 'identifier' && (
                <form onSubmit={sendOtp} className="space-y-4" noValidate>
                    <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
                        {(['phone', 'email'] as const).map((m) => (
                            <button
                                key={m}
                                type="button"
                                onClick={() => { setMode(m); setIdentifier(''); setError(null); }}
                                className={cn(
                                    'flex items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-colors',
                                    mode === m ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
                                )}
                            >
                                {m === 'phone' ? <Smartphone className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
                                {m === 'phone' ? 'Phone' : 'Email'}
                            </button>
                        ))}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="identifier">
                            {mode === 'phone' ? 'Mobile number' : 'Email address'}
                        </Label>
                        <Input
                            id="identifier"
                            value={identifier}
                            onChange={(e) => setIdentifier(e.target.value)}
                            placeholder={mode === 'phone' ? '01712345678' : 'you@example.com'}
                            inputMode={mode === 'phone' ? 'tel' : 'email'}
                            autoFocus
                        />
                        {mode === 'phone' && (
                            <p className="text-xs text-muted-foreground">
                                Bangladeshi mobile — 01…, 1…, 880…, or +880… all work.
                            </p>
                        )}
                    </div>

                    {error && (
                        <p className="rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive" role="alert">
                            {error}
                        </p>
                    )}

                    <Button type="submit" className="w-full" size="lg" loading={loading}>
                        Send verification code
                    </Button>
                </form>
            )}

            {step === 'otp' && (
                <div className="space-y-5">
                    <OtpInput value={code} onChange={setCode} onComplete={verifyOtp} disabled={loading} />

                    {error && (
                        <p className="rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive" role="alert">
                            {error}
                        </p>
                    )}

                    <Button className="w-full" size="lg" loading={loading} onClick={() => verifyOtp()}>
                        Verify code
                    </Button>

                    <div className="flex items-center justify-between text-sm">
                        <button
                            type="button"
                            onClick={() => { setStep('identifier'); setError(null); setCode(''); }}
                            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
                        >
                            <ArrowLeft className="h-3.5 w-3.5" /> Change {mode}
                        </button>
                        <button
                            type="button"
                            disabled={cooldown > 0 || loading}
                            onClick={() => sendOtp()}
                            className="font-medium text-primary hover:underline disabled:pointer-events-none disabled:text-muted-foreground"
                        >
                            {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
                        </button>
                    </div>
                </div>
            )}

            {step === 'password' && (
                <form onSubmit={finish} className="space-y-4" noValidate>
                    <div className="flex items-center gap-2 rounded-lg bg-[hsl(var(--income))]/10 px-3 py-2.5 text-sm text-[hsl(var(--income))]">
                        <Check className="h-4 w-4 shrink-0" />
                        {destination} verified
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="name">Full name</Label>
                        <Input
                            id="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Adv. Rahman Ahmed"
                            autoComplete="name"
                            autoFocus
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="password">Password</Label>
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
                        <Label htmlFor="confirm">Confirm password</Label>
                        <Input
                            id="confirm"
                            type={show ? 'text' : 'password'}
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                            placeholder="Re-enter your password"
                            autoComplete="new-password"
                        />
                    </div>

                    {error && (
                        <p className="rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive" role="alert">
                            {error}
                        </p>
                    )}

                    <Button type="submit" className="w-full" size="lg" loading={loading}>
                        Create account
                    </Button>
                </form>
            )}
        </AuthLayout>
    );
}
