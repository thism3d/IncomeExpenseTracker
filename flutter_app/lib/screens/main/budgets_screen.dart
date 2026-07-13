import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../models/models.dart';
import '../../providers/data_provider.dart';
import '../../services/api_service.dart';
import '../../services/ws_client.dart' show ApiException;
import '../../theme/app_theme.dart';
import '../../utils/category_icons.dart';
import '../../utils/formatters.dart';
import '../../widgets/common.dart';
import '../../widgets/picker_sheet.dart';

class BudgetsScreen extends StatefulWidget {
  const BudgetsScreen({super.key});

  @override
  State<BudgetsScreen> createState() => _BudgetsScreenState();
}

class _BudgetsScreenState extends State<BudgetsScreen> {
  BudgetSummary _summary = const BudgetSummary();
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final summary = await ApiService.budget();
      if (!mounted) return;
      setState(() {
        _summary = summary;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _setBudget({String? categoryId, double? current}) async {
    final controller =
        TextEditingController(text: current == null ? '' : current.toStringAsFixed(0));

    final amount = await showDialog<double>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(categoryId == null ? 'Overall monthly budget' : 'Category budget'),
        content: TextField(
          controller: controller,
          autofocus: true,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: InputDecoration(
            prefixText: '${Fmt.money(0).substring(0, 1)} ',
            hintText: '0.00',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext)
                .pop(double.tryParse(controller.text.trim())),
            child: const Text('Save'),
          ),
        ],
      ),
    );

    controller.dispose();
    if (amount == null || amount <= 0 || !mounted) return;

