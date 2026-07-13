import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';

import '../../models/models.dart';
import '../../providers/data_provider.dart';
import '../../services/api_service.dart';
import '../../services/ws_client.dart' show ApiException;
import '../../theme/app_theme.dart';
import '../../utils/category_icons.dart';
import '../../utils/formatters.dart';
import '../../widgets/charts.dart';
import '../../widgets/common.dart';

const _periods = [
  ('daily', 'Daily'),
  ('weekly', 'Weekly'),
  ('monthly', 'Monthly'),
  ('yearly', 'Yearly'),
];

/// The income-tax report. Charts on screen, and the same numbers exportable as a
/// PDF statement or an Excel workbook — the reason this app exists.
class ReportsScreen extends StatefulWidget {
  const ReportsScreen({super.key});

  @override
  State<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends State<ReportsScreen> {
  String _period = 'monthly';
  TxType _breakdown = TxType.expense;

  List<TrendPoint> _trend = [];
  List<CategorySlice> _categories = [];
  List<PaymentMethodStat> _methods = [];
  bool _loading = true;
  String? _exporting;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final accountId = context.read<DataProvider>().selectedAccountId;
    try {
      final results = await Future.wait([
        ApiService.trend(period: _period, accountId: accountId),
        ApiService.categoryBreakdown(
            period: _period, type: _breakdown, accountId: accountId),
        ApiService.paymentMethodBreakdown(period: _period, accountId: accountId),
      ]);
      if (!mounted) return;
      setState(() {
        _trend = results[0] as List<TrendPoint>;
        _categories = results[1] as List<CategorySlice>;
        _methods = results[2] as List<PaymentMethodStat>;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _export(String format) async {
    setState(() => _exporting = format);
    try {
      final accountId = context.read<DataProvider>().selectedAccountId;
      final file = await ApiService.exportReport(
        format: format,
        period: _period,
        accountId: accountId,
      );
      if (!mounted) return;

      // Hand it to the OS share sheet: the lawyer emails it to their accountant,
      // saves it to Drive, or prints it — all of which are outside our app.
      await Share.shareXFiles(
        [XFile(file.path)],
        text: 'SisirBindu income & expense statement',
        subject: 'Income & expense statement',
      );
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.message, error: true);
    } catch (_) {
      if (mounted) showSnack(context, 'Could not generate the report', error: true);
    } finally {
      if (mounted) setState(() => _exporting = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final dark = theme.brightness == Brightness.dark;
    final data = context.watch<DataProvider>();
    final totals = data.overview.forPeriod(_period);

    final total = _categories.fold<double>(0, (s, c) => s + c.total);

    return Scaffold(
      appBar: AppBar(title: const Text('Reports')),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _load,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
            children: [
              // Period filter
              SizedBox(
                height: 40,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  children: [
                    for (final p in _periods)
                      Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: ChoiceChip(
                          label: Text(p.$2),
                          selected: _period == p.$1,
                          onSelected: (_) {
                            setState(() => _period = p.$1);
                            _load();
                          },
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 12),

              // Summary
              Row(
                children: [
                  Expanded(
                    child: _tile(theme, 'Income', totals.income,
                        AppColors.income(dark), Icons.trending_up_rounded),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _tile(theme, 'Expense', totals.expense,
                        AppColors.expense(dark), Icons.trending_down_rounded),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              _tile(
                theme,
                'Net',
                totals.net,
                totals.net >= 0 ? AppColors.income(dark) : AppColors.expense(dark),
                Icons.account_balance_wallet_rounded,
                wide: true,
              ),
              const SizedBox(height: 14),

              _card(theme, 'Income vs expense',
                  _loading
                      ? const SizedBox(
                          height: 190, child: Center(child: CircularProgressIndicator()))
                      : TrendChart(points: _trend, height: 210)),

              _card(
                theme,
                'By category',
                Column(
                  children: [
                    SegmentedButton<TxType>(
                      segments: const [
                        ButtonSegment(value: TxType.expense, label: Text('Expense')),
                        ButtonSegment(value: TxType.income, label: Text('Income')),
                      ],
                      selected: {_breakdown},
                      onSelectionChanged: (s) {
                        setState(() => _breakdown = s.first);
                        _load();
                      },
                    ),
                    const SizedBox(height: 14),
                    if (_loading)
                      const SizedBox(
                          height: 172, child: Center(child: CircularProgressIndicator()))
                    else
                      CategoryDonut(slices: _categories),
                  ],
                ),
              ),

              _card(theme, 'Payment methods',
                  _loading
                      ? const SizedBox(
                          height: 176, child: Center(child: CircularProgressIndicator()))
                      : PaymentMethodBars(methods: _methods)),

              // The table view — the relief channel for the low-contrast chart
              // slots, and the thing an accountant will actually read.
              if (_categories.isNotEmpty)
                _card(
                  theme,
                  'Category detail',
                  Column(
                    children: [
                      for (final c in _categories)
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 5),
                          child: Row(
                            children: [
                              CategoryAvatar(
                                icon: iconFor(c.icon),
                                color: AppColors.fromHex(c.color),
                                size: 34,
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(c.name,
                                        style: theme.textTheme.bodyMedium
                                            ?.copyWith(fontWeight: FontWeight.w600)),
                                    Text(
                                      '${c.count} entr${c.count == 1 ? 'y' : 'ies'} · ${c.percent.toStringAsFixed(1)}%',
                                      style: theme.textTheme.labelSmall?.copyWith(
                                        color: theme.colorScheme.onSurface
                                            .withValues(alpha: 0.5),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              Text(
                                Fmt.money(c.total),
                                style: theme.textTheme.bodyMedium?.copyWith(
                                  fontWeight: FontWeight.w700,
                                  color: _breakdown == TxType.income
                                      ? AppColors.income(dark)
                                      : AppColors.expense(dark),
                                  fontFeatures: const [FontFeature.tabularFigures()],
                                ),
                              ),
                            ],
                          ),
                        ),
                      const Divider(height: 22),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('Total',
                              style: theme.textTheme.bodyMedium
                                  ?.copyWith(fontWeight: FontWeight.w700)),
                          Text(
                            Fmt.money(total),
                            style: theme.textTheme.titleSmall?.copyWith(
                              fontWeight: FontWeight.w700,
                              fontFeatures: const [FontFeature.tabularFigures()],
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),

              // Export
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Icon(Icons.download_rounded,
                              size: 20, color: theme.colorScheme.primary),
                          const SizedBox(width: 8),
                          Text('Ready for the tax office',
                              style: theme.textTheme.titleSmall
                                  ?.copyWith(fontWeight: FontWeight.w600)),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Text(
                        'The PDF is a formatted statement with your summary, breakdowns and full ledger. '
                        'The Excel workbook has live formulas, so the figures recompute when you filter rows.',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onSurface.withValues(alpha: 0.6),
                          height: 1.45,
                        ),
                      ),
                      const SizedBox(height: 14),
                      Row(
                        children: [
                          Expanded(
                            child: OutlinedButton.icon(
                              onPressed:
                                  _exporting != null ? null : () => _export('pdf'),
                              icon: _exporting == 'pdf'
                                  ? const SizedBox(
                                      width: 16, height: 16,
                                      child: CircularProgressIndicator(strokeWidth: 2))
                                  : const Icon(Icons.picture_as_pdf_rounded, size: 18),
                              label: const Text('PDF'),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: FilledButton.icon(
                              onPressed:
                                  _exporting != null ? null : () => _export('excel'),
                              icon: _exporting == 'excel'
                                  ? const SizedBox(
                                      width: 16, height: 16,
                                      child: CircularProgressIndicator(
                                          strokeWidth: 2, color: Colors.white))
                                  : const Icon(Icons.table_chart_rounded, size: 18),
                              label: const Text('Excel'),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _tile(
    ThemeData theme,
    String label,
    double value,
    Color colour,
    IconData icon, {
    bool wide = false,
  }) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: colour.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        children: [
          Icon(icon, size: 18, color: colour),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label,
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: colour,
                      fontWeight: FontWeight.w600,
                    )),
                const SizedBox(height: 2),
                Text(
                  Fmt.money(value),
                  overflow: TextOverflow.ellipsis,
                  style: (wide
                          ? theme.textTheme.titleLarge
                          : theme.textTheme.titleSmall)
                      ?.copyWith(
                    fontWeight: FontWeight.w700,
                    color: colour,
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _card(ThemeData theme, String title, Widget child) => Padding(
        padding: const EdgeInsets.only(bottom: 14),
        child: Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title,
                    style: theme.textTheme.titleSmall
                        ?.copyWith(fontWeight: FontWeight.w600)),
                const SizedBox(height: 12),
                child,
              ],
            ),
          ),
        ),
      );
}
