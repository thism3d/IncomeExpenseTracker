import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../providers/auth_provider.dart';
import '../../services/lock_service.dart';
import '../../utils/constants.dart';
import '../../widgets/common.dart';
import '../../widgets/pin_pad.dart';

/// Mandatory app-lock enrolment. The README is explicit: the user "cannot skip
/// this step".
///
/// There is deliberately no skip button and no back arrow — the only way off this
/// screen is to set a PIN (and optionally enable the device biometric), or to
/// sign out entirely.
///
/// The PIN is required even when biometrics are enabled, because biometrics can
/// fail: no enrolled fingerprint, a wet thumb, a failed face scan, a phone
/// handed to a colleague. The PIN is the fallback that always works, and it is
/// the only factor the server can actually verify.
class LockSetupScreen extends StatefulWidget {
  const LockSetupScreen({super.key});

  @override
  State<LockSetupScreen> createState() => _LockSetupScreenState();
}

class _LockSetupScreenState extends State<LockSetupScreen> {
  String _pin = '';
  String _confirmPin = '';
  bool _confirming = false;
  bool _useBiometric = false;
  bool _biometricAvailable = false;
  String _biometricLabel = 'Biometric unlock';
  String? _error;

  @override
  void initState() {
    super.initState();
    _probeBiometrics();
  }

  Future<void> _probeBiometrics() async {
    final lock = LockService.instance;
    final can = await lock.canUseBiometrics;
    final enrolled = await lock.hasEnrolledBiometrics();
    final label = await lock.biometricLabel();
    if (!mounted) return;
    setState(() {
      _biometricAvailable = can && enrolled;
      _biometricLabel = label;
      // Default it on when the hardware is there — it's the better experience,
      // and the PIN still backs it up.
      _useBiometric = _biometricAvailable;
    });
  }

  void _onDigit(String digit) {
    setState(() {
      _error = null;
      if (_confirming) {
        if (_confirmPin.length < AppConstants.pinMaxLength) _confirmPin += digit;
      } else {
        if (_pin.length < AppConstants.pinMaxLength) _pin += digit;
      }
    });
  }

  void _onBackspace() {
    setState(() {
      _error = null;
      if (_confirming) {
        if (_confirmPin.isNotEmpty) {
          _confirmPin = _confirmPin.substring(0, _confirmPin.length - 1);
        }
      } else if (_pin.isNotEmpty) {
        _pin = _pin.substring(0, _pin.length - 1);
      }
    });
  }

  void _next() {
    if (_pin.length < AppConstants.pinMinLength) {
      setState(() => _error = 'Choose a PIN of at least ${AppConstants.pinMinLength} digits');
      return;
    }
    setState(() {
      _confirming = true;
      _confirmPin = '';
      _error = null;
    });
  }

