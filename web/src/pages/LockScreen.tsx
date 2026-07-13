import { useState, useEffect } from 'react';
import { Fingerprint, KeyRound, LogOut, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Button, Card, CardContent } from '@/components/ui';

interface LockScreenProps {
    onUnlock: () => void;
}

export default function LockScreen({ onUnlock }: LockScreenProps) {
    const { user, logout } = useAuth();
    const [pin, setPin] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [hasBiometric, setHasBiometric] = useState(false);

    const userId = user?.id || '';
    const lockTypeKey = `sb_lock_type_${userId}`;
    const lockPinKey = `sb_lock_pin_${userId}`;

    useEffect(() => {
        const type = localStorage.getItem(lockTypeKey);
        if (type === 'passkey') {
            setHasBiometric(true);
            // Auto-trigger passkey on load
            triggerPasskey();
        }
    }, [userId]);

    const handleDigit = (digit: string) => {
        setError(null);
        if (pin.length < 6) {
            const newPin = pin + digit;
            setPin(newPin);
            if (newPin.length >= 4) {
                // Check PIN immediately
                const savedPin = localStorage.getItem(lockPinKey);
                if (savedPin === newPin) {
                    onUnlock();
                } else if (newPin.length === 6 || (savedPin && savedPin.length === newPin.length)) {
                    setError('Incorrect PIN code');
                    setPin('');
                }
            }
        }
    };

    const handleBackspace = () => {
        if (pin.length > 0) {
            setPin(pin.substring(0, pin.length - 1));
        }
    };

    const triggerPasskey = async () => {
        try {
            setError(null);
            // Request credential using native biometric/security keys (Touch ID, Face ID, PIN)
            const credential = await navigator.credentials.get({
                publicKey: {
                    challenge: new Uint8Array([1, 2, 3, 4, 5]),
                    rpId: window.location.hostname,
                    userVerification: 'required'
                }
            });
            if (credential) {
                onUnlock();
            }
        } catch (err: any) {
            // User cancelled or biometric failed — fall back to PIN
            if (err.name !== 'NotAllowedError') {
                setError('Biometric authentication failed. Use PIN.');
            }
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-background px-6 py-12 relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(14,124,102,0.03),transparent_70%)] pointer-events-none" />
            <div className="w-full max-w-md animate-fade-in relative z-10">
                <div className="mb-8 flex flex-col items-center text-center">
                    <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <KeyRound className="h-7 w-7" />
                    </div>
                    <h1 className="text-2xl font-semibold tracking-tight">SisirBindu App Lock</h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        Unlock to access {user?.name || 'your chamber'}
                    </p>
                </div>

                <Card className="backdrop-blur-sm bg-card/90">
                    <CardContent className="p-6 flex flex-col items-center">
                        {/* Display Dots */}
                        <div className="flex justify-center gap-4 mb-8">
                            {[0, 1, 2, 3, 4, 5].map((idx) => (
                                <div
                                    key={idx}
                                    className={`h-3 w-3 rounded-full border transition-all duration-150 ${
                                        idx < pin.length
                                            ? 'bg-primary border-primary scale-110 shadow-sm shadow-primary/20'
                                            : 'border-muted-foreground/30 bg-muted/20'
                                    }`}
                                />
                            ))}
                        </div>

                        {error && (
                            <div className="mb-6 flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                                <ShieldAlert className="h-4 w-4" />
                                <span>{error}</span>
                            </div>
                        )}

                        {/* Numeric Keyboard */}
                        <div className="grid grid-cols-3 gap-y-4 gap-x-6 w-full max-w-[280px]">
                            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                                <button
                                    key={digit}
                                    type="button"
                                    onClick={() => handleDigit(digit)}
                                    className="h-14 w-14 rounded-full border bg-background hover:bg-accent text-lg font-semibold flex items-center justify-center transition-colors active:scale-95"
                                >
                                    {digit}
                                </button>
                            ))}
                            
                            {/* Biometric trigger */}
                            {hasBiometric ? (
                                <button
                                    onClick={triggerPasskey}
                                    type="button"
                                    className="h-14 w-14 rounded-full text-primary hover:bg-primary/10 flex items-center justify-center transition-colors active:scale-95"
                                    title="Unlock with Passkey"
                                >
                                    <Fingerprint className="h-7 w-7" />
                                </button>
                            ) : (
                                <div className="h-14 w-14" />
                            )}

                            <button
                                onClick={() => handleDigit('0')}
                                type="button"
                                className="h-14 w-14 rounded-full border bg-background hover:bg-accent text-lg font-semibold flex items-center justify-center transition-colors active:scale-95"
                            >
                                0
                            </button>

                            <button
                                onClick={handleBackspace}
                                type="button"
                                className="h-14 w-14 rounded-full hover:bg-accent text-muted-foreground flex items-center justify-center transition-colors active:scale-95"
                            >
                                Delete
                            </button>
                        </div>

                        {/* Sign Out Fallback */}
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={logout}
                            className="mt-8 text-muted-foreground hover:text-destructive gap-2 text-xs"
                        >
                            <LogOut className="h-3.5 w-3.5" /> Sign out of this account
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
