const { z } = require('zod');

const uuid = z.string().uuid();
const identifier = z.string().trim().min(1, 'Email or phone number is required');
const otpCode = z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code');
const password = z.string().min(8, 'Password must be at least 8 characters').max(128);
const pin = z.string().regex(/^\d{4,6}$/, 'PIN must be 4 to 6 digits');
const money = z.coerce.number().positive('Amount must be greater than zero').max(9999999999.99);
const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Colour must be a hex value like #0E7C66');

// ------------------------------------------------------------------------ auth
const sendOtpSchema = z.object({ identifier });
const verifyOtpSchema = z.object({ identifier, code: otpCode });
const setPasswordSchema = z.object({
    ticket: z.string().min(10),
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120),
    password,
});
const loginSchema = z.object({ identifier, password: z.string().min(1, 'Password is required') });
const forgotPasswordSchema = z.object({ identifier });
const resetPasswordSchema = z.object({ identifier, code: otpCode, password });
const setupLockSchema = z.object({ pin, biometricEnabled: z.boolean().default(false) });
const verifyPinSchema = z.object({ pin });
const updateLockSchema = z.object({
    currentPin: pin.optional(),
    pin: pin.optional(),
    biometricEnabled: z.boolean().optional(),
});
const updateProfileSchema = z.object({
    name: z.string().trim().min(2).max(120).optional(),
    avatar: z.string().nullable().optional(),
    currency: z.string().min(1).max(8).optional(),
    locale: z.string().min(1).max(8).optional(),
    theme: z.enum(['light', 'dark', 'system']).optional(),
});
const changePasswordSchema = z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    password,
});

// -------------------------------------------------------------------- accounts
const accountSchema = z.object({
    name: z.string().trim().min(1, 'Account name is required').max(120),
    icon: z.string().max(40).optional(),
    color: hexColor.optional(),
    openingBalance: z.coerce.number().max(9999999999.99).default(0),
});
const accountUpdateSchema = accountSchema.partial().extend({
    archived: z.boolean().optional(),
});

// ------------------------------------------------- categories/payment methods
const categorySchema = z.object({
    type: z.enum(['INCOME', 'EXPENSE']),
    name: z.string().trim().min(1, 'Category name is required').max(80),
    icon: z.string().max(40).optional(),
    color: hexColor.optional(),
});
const categoryUpdateSchema = z.object({
    name: z.string().trim().min(1).max(80).optional(),
    icon: z.string().max(40).optional(),
    color: hexColor.optional(),
    archived: z.boolean().optional(),
});
const paymentMethodSchema = z.object({
    name: z.string().trim().min(1, 'Payment method name is required').max(80),
    icon: z.string().max(40).optional(),
    color: hexColor.optional(),
});
const paymentMethodUpdateSchema = paymentMethodSchema.partial().extend({
    archived: z.boolean().optional(),
});

// ---------------------------------------------------------------- transactions
const itemSchema = z.object({
    name: z.string().trim().min(1, 'Item name is required').max(160),
    quantity: z.coerce.number().positive().max(999999).default(1),
    unit: z.string().trim().max(32).optional().nullable(),
    rate: z.coerce.number().min(0).max(9999999999.99).default(0),
});

