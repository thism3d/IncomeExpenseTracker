import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    ArrowRight, BarChart3, CalendarDays, Check, FileSpreadsheet, FileText,
    Fingerprint, FolderOpen, KeyRound, Menu, Mic, Moon, Receipt, ScanLine,
    ShieldCheck, Smartphone, Sun, X, Zap,
} from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import { Button } from '@/components/ui';
import { cn, formatMoney } from '@/lib/utils';
import { CategoryDonut, TrendChart } from '@/components/charts';
import type { CategorySlice, TrendPoint } from '@/lib/types';

/* A believable month for a Dhaka advocate. Static — the landing page must render
   for a visitor with no account and no API call. */
const DEMO_TREND: TrendPoint[] = [
    { date: '2026-02-01', income: 182000, expense: 96000, net: 86000 },
    { date: '2026-03-01', income: 214000, expense: 104000, net: 110000 },
    { date: '2026-04-01', income: 196000, expense: 118000, net: 78000 },
    { date: '2026-05-01', income: 238000, expense: 109000, net: 129000 },
    { date: '2026-06-01', income: 221000, expense: 126000, net: 95000 },
    { date: '2026-07-01', income: 262000, expense: 121000, net: 141000 },
];

const DEMO_CATEGORIES: CategorySlice[] = [
    { id: '1', name: 'Chamber rent', icon: 'rent', color: '#0a9c7c', total: 44000, count: 2, percent: 23 },
    { id: '2', name: 'Court fees', icon: 'taxes', color: '#7c3aed', total: 22700, count: 8, percent: 12 },
    { id: '3', name: 'Staff salary', icon: 'maid', color: '#e34948', total: 18700, count: 2, percent: 10 },
    { id: '4', name: 'Fuel', icon: 'fuel', color: '#eda100', total: 18000, count: 6, percent: 9 },
    { id: '5', name: 'Stationery', icon: 'stationary', color: '#e87ba4', total: 16900, count: 5, percent: 9 },
    { id: '6', name: 'Bar council', icon: 'insurance', color: '#008300', total: 16000, count: 1, percent: 8 },
    { id: '7', name: 'Transport', icon: 'transportation', color: '#2a78d6', total: 14100, count: 20, percent: 7 },
    { id: '8', name: 'Other', icon: 'other_expenses', color: '#eb6834', total: 44600, count: 31, percent: 22 },
];

const FEATURES = [
    {
        icon: FileText,
        title: 'Income-tax statements in one click',
        body: 'A formatted PDF with your summary, category breakdown and the full ledger — plus an Excel workbook whose formulas recompute when your accountant filters rows.',
    },
    {
        icon: FolderOpen,
        title: 'Every bill, kept with its entry',
        body: 'Photograph a receipt, attach the court fee PDF, record a voice memo about the case. They live in your Drive, filed by date, tied to the transaction they belong to.',
    },
    {
        icon: ShieldCheck,
        title: 'Locked behind your fingerprint',
        body: 'Fingerprint, face, or a PIN — required, not optional. Your clients’ financial trail never sits open on an unlocked phone.',
    },
    {
        icon: BarChart3,
        title: 'You can actually read the charts',
        body: 'Colour-blind-safe by construction, readable in light and dark, and every figure spelled out beside its swatch. Never a chart you have to squint at.',
    },
    {
        icon: CalendarDays,
        title: 'The month at a glance',
        body: 'Tap any day to see what happened, or add an entry dated to it. Income, expense and balance totalled underneath.',
    },
    {
        icon: Zap,
        title: 'Phone and desktop, in step',
        body: 'Record an expense on your phone in the courtroom; it is on your desktop before you sit down. No refresh, no sync button.',
    },
];

const ATTACHMENTS = [
    { icon: ScanLine, label: 'Photo bills' },
    { icon: FileText, label: 'PDF & DOCX' },
    { icon: Mic, label: 'Voice notes' },
    { icon: Receipt, label: 'Itemised bills' },
];

