import type { ReactNode } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import { Button } from '@/components/ui';

export const AuthLayout = ({
    title,
    subtitle,
    children,
    footer,
}: {
    title: string;
    subtitle?: string;
    children: ReactNode;
    footer?: ReactNode;
}) => {
    const { mode, toggle } = useTheme();

    return (
        <div className="flex min-h-screen">
            {/* The brand panel is decoration — it hides on small screens so the form
                always owns the viewport where it matters. */}
            <div className="relative hidden w-1/2 flex-col justify-between bg-gradient-to-br from-primary via-primary to-[hsl(166_88%_22%)] p-12 lg:flex">
                <div className="flex items-center gap-3">
                    <img src="/logo.png" alt="" className="h-11 w-11 rounded-xl bg-white/90 p-1" />
                    <div className="text-white">
                        <div className="text-base font-semibold tracking-tight">SISIRBINDU</div>
                        <div className="text-[11px] font-medium uppercase tracking-[0.15em] text-white/70">Tracker App</div>
                    </div>
                </div>

                <div className="max-w-md">
                    <h2 className="text-3xl font-semibold leading-tight text-white">
                        Every taka accounted for — and tax-ready.
                    </h2>
                    <p className="mt-4 text-[15px] leading-relaxed text-white/75">
                        Track income and expenses across accounts, attach bills, receipts and voice
                        notes to any entry, and export a complete statement as PDF or Excel whenever
                        the tax office asks.
                    </p>
                    <ul className="mt-8 space-y-3 text-sm text-white/80">
                        {[
                            'Attach PDFs, photos, documents and audio to any transaction',
                            'Fingerprint, face, or PIN lock on your device',
                            'Income-tax statements in one click',
                        ].map((line) => (
                            <li key={line} className="flex items-start gap-2.5">
                                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-white/60" />
                                {line}
                            </li>
                        ))}
                    </ul>
                </div>

                <p className="text-xs text-white/50">© {new Date().getFullYear()} SisirBindu</p>
            </div>

            <div className="flex flex-1 flex-col bg-background">
                <div className="flex justify-end p-4">
                    <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
                        {mode === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
                    </Button>
                </div>

                <div className="flex flex-1 items-center justify-center px-6 pb-16">
                    <div className="w-full max-w-sm animate-fade-in">
                        <div className="mb-8 flex items-center gap-3 lg:hidden">
                            <img src="/logo.png" alt="" className="h-10 w-10 rounded-lg" />
                            <div>
                                <div className="text-sm font-semibold tracking-tight">SISIRBINDU</div>
                                <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                    Tracker App
                                </div>
                            </div>
                        </div>

                        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
                        {subtitle && <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>}

                        <div className="mt-7">{children}</div>

                        {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
                    </div>
                </div>
            </div>
        </div>
    );
};
