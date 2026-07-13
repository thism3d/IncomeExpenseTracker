import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../models/models.dart';
import '../../providers/data_provider.dart';
import '../../services/api_service.dart';
import '../../theme/app_theme.dart';
import '../../utils/formatters.dart';
import '../../widgets/common.dart';
import 'home_screen.dart' show TransactionTile;
import 'transaction_editor.dart';

/// The full ledger. Lazy-loads on scroll using the API's keyset cursor — stable
/// while new transactions arrive at the top, unlike OFFSET paging.
class TransactionsScreen extends StatefulWidget {
  const TransactionsScreen({super.key});

  @override
  State<TransactionsScreen> createState() => _TransactionsScreenState();
}

class _TransactionsScreenState extends State<TransactionsScreen> {
  final _scroll = ScrollController();
  final _search = TextEditingController();
  Timer? _debounce;

  final List<Transaction> _rows = [];
  String? _cursor;
  String? _cursorId;
  bool _hasMore = true;
  bool _loading = true;
  bool _loadingMore = false;

  TxType? _type;
  String? _accountId;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_onScroll);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _accountId = context.read<DataProvider>().selectedAccountId;
      _loadFirst();
    });
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _scroll.dispose();
    _search.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scroll.position.pixels >= _scroll.position.maxScrollExtent - 400) {
      _loadMore();
    }
  }

  Future<void> _loadFirst() async {
    setState(() => _loading = true);
    try {
      final page = await ApiService.transactions(
        type: _type,
        accountId: _accountId,
        search: _search.text.trim(),
      );
      if (!mounted) return;
      setState(() {
        _rows
          ..clear()
          ..addAll(page.items);
        _cursor = page.cursor;
        _cursorId = page.cursorId;
        _hasMore = page.hasMore;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _loadMore() async {
    if (_loadingMore || !_hasMore || _cursor == null) return;
    setState(() => _loadingMore = true);
    try {
      final page = await ApiService.transactions(
        type: _type,
        accountId: _accountId,
        search: _search.text.trim(),
        cursor: _cursor,
        cursorId: _cursorId,
      );
      if (!mounted) return;
      setState(() {
        _rows.addAll(page.items);
        _cursor = page.cursor;
        _cursorId = page.cursorId;
        _hasMore = page.hasMore;
        _loadingMore = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loadingMore = false);
    }
  }

  void _onSearchChanged(String _) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), _loadFirst);
  }

  Future<void> _open(Transaction tx) async {
    final saved = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => TransactionEditor(existing: tx)),
    );
    if (saved == true) _loadFirst();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final dark = theme.brightness == Brightness.dark;
    final data = context.watch<DataProvider>();

    // Group by day so a long ledger stays readable.
    final groups = <String, List<Transaction>>{};
    for (final tx in _rows) {
      final key = Fmt.relativeDay(tx.occurredAt);
      groups.putIfAbsent(key, () => []).add(tx);
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Transactions')),
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
              child: TextField(
                controller: _search,
                onChanged: _onSearchChanged,
                decoration: InputDecoration(
                  hintText: 'Search notes, categories, items…',
                  prefixIcon: const Icon(Icons.search_rounded),
                  isDense: true,
                  suffixIcon: _search.text.isEmpty
                      ? null
                      : IconButton(
                          icon: const Icon(Icons.close_rounded, size: 18),
                          onPressed: () {
                            _search.clear();
                            _loadFirst();
                          },
                        ),
                ),
              ),
            ),

            SizedBox(
              height: 42,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                children: [
                  _chip(theme, 'All', _type == null, () {
                    setState(() => _type = null);
                    _loadFirst();
                  }),
                  _chip(theme, 'Income', _type == TxType.income, () {
                    setState(() => _type = TxType.income);
                    _loadFirst();
                  }, colour: AppColors.income(dark)),
                  _chip(theme, 'Expense', _type == TxType.expense, () {
                    setState(() => _type = TxType.expense);
                    _loadFirst();
                  }, colour: AppColors.expense(dark)),
                  _chip(theme, 'Transfer', _type == TxType.transfer, () {
                    setState(() => _type = TxType.transfer);
                    _loadFirst();
                  }),
                  const SizedBox(width: 6),
                  _chip(
                    theme,
                    _accountId == null
                        ? 'All accounts'
                        : data.accounts
                                .where((a) => a.id == _accountId)
                                .firstOrNull
                                ?.name ??
                            'Account',
                    _accountId != null,
                    () => _pickAccount(data),
                    icon: Icons.account_balance_wallet_rounded,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 4),

            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _rows.isEmpty
                      ? EmptyState(
                          icon: Icons.receipt_long_rounded,
                          title: _search.text.isEmpty
                              ? 'No transactions yet'
                              : 'Nothing matches',
                          message: _search.text.isEmpty
                              ? 'Record your first income or expense.'
                              : 'Try a different search.',
                        )
                      : RefreshIndicator(
                          onRefresh: _loadFirst,
                          child: ListView.builder(
                            controller: _scroll,
                            padding: const EdgeInsets.only(bottom: 24),
                            itemCount: groups.length + 1,
                            itemBuilder: (context, index) {
                              if (index == groups.length) {
                                return Padding(
                                  padding: const EdgeInsets.symmetric(vertical: 18),
                                  child: Center(
                                    child: _loadingMore
                                        ? const SizedBox(
                                            width: 22, height: 22,
                                            child: CircularProgressIndicator(
                                                strokeWidth: 2.2))
                                        : !_hasMore && _rows.length > 8
                                            ? Text(
                                                'That is everything.',
                                                style: theme.textTheme.bodySmall
                                                    ?.copyWith(
                                                  color: theme.colorScheme.onSurface
                                                      .withValues(alpha: 0.4),
                                                ),
                                              )
                                            : const SizedBox.shrink(),
                                  ),
                                );
                              }

                              final key = groups.keys.elementAt(index);
                              final rows = groups[key]!;
                              final income = rows
                                  .where((t) => t.isIncome)
                                  .fold<double>(0, (s, t) => s + t.amount);
                              final expense = rows
                                  .where((t) => t.type == TxType.expense)
                                  .fold<double>(0, (s, t) => s + t.amount);

                              return Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Padding(
                                    padding:
                                        const EdgeInsets.fromLTRB(20, 14, 20, 4),
                                    child: Row(
                                      mainAxisAlignment:
                                          MainAxisAlignment.spaceBetween,
                                      children: [
                                        Text(
                                          key.toUpperCase(),
                                          style: theme.textTheme.labelSmall?.copyWith(
                                            letterSpacing: 0.8,
                                            fontWeight: FontWeight.w700,
                                            color: theme.colorScheme.onSurface
                                                .withValues(alpha: 0.45),
                                          ),
                                        ),
                                        Row(
                                          children: [
                                            if (income > 0)
                                              Text(
                                                '+${Fmt.money(income, compact: true)}',
                                                style: theme.textTheme.labelSmall
                                                    ?.copyWith(
                                                  color: AppColors.income(dark),
                                                  fontWeight: FontWeight.w600,
                                                ),
                                              ),
                                            if (income > 0 && expense > 0)
                                              const SizedBox(width: 8),
                                            if (expense > 0)
                                              Text(
                                                '−${Fmt.money(expense, compact: true)}',
                                                style: theme.textTheme.labelSmall
                                                    ?.copyWith(
                                                  color: AppColors.expense(dark),
                                                  fontWeight: FontWeight.w600,
                                                ),
                                              ),
                                          ],
                                        ),
                                      ],
                                    ),
                                  ),
                                  for (final tx in rows)
                                    TransactionTile(tx: tx, onTap: () => _open(tx)),
                                ],
                              );
                            },
                          ),
                        ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _pickAccount(DataProvider data) async {
    final picked = await showModalBottomSheet<String?>(
      context: context,
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.layers_rounded),
              title: const Text('All accounts'),
              onTap: () => Navigator.of(sheetContext).pop(''),
            ),
            for (final a in data.accounts)
              ListTile(
                leading: const Icon(Icons.account_balance_wallet_rounded),
                title: Text(a.name),
                subtitle: Text(Fmt.money(a.balance)),
                onTap: () => Navigator.of(sheetContext).pop(a.id),
              ),
          ],
        ),
      ),
    );

    if (picked == null || !mounted) return;
    setState(() => _accountId = picked.isEmpty ? null : picked);
    _loadFirst();
  }

  Widget _chip(
    ThemeData theme,
    String label,
    bool selected,
    VoidCallback onTap, {
    Color? colour,
    IconData? icon,
  }) {
    final accent = colour ?? theme.colorScheme.primary;
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            color: selected ? accent.withValues(alpha: 0.12) : null,
            border: Border.all(
              color: selected ? accent : theme.colorScheme.outline,
            ),
            borderRadius: BorderRadius.circular(999),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (icon != null) ...[
                Icon(icon, size: 14, color: selected ? accent : null),
                const SizedBox(width: 5),
              ],
              Text(
                label,
                style: theme.textTheme.labelMedium?.copyWith(
                  fontWeight: FontWeight.w600,
                  color: selected ? accent : null,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
