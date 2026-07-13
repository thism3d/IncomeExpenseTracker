import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../models/models.dart';
import '../../providers/data_provider.dart';
import '../../services/notification_service.dart';
import 'calendar_screen.dart';
import 'drive_screen.dart';
import 'home_screen.dart';
import 'transaction_editor.dart';

/// The three tabs the README asks for: Home / Calendar / Drive.
class MainShell extends StatefulWidget {
  const MainShell({super.key});

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> {
  int _index = 0;

  @override
  void initState() {
    super.initState();
    // Load the shared data once the shell mounts, not in build.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<DataProvider>().load();
      NotificationService.instance.requestPermission();
    });
  }

  Future<void> _add(TxType type) async {
    final saved = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => TransactionEditor(initialType: type)),
    );
    if (saved == true && mounted) {
      context.read<DataProvider>().refresh(silent: true);
    }
  }

  void _showAddSheet() {
    showModalBottomSheet<void>(
      context: context,
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 6),
            for (final entry in [
              (TxType.income, Icons.south_west_rounded, 'Add income', 'Money in'),
              (TxType.expense, Icons.north_east_rounded, 'Add expense', 'Money out'),
              (TxType.transfer, Icons.swap_horiz_rounded, 'Transfer', 'Between your accounts'),
            ])
              ListTile(
                leading: CircleAvatar(
                  backgroundColor: Theme.of(sheetContext)
                      .colorScheme
                      .primary
                      .withValues(alpha: 0.12),
                  child: Icon(entry.$2,
                      size: 20, color: Theme.of(sheetContext).colorScheme.primary),
                ),
                title: Text(entry.$3,
                    style: const TextStyle(fontWeight: FontWeight.w600)),
                subtitle: Text(entry.$4),
                onTap: () {
                  Navigator.of(sheetContext).pop();
                  _add(entry.$1);
                },
              ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: _index,
        children: const [
          HomeScreen(),
          CalendarScreen(),
          DriveScreen(),
        ],
      ),

      floatingActionButton: FloatingActionButton(
        onPressed: _showAddSheet,
        child: const Icon(Icons.add_rounded),
      ),

      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.home_outlined),
            selectedIcon: Icon(Icons.home_rounded),
            label: 'Home',
          ),
          NavigationDestination(
            icon: Icon(Icons.calendar_month_outlined),
            selectedIcon: Icon(Icons.calendar_month_rounded),
            label: 'Calendar',
          ),
          NavigationDestination(
            icon: Icon(Icons.folder_outlined),
            selectedIcon: Icon(Icons.folder_rounded),
            label: 'Drive',
          ),
        ],
      ),
    );
  }
}
