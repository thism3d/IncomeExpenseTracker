import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

const CURRENCY_SYMBOL: Record<string, string> = {
    BDT: '৳',
    USD: '$',
    EUR: '€',
    GBP: '£',
    INR: '₹',
};

export const currencySymbol = (code = 'BDT') => CURRENCY_SYMBOL[code] || code + ' ';

export const formatMoney = (value: number, currency = 'BDT', opts?: { compact?: boolean; sign?: boolean }) => {
    const sym = currencySymbol(currency);
    const abs = Math.abs(value);

    // Charts and stat tiles need short axis labels; ledgers need exact figures.
    const body = opts?.compact && abs >= 1000
        ? new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(abs)
        : new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(abs);

    const sign = value < 0 ? '-' : opts?.sign ? '+' : '';
    return `${sign}${sym}${body}`;
};

export const formatDate = (d: string | Date, style: 'short' | 'long' | 'day' | 'time' | 'full' = 'short') => {
    const date = typeof d === 'string' ? new Date(d) : d;
    switch (style) {
        case 'long': return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
        case 'day':  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
        case 'time': return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        case 'full': return date.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        default:     return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }
};

export const formatBytes = (bytes: number) => {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};

export const relativeTime = (d: string | Date) => {
    const date = typeof d === 'string' ? new Date(d) : d;
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return formatDate(date);
};

// The API stores canonical 8801XXXXXXXXX; users read 01X-XXXX-XXXX.
export const formatPhone = (phone: string | null) => {
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    if (digits.startsWith('880') && digits.length === 13) {
        const n = digits.slice(3);
        return `0${n.slice(0, 4)}-${n.slice(4, 7)}-${n.slice(7)}`;
    }
    return phone;
};

export const initials = (name: string) =>
    name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

export const debounce = <T extends (...args: any[]) => void>(fn: T, ms = 300) => {
    let timer: ReturnType<typeof setTimeout>;
    return (...args: Parameters<T>) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    };
};
