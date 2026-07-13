// Chart design tokens.
//
// These are not hand-picked. The categorical slots were derived by enumerating
// hue orderings and keeping the one that maximizes the minimum adjacent CVD ΔE,
// then validated against both surfaces:
//
//   light (#ffffff): lightness band PASS · chroma floor PASS · CVD ΔE 37.7 PASS
//   dark  (#12121a): lightness band PASS · chroma floor PASS · CVD ΔE 27.5 PASS
//
// Two light slots (yellow #eda100, magenta #e87ba4) sit below 3:1 on white. That
// is a WARN with a mandatory relief channel, which is why every chart using them
// also carries a legend + direct labels — never color alone.
//
// Re-run before changing any value:
//   node scripts/validate_palette.js "<slots>" --mode light --surface "#ffffff"

export type Mode = 'light' | 'dark';

// Income vs expense is POLARITY, not identity — it takes the diverging pair
// (one warm pole, one cool pole), never two arbitrary categorical slots.
export const POLARITY = {
    light: { income: '#0a7d63', expense: '#c8322f', neutral: '#e7e5e4' },
    dark:  { income: '#2fc79f', expense: '#f4796f', neutral: '#2e2e38' },
} as const;

// Categorical: identity only (which category, which payment method). Assigned in
// this fixed order and never cycled — a 9th series folds into "Other".
export const CATEGORICAL = {
    light: ['#0a9c7c', '#7c3aed', '#e34948', '#eda100', '#e87ba4', '#008300', '#2a78d6', '#eb6834'],
    dark:  ['#0d9e7b', '#9b7cf0', '#e05352', '#bd8200', '#cf6389', '#22a222', '#4d95e8', '#dd6a3a'],
} as const;

// Status: state, never a series. Always shipped with an icon + label so meaning
// never rests on color alone.
export const STATUS = {
    good:     { light: '#0ca30c', dark: '#22c55e' },
    warning:  { light: '#b45309', dark: '#fab219' },
    critical: { light: '#c8322f', dark: '#f4796f' },
} as const;

// Chart chrome. Recessive by design: the data is the loudest thing on the canvas.
export const CHROME = {
    light: {
        surface: '#ffffff',
        grid: '#eceae7',
        axis: '#a8a29e',
        tickText: '#78716c',
        tooltipBg: '#ffffff',
        tooltipBorder: 'rgba(11,11,11,0.10)',
        textPrimary: '#1c1917',
        textMuted: '#78716c',
    },
    dark: {
        surface: '#12121a',
        grid: '#26262f',
        axis: '#4b4b57',
        tickText: '#8f8f9d',
        tooltipBg: '#1a1a24',
        tooltipBorder: 'rgba(255,255,255,0.12)',
        textPrimary: '#f5f5f4',
        textMuted: '#a1a1aa',
    },
} as const;

export const seriesColor = (index: number, mode: Mode) =>
    CATEGORICAL[mode][index % CATEGORICAL[mode].length];

// Budget usage is a state, so it wears status tokens — not a categorical hue.
export const budgetStatus = (percentUsed: number) =>
    percentUsed >= 100 ? 'critical' : percentUsed >= 80 ? 'warning' : 'good';

export const statusColor = (
    state: keyof typeof STATUS,
    mode: Mode
) => STATUS[state][mode];
