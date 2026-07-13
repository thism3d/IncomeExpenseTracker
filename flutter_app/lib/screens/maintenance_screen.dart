import 'package:flutter/material.dart';

import '../services/api_service.dart';

/// A full-screen curtain while the backend is in maintenance. It polls, so the
/// user gets back in the moment the admin turns it off — no restart needed.
class MaintenanceScreen extends StatefulWidget {
  const MaintenanceScreen({super.key});

  @override
  State<MaintenanceScreen> createState() => _MaintenanceScreenState();
}

class _MaintenanceScreenState extends State<MaintenanceScreen> {
  String _message = 'We are performing scheduled maintenance. Please check back shortly.';
  bool _checking = false;

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  Future<void> _refresh() async {
    setState(() => _checking = true);
    try {
      final config = await ApiService.appConfig();
      if (!mounted) return;
      if (config.maintenanceMessage.isNotEmpty) {
        setState(() => _message = config.maintenanceMessage);
      }
    } catch (_) {
      // Still down, or offline. The message we have is good enough.
    } finally {
      if (mounted) setState(() => _checking = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 66,
                  height: 66,
                  decoration: BoxDecoration(
                    color: theme.colorScheme.primary.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Icon(Icons.build_rounded,
                      color: theme.colorScheme.primary, size: 30),
                ),
                const SizedBox(height: 24),
                Text(
                  'Back shortly',
                  style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 10),
                Text(
                  _message,
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.65),
                    height: 1.55,
                  ),
                ),
                const SizedBox(height: 30),
                OutlinedButton.icon(
                  onPressed: _checking ? null : _refresh,
                  icon: _checking
                      ? const SizedBox(
                          width: 15, height: 15,
                          child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.refresh_rounded, size: 18),
                  label: const Text('Check again'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
