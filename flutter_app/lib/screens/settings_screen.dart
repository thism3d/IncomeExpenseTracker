import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/auth_provider.dart';
import '../providers/data_provider.dart';
import '../providers/theme_provider.dart';
import '../services/lock_service.dart';
import '../utils/constants.dart';
import '../utils/formatters.dart';
import '../widgets/common.dart';
import '../widgets/pin_pad.dart';
import 'main/account_sheet.dart';
import 'main/budgets_screen.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final auth = context.watch<AuthProvider>();
    final themeProvider = context.watch<ThemeProvider>();
    final user = auth.user;

    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: SafeArea(
        child: ListView(
          children: [
            // Profile
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
              child: Row(
                children: [
                  Container(
                    width: 58,
                    height: 58,
                    decoration: BoxDecoration(
                      color: theme.colorScheme.primary.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(18),
                    ),
                    alignment: Alignment.center,
                    child: Text(
                      Fmt.initials(user?.name ?? '?'),
                      style: theme.textTheme.titleLarge?.copyWith(
                        color: theme.colorScheme.primary,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(user?.name ?? '',
                            style: theme.textTheme.titleMedium
                                ?.copyWith(fontWeight: FontWeight.w600)),
                        const SizedBox(height: 2),
                        Text(
                          user?.email ?? Fmt.phone(user?.phone),
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: theme.colorScheme.onSurface.withValues(alpha: 0.6),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),

            _section(theme, 'Money'),
            _tile(
              context,
              icon: Icons.account_balance_wallet_rounded,
              title: 'Accounts',
              subtitle: '${context.watch<DataProvider>().accounts.length} account(s)',
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const AccountsScreen()),
              ),
            ),
            _tile(
              context,
              icon: Icons.savings_rounded,
              title: 'Budgets',
              subtitle: 'Monthly limits and alerts',
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const BudgetsScreen()),
              ),
            ),

            _section(theme, 'Security'),
            _LockSettings(),

            _section(theme, 'Appearance'),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              child: SegmentedButton<ThemeMode>(
                segments: const [
                  ButtonSegment(
                      value: ThemeMode.light,
                      icon: Icon(Icons.light_mode_rounded, size: 17),
                      label: Text('Light')),
                  ButtonSegment(
                      value: ThemeMode.dark,
                      icon: Icon(Icons.dark_mode_rounded, size: 17),
                      label: Text('Dark')),
                  ButtonSegment(
                      value: ThemeMode.system,
                      icon: Icon(Icons.brightness_auto_rounded, size: 17),
                      label: Text('System')),
                ],
                selected: {themeProvider.mode},
                onSelectionChanged: (s) => themeProvider.set(s.first),
              ),
            ),

            _section(theme, 'About'),
            _tile(
              context,
              icon: Icons.info_outline_rounded,
              title: AppConstants.appName,
              subtitle: 'Version ${AppConstants.appVersion} '
                  '(build ${AppConstants.appBuildNumber})',
            ),

            const SizedBox(height: 20),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: OutlinedButton.icon(
                onPressed: () async {
                  final confirmed = await showDialog<bool>(
                    context: context,
                    builder: (dialogContext) => AlertDialog(
                      title: const Text('Sign out?'),
                      content: const Text(
                          'You will need your password to sign back in.'),
                      actions: [
                        TextButton(
                          onPressed: () => Navigator.of(dialogContext).pop(false),
                          child: const Text('Cancel'),
                        ),
                        FilledButton(
                          onPressed: () => Navigator.of(dialogContext).pop(true),
                          child: const Text('Sign out'),
                        ),
                      ],
                    ),
                  );
                  if (confirmed != true || !context.mounted) return;
                  context.read<DataProvider>().reset();
                  await context.read<AuthProvider>().logout();
                },
                icon: Icon(Icons.logout_rounded, color: theme.colorScheme.error),
                label: Text('Sign out',
                    style: TextStyle(color: theme.colorScheme.error)),
              ),
            ),
            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }

  Widget _section(ThemeData theme, String label) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 18, 20, 6),
        child: Text(
          label.toUpperCase(),
          style: theme.textTheme.labelSmall?.copyWith(
            letterSpacing: 1,
            fontWeight: FontWeight.w700,
            color: theme.colorScheme.onSurface.withValues(alpha: 0.45),
          ),
        ),
      );

  Widget _tile(
    BuildContext context, {
    required IconData icon,
    required String title,
    String? subtitle,
    VoidCallback? onTap,
  }) {
    final theme = Theme.of(context);
    return ListTile(
      leading: CategoryAvatar(icon: icon, color: theme.colorScheme.primary, size: 40),
      title: Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
      subtitle: subtitle == null ? null : Text(subtitle),
      trailing: onTap == null
          ? null
          : Icon(Icons.chevron_right_rounded,
              color: theme.colorScheme.onSurface.withValues(alpha: 0.3)),
      onTap: onTap,
    );
  }
}

