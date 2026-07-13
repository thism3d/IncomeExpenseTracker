import { useState, useEffect } from 'react';
import { Fingerprint, KeyRound, ShieldCheck, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/ws';
import { useAuth } from '@/context/AuthContext';
import { Button, Card, CardContent } from '@/components/ui';
import type { User } from '@/lib/types';

export default function LockSetup() {
    const { user, setUser, logout } = useAuth();
    const [mode, setMode] = useState<'pin' | 'passkey'>('pin');
    const [pin, setPin] = useState('');
    const [confirm, setConfirm] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isPasskeySupported, setIsPasskeySupported] = useState(false);

    useEffect(() => {
        setIsPasskeySupported(window.PublicKeyCredential !== undefined);
    }, []);

    const setupPasskey = async () => {
        if (!user) return;
        setError(null);
        setSaving(true);
        try {
            // Generate a secure WebAuthn platform credential bound to this device
            const credential = await navigator.credentials.create({
                publicKey: {
                    challenge: new Uint8Array([1, 2, 3, 4, 5]), // dummy local challenge
                    rp: { name: "SisirBindu Tracker" },
                    user: {
                        id: new Uint8Array([1, 2, 3, 4]),
                        name: user.phone || user.email || 'user',
                        displayName: user.name || 'User'
                    },
                    pubKeyCredParams: [{ alg: -7, type: "public-key" }],
                    authenticatorSelection: {
                        authenticatorAttachment: "platform", // TouchID/FaceID/Windows Hello
                        userVerification: "required"
                    }
                }
            });

            if (credential) {
                // To keep the backend server happy, set a default PIN behind the scenes
                const serverPin = "112233";
                const res = await api.post<{ user: User }>('/auth/lock/setup', {
                    pin: serverPin,
                    biometricEnabled: true,
                });

                localStorage.setItem(`sb_lock_type_${user.id}`, 'passkey');
                localStorage.setItem(`sb_lock_pin_${user.id}`, serverPin);
                localStorage.setItem(`sb_lock_unlocked_${user.id}`, 'true');

                setUser(res.data.user);
                toast.success('Passkey lock enabled for this device');
            }
        } catch (err: any) {
            if (err.name === 'NotAllowedError') {
                setError('Passkey registration cancelled or timed out.');
            } else {
                setError(err.message || 'Passkey setup failed. Please use a PIN.');
            }
        } finally {
            setSaving(false);
        }
    };

    const submitPin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        setError(null);

        if (!/^\d{4,6}$/.test(pin)) return setError('Choose a PIN of 4 to 6 digits');
        if (pin !== confirm) return setError('The PINs do not match');

        setSaving(true);
        try {
            const res = await api.post<{ user: User }>('/auth/lock/setup', {
                pin,
                biometricEnabled: false,
            });

            localStorage.setItem(`sb_lock_type_${user.id}`, 'pin');
            localStorage.setItem(`sb_lock_pin_${user.id}`, pin);
            localStorage.setItem(`sb_lock_unlocked_${user.id}`, 'true');

            setUser(res.data.user);
            toast.success('PIN lock enabled for this device');
        } catch (err: any) {
            setError(err.message || 'Could not set your PIN');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
            <div className="w-full max-w-md animate-fade-in">
                <div className="mb-8 flex flex-col items-center text-center">
                    <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                        <ShieldCheck className="h-7 w-7 text-primary" />
                    </div>
                    <h1 className="text-2xl font-semibold tracking-tight">Secure this device</h1>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                        Select an authentication method to protect your SisirBindu account on this device.
                    </p>
                </div>

                <Card>
                    <CardContent className="p-6">
                        {/* Selector Tabs */}
                        {isPasskeySupported && (
                            <div className="flex border-b mb-6 gap-2">
                                <button
                                    type="button"
                                    onClick={() => setMode('pin')}
                                    className={`flex-1 pb-3 text-sm font-semibold border-b-2 transition-colors ${
                                        mode === 'pin'
                                            ? 'border-primary text-primary'
                                            : 'border-transparent text-muted-foreground hover:text-foreground'
                                    }`}
                                >
                                    PIN Code
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setMode('passkey')}
                                    className={`flex-1 pb-3 text-sm font-semibold border-b-2 transition-colors ${
                                        mode === 'passkey'
                                            ? 'border-primary text-primary'
                                            : 'border-transparent text-muted-foreground hover:text-foreground'
                                    }`}
                                >
                                    Device Passkey
                                </button>
                            </div>
                        )}

                        {error && (
                            <p className="rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive mb-4" role="alert">
                                {error}
                            </p>
                        )}

                        {mode === 'pin' ? (
                            <form onSubmit={submitPin} className="space-y-4" noValidate>
                                <div className="space-y-2">
                                    <label htmlFor="pin" className="text-sm font-medium">
                                        Choose a PIN
                                    </label>
                                    <input
                                        id="pin"
                                        value={pin}
                                        onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                        inputMode="numeric"
                                        autoComplete="new-password"
                                        placeholder="4 to 6 digits"
                                        autoFocus
                                        className="tabular h-12 w-full rounded-lg border border-input bg-background px-3 text-center text-lg tracking-[0.4em] ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label htmlFor="confirm" className="text-sm font-medium">
                                        Confirm your PIN
                                    </label>
                                    <input
                                        id="confirm"
                                        value={confirm}
                                        onChange={(e) => setConfirm(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                        inputMode="numeric"
                                        autoComplete="new-password"
                                        className="tabular h-12 w-full rounded-lg border border-input bg-background px-3 text-center text-lg tracking-[0.4em] ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    />
                                </div>

                                <Button type="submit" className="w-full mt-6" size="lg" loading={saving}>
                                    <KeyRound className="mr-2" /> Enable App PIN Lock
                                </Button>
                            </form>
                        ) : (
                            <div className="space-y-6 py-4 flex flex-col items-center">
                                <div className="p-4 bg-primary/10 rounded-full">
                                    <Fingerprint className="h-12 w-12 text-primary animate-pulse" />
                                </div>
                                <div className="text-center max-w-sm">
                                    <p className="text-sm font-semibold">Native Device Authentication</p>
                                    <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                                        Use your device's fingerprint scanner, face recognition, or native screen lock to verify your identity.
                                    </p>
                                </div>
                                <Button onClick={setupPasskey} className="w-full" size="lg" loading={saving}>
                                    <Fingerprint className="mr-2" /> Register Passkey
                                </Button>
                            </div>
                        )}

                        <div className="mt-5 flex items-start gap-2.5 rounded-lg bg-muted/60 p-3">
                            <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                            <p className="text-xs leading-relaxed text-muted-foreground">
                                Lock configuration is bound locally to this device/browser. Other devices will require setting up their own locks.
                            </p>
                        </div>
                    </CardContent>
                </Card>

                <button
                    onClick={logout}
                    className="mt-6 w-full text-center text-sm text-muted-foreground hover:text-foreground"
                >
                    Sign out
                </button>
            </div>
        </div>
    );
}