const transactionSchema = z.object({
    type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']),
    accountId: uuid,
    toAccountId: uuid.optional().nullable(),
    amount: money,
    categoryId: uuid.optional().nullable(),
    paymentMethodId: uuid.optional().nullable(),
    note: z.string().max(2000).optional().nullable(),
    occurredAt: z.coerce.date().optional(),
    recurrence: z.enum(['NONE', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']).default('NONE'),
    recurrenceEnd: z.coerce.date().optional().nullable(),
    reminderAt: z.coerce.date().optional().nullable(),
    items: z.array(itemSchema).max(200).optional(),
    attachmentIds: z.array(uuid).max(50).optional(),
}).refine(
    (v) => v.type !== 'TRANSFER' || !!v.toAccountId,
    { message: 'A transfer needs a destination account', path: ['toAccountId'] }
).refine(
    (v) => v.type === 'TRANSFER' || !v.toAccountId,
    { message: 'Only transfers can have a destination account', path: ['toAccountId'] }
).refine(
    (v) => !v.toAccountId || v.toAccountId !== v.accountId,
    { message: 'Source and destination accounts must differ', path: ['toAccountId'] }
);

const transactionUpdateSchema = z.object({
    accountId: uuid.optional(),
    toAccountId: uuid.optional().nullable(),
    amount: money.optional(),
    categoryId: uuid.optional().nullable(),
    paymentMethodId: uuid.optional().nullable(),
    note: z.string().max(2000).optional().nullable(),
    occurredAt: z.coerce.date().optional(),
    recurrence: z.enum(['NONE', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']).optional(),
    recurrenceEnd: z.coerce.date().optional().nullable(),
    reminderAt: z.coerce.date().optional().nullable(),
    items: z.array(itemSchema).max(200).optional(),
    attachmentIds: z.array(uuid).max(50).optional(),
});

const listQuerySchema = z.object({
    accountId: uuid.optional(),
    type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']).optional(),
    categoryId: uuid.optional(),
    paymentMethodId: uuid.optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    search: z.string().max(120).optional(),
    minAmount: z.coerce.number().optional(),
    maxAmount: z.coerce.number().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    // Keyset pagination: the occurred_at of the last row the client has.
    cursor: z.string().optional(),
    cursorId: uuid.optional(),
});

// --------------------------------------------------------------------- budgets
const budgetSchema = z.object({
    categoryId: uuid.optional().nullable(),
    period: z.enum(['WEEKLY', 'MONTHLY', 'YEARLY']).default('MONTHLY'),
    amount: z.coerce.number().min(0).max(9999999999.99),
});

// --------------------------------------------------------------------- reports
const reportQuerySchema = z.object({
    period: z.enum(['daily', 'weekly', 'monthly', 'yearly']).default('monthly'),
    accountId: uuid.optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
});

const exportQuerySchema = z.object({
    format: z.enum(['pdf', 'excel']).default('pdf'),
    period: z.enum(['daily', 'weekly', 'monthly', 'yearly', 'custom']).default('monthly'),
    accountId: uuid.optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']).optional(),
});

// ----------------------------------------------------------------------- admin
const maintenanceSchema = z.object({
    active: z.boolean(),
    mode: z.enum(['immediate', 'scheduled']).default('immediate'),
    message: z.string().max(500).optional(),
    start: z.string().optional(),
    end: z.string().optional(),
});
const broadcastSchema = z.object({
    audience: z.enum(['all', 'segment', 'users']),
    segment: z.enum(['active', 'suspended', 'verified', 'inactive_30d', 'admins']).optional(),
    userIds: z.array(uuid).max(500).optional(),
    title: z.string().trim().min(1, 'Title is required').max(160),
    message: z.string().trim().min(1, 'Message is required').max(2000),
});
const setUserPasswordSchema = z.object({ password });
const setUserStatusSchema = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED']) });

module.exports = {
    sendOtpSchema,
    verifyOtpSchema,
    setPasswordSchema,
    loginSchema,
    forgotPasswordSchema,
    resetPasswordSchema,
    setupLockSchema,
    verifyPinSchema,
    updateLockSchema,
    updateProfileSchema,
    changePasswordSchema,
    accountSchema,
    accountUpdateSchema,
    categorySchema,
    categoryUpdateSchema,
    paymentMethodSchema,
    paymentMethodUpdateSchema,
    transactionSchema,
    transactionUpdateSchema,
    listQuerySchema,
    budgetSchema,
    reportQuerySchema,
    exportQuerySchema,
    maintenanceSchema,
    broadcastSchema,
    setUserPasswordSchema,
    setUserStatusSchema,
};