/// Biometric toggle + change PIN.
class _LockSettings extends StatefulWidget {
  @override
  State<_LockSettings> createState() => _LockSettingsState();
}

class _LockSettingsState extends State<_LockSettings> {
  bool _available = false;
  String _label = 'Biometric unlock';

  @override
  void initState() {
    super.initState();
    _probe();
  }

  Future<void> _probe() async {
    final lock = LockService.instance;
    final can = await lock.canUseBiometrics;
    final enrolled = await lock.hasEnrolledBiometrics();
    final label = await lock.biometricLabel();
    if (!mounted) return;
    setState(() {
      _available = can && enrolled;
      _label = label;
    });
  }

  Future<void> _toggleBiometric(bool value) async {
    final auth = context.read<AuthProvider>();

    // Prove it works before recording it as enabled, or the user could be locked
    // out behind hardware that then refuses them.
    if (value) {
      final ok = await LockService.instance
          .authenticate(reason: 'Confirm your $_label to enable it');
      if (!ok) {
        if (mounted) showSnack(context, 'Could not confirm your $_label', error: true);
        return;
      }
    }

    final saved = await auth.updateLock(biometricEnabled: value);
    if (!mounted) return;
    showSnack(
      context,
      saved
          ? (value ? '$_label enabled' : '$_label disabled')
          : (auth.error ?? 'Could not update'),
      error: !saved,
    );
  }

  Future<void> _changePin() async {
    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => const _ChangePinScreen()),
    );
    if (changed == true && mounted) showSnack(context, 'PIN updated');
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final user = context.watch<AuthProvider>().user;

    return Column(
      children: [
        if (_available)
          SwitchListTile.adaptive(
            value: user?.biometricEnabled ?? false,
            onChanged: _toggleBiometric,
            secondary: CategoryAvatar(
              icon: _label.startsWith('Face')
                  ? Icons.face_rounded
                  : Icons.fingerprint_rounded,
              color: theme.colorScheme.primary,
              size: 40,
            ),
            title: Text(_label,
                style: const TextStyle(fontWeight: FontWeight.w600)),
            subtitle: const Text('Unlock without typing your PIN'),
          )
        else
          ListTile(
            leading: CategoryAvatar(
              icon: Icons.fingerprint_rounded,
              color: theme.colorScheme.onSurface.withValues(alpha: 0.35),
              size: 40,
            ),
            title: const Text('Biometric unlock',
                style: TextStyle(fontWeight: FontWeight.w600)),
            subtitle: const Text('No fingerprint or face enrolled on this device'),
          ),

        ListTile(
          leading: CategoryAvatar(
            icon: Icons.pin_rounded,
            color: theme.colorScheme.primary,
            size: 40,
          ),
          title: const Text('Change PIN',
              style: TextStyle(fontWeight: FontWeight.w600)),
          subtitle: const Text('Your fallback when biometrics fail'),
          trailing: Icon(Icons.chevron_right_rounded,
              color: theme.colorScheme.onSurface.withValues(alpha: 0.3)),
          onTap: _changePin,
        ),
      ],
    );
  }
}

