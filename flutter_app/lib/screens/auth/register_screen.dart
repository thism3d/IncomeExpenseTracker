import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../providers/auth_provider.dart';
import '../../providers/data_provider.dart';
import '../../utils/constants.dart';
import '../../widgets/common.dart';
import '../../widgets/otp_field.dart';

/// Registration is three steps, exactly as the README specifies:
/// send OTP -> verify OTP -> set password. The account row is only created at
/// the last step, so an unverified number never occupies the phone slot.
class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

enum _Step { identifier, otp, password }

class _RegisterScreenState extends State<RegisterScreen> {
  _Step _step = _Step.identifier;
  bool _usePhone = true;

  final _identifier = TextEditingController();
  final _code = TextEditingController();
  final _name = TextEditingController();
  final _password = TextEditingController();
  final _confirm = TextEditingController();

  String _destination = '';
  String _ticket = '';
  bool _obscure = true;
  String? _localError;

  Timer? _cooldownTimer;
  int _cooldown = 0;

  @override
  void dispose() {
    _cooldownTimer?.cancel();
    _identifier.dispose();
    _code.dispose();
    _name.dispose();
    _password.dispose();
    _confirm.dispose();
    super.dispose();
  }

  void _startCooldown() {
    setState(() => _cooldown = AppConstants.otpResendSeconds);
    _cooldownTimer?.cancel();
    _cooldownTimer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) return t.cancel();
      setState(() => _cooldown -= 1);
      if (_cooldown <= 0) t.cancel();
    });
  }

  Future<void> _sendOtp() async {
    final auth = context.read<AuthProvider>();
    setState(() => _localError = null);
    auth.clearError();

    if (_identifier.text.trim().isEmpty) {
      setState(() => _localError =
          _usePhone ? 'Enter your mobile number' : 'Enter your email address');
      return;
    }

    FocusScope.of(context).unfocus();
    final result = await auth.sendRegisterOtp(_identifier.text.trim());
    if (result == null || !mounted) return;

    setState(() {
      _destination = '${result['destination'] ?? ''}';
      _step = _Step.otp;
      _code.clear();
    });
    _startCooldown();
  }

  Future<void> _verifyOtp([String? submitted]) async {
    final auth = context.read<AuthProvider>();
    final code = submitted ?? _code.text;
    setState(() => _localError = null);
    auth.clearError();

    if (code.length != AppConstants.otpLength) {
      setState(() => _localError = 'Enter the 6-digit code');
      return;
    }

    FocusScope.of(context).unfocus();
    final ticket = await auth.verifyRegisterOtp(_identifier.text.trim(), code);
    if (ticket == null || !mounted) {
      _code.clear();
      return;
    }

    setState(() {
      _ticket = ticket;
      _step = _Step.password;
    });
  }

  Future<void> _finish() async {
    final auth = context.read<AuthProvider>();
    setState(() => _localError = null);
    auth.clearError();

    if (_name.text.trim().length < 2) {
      setState(() => _localError = 'Enter your full name');
      return;
    }
    if (_password.text.length < 8) {
      setState(() => _localError = 'Password must be at least 8 characters');
      return;
    }
    if (_password.text != _confirm.text) {
      setState(() => _localError = 'Passwords do not match');
      return;
    }

    FocusScope.of(context).unfocus();
    final ok = await auth.completeRegistration(
      ticket: _ticket,
      name: _name.text.trim(),
      password: _password.text,
    );

    if (!mounted) return;
    if (ok) {
      // The root gate takes over from here and forces lock setup.
      context.read<DataProvider>().load();
      Navigator.of(context).popUntil((r) => r.isFirst);
    } else if (auth.error != null && auth.error!.contains('expired')) {
      // The 15-minute ticket died — send them back to the start rather than
      // leaving a dead form on screen.
      setState(() {
        _step = _Step.identifier;
        _code.clear();
        _ticket = '';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final theme = Theme.of(context);
    final error = _localError ?? auth.error;
    final index = _Step.values.indexOf(_step);

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () {
            if (_step == _Step.identifier) {
              Navigator.of(context).pop();
            } else {
              setState(() {
                _step = _Step.values[index - 1];
                _localError = null;
              });
            }
          },
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 8, 24, 32),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              AuthHeader(
                title: switch (_step) {
                  _Step.identifier => 'Create your account',
                  _Step.otp => 'Verify it\'s you',
                  _Step.password => 'Set your password',
                },
                subtitle: switch (_step) {
                  _Step.identifier => 'We will send you a verification code',
                  _Step.otp => 'Enter the 6-digit code sent to $_destination',
                  _Step.password => 'Almost done — choose a name and password',
                },
              ),
              const SizedBox(height: 24),

              // Three dots, the reached ones filled.
              Row(
                children: List.generate(_Step.values.length, (i) {
                  return Expanded(
                    child: Container(
                      height: 4,
                      margin: EdgeInsets.only(right: i == _Step.values.length - 1 ? 0 : 6),
                      decoration: BoxDecoration(
                        color: i <= index
                            ? theme.colorScheme.primary
                            : theme.colorScheme.onSurface.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(999),
                      ),
                    ),
                  );
                }),
              ),
              const SizedBox(height: 26),

              ErrorBanner(error),

              if (_step == _Step.identifier) ..._identifierStep(theme, auth),
              if (_step == _Step.otp) ..._otpStep(theme, auth),
              if (_step == _Step.password) ..._passwordStep(theme, auth),
            ],
          ),
        ),
      ),
    );
  }

  List<Widget> _identifierStep(ThemeData theme, AuthProvider auth) => [
        Container(
          padding: const EdgeInsets.all(4),
          decoration: BoxDecoration(
            color: theme.colorScheme.onSurface.withValues(alpha: 0.05),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            children: [
              for (final phone in [true, false])
                Expanded(
                  child: GestureDetector(
                    onTap: () => setState(() {
                      _usePhone = phone;
                      _identifier.clear();
                      _localError = null;
                    }),
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      decoration: BoxDecoration(
                        color: _usePhone == phone ? theme.colorScheme.surface : null,
                        borderRadius: BorderRadius.circular(9),
                        boxShadow: _usePhone == phone
                            ? [BoxShadow(
                                color: Colors.black.withValues(alpha: 0.05),
                                blurRadius: 4)]
                            : null,
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(phone ? Icons.smartphone_rounded : Icons.mail_outline_rounded,
                              size: 17),
                          const SizedBox(width: 7),
                          Text(phone ? 'Phone' : 'Email',
                              style: theme.textTheme.bodyMedium
                                  ?.copyWith(fontWeight: FontWeight.w600)),
                        ],
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 18),

        TextField(
          controller: _identifier,
          keyboardType: _usePhone ? TextInputType.phone : TextInputType.emailAddress,
          decoration: InputDecoration(
            labelText: _usePhone ? 'Mobile number' : 'Email address',
            hintText: _usePhone ? '01712345678' : 'you@example.com',
            prefixIcon: Icon(
                _usePhone ? Icons.smartphone_rounded : Icons.mail_outline_rounded),
          ),
        ),
        if (_usePhone) ...[
          const SizedBox(height: 8),
          Padding(
            padding: const EdgeInsets.only(left: 4),
            child: Text(
              'Bangladeshi mobile — 01…, 1…, 880… or +880… all work.',
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurface.withValues(alpha: 0.5),
              ),
            ),
          ),
        ],
        const SizedBox(height: 26),

        ElevatedButton(
          onPressed: auth.busy ? null : _sendOtp,
          child: auth.busy
              ? const SizedBox(
                  width: 22, height: 22,
                  child: CircularProgressIndicator(strokeWidth: 2.2, color: Colors.white))
              : const Text('Send verification code'),
        ),
      ];

  List<Widget> _otpStep(ThemeData theme, AuthProvider auth) => [
        OtpField(
          controller: _code,
          enabled: !auth.busy,
          onCompleted: _verifyOtp,
        ),
        const SizedBox(height: 24),

        ElevatedButton(
          onPressed: auth.busy ? null : () => _verifyOtp(),
          child: auth.busy
              ? const SizedBox(
                  width: 22, height: 22,
                  child: CircularProgressIndicator(strokeWidth: 2.2, color: Colors.white))
              : const Text('Verify code'),
        ),
        const SizedBox(height: 14),

        Center(
          child: TextButton(
            onPressed: (_cooldown > 0 || auth.busy) ? null : _sendOtp,
            child: Text(_cooldown > 0 ? 'Resend in ${_cooldown}s' : 'Resend code'),
          ),
        ),
      ];

  List<Widget> _passwordStep(ThemeData theme, AuthProvider auth) => [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            color: theme.colorScheme.primary.withValues(alpha: 0.10),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            children: [
              Icon(Icons.check_circle_rounded,
                  size: 18, color: theme.colorScheme.primary),
              const SizedBox(width: 10),
              Expanded(
                child: Text('$_destination verified',
                    style: theme.textTheme.bodySmall
                        ?.copyWith(color: theme.colorScheme.primary)),
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),

        TextField(
          controller: _name,
          textCapitalization: TextCapitalization.words,
          decoration: const InputDecoration(
            labelText: 'Full name',
            hintText: 'Adv. Jahid Tutul',
            prefixIcon: Icon(Icons.person_outline_rounded),
          ),
        ),
        const SizedBox(height: 16),

        TextField(
          controller: _password,
          obscureText: _obscure,
          decoration: InputDecoration(
            labelText: 'Password',
            hintText: 'At least 8 characters',
            prefixIcon: const Icon(Icons.lock_outline_rounded),
            suffixIcon: IconButton(
              icon: Icon(_obscure
                  ? Icons.visibility_outlined
                  : Icons.visibility_off_outlined),
              onPressed: () => setState(() => _obscure = !_obscure),
            ),
          ),
        ),
        const SizedBox(height: 16),

        TextField(
          controller: _confirm,
          obscureText: _obscure,
          onSubmitted: (_) => _finish(),
          decoration: const InputDecoration(
            labelText: 'Confirm password',
            prefixIcon: Icon(Icons.lock_outline_rounded),
          ),
        ),
        const SizedBox(height: 26),

        ElevatedButton(
          onPressed: auth.busy ? null : _finish,
          child: auth.busy
              ? const SizedBox(
                  width: 22, height: 22,
                  child: CircularProgressIndicator(strokeWidth: 2.2, color: Colors.white))
              : const Text('Create account'),
        ),
      ];
}
