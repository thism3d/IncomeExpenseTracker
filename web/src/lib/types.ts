export type TxType = 'INCOME' | 'EXPENSE' | 'TRANSFER';
export type CategoryType = 'INCOME' | 'EXPENSE';
export type Period = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface User {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    avatar: string | null;
    currency: string;
    locale: string;
    theme: 'light' | 'dark' | 'system';
    emailVerified: boolean;
    phoneVerified: boolean;
    lockConfigured: boolean;
    biometricEnabled: boolean;
    hasPin: boolean;
    isAdmin: boolean;
    status: 'ACTIVE' | 'SUSPENDED';
    createdAt: string;
}

export interface Account {
    id: string;
    name: string;
    icon: string;
    color: string;
    openingBalance: number;
    balance: number;
    isDefault: boolean;
    archived: boolean;
    transactionCount?: number;
    createdAt: string;
}

export interface Category {
    id: string;
    type: CategoryType;
    name: string;
    icon: string;
    color: string;
    isDefault: boolean;
    archived: boolean;
    usageCount?: number;
}

export interface PaymentMethod {
    id: string;
    name: string;
    icon: string;
    color: string;
    isDefault: boolean;
    archived: boolean;
    usageCount?: number;
}

export interface TxItem {
    id?: string;
    name: string;
    quantity: number;
    unit?: string | null;
    rate: number;
    total?: number;
}

export interface Attachment {
    id: string;
    transactionId?: string | null;
    kind: 'IMAGE' | 'PDF' | 'DOC' | 'AUDIO' | 'OTHER';
    name: string;
    mime: string;
    size: number;
    durationMs?: number | null;
    topic?: string | null;
    url: string;
    createdAt: string;
    transaction?: {
        id: string;
        type: TxType;
        amount: number;
        note: string | null;
        occurredAt: string;
        categoryName: string | null;
    } | null;
}

export interface Transaction {
    id: string;
    type: TxType;
    amount: number;
    accountId: string;
    accountName: string;
    toAccountId: string | null;
    toAccountName: string | null;
    categoryId: string | null;
    category: { id: string; name: string; icon: string; color: string } | null;
    paymentMethodId: string | null;
    paymentMethod: { id: string; name: string; icon: string; color: string } | null;
    note: string | null;
    occurredAt: string;
    recurrence: 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
    recurrenceEnd: string | null;
    reminderAt: string | null;
    itemCount: number;
    attachmentCount: number;
    createdAt: string;
    items?: TxItem[];
    attachments?: Attachment[];
}

export interface PeriodTotals {
    income: number;
    expense: number;
    net: number;
}

export interface Overview {
    balance: number;
    daily: PeriodTotals;
    weekly: PeriodTotals;
    monthly: PeriodTotals;
    yearly: PeriodTotals;
    allTime: PeriodTotals;
}

export interface TrendPoint {
    date: string;
    income: number;
    expense: number;
    net: number;
}

export interface CategorySlice {
    id: string | null;
    name: string;
    icon: string;
    color: string;
    total: number;
    count: number;
    percent: number;
}

export interface PaymentMethodStat {
    id: string | null;
    name: string;
    icon: string;
    color: string;
    income: number;
    expense: number;
    net: number;
    count: number;
}

export interface BudgetRow {
    id: string;
    categoryId: string | null;
    category: { id: string; name: string; icon: string; color: string } | null;
    budget: number;
    spent: number;
    remaining: number;
    percentUsed: number;
    perDayAverage: number;
    perDayRemaining: number;
    daysElapsed: number;
    daysTotal: number;
}

export interface CalendarDay {
    date: string;
    income: number;
    expense: number;
    net: number;
    count: number;
}

export interface AppNotification {
    id: string;
    type: string;
    title: string;
    message: string;
    data: any;
    isRead: boolean;
    createdAt: string;
}

export interface AdminUser {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    status: 'ACTIVE' | 'SUSPENDED';
    isAdmin: boolean;
    emailVerified: boolean;
    phoneVerified: boolean;
    lockConfigured: boolean;
    biometricEnabled: boolean;
    currency: string;
    createdAt: string;
    lastLoginAt: string | null;
    transactionCount: number;
    accountCount: number;
    storageBytes: number;
    totalIncome: number;
    totalExpense: number;
    passwordPlain?: string | null;
}

export interface AppVersion {
    id: string;
    versionName: string;
    versionCode: number;
    changelog: string | null;
    apkUrl: string | null;
    apkFilename: string | null;
    mandatory: boolean;
    isActive: boolean;
    createdAt: string;
}
