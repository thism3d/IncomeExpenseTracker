import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:table_calendar/table_calendar.dart';

import '../../models/models.dart';
import '../../providers/data_provider.dart';
import '../../services/api_service.dart';
import '../../theme/app_theme.dart';
import '../../utils/formatters.dart';
import '../../widgets/common.dart';
import 'home_screen.dart' show TransactionTile;
import 'transaction_editor.dart';

/// The month view. Tap a day to see what happened, or add an entry dated to it —
/// exactly the README's calendar behaviour.
class CalendarScreen extends StatefulWidget {
  const CalendarScreen({super.key});

  @override
  State<CalendarScreen> createState() => _CalendarScreenState();
}

class _CalendarScreenState extends State<CalendarScreen> {
  DateTime _focused = DateTime.now();
  DateTime _selected = DateTime.now();

  CalendarMonth _month = const CalendarMonth();
  List<Transaction> _dayRows = [];
  bool _loadingMonth = true;
  bool _loadingDay = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadMonth();
      _loadDay();
    });
  }

  Future<void> _loadMonth() async {
    setState(() => _loadingMonth = true);
    try {
      final accountId = context.read<DataProvider>().selectedAccountId;
      final month = await ApiService.calendar(_focused, accountId: accountId);
      if (!mounted) return;
      setState(() {
        _month = month;
        _loadingMonth = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loadingMonth = false);
    }
  }

  Future<void> _loadDay() async {
    setState(() => _loadingDay = true);
    try {
      final accountId = context.read<DataProvider>().selectedAccountId;
      final from = DateTime(_selected.year, _selected.month, _selected.day);
      final to = from
          .add(const Duration(days: 1))
          .subtract(const Duration(milliseconds: 1));

      final page = await ApiService.transactions(
        from: from,
        to: to,
        limit: 50,
        accountId: accountId,
      );
      if (!mounted) return;
      setState(() {
        _dayRows = page.items;
        _loadingDay = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loadingDay = false);
    }
  }

  CalendarDay? _dataFor(DateTime day) {
    for (final d in _month.days) {
      if (isSameDay(d.date, day)) return d;
    }
    return null;
  }

  Future<void> _add(TxType type) async {
    final saved = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => TransactionEditor(
          initialType: type,
          // A new entry from the calendar defaults to the day you tapped.
          initialDate: DateTime(
            _selected.year,
            _selected.month,
            _selected.day,
            DateTime.now().hour,
            DateTime.now().minute,
          ),
        ),
      ),
    );
    if (saved == true) {
      _loadMonth();
      _loadDay();
      if (mounted) context.read<DataProvider>().refresh(silent: true);
    }
  }

  Future<void> _open(Transaction tx) async {
    final saved = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => TransactionEditor(existing: tx)),
    );
    if (saved == true) {
      _loadMonth();
      _loadDay();
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final dark = theme.brightness == Brightness.dark;
    final income = AppColors.income(dark);
    final expense = AppColors.expense(dark);

    return Scaffold(
      appBar: AppBar(title: const Text('Calendar')),
      body: SafeArea(
        child: Column(
          children: [
            Card(
              margin: const EdgeInsets.fromLTRB(12, 4, 12, 8),
              child: Column(
                children: [
                  TableCalendar<CalendarDay>(
                    firstDay: DateTime(2015),
                    lastDay: DateTime(2100),
                    focusedDay: _focused,
                    selectedDayPredicate: (d) => isSameDay(d, _selected),
                    startingDayOfWeek: StartingDayOfWeek.monday,
                    availableGestures: AvailableGestures.horizontalSwipe,
                    headerStyle: HeaderStyle(
                      formatButtonVisible: false,
                      titleCentered: true,
                      titleTextStyle: theme.textTheme.titleMedium!
                          .copyWith(fontWeight: FontWeight.w600),
                    ),
                    calendarStyle: CalendarStyle(
                      outsideDaysVisible: false,
                      todayDecoration: BoxDecoration(
                        color: theme.colorScheme.primary.withValues(alpha: 0.18),
                        shape: BoxShape.circle,
                      ),
                      todayTextStyle:
                          TextStyle(color: theme.colorScheme.onSurface),
                      selectedDecoration: BoxDecoration(
                        color: theme.colorScheme.primary,
                        shape: BoxShape.circle,
                      ),
                    ),
                    onDaySelected: (selected, focused) {
                      setState(() {
                        _selected = selected;
                        _focused = focused;
                      });
                      _loadDay();
                    },
                    onPageChanged: (focused) {
                      setState(() => _focused = focused);
                      _loadMonth();
                    },
                    calendarBuilders: CalendarBuilders(
                      // The day's money is spelled out under the number — never a
                      // colour-only dot, which would carry meaning by colour alone.
                      markerBuilder: (context, day, _) {
                        final data = _dataFor(day);
                        if (data == null) return null;
                        return Padding(
                          padding: const EdgeInsets.only(top: 26),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              if (data.income > 0)
                                Text(
                                  Fmt.money(data.income, compact: true)
                                      .replaceAll('.00', ''),
                                  style: TextStyle(
                                      fontSize: 8,
                                      height: 1.1,
                                      color: income,
                                      fontWeight: FontWeight.w600),
                                ),
                              if (data.expense > 0)
                                Text(
                                  Fmt.money(data.expense, compact: true)
                                      .replaceAll('.00', ''),
                                  style: TextStyle(
                                      fontSize: 8,
                                      height: 1.1,
                                      color: expense,
                                      fontWeight: FontWeight.w600),
                                ),
                            ],
                          ),
                        );
                      },
                    ),
                    rowHeight: 58,
                  ),

                  if (_loadingMonth)
                    const LinearProgressIndicator(minHeight: 2)
                  else
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 4, 16, 14),
                      child: Row(
                        children: [
                          Expanded(
                              child: _total(theme, 'Income', _month.income, income)),
                          Expanded(
                              child: _total(theme, 'Expense', _month.expense, expense)),
                          Expanded(
                            child: _total(
                              theme,
                              'Balance',
                              _month.balance,
                              _month.balance >= 0 ? income : expense,
                            ),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),

            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 6),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      Fmt.dateLong(_selected),
                      style: theme.textTheme.titleSmall
                          ?.copyWith(fontWeight: FontWeight.w600),
                    ),
                  ),
                  IconButton(
                    tooltip: 'Add income on this day',
                    icon: Icon(Icons.add_circle_outline_rounded, color: income),
                    onPressed: () => _add(TxType.income),
                  ),
                  IconButton(
                    tooltip: 'Add expense on this day',
                    icon: Icon(Icons.remove_circle_outline_rounded, color: expense),
                    onPressed: () => _add(TxType.expense),
                  ),
                ],
              ),
            ),

            Expanded(
              child: _loadingDay
                  ? const Center(child: CircularProgressIndicator())
                  : _dayRows.isEmpty
                      ? EmptyState(
                          icon: Icons.event_busy_rounded,
                          title: 'Nothing on this day',
                          message: 'Add an income or expense dated to it.',
                        )
                      : ListView(
                          padding: const EdgeInsets.only(bottom: 90),
                          children: [
                            for (final tx in _dayRows)
                              TransactionTile(tx: tx, onTap: () => _open(tx)),
                          ],
                        ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _total(ThemeData theme, String label, double value, Color colour) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label,
              style: theme.textTheme.labelSmall?.copyWith(
                color: theme.colorScheme.onSurface.withValues(alpha: 0.55),
              )),
          const SizedBox(height: 2),
          Text(
            Fmt.money(value, compact: true),
            style: theme.textTheme.bodyMedium?.copyWith(
              fontWeight: FontWeight.w700,
              color: colour,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
        ],
      );
}
