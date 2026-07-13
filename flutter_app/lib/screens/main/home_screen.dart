import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../models/models.dart';
import '../../providers/auth_provider.dart';
import '../../providers/data_provider.dart';
import '../../services/api_service.dart';
import '../../theme/app_theme.dart';
import '../../utils/category_icons.dart';
import '../../utils/formatters.dart';
import '../../widgets/charts.dart';
import '../../widgets/common.dart';
import '../notifications_screen.dart';
import '../settings_screen.dart';
import 'account_sheet.dart';
import 'reports_screen.dart';
import 'transaction_editor.dart';
import 'transactions_screen.dart';

const _periods = [
  ('daily', 'Today'),
  ('weekly', 'This week'),
  ('monthly', 'This month'),
  ('yearly', 'This year'),
];

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  String _period = 'monthly';

  List<TrendPoint> _trend = [];
  List<CategorySlice> _categories = [];
  List<PaymentMethodStat> _methods = [];
  List<Transaction> _recent = [];
  BudgetSummary _budget = const BudgetSummary();
  bool _loadingCharts = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadCharts());
  }

  Future<void> _loadCharts() async {
    final data = context.read<DataProvider>();
    final accountId = data.selectedAccountId;

    if (mounted) setState(() => _loadingCharts = true);
    try {
      final results = await Future.wait([
        ApiService.trend(period: _period, accountId: accountId),
        ApiService.categoryBreakdown(period: _period, accountId: accountId),
        ApiService.paymentMethodBreakdown(period: _period, accountId: accountId),
        ApiService.transactions(limit: 6, accountId: accountId),
        ApiService.budget(),
      ]);
      if (!mounted) return;
      setState(() {
        _trend = results[0] as List<TrendPoint>;
        _categories = results[1] as List<CategorySlice>;
        _methods = results[2] as List<PaymentMethodStat>;
        _recent = (results[3] as TransactionPage).items;
        _budget = results[4] as BudgetSummary;
        _loadingCharts = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loadingCharts = false);
    }
  }

  Future<void> _refresh() async {
    await context.read<DataProvider>().refresh(silent: true);
    await _loadCharts();
  }

  Future<void> _openEditor({Transaction? existing, TxType? type}) async {
    final saved = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => TransactionEditor(existing: existing, initialType: type ?? TxType.expense),
      ),
    );
    if (saved == true) _refresh();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final data = context.watch<DataProvider>();
    final auth = context.watch<AuthProvider>();
    final totals = data.overview.forPeriod(_period);
    final periodLabel = _periods.firstWhere((p) => p.$1 == _period).$2;

    return Scaffold(
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _refresh,
          child: CustomScrollView(
            slivers: [
              SliverToBoxAdapter(child: _header(theme, auth, data)),

              SliverToBoxAdapter(child: _accountStrip(theme, data)),

              SliverToBoxAdapter(child: _balanceCard(theme, data, totals, periodLabel)),

              SliverToBoxAdapter(child: _quickActions(theme)),

              SliverToBoxAdapter(
                child: _card(
                  theme,
                  title: 'Income vs expense',
                  action: TextButton(
                    onPressed: () => Navigator.of(context).push(MaterialPageRoute(
                      builder: (_) => const ReportsScreen(),
                    )),
                    child: const Text('Full report'),
                  ),
                  child: _loadingCharts
                      ? const SizedBox(height: 190, child: Center(child: CircularProgressIndicator()))
                      : TrendChart(points: _trend),
                ),
              ),

              SliverToBoxAdapter(
                child: _card(
                  theme,
                  title: 'Where it went',
                  child: _loadingCharts
                      ? const SizedBox(height: 172, child: Center(child: CircularProgressIndicator()))
                      : CategoryDonut(slices: _categories),
                ),
              ),

              SliverToBoxAdapter(
                child: _card(
                  theme,
                  title: 'Payment methods',
                  child: _loadingCharts
                      ? const SizedBox(height: 176, child: Center(child: CircularProgressIndicator()))
                      : PaymentMethodBars(methods: _methods),
                ),
              ),

              if (_budget.overall != null)
                SliverToBoxAdapter(child: _budgetCard(theme, _budget.overall!)),

              SliverToBoxAdapter(
                child: _card(
                  theme,
                  title: 'Recent',
                  action: TextButton(
                    onPressed: () async {
                      await Navigator.of(context).push(MaterialPageRoute(
                        builder: (_) => const TransactionsScreen(),
                      ));
                      _refresh();
                    },
                    child: const Text('See all'),
                  ),
                  padded: false,
                  child: _recent.isEmpty
                      ? EmptyState(
                          icon: Icons.receipt_long_rounded,
                          title: 'No transactions yet',
                          message: 'Record your first income or expense.',
                          action: FilledButton(
                            onPressed: () => _openEditor(type: TxType.expense),
                            child: const Text('Add transaction'),
                          ),
                        )
                      : Column(
                          children: [
                            for (final tx in _recent)
                              TransactionTile(
                                tx: tx,
                                onTap: () => _openEditor(existing: tx),
                              ),
                          ],
                        ),
                ),
              ),

              const SliverToBoxAdapter(child: SizedBox(height: 90)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _header(ThemeData theme, AuthProvider auth, DataProvider data) {
    final hour = DateTime.now().hour;
    final greeting = hour < 12
        ? 'Good morning'
        : hour < 17
            ? 'Good afternoon'
            : 'Good evening';
    final first = (auth.user?.name ?? '').split(' ').first;

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 12, 12, 4),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('$greeting, $first',
                    style: theme.textTheme.titleLarge
                        ?.copyWith(fontWeight: FontWeight.w600)),
                const SizedBox(height: 2),
                Text('Here is where your money stands.',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurface.withValues(alpha: 0.55),
                    )),
              ],
            ),
          ),
          Stack(
            children: [
              IconButton(
                icon: const Icon(Icons.notifications_none_rounded),
                onPressed: () async {
                  await Navigator.of(context).push(MaterialPageRoute(
                    builder: (_) => const NotificationsScreen(),
                  ));
                  if (mounted) context.read<DataProvider>().markNotificationsRead();
                },
              ),
              if (data.unreadNotifications > 0)
                Positioned(
                  right: 8,
                  top: 8,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                    decoration: BoxDecoration(
                      color: theme.colorScheme.error,
                      borderRadius: BorderRadius.circular(999),
                    ),
                    constraints: const BoxConstraints(minWidth: 16),
                    child: Text(
                      data.unreadNotifications > 9 ? '9+' : '${data.unreadNotifications}',
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                          color: Colors.white, fontSize: 10, fontWeight: FontWeight.w700),
                    ),
                  ),
                ),
            ],
          ),
          IconButton(
            icon: const Icon(Icons.settings_outlined),
            onPressed: () => Navigator.of(context).push(MaterialPageRoute(
              builder: (_) => const SettingsScreen(),
            )),
          ),
        ],
      ),
    );
  }

  Widget _accountStrip(ThemeData theme, DataProvider data) {
    return SizedBox(
      height: 84,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        children: [
          _accountChip(
            theme,
            label: 'All accounts',
            amount: data.accounts.fold<double>(0, (s, a) => s + a.balance),
            selected: data.selectedAccountId == null,
            icon: Icons.layers_rounded,
            onTap: () async {
              await data.selectAccount(null);
              _loadCharts();
            },
          ),
          for (final a in data.accounts)
            _accountChip(
              theme,
              label: a.name,
              amount: a.balance,
              selected: data.selectedAccountId == a.id,
              icon: Icons.account_balance_wallet_rounded,
              isDefault: a.isDefault,
              onTap: () async {
                await data.selectAccount(a.id);
                _loadCharts();
              },
            ),
          Padding(
            padding: const EdgeInsets.only(left: 4),
            child: OutlinedButton.icon(
              onPressed: () async {
                await showAccountSheet(context);
                _refresh();
              },
              icon: const Icon(Icons.add_rounded, size: 18),
              label: const Text('Account'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _accountChip(
    ThemeData theme, {
    required String label,
    required double amount,
    required bool selected,
    required IconData icon,
    required VoidCallback onTap,
    bool isDefault = false,
  }) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          width: 156,
          padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 10),
          decoration: BoxDecoration(
            color: selected
                ? theme.colorScheme.primary.withValues(alpha: 0.08)
                : theme.colorScheme.surface,
            border: Border.all(
              color: selected ? theme.colorScheme.primary : theme.colorScheme.outline,
              width: selected ? 1.5 : 1,
            ),
            borderRadius: BorderRadius.circular(14),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Row(
                children: [
                  Icon(icon,
                      size: 13,
                      color: theme.colorScheme.onSurface.withValues(alpha: 0.5)),
                  const SizedBox(width: 5),
                  Expanded(
                    child: Text(
                      label,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: theme.colorScheme.onSurface.withValues(alpha: 0.6),
                      ),
                    ),
                  ),
                  if (isDefault)
                    const Icon(Icons.star_rounded, size: 12, color: Colors.amber),
                ],
              ),
              const SizedBox(height: 5),
              Text(
                Fmt.money(amount),
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w700,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _balanceCard(
      ThemeData theme, DataProvider data, PeriodTotals totals, String periodLabel) {
    final dark = theme.brightness == Brightness.dark;

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('BALANCE',
                      style: theme.textTheme.labelSmall?.copyWith(
                        letterSpacing: 1,
                        fontWeight: FontWeight.w600,
                        color: theme.colorScheme.onSurface.withValues(alpha: 0.5),
                      )),
                  DropdownButtonHideUnderline(
                    child: DropdownButton<String>(
                      value: _period,
                      isDense: true,
                      borderRadius: BorderRadius.circular(12),
                      style: theme.textTheme.labelMedium
                          ?.copyWith(color: theme.colorScheme.onSurface),
                      items: [
                        for (final p in _periods)
                          DropdownMenuItem(value: p.$1, child: Text(p.$2)),
                      ],
                      onChanged: (v) {
                        if (v == null) return;
                        setState(() => _period = v);
                        _loadCharts();
                      },
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                Fmt.money(data.overview.balance),
                style: theme.textTheme.headlineMedium?.copyWith(
                  fontWeight: FontWeight.w700,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: _miniStat(theme, 'Income · $periodLabel', totals.income,
                        AppColors.income(dark), Icons.south_west_rounded),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _miniStat(theme, 'Expense · $periodLabel', totals.expense,
                        AppColors.expense(dark), Icons.north_east_rounded),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _miniStat(
      ThemeData theme, String label, double value, Color colour, IconData icon) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: colour.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 13, color: colour),
              const SizedBox(width: 5),
              Expanded(
                child: Text(
                  label,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.labelSmall
                      ?.copyWith(color: colour, fontWeight: FontWeight.w600),
                ),
              ),
            ],
          ),
          const SizedBox(height: 3),
          Text(
            Fmt.money(value),
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.w700,
              color: colour,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
        ],
      ),
    );
  }

  Widget _quickActions(ThemeData theme) {
    final dark = theme.brightness == Brightness.dark;
    final actions = [
      (TxType.income, 'Income', Icons.south_west_rounded, AppColors.income(dark)),
      (TxType.expense, 'Expense', Icons.north_east_rounded, AppColors.expense(dark)),
      (TxType.transfer, 'Transfer', Icons.swap_horiz_rounded, theme.colorScheme.primary),
    ];

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
      child: Row(
        children: [
          for (final a in actions)
            Expanded(
              child: Padding(
                padding: EdgeInsets.only(right: a == actions.last ? 0 : 8),
                child: GestureDetector(
                  onTap: () => _openEditor(type: a.$1),
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    decoration: BoxDecoration(
                      color: theme.colorScheme.surface,
                      border: Border.all(color: theme.colorScheme.outline),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Column(
                      children: [
                        Icon(a.$3, size: 20, color: a.$4),
                        const SizedBox(height: 6),
                        Text(a.$2,
                            style: theme.textTheme.labelMedium
                                ?.copyWith(fontWeight: FontWeight.w600)),
                      ],
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _budgetCard(ThemeData theme, BudgetRow row) {
    // Budget usage is a STATE, so it wears status tokens — and the icon + label
    // mean the meaning never rests on colour alone.
    final (colour, label, icon) = row.percentUsed >= 100
        ? (AppColors.critical, 'Over budget', Icons.error_outline_rounded)
        : row.percentUsed >= 80
            ? (AppColors.warning, 'Nearly spent', Icons.warning_amber_rounded)
            : (AppColors.good, 'On track', Icons.check_circle_outline_rounded);

    return _card(
      theme,
      title: 'Monthly budget',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 15, color: colour),
              const SizedBox(width: 5),
              Text(label,
                  style: theme.textTheme.labelSmall
                      ?.copyWith(color: colour, fontWeight: FontWeight.w600)),
              const Spacer(),
              Text(
                '${row.percentUsed.round()}% used',
                style: theme.textTheme.labelSmall?.copyWith(
                  color: theme.colorScheme.onSurface.withValues(alpha: 0.55),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Text(Fmt.money(row.spent),
                  style: theme.textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w700,
                    fontFeatures: const [FontFeature.tabularFigures()],
                  )),
              const SizedBox(width: 6),
              Text('of ${Fmt.money(row.budget)}',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.55),
                  )),
            ],
          ),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: (row.percentUsed / 100).clamp(0, 1),
              minHeight: 7,
              backgroundColor: theme.colorScheme.onSurface.withValues(alpha: 0.07),
              valueColor: AlwaysStoppedAnimation(colour),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _budgetStat(theme, 'Per day so far', row.perDayAverage),
              ),
              Expanded(
                child: _budgetStat(theme, 'Left per day',
                    row.perDayRemaining < 0 ? 0 : row.perDayRemaining),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _budgetStat(ThemeData theme, String label, double value) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label,
              style: theme.textTheme.labelSmall?.copyWith(
                color: theme.colorScheme.onSurface.withValues(alpha: 0.55),
              )),
          const SizedBox(height: 2),
          Text(Fmt.money(value),
              style: theme.textTheme.bodyMedium?.copyWith(
                fontWeight: FontWeight.w600,
                fontFeatures: const [FontFeature.tabularFigures()],
              )),
        ],
      );

  Widget _card(
    ThemeData theme, {
    required String title,
    required Widget child,
    Widget? action,
    bool padded = true,
  }) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
      child: Card(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: EdgeInsets.fromLTRB(16, 14, action == null ? 16 : 6, 6),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(title,
                      style: theme.textTheme.titleSmall
                          ?.copyWith(fontWeight: FontWeight.w600)),
                  if (action != null) action,
                ],
              ),
            ),
            Padding(
              padding: EdgeInsets.fromLTRB(
                  padded ? 16 : 0, 0, padded ? 16 : 0, padded ? 16 : 8),
              child: child,
            ),
          ],
        ),
      ),
    );
  }
}