export default function Landing() {
    const { mode, toggle } = useTheme();
    const [menuOpen, setMenuOpen] = useState(false);
    const [visible, setVisible] = useState<Set<string>>(new Set());
    const sections = useRef<Map<string, HTMLElement>>(new Map());

    /* Reveal-on-scroll. An IntersectionObserver rather than a scroll listener, so
       it costs nothing on the main thread and respects the compositor. */
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) {
                        setVisible((prev) => new Set(prev).add(entry.target.id));
                    }
                }
            },
            { threshold: 0.15, rootMargin: '0px 0px -60px 0px' }
        );
        sections.current.forEach((el) => observer.observe(el));
        return () => observer.disconnect();
    }, []);

    const register = (id: string) => (el: HTMLElement | null) => {
        if (el) sections.current.set(id, el);
    };

    const shown = (id: string) => visible.has(id);

    return (
        <div className="min-h-screen bg-background">
            {/* ---------------------------------------------------------- header */}
            <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-md">
                <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
                    <Link to="/" className="flex items-center gap-2.5">
                        <img src="/logo.png" alt="" className="h-9 w-9 rounded-lg" />
                        <div className="leading-tight">
                            <div className="text-sm font-semibold tracking-tight">SISIRBINDU</div>
                            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                Tracker
                            </div>
                        </div>
                    </Link>

                    <nav className="ml-8 hidden items-center gap-6 md:flex">
                        {[
                            ['Features', '#features'],
                            ['Reports', '#reports'],
                            ['Security', '#security'],
                            ['Download App', '#download'],
                        ].map(([label, href]) => (
                            <a
                                key={href}
                                href={href}
                                className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                            >
                                {label}
                            </a>
                        ))}
                    </nav>

                    <div className="ml-auto flex items-center gap-2">
                        <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
                            {mode === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
                        </Button>

                        <div className="hidden items-center gap-2 sm:flex">
                            <Button variant="ghost" asChild>
                                <Link to="/login">Sign in</Link>
                            </Button>
                            <Button asChild>
                                <Link to="/register">Get started</Link>
                            </Button>
                        </div>

                        <Button
                            variant="ghost"
                            size="icon"
                            className="sm:hidden"
                            onClick={() => setMenuOpen((o) => !o)}
                            aria-label="Menu"
                        >
                            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                        </Button>
                    </div>
                </div>

                {menuOpen && (
                    <div className="border-t px-4 py-3 sm:hidden">
                        <div className="flex flex-col gap-2">
                            <Button variant="outline" asChild>
                                <Link to="/login">Sign in</Link>
                            </Button>
                            <Button asChild>
                                <Link to="/register">Get started</Link>
                            </Button>
                        </div>
                    </div>
                )}
            </header>

            {/* ------------------------------------------------------------ hero */}
            <section className="relative overflow-hidden">
                {/* A soft brand wash, not a gradient slab. */}
                <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 -top-40 h-[420px] bg-[radial-gradient(60%_60%_at_50%_0%,hsl(var(--primary)/0.14),transparent_70%)]"
                />

                <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-16 sm:px-6 sm:pt-24">
                    <div className="grid items-center gap-12 lg:grid-cols-2">
                        <div className="animate-fade-in">
                            <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
                                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                                Built for Bangladeshi advocates
                            </span>

                            <h1 className="mt-5 text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
                                Every taka accounted for —{' '}
                                <span className="text-primary">and tax-ready.</span>
                            </h1>

                            <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-muted-foreground sm:text-base">
                                Track income and expenses across your chamber and personal accounts,
                                attach the bill to the entry it belongs to, and hand your accountant a
                                complete statement the moment they ask.
                            </p>

                            <div className="mt-8 flex flex-wrap gap-3">
                                <Button size="lg" asChild>
                                    <Link to="/register">
                                        Create your account <ArrowRight className="ml-1 h-4 w-4" />
                                    </Link>
                                </Button>
                                <Button size="lg" variant="outline" asChild>
                                    <Link to="/login">Sign in</Link>
                                </Button>
                                <Button size="lg" variant="secondary" asChild className="gap-2">
                                    <a href="https://api.sisirbindu.site/downloads/sisirbindu-v1.apk" download>
                                        <Smartphone className="h-4 w-4 text-primary animate-pulse" /> Download APK
                                    </a>
                                </Button>
                            </div>

                            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2">
                                {['Free to start', 'No card required', 'Works offline on your phone'].map((line) => (
                                    <li key={line} className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                        <Check className="h-4 w-4 text-primary" />
                                        {line}
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* A real chart, not a screenshot — it is the actual component the
                            product renders, with demo data. */}
                        <div className="animate-fade-in lg:pl-4">
                            <div className="rounded-2xl border bg-card p-5 shadow-xl shadow-black/[0.04] dark:shadow-black/20">
                                <div className="mb-4 flex items-start justify-between">
                                    <div>
                                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                            Balance
                                        </p>
                                        <p className="tabular mt-1 text-3xl font-semibold tracking-tight">
                                            {formatMoney(1628796.6)}
                                        </p>
                                    </div>
                                    <span className="rounded-lg bg-[hsl(var(--income))]/10 px-2 py-1 text-xs font-semibold text-[hsl(var(--income))]">
                                        +{formatMoney(141000, 'BDT', { compact: true })} this month
                                    </span>
                                </div>

                                <TrendChart points={DEMO_TREND} mode={mode} currency="BDT" height={200} />
                            </div>

                            <div className="mt-4 grid grid-cols-2 gap-3">
                                {[
                                    { label: 'Income · July', value: 262000, tone: 'income' as const },
                                    { label: 'Expense · July', value: 121000, tone: 'expense' as const },
                                ].map((tile) => (
                                    <div key={tile.label} className="rounded-xl border bg-card p-4">
                                        <p className="text-xs font-medium text-muted-foreground">{tile.label}</p>
                                        <p
                                            className={cn(
                                                'tabular mt-1 text-xl font-semibold',
                                                tile.tone === 'income'
                                                    ? 'text-[hsl(var(--income))]'
                                                    : 'text-[hsl(var(--expense))]'
                                            )}
                                        >
                                            {formatMoney(tile.value)}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* -------------------------------------------------------- features */}
            <section
                id="features"
                ref={register('features')}
                className="border-t bg-muted/30 py-20"
            >
                <div className="mx-auto max-w-6xl px-4 sm:px-6">
                    <div
                        className={cn(
                            'mx-auto max-w-2xl text-center transition-all duration-700',
                            shown('features') ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
                        )}
                    >
                        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                            Built around how a practice actually runs
                        </h2>
                        <p className="mt-4 text-muted-foreground">
                            Case fees arrive in lumps. Court fees, stationery and transport bleed out
                            daily. This is built for that, not for a salary and a shopping list.
                        </p>
                    </div>

                    <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                        {FEATURES.map((feature, i) => (
                            <div
                                key={feature.title}
                                className={cn(
                                    'group rounded-2xl border bg-card p-6 transition-all duration-700 hover:border-primary/40 hover:shadow-lg hover:shadow-black/[0.04] dark:hover:shadow-black/20',
                                    shown('features') ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
                                )}
                                style={{ transitionDelay: shown('features') ? `${i * 70}ms` : '0ms' }}
                            >
                                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-transform group-hover:scale-105">
                                    <feature.icon className="h-5 w-5" />
                                </div>
                                <h3 className="mt-4 font-semibold">{feature.title}</h3>
                                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                                    {feature.body}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* --------------------------------------------------------- reports */}
            <section id="reports" ref={register('reports')} className="py-20">
                <div className="mx-auto max-w-6xl px-4 sm:px-6">
                    <div className="grid items-center gap-12 lg:grid-cols-2">
                        <div
                            className={cn(
                                'transition-all duration-700',
                                shown('reports') ? 'translate-x-0 opacity-100' : '-translate-x-4 opacity-0'
                            )}
                        >
                            <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                                Reports
                            </span>
                            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                                The statement your accountant asks for
                            </h2>
                            <p className="mt-4 leading-relaxed text-muted-foreground">
                                Pick a period. Get a formatted PDF with the summary, the category
                                breakdown, the payment methods and the full ledger — or an Excel
                                workbook with live formulas, so filtering rows recomputes the totals.
                            </p>

                            <div className="mt-6 flex flex-wrap gap-3">
                                <span className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-medium">
                                    <FileText className="h-4 w-4 text-[hsl(var(--expense))]" /> PDF statement
                                </span>
                                <span className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-medium">
                                    <FileSpreadsheet className="h-4 w-4 text-[hsl(var(--income))]" /> Excel workbook
                                </span>
                                <span className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-medium">
                                    <Receipt className="h-4 w-4 text-primary" /> Print
                                </span>
                            </div>

                            <div className="mt-8 flex flex-wrap gap-4">
                                {ATTACHMENTS.map((a) => (
                                    <div key={a.label} className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <a.icon className="h-4 w-4 text-primary" />
                                        {a.label}
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div
                            className={cn(
                                'rounded-2xl border bg-card p-6 transition-all duration-700',
                                shown('reports') ? 'translate-x-0 opacity-100' : 'translate-x-4 opacity-0'
                            )}
                        >
                            <p className="mb-1 text-sm font-semibold">Where it went</p>
                            <p className="mb-4 text-xs text-muted-foreground">July 2026 · all accounts</p>
                            <CategoryDonut slices={DEMO_CATEGORIES} mode={mode} currency="BDT" />
                        </div>
                    </div>
                </div>
            </section>

            {/* -------------------------------------------------------- security */}
            <section
                id="security"
                ref={register('security')}
                className="border-y bg-muted/30 py-20"
            >
                <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
                    <div
                        className={cn(
                            'transition-all duration-700',
                            shown('security') ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
                        )}
                    >
                        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                            <ShieldCheck className="h-7 w-7 text-primary" />
                        </div>
                        <h2 className="mt-6 text-3xl font-semibold tracking-tight sm:text-4xl">
                            Your clients’ money, behind your fingerprint
                        </h2>
                        <p className="mx-auto mt-4 max-w-xl leading-relaxed text-muted-foreground">
                            The app lock is mandatory, not a setting you forget to switch on. Fingerprint
                            or face where your phone supports it, and a PIN underneath that always works.
                        </p>

                        <div className="mt-10 grid gap-4 sm:grid-cols-3">
                            {[
                                { icon: Fingerprint, label: 'Fingerprint & face', body: 'Verified on the device. It never leaves your phone.' },
                                { icon: KeyRound, label: 'PIN fallback', body: 'Works when a wet thumb or a failed scan does not.' },
                                { icon: Smartphone, label: 'Re-locks itself', body: 'Step away from your desk and it closes behind you.' },
                            ].map((item) => (
                                <div key={item.label} className="rounded-xl border bg-card p-5 text-left">
                                    <item.icon className="h-5 w-5 text-primary" />
                                    <p className="mt-3 text-sm font-semibold">{item.label}</p>
                                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.body}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* ------------------------------------------------------------- APK Download */}
            <section
                id="download"
                ref={register('download')}
                className="py-20 border-b bg-gradient-to-b from-card to-background relative overflow-hidden"
            >
                <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:32px_32px] pointer-events-none" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary/5 rounded-full blur-3xl pointer-events-none" />
                <div className="relative mx-auto max-w-5xl px-4 sm:px-6">
                    <div className="grid gap-12 items-center lg:grid-cols-12">
                        <div className="lg:col-span-7 text-left">
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-ping" />
                                Android Application
                            </span>
                            <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
                                SisirBindu on your Phone
                            </h2>
                            <p className="mt-4 text-muted-foreground leading-relaxed text-sm sm:text-base">
                                Take control of your practice's accounting on the move. Fast, works offline, and keeps your records protected behind device biometrics.
                            </p>
                            <div className="mt-8 flex flex-wrap gap-4 items-center">
                                <a
                                    href="https://api.sisirbindu.site/downloads/sisirbindu-v1.apk"
                                    download
                                    className="inline-flex items-center justify-center rounded-xl bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/95 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                                >
                                    <Smartphone className="mr-2 h-5 w-5" /> Download Latest APK
                                </a>
                                <div className="text-xs text-muted-foreground leading-snug">
                                    <p className="font-semibold text-foreground">Version 1.0.0 (Release)</p>
                                    <p className="mt-0.5">Requires Android 8.0 or higher</p>
                                </div>
                            </div>
                        </div>
                        <div className="lg:col-span-5 flex justify-center">
                            <div className="relative group max-w-[280px]">
                                <div className="absolute -inset-1.5 bg-gradient-to-r from-primary to-emerald-500 rounded-3xl blur opacity-25 group-hover:opacity-40 transition duration-1000 group-hover:duration-200" />
                                <div className="relative rounded-2xl border bg-card p-6 shadow-2xl flex flex-col items-center">
                                    <div className="p-3 bg-primary/10 rounded-xl mb-4">
                                        <Smartphone className="h-12 w-12 text-primary" />
                                    </div>
                                    <div className="text-center">
                                        <p className="text-sm font-semibold">SISIRBINDU Mobile</p>
                                        <p className="text-xs text-muted-foreground mt-1">Direct Download Link</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ------------------------------------------------------------- CTA */}
            <section className="py-20">
                <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
                    <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                        Start tracking today
                    </h2>
                    <p className="mx-auto mt-4 max-w-lg text-muted-foreground">
                        Sign up with your mobile number in under a minute. Your default account and
                        every category a practice needs are set up for you.
                    </p>
                    <div className="mt-8 flex flex-wrap justify-center gap-3">
                        <Button size="lg" asChild>
                            <Link to="/register">
                                Create your account <ArrowRight className="ml-1 h-4 w-4" />
                            </Link>
                        </Button>
                        <Button size="lg" variant="outline" asChild>
                            <Link to="/login">I already have one</Link>
                        </Button>
                    </div>
                </div>
            </section>

            {/* ---------------------------------------------------------- footer */}
            <footer className="border-t py-10">
                <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6">
                    <div className="flex items-center gap-2.5">
                        <img src="/logo.png" alt="" className="h-7 w-7 rounded-md" />
                        <span className="text-sm font-medium">SISIRBINDU TRACKERAPP</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        © {new Date().getFullYear()} SisirBindu. Income &amp; expense tracking for the
                        legal profession.
                    </p>
                </div>
            </footer>
        </div>
    );
}
