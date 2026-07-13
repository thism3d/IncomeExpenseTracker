// Default categories and payment methods, seeded per-user on registration.
// The lists are exactly those specified in the README.
//
// `icon` is a stable string key, not a platform icon — the Flutter app and the
// web app each map it onto their own icon set. Never rename a key once shipped;
// existing user rows store it.

const INCOME_CATEGORIES = [
    { name: 'Allowance',         icon: 'allowance',         color: '#22C55E' },
    { name: 'Bonus',             icon: 'bonus',             color: '#F59E0B' },
    { name: 'Business',          icon: 'business',          color: '#0E7C66' },
    { name: 'Investment Income', icon: 'investment_income', color: '#3B82F6' },
    { name: 'Other Income',      icon: 'other_income',      color: '#8B5CF6' },
    { name: 'Salary',            icon: 'salary',            color: '#10B981' },
    { name: 'Pension',           icon: 'pension',           color: '#6366F1' },
];

const EXPENSE_CATEGORIES = [
    { name: 'Air Tickets',            icon: 'air_tickets',            color: '#0EA5E9' },
    { name: 'Auto Rickshaw',          icon: 'auto_rickshaw',          color: '#F59E0B' },
    { name: 'Bike',                   icon: 'bike',                   color: '#EF4444' },
    { name: 'Bills',                  icon: 'bills',                  color: '#6366F1' },
    { name: 'Cable TV',               icon: 'cable_tv',               color: '#8B5CF6' },
    { name: 'Car',                    icon: 'car',                    color: '#3B82F6' },
    { name: 'Car Insurance',          icon: 'car_insurance',          color: '#0E7C66' },
    { name: 'Card Fee',               icon: 'card_fee',               color: '#F43F5E' },
    { name: 'Cigarette',              icon: 'cigarette',              color: '#78716C' },
    { name: 'Cloths',                 icon: 'cloths',                 color: '#EC4899' },
    { name: 'Drinks',                 icon: 'drinks',                 color: '#06B6D4' },
    { name: 'Driver',                 icon: 'driver',                 color: '#64748B' },
    { name: 'Durables',               icon: 'durables',               color: '#A16207' },
    { name: 'Education',              icon: 'education',              color: '#2563EB' },
    { name: 'Electricity',            icon: 'electricity',            color: '#EAB308' },
    { name: 'EMI',                    icon: 'emi',                    color: '#DC2626' },
    { name: 'Entertainment',          icon: 'entertainment',          color: '#D946EF' },
    { name: 'Fast Food',              icon: 'fast_food',              color: '#F97316' },
    { name: 'Festivals',              icon: 'festivals',              color: '#E11D48' },
    { name: 'Fitness',                icon: 'fitness',                color: '#16A34A' },
    { name: 'Food',                   icon: 'food',                   color: '#F97316' },
    { name: 'Fruit and Vegetables',   icon: 'fruit_vegetables',       color: '#65A30D' },
    { name: 'Fuel',                   icon: 'fuel',                   color: '#B45309' },
    { name: 'Furniture',              icon: 'furniture',              color: '#92400E' },
    { name: 'Gas',                    icon: 'gas',                    color: '#F59E0B' },
    { name: 'Gifts',                  icon: 'gifts',                  color: '#EC4899' },
    { name: 'Groceries',              icon: 'groceries',              color: '#22C55E' },
    { name: 'Health',                 icon: 'health',                 color: '#EF4444' },
    { name: 'Health Insurance',       icon: 'health_insurance',       color: '#0891B2' },
    { name: 'Insurance',              icon: 'insurance',              color: '#0E7C66' },
    { name: 'Internet',               icon: 'internet',               color: '#3B82F6' },
    { name: 'Investment Expense',     icon: 'investment_expense',     color: '#7C3AED' },
    { name: 'Kids',                   icon: 'kids',                   color: '#F472B6' },
    { name: 'Laundry',                icon: 'laundry',                color: '#38BDF8' },
    { name: 'Maid/Servant',           icon: 'maid',                   color: '#A78BFA' },
    { name: 'Medicine',               icon: 'medicine',               color: '#DC2626' },
    { name: 'Milk',                   icon: 'milk',                   color: '#94A3B8' },
    { name: 'Mobile',                 icon: 'mobile',                 color: '#6366F1' },
    { name: 'Other Expenses',         icon: 'other_expenses',         color: '#64748B' },
    { name: 'Parking',                icon: 'parking',                color: '#0284C7' },
    { name: 'Party',                  icon: 'party',                  color: '#D946EF' },
    { name: 'Personal Grooming',      icon: 'personal_grooming',      color: '#F472B6' },
    { name: 'Pet',                    icon: 'pet',                    color: '#CA8A04' },
    { name: 'Rent',                   icon: 'rent',                   color: '#0E7C66' },
    { name: 'Repair and Maintenance', icon: 'repair_maintenance',     color: '#78716C' },
    { name: 'Restaurant and Hotel',   icon: 'restaurant_hotel',       color: '#F97316' },
    { name: 'Savings',                icon: 'savings',                color: '#16A34A' },
    { name: 'Shopping',               icon: 'shopping',               color: '#EC4899' },
    { name: 'Social',                 icon: 'social',                 color: '#8B5CF6' },
    { name: 'Stationary',             icon: 'stationary',             color: '#2563EB' },
    { name: 'Taxes',                  icon: 'taxes',                  color: '#B91C1C' },
    { name: 'Taxi',                   icon: 'taxi',                   color: '#EAB308' },
    { name: 'Toiletries',             icon: 'toiletries',             color: '#06B6D4' },
    { name: 'Toll',                   icon: 'toll',                   color: '#64748B' },
    { name: 'Toys',                   icon: 'toys',                   color: '#F472B6' },
    { name: 'Transportation',         icon: 'transportation',         color: '#3B82F6' },
    { name: 'Vacation',               icon: 'vacation',               color: '#0EA5E9' },
    { name: 'Water',                  icon: 'water',                  color: '#06B6D4' },
];