/// One ledger row. Shared by Home, Transactions and Calendar so a transaction
/// looks identical everywhere.
class TransactionTile extends StatelessWidget {
  const TransactionTile({
    super.key,
    required this.tx,
    this.onTap,
    this.showDate = true,
  });

  final Transaction tx;
  final VoidCallback? onTap;
  final bool showDate;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final dark = theme.brightness == Brightness.dark;

    final colour = tx.isTransfer
        ? theme.colorScheme.onSurface.withValues(alpha: 0.5)
        : AppColors.fromHex(
            tx.categoryColor,
            fallback: tx.isIncome ? AppColors.income(dark) : AppColors.expense(dark),
          );

    final subtitle = [
      if (tx.note != null && tx.note!.isNotEmpty) tx.note,
      if (tx.paymentMethodName != null) tx.paymentMethodName,
      if (showDate) Fmt.time(tx.occurredAt),
    ].whereType<String>().join(' · ');

    return ListTile(
      onTap: onTap,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 2),
      leading: CategoryAvatar(
        icon: tx.isTransfer ? Icons.swap_horiz_rounded : iconFor(tx.categoryIcon),
        color: colour,
      ),
      title: Text(
        tx.title,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
      ),
      subtitle: subtitle.isEmpty
          ? null
          : Text(
              subtitle,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurface.withValues(alpha: 0.55),
              ),
            ),
      trailing: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          AmountText(
            text: '${tx.isTransfer ? '' : (tx.isIncome ? '+' : '−')}'
                '${Fmt.money(tx.amount)}',
            isIncome: tx.isIncome,
            isTransfer: tx.isTransfer,
          ),
          if (tx.attachmentCount > 0 || tx.itemCount > 0) ...[
            const SizedBox(height: 3),
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (tx.itemCount > 0) ...[
                  Icon(Icons.list_alt_rounded,
                      size: 11,
                      color: theme.colorScheme.onSurface.withValues(alpha: 0.4)),
                  const SizedBox(width: 2),
                  Text('${tx.itemCount}',
                      style: theme.textTheme.labelSmall?.copyWith(
                        fontSize: 10,
                        color: theme.colorScheme.onSurface.withValues(alpha: 0.5),
                      )),
                  const SizedBox(width: 6),
                ],
                if (tx.attachmentCount > 0) ...[
                  Icon(Icons.attach_file_rounded,
                      size: 11,
                      color: theme.colorScheme.onSurface.withValues(alpha: 0.4)),
                  const SizedBox(width: 2),
                  Text('${tx.attachmentCount}',
                      style: theme.textTheme.labelSmall?.copyWith(
                        fontSize: 10,
                        color: theme.colorScheme.onSurface.withValues(alpha: 0.5),
                      )),
                ],
              ],
            ),
          ],
        ],
      ),
    );
  }
}