  Future<void> _save() async {
    if (_confirmPin != _pin) {
      setState(() {
        _error = 'The PINs do not match. Try again.';
        _confirmPin = '';
      });
      return;
    }

    // Prove the biometric actually works before we record it as enabled —
    // otherwise the user could end up with a flag set for hardware that then
    // refuses them at the lock screen.
    var biometric = _useBiometric;
    if (biometric) {
      final ok = await LockService.instance.authenticate(
        reason: 'Confirm your $_biometricLabel to enable it',
      );
      if (!ok) {
        if (!mounted) return;
        setState(() {
          biometric = false;
          _useBiometric = false;
          _error = 'Could not confirm your $_biometricLabel. '
              'Your PIN has still been set — you can enable it later in Settings.';
        });
      }
    }

    if (!mounted) return;
    final ok = await context.read<AuthProvider>().setupLock(
          pin: _pin,
          biometricEnabled: biometric,
        );
    if (!ok && mounted) {
      setState(() {
        _error = context.read<AuthProvider>().error ?? 'Could not set your PIN';
        _confirming = false;
        _pin = '';
        _confirmPin = '';
      });
    }
    // On success the root gate swaps this screen for the home shell.
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final auth = context.watch<AuthProvider>();
    final entered = _confirming ? _confirmPin : _pin;
    final canContinue = _confirming
        ? _confirmPin.length >= AppConstants.pinMinLength
        : _pin.length >= AppConstants.pinMinLength;

    return PopScope(
      // Not skippable — the back button must not sneak past this screen.
      canPop: false,
      child: Scaffold(
        body: SafeArea(
          child: Column(
            children: [
              Expanded(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(24, 32, 24, 8),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Center(
                        child: Container(
                          width: 62,
                          height: 62,
                          decoration: BoxDecoration(
                            color: theme.colorScheme.primary.withValues(alpha: 0.12),
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Icon(Icons.lock_outline_rounded,
                              color: theme.colorScheme.primary, size: 28),
                        ),
                      ),
                      const SizedBox(height: 20),

                      Text(
                        _confirming ? 'Confirm your PIN' : 'Secure your account',
                        textAlign: TextAlign.center,
                        style: theme.textTheme.headlineSmall
                            ?.copyWith(fontWeight: FontWeight.w600),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        _confirming
                            ? 'Enter the same PIN once more'
                            : 'Set a ${AppConstants.pinMinLength}–${AppConstants.pinMaxLength} digit PIN. '
                                'Your financial records stay locked without it.',
                        textAlign: TextAlign.center,
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: theme.colorScheme.onSurface.withValues(alpha: 0.6),
                          height: 1.45,
                        ),
                      ),
                      const SizedBox(height: 28),

                      PinDots(
                        length: entered.length,
                        total: AppConstants.pinMaxLength,
                        minimum: AppConstants.pinMinLength,
                      ),
                      const SizedBox(height: 22),

                      if (_error != null)
                        ErrorBanner(_error)
                      else
                        const SizedBox(height: 0),

                      if (!_confirming && _biometricAvailable) ...[
                        const SizedBox(height: 6),
                        Container(
                          decoration: BoxDecoration(
                            border: Border.all(color: theme.colorScheme.outline),
                            borderRadius: BorderRadius.circular(14),
                          ),
                          child: SwitchListTile.adaptive(
                            value: _useBiometric,
                            onChanged: (v) => setState(() => _useBiometric = v),
                            title: Text(_biometricLabel,
                                style: theme.textTheme.bodyMedium
                                    ?.copyWith(fontWeight: FontWeight.w600)),
                            subtitle: Text(
                              'Unlock without typing your PIN',
                              style: theme.textTheme.bodySmall?.copyWith(
                                color:
                                    theme.colorScheme.onSurface.withValues(alpha: 0.55),
                              ),
                            ),
                            secondary: Icon(
                              _biometricLabel.startsWith('Face')
                                  ? Icons.face_rounded
                                  : Icons.fingerprint_rounded,
                              color: theme.colorScheme.primary,
                            ),
                            contentPadding:
                                const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
                          ),
                        ),
                      ],

                      if (!_confirming && !_biometricAvailable) ...[
                        const SizedBox(height: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                          decoration: BoxDecoration(
                            color: theme.colorScheme.onSurface.withValues(alpha: 0.04),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Row(
                            children: [
                              Icon(Icons.info_outline_rounded,
                                  size: 18,
                                  color:
                                      theme.colorScheme.onSurface.withValues(alpha: 0.5)),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Text(
                                  'No fingerprint or face is enrolled on this device. '
                                  'Your PIN will unlock the app.',
                                  style: theme.textTheme.bodySmall?.copyWith(
                                    color: theme.colorScheme.onSurface
                                        .withValues(alpha: 0.6),
                                    height: 1.4,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ),

              PinPad(
                onDigit: _onDigit,
                onBackspace: _onBackspace,
                enabled: !auth.busy,
              ),

              Padding(
                padding: const EdgeInsets.fromLTRB(24, 12, 24, 16),
                child: Column(
                  children: [
                    ElevatedButton(
                      onPressed: (!canContinue || auth.busy)
                          ? null
                          : (_confirming ? _save : _next),
                      child: auth.busy
                          ? const SizedBox(
                              width: 22, height: 22,
                              child: CircularProgressIndicator(
                                  strokeWidth: 2.2, color: Colors.white))
                          : Text(_confirming ? 'Enable app lock' : 'Continue'),
                    ),
                    const SizedBox(height: 6),
                    TextButton(
                      onPressed: auth.busy
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
