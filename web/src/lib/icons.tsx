// Maps the backend's stable icon keys (see backend/src/utils/presets.js) onto
// Lucide icons. The keys are the contract — never rename one, existing category
// rows store it. An unknown key falls back rather than crashing the row.

import {
    Wallet, Banknote, Gift, Briefcase, TrendingUp, CircleDollarSign, Landmark, PiggyBank,
    Plane, CarTaxiFront, Bike, ReceiptText, Tv, Car, ShieldCheck, CreditCard, Cigarette,
    Shirt, CupSoda, UserRound, Package, GraduationCap, Zap, CalendarClock, Clapperboard,
    Sandwich, PartyPopper, Dumbbell, UtensilsCrossed, Apple, Fuel, Sofa, Flame, Gift as GiftIcon,
    ShoppingCart, HeartPulse, Stethoscope, Umbrella, Wifi, LineChart, Baby, WashingMachine,
    BrushCleaning, Pill, Milk, Smartphone, MoreHorizontal, SquareParking, Sparkles, Cat,
    House, Wrench, Hotel, Coins, ShoppingBag, Users, PenLine, Scale, Bath, TicketCheck,
    ToyBrick, BusFront, Palmtree, Droplets, Building2, Banknote as Cash, FileText, Image,
    FileAudio, File, type LucideIcon,
} from 'lucide-react';

const MAP: Record<string, LucideIcon> = {
    // income
    allowance: Gift,
    bonus: Sparkles,
    business: Briefcase,
    investment_income: TrendingUp,
    other_income: CircleDollarSign,
    salary: Banknote,
    pension: Landmark,

    // expense
    air_tickets: Plane,
    auto_rickshaw: CarTaxiFront,
    bike: Bike,
    bills: ReceiptText,
    cable_tv: Tv,
    car: Car,
    car_insurance: ShieldCheck,
    card_fee: CreditCard,
    cigarette: Cigarette,
    cloths: Shirt,
    drinks: CupSoda,
    driver: UserRound,
    durables: Package,
    education: GraduationCap,
    electricity: Zap,
    emi: CalendarClock,
    entertainment: Clapperboard,
    fast_food: Sandwich,
    festivals: PartyPopper,
    fitness: Dumbbell,
    food: UtensilsCrossed,
    fruit_vegetables: Apple,
    fuel: Fuel,
    furniture: Sofa,
    gas: Flame,
    gifts: GiftIcon,
    groceries: ShoppingCart,
    health: HeartPulse,
    health_insurance: Stethoscope,
    insurance: Umbrella,
    internet: Wifi,
    investment_expense: LineChart,
    kids: Baby,
    laundry: WashingMachine,
    maid: BrushCleaning,
    medicine: Pill,
    milk: Milk,
    mobile: Smartphone,
    other_expenses: MoreHorizontal,
    parking: SquareParking,
    party: PartyPopper,
    personal_grooming: Sparkles,
    pet: Cat,
    rent: House,
    repair_maintenance: Wrench,
    restaurant_hotel: Hotel,
    savings: PiggyBank,
    shopping: ShoppingBag,
    social: Users,
    stationary: PenLine,
    taxes: Scale,
    taxi: CarTaxiFront,
    toiletries: Bath,
    toll: TicketCheck,
    toys: ToyBrick,
    transportation: BusFront,
    vacation: Palmtree,
    water: Droplets,

    // payment methods
    cash: Cash,
    bank: Building2,
    card: CreditCard,
    others: MoreHorizontal,

    // accounts
    wallet: Wallet,
    coins: Coins,

    // attachment kinds
    IMAGE: Image,
    PDF: FileText,
    DOC: FileText,
    AUDIO: FileAudio,
    OTHER: File,
};

export const iconFor = (key: string | null | undefined): LucideIcon =>
    (key && MAP[key]) || MoreHorizontal;

export const CategoryIcon = ({
    icon,
    className,
    style,
}: {
    icon: string | null | undefined;
    className?: string;
    style?: React.CSSProperties;
}) => {
    const Icon = iconFor(icon);
    return <Icon className={className} style={style} aria-hidden />;
};