    try {
      await ApiService.setBudget(categoryId: categoryId, amount: amount);
      if (!mounted) return;
      showSnack(context, 'Budget saved');
      _load();
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.message, error: true);
    }
  }

  Future<void> _addCategoryBudget() async {
    final data = context.read<DataProvider>();
    final existing = _summary.categories.map((b) => b.categoryId).toSet();
    final options = data
        .categoriesFor(TxType.expense)
        .where((c) => !existing.contains(c.id))
        .toList();

    if (options.isEmpty) {
      showSnack(context, 'Every expense category already has a budget');
      return;
    }

    final picked = await showPickerSheet<Category>(
      context,
      title: 'Budget for…',
      items: options,
      labelOf: (c) => c.name,
      idOf: (c) => c.id,
      iconOf: (c) => iconFor(c.icon),
      colourOf: (c) => AppColors.fromHex(c.color),
    );
    if (picked == null || !mounted) return;
    await _setBudget(categoryId: picked.id);
  }

  Future<void> _remove(BudgetRow row) async {
    try {
      await ApiService.deleteBudget(row.id);
      if (!mounted) return;
      showSnack(context, 'Budget removed');
      _load();
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.message, error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Budgets'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add_rounded),
            onPressed: _addCategoryBudget,
          ),
        ],
      ),
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : RefreshIndicator(
                onRefresh: _load,
                child: ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    Text(
                      'Set a monthly ceiling overall, or per category. '
                      'You are alerted at 90%.',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurface.withValues(alpha: 0.6),
                        height: 1.45,
                      ),
                    ),
                    const SizedBox(height: 16),

                    if (_summary.overall == null)
                      Card(
                        child: ListTile(
                          leading: CategoryAvatar(
                            icon: Icons.savings_rounded,
                            color: theme.colorScheme.primary,
                          ),
                          title: const Text('Set an overall budget',
                              style: TextStyle(fontWeight: FontWeight.w600)),
                          subtitle: const Text('Track all of your spending together'),
                          trailing: const Icon(Icons.add_rounded),
                          onTap: () => _setBudget(),
                        ),
                      )
                    else
                      _budgetCard(theme, _summary.overall!, overall: true),

                    if (_summary.categories.isNotEmpty) ...[
                      const SizedBox(height: 18),
                      Text(
                        'BY CATEGORY',
                        style: theme.textTheme.labelSmall?.copyWith(
                          letterSpacing: 1,
                          fontWeight: FontWeight.w700,
                          color: theme.colorScheme.onSurface.withValues(alpha: 0.45),
                        ),
                      ),
                      const SizedBox(height: 8),
                      for (final row in _summary.categories) _budgetCard(theme, row),
                    ],

                    if (_summary.overall == null && _summary.categories.isEmpty)
                      const Padding(
                        padding: EdgeInsets.only(top: 40),
                        child: EmptyState(
                          icon: Icons.savings_rounded,
                          title: 'No budgets yet',
                          message:
                              'Set a monthly limit and watch how much is left, and what you can still spend per day.',
                        ),
                      ),
                  ],
                ),
              ),
      ),
    );
  }

  Widget _budgetCard(ThemeData theme, BudgetRow row, {bool overall = false}) {
    // Budget usage is a STATE — status tokens, always with an icon and a label,
    // so the meaning never rests on colour alone.
    final (colour, label, icon) = row.percentUsed >= 100
        ? (AppColors.critical, 'Over budget', Icons.error_outline_rounded)
        : row.percentUsed >= 80
            ? (AppColors.warning, 'Nearly spent', Icons.warning_amber_rounded)
            : (AppColors.good, 'On track', Icons.check_circle_outline_rounded);

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  CategoryAvatar(
                    icon: overall
                        ? Icons.savings_rounded
                        : iconFor(row.categoryIcon),
                    color: overall
                        ? theme.colorScheme.primary
                        : AppColors.fromHex(row.categoryColor),
                    size: 38,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          row.categoryName ?? 'Overall budget',
                          style: theme.textTheme.bodyMedium
                              ?.copyWith(fontWeight: FontWeight.w600),
                        ),
                        Row(
                          children: [
                            Icon(icon, size: 13, color: colour),
                            const SizedBox(width: 4),
                            Text(label,
                                style: theme.textTheme.labelSmall?.copyWith(
                                  color: colour,
                                  fontWeight: FontWeight.w600,
                                )),
                          ],
                        ),
                      ],
                    ),
                  ),
                  PopupMenuButton<String>(
                    itemBuilder: (_) => const [
                      PopupMenuItem(value: 'edit', child: Text('Change amount')),
                      PopupMenuItem(value: 'remove', child: Text('Remove')),
                    ],
                    onSelected: (action) {
                      if (action == 'edit') {
                        _setBudget(categoryId: row.categoryId, current: row.budget);
                      } else {
                        _remove(row);
                      }
                    },
                  ),
                ],
              ),
              const SizedBox(height: 12),

              Row(
                crossAxisAlignment: CrossAxisAlignment.baseline,
                textBaseline: TextBaseline.alphabetic,
                children: [
                  Text(
                    Fmt.money(row.spent),
                    style: theme.textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.w700,
                      fontFeatures: const [FontFeature.tabularFigures()],
                    ),
                  ),
                  const SizedBox(width: 6),
                  Text('of ${Fmt.money(row.budget)}',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurface.withValues(alpha: 0.55),
                      )),
                ],
              ),
              const SizedBox(height: 8),

              ClipRRect(
                borderRadius: BorderRadius.circular(999),
                child: LinearProgressIndicator(
                  value: (row.percentUsed / 100).clamp(0, 1),
                  minHeight: 7,
                  backgroundColor:
                      theme.colorScheme.onSurface.withValues(alpha: 0.07),
                  valueColor: AlwaysStoppedAnimation(colour),
                ),
              ),
              const SizedBox(height: 6),
              Text(
                '${row.percentUsed.round()}% used · '
                '${row.remaining >= 0 ? '${Fmt.money(row.remaining)} left' : '${Fmt.money(row.remaining.abs())} over'}',
                style: theme.textTheme.labelSmall?.copyWith(
                  color: theme.colorScheme.onSurface.withValues(alpha: 0.55),
                ),
              ),

              const Divider(height: 22),
              Row(
                children: [
                  Expanded(
                    child: _stat(theme, 'Per day so far', row.perDayAverage),
                  ),
                  Expanded(
                    child: _stat(theme, 'Left per day',
                        row.perDayRemaining < 0 ? 0 : row.perDayRemaining),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _stat(ThemeData theme, String label, double value) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label,
              style: theme.textTheme.labelSmall?.copyWith(
                color: theme.colorScheme.onSurface.withValues(alpha: 0.55),
              )),
          const SizedBox(height: 2),
          Text(
            Fmt.money(value),
            style: theme.textTheme.bodyMedium?.copyWith(
              fontWeight: FontWeight.w600,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
        ],
      );
}