class _ChangePinScreen extends StatefulWidget {
  const _ChangePinScreen();

  @override
  State<_ChangePinScreen> createState() => _ChangePinScreenState();
}

enum _PinStage { current, next, confirm }

class _ChangePinScreenState extends State<_ChangePinScreen> {
  _PinStage _stage = _PinStage.current;
  String _current = '';
  String _next = '';
  String _confirm = '';
  String? _error;
  bool _saving = false;

  String get _entered => switch (_stage) {
        _PinStage.current => _current,
        _PinStage.next => _next,
        _PinStage.confirm => _confirm,
      };

  void _onDigit(String d) {
    if (_entered.length >= AppConstants.pinMaxLength) return;
    setState(() {
      _error = null;
      switch (_stage) {
        case _PinStage.current:
          _current += d;
        case _PinStage.next:
          _next += d;
        case _PinStage.confirm:
          _confirm += d;
      }
    });
  }

  void _onBackspace() {
    if (_entered.isEmpty) return;
    setState(() {
      _error = null;
      switch (_stage) {
        case _PinStage.current:
          _current = _current.substring(0, _current.length - 1);
        case _PinStage.next:
          _next = _next.substring(0, _next.length - 1);
        case _PinStage.confirm:
          _confirm = _confirm.substring(0, _confirm.length - 1);
      }
    });
  }

  Future<void> _advance() async {
    if (_entered.length < AppConstants.pinMinLength) return;

    switch (_stage) {
      case _PinStage.current:
        setState(() => _stage = _PinStage.next);
      case _PinStage.next:
        setState(() => _stage = _PinStage.confirm);
      case _PinStage.confirm:
        if (_confirm != _next) {
          setState(() {
            _error = 'The PINs do not match';
            _confirm = '';
          });
          return;
        }
        setState(() => _saving = true);
        final auth = context.read<AuthProvider>();
        final ok = await auth.updateLock(currentPin: _current, pin: _next);
        if (!mounted) return;
        setState(() => _saving = false);
        if (ok) {
          Navigator.of(context).pop(true);
        } else {
          setState(() {
            // Almost always "current PIN is incorrect" — start over.
            _error = auth.error ?? 'Could not change your PIN';
            _stage = _PinStage.current;
            _current = '';
            _next = '';
            _confirm = '';
          });
        }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('Change PIN')),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      switch (_stage) {
                        _PinStage.current => 'Enter your current PIN',
                        _PinStage.next => 'Choose a new PIN',
                        _PinStage.confirm => 'Confirm your new PIN',
                      },
                      style: theme.textTheme.titleMedium
                          ?.copyWith(fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(height: 28),
                    PinDots(
                      length: _entered.length,
                      total: AppConstants.pinMaxLength,
                      minimum: AppConstants.pinMinLength,
                      error: _error != null,
                    ),
                    const SizedBox(height: 16),
                    SizedBox(
                      height: 36,
                      child: _saving
                          ? const SizedBox(
                              width: 20, height: 20,
                              child: CircularProgressIndicator(strokeWidth: 2))
                          : Text(
                              _error ?? '',
                              style: theme.textTheme.bodySmall
                                  ?.copyWith(color: theme.colorScheme.error),
                            ),
                    ),
                  ],
                ),
              ),
            ),
            PinPad(
              onDigit: _onDigit,
              onBackspace: _onBackspace,
              enabled: !_saving,
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 12, 24, 20),
              child: ElevatedButton(
                onPressed:
                    (_entered.length < AppConstants.pinMinLength || _saving)
                        ? null
                        : _advance,
                child: Text(_stage == _PinStage.confirm ? 'Save new PIN' : 'Continue'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