const PAYMENT_METHODS = [
    { name: 'Cash',   icon: 'cash',   color: '#22C55E' },
    { name: 'Bank',   icon: 'bank',   color: '#3B82F6' },
    { name: 'Card',   icon: 'card',   color: '#8B5CF6' },
    { name: 'Others', icon: 'others', color: '#64748B' },
];

const DEFAULT_ACCOUNT_NAME = 'Personal';

// Seed a brand-new user's categories, payment methods and default account.
// Runs inside the registration transaction, so it takes the client.
const seedUserDefaults = async (client, userId) => {
    const catValues = [];
    const catParams = [];
    let i = 1;
    for (const c of INCOME_CATEGORIES) {
        catValues.push(`($${i++}, 'INCOME', $${i++}, $${i++}, $${i++}, true)`);
        catParams.push(userId, c.name, c.icon, c.color);
    }
    for (const c of EXPENSE_CATEGORIES) {
        catValues.push(`($${i++}, 'EXPENSE', $${i++}, $${i++}, $${i++}, true)`);
        catParams.push(userId, c.name, c.icon, c.color);
    }
    await client.query(
        `INSERT INTO categories (user_id, type, name, icon, color, is_default)
         VALUES ${catValues.join(', ')}
         ON CONFLICT DO NOTHING`,
        catParams
    );

    const pmValues = [];
    const pmParams = [];
    let j = 1;
    for (const p of PAYMENT_METHODS) {
        pmValues.push(`($${j++}, $${j++}, $${j++}, $${j++}, true)`);
        pmParams.push(userId, p.name, p.icon, p.color);
    }
    await client.query(
        `INSERT INTO payment_methods (user_id, name, icon, color, is_default)
         VALUES ${pmValues.join(', ')}
         ON CONFLICT DO NOTHING`,
        pmParams
    );

    const account = await client.query(
        `INSERT INTO accounts (user_id, name, is_default)
         VALUES ($1, $2, true)
         RETURNING id`,
        [userId, DEFAULT_ACCOUNT_NAME]
    );
    return account.rows[0].id;
};

module.exports = {
    INCOME_CATEGORIES,
    EXPENSE_CATEGORIES,
    PAYMENT_METHODS,
    DEFAULT_ACCOUNT_NAME,
    seedUserDefaults,
};
