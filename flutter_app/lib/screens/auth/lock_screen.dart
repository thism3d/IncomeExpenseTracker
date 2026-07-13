import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../providers/auth_provider.dart';
import '../../services/lock_service.dart';
import '../../utils/constants.dart';
import '../../utils/formatters.dart';
import '../../widgets/pin_pad.dart';

/// The gate on every cold start and after a long absence. Biometric first when
/// the user enabled it (it's one touch), PIN always available underneath.
class LockScreen extends StatefulWidget {
  const LockScreen({super.key});

  @override
  State<LockScreen> createState() => _LockScreenState();
}

class _LockScreenState extends State<LockScreen> {
  String _pin = '';
  String? _error;
  bool _verifying = false;
  bool _biometricAvailable = false;
  String _biometricLabel = 'Biometric unlock';
  int _attempts = 0;

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    final user = context.read<AuthProvider>().user;
    final lock = LockService.instance;

    final can = await lock.canUseBiometrics;
    final enrolled = await lock.hasEnrolledBiometrics();
    final label = await lock.biometricLabel();
    if (!mounted) return;

    final available = can && enrolled && (user?.biometricEnabled ?? false);
    setState(() {
      _biometricAvailable = available;
      _biometricLabel = label;
    });

    // Offer the biometric straight away — the user shouldn't have to tap a
    // button to get the prompt they already opted into.
    if (available) _tryBiometric();
  }

  Future<void> _tryBiometric() async {
    if (_verifying) return;
    setState(() {
      _verifying = true;
      _error = null;
    });

    final ok = await context.read<AuthProvider>().unlockWithBiometrics();
    if (!mounted) return;

    setState(() => _verifying = false);
    if (!ok) {
      // Cancelled, or the sensor refused. Don't nag — the PIN pad is right there.
      setState(() => _error = null);
    }
  }

  Future<void> _submitPin() async {
    if (_pin.length < AppConstants.pinMinLength) return;

    setState(() {
      _verifying = true;
      _error = null;
    });

    final ok = await context.read<AuthProvider>().unlockWithPin(_pin);
    if (!mounted) return;

    if (!ok) {
      _attempts += 1;
      HapticFeedback.heavyImpact();
      setState(() {
        _verifying = false;
        _pin = '';
        _error = _attempts >= 3
            ? 'Incorrect PIN. Forgot it? Sign out and reset your password.'
            : 'Incorrect PIN. Try again.';
      });
    }
    // Success: the root gate swaps this screen for the home shell.
  }

  void _onDigit(String d) {
    if (_verifying) return;
    setState(() {
      _error = null;
      if (_pin.length < AppConstants.pinMaxLength) _pin += d;
    });
    // Auto-submit at the max length; shorter PINs use the Unlock button.
    if (_pin.length == AppConstants.pinMaxLength) _submitPin();
  }

  void _onBackspace() {
    if (_verifying || _pin.isEmpty) return;
    setState(() {
      _error = null;
      _pin = _pin.substring(0, _pin.length - 1);
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final user = context.watch<AuthProvider>().user;

    return PopScope(
      canPop: false,
      child: Scaffold(
        body: SafeArea(
          child: Column(
            children: [
              Expanded(
                child: Center(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.symmetric(horizontal: 24),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          width: 66,
                          height: 66,
                          decoration: BoxDecoration(
                            color: theme.colorScheme.primary.withValues(alpha: 0.12),
                            borderRadius: BorderRadius.circular(22),
                          ),
                          alignment: Alignment.center,
                          child: Text(
                            Fmt.initials(user?.name ?? 'S'),
                            style: theme.textTheme.titleLarge?.copyWith(
                              color: theme.colorScheme.primary,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                        const SizedBox(height: 18),

                        Text(
                          user == null ? 'Welcome back' : 'Hello, ${user.name.split(' ').first}',
                          style: theme.textTheme.titleLarge
                              ?.copyWith(fontWeight: FontWeight.w600),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          'Enter your PIN to unlock',
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: theme.colorScheme.onSurface.withValues(alpha: 0.6),
                          ),
                        ),
                        const SizedBox(height: 32),

                        PinDots(
                          length: _pin.length,
                          total: AppConstants.pinMaxLength,
                          minimum: AppConstants.pinMinLength,
                          error: _error != null,
                        ),
                        const SizedBox(height: 18),

                        SizedBox(
                          height: 42,
                          child: _verifying
                              ? const SizedBox(
                                  width: 20, height: 20,
                                  child: CircularProgressIndicator(strokeWidth: 2.2))
                              : _error != null
                                  ? Padding(
                                      padding: const EdgeInsets.symmetric(horizontal: 20),
                                      child: Text(
                                        _error!,
                                        textAlign: TextAlign.center,
                                        style: theme.textTheme.bodySmall
                                            ?.copyWith(color: theme.colorScheme.error),
                                      ),
                                    )
                                  : const SizedBox.shrink(),
                        ),
                      ],
                    ),
                  ),
                ),
              ),

              PinPad(
                onDigit: _onDigit,
                onBackspace: _onBackspace,
                onBiometric: _biometricAvailable ? _tryBiometric : null,
                biometricIcon: _biometricLabel.startsWith('Face')
                    ? Icons.face_rounded
                    : Icons.fingerprint_rounded,
                enabled: !_verifying,
              ),

              Padding(
                padding: const EdgeInsets.fromLTRB(24, 12, 24, 16),
                child: Column(
                  children: [
                    // A 4-digit PIN needs an explicit submit; a 6-digit one
                    // auto-submits, but the button stays for consistency.
                    ElevatedButton(
                      onPressed: (_pin.length < AppConstants.pinMinLength || _verifying)
                          ? null
                          : _submitPin,
                      child: const Text('Unlock'),
                    ),
                    const SizedBox(height: 6),
                    TextButton(
                      onPressed: _verifying
                          ? null
                          : () => context.read<AuthProvider>().logout(),
                      child: Text(
                        'Sign out',
                        style: TextStyle(
                            color: theme.colorScheme.onSurface.withValues(alpha: 0.55)),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
