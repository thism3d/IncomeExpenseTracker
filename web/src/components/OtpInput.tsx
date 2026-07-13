import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

// Six single-character boxes that behave like one field: typing advances,
// backspace retreats, and a pasted code fills the row.
export const OtpInput = ({
    value,
    onChange,
    onComplete,
    disabled,
    autoFocus = true,
}: {
    value: string;
    onChange: (v: string) => void;
    onComplete?: (v: string) => void;
    disabled?: boolean;
    autoFocus?: boolean;
}) => {
    const refs = useRef<Array<HTMLInputElement | null>>([]);
    const digits = value.padEnd(6, ' ').slice(0, 6).split('');

    useEffect(() => {
        if (autoFocus) refs.current[0]?.focus();
    }, [autoFocus]);

    const set = (index: number, char: string) => {
        const next = value.padEnd(6, ' ').split('');
        next[index] = char;
        const joined = next.join('').replace(/ /g, '').slice(0, 6);
        onChange(joined);
        if (joined.length === 6) onComplete?.(joined);
    };

    return (
        <div className="flex gap-2" role="group" aria-label="Verification code">
            {digits.map((d, i) => (
                <input
                    key={i}
                    ref={(el) => { refs.current[i] = el; }}
                    value={d.trim()}
                    disabled={disabled}
                    inputMode="numeric"
                    autoComplete={i === 0 ? 'one-time-code' : 'off'}
                    maxLength={1}
                    aria-label={`Digit ${i + 1}`}
                    onChange={(e) => {
                        const char = e.target.value.replace(/\D/g, '').slice(-1);
                        if (!char) return;
                        set(i, char);
                        if (i < 5) refs.current[i + 1]?.focus();
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Backspace') {
                            e.preventDefault();
                            if (d.trim()) {
                                set(i, '');
                            } else if (i > 0) {
                                set(i - 1, '');
                                refs.current[i - 1]?.focus();
                            }
                        }
                        if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus();
                        if (e.key === 'ArrowRight' && i < 5) refs.current[i + 1]?.focus();
                    }}
                    onPaste={(e) => {
                        e.preventDefault();
                        const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
                        if (!pasted) return;
                        onChange(pasted);
                        if (pasted.length === 6) {
                            onComplete?.(pasted);
                            refs.current[5]?.focus();
                        } else {
                            refs.current[pasted.length]?.focus();
                        }
                    }}
                    className={cn(
                        'h-12 w-full rounded-lg border border-input bg-background text-center text-lg font-semibold tabular',
                        'ring-offset-background transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                        'disabled:cursor-not-allowed disabled:opacity-50'
                    )}
                />
            ))}
        </div>
    );
};
