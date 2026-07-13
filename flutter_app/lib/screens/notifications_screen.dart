import 'package:flutter/material.dart';

import '../models/models.dart';
import '../services/api_service.dart';
import '../utils/formatters.dart';
import '../widgets/common.dart';

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  List<AppNotification> _items = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final page = await ApiService.notifications();
      if (!mounted) return;
      setState(() {
        _items = page.items;
        _loading = false;
      });
      // Opening the screen is the acknowledgement.
      if (page.unreadCount > 0) await ApiService.markAllRead();
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  IconData _iconFor(String type) => switch (type) {
        'BUDGET_ALERT' => Icons.warning_amber_rounded,
        'RECURRING' => Icons.repeat_rounded,
        'REMINDER' => Icons.notifications_active_rounded,
        'ADMIN_BROADCAST' => Icons.campaign_rounded,
        _ => Icons.info_outline_rounded,
      };

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('Notifications')),
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _items.isEmpty
                ? const EmptyState(
                    icon: Icons.notifications_none_rounded,
                    title: 'All caught up',
                    message: 'You have no notifications.',
                  )
                : RefreshIndicator(
                    onRefresh: _load,
                    child: ListView.separated(
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      itemCount: _items.length,
                      separatorBuilder: (_, __) => const Divider(height: 1, indent: 68),
                      itemBuilder: (context, i) {
                        final n = _items[i];
                        return ListTile(
                          leading: CategoryAvatar(
                            icon: _iconFor(n.type),
                            color: theme.colorScheme.primary,
                          ),
                          title: Text(n.title,
                              style: const TextStyle(fontWeight: FontWeight.w600)),
                          subtitle: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const SizedBox(height: 2),
                              Text(n.message,
                                  style: theme.textTheme.bodySmall?.copyWith(
                                    height: 1.35,
                                    color: theme.colorScheme.onSurface
                                        .withValues(alpha: 0.65),
                                  )),
                              const SizedBox(height: 4),
                              Text(
                                Fmt.relativeTime(n.createdAt),
                                style: theme.textTheme.labelSmall?.copyWith(
                                  color: theme.colorScheme.onSurface
                                      .withValues(alpha: 0.45),
                                ),
                              ),
                            ],
                          ),
                          isThreeLine: true,
                        );
                      },
                    ),
                  ),
      ),
    );
  }
}
