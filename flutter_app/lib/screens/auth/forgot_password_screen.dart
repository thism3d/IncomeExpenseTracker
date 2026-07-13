import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../providers/auth_provider.dart';
import '../../providers/data_provider.dart';
import '../../utils/constants.dart';
import '../../widgets/common.dart';
import '../../widgets/otp_field.dart';

/// Forgot password: send a code, then verify-and-reset in one step so a verified
/// code is never left dangling. The reset response carries a fresh token, so the
/// user lands signed in rather than back at the login form.
class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  final _identifier = TextEditingController();
  final _code = TextEditingController();
  final _password = TextEditingController();
  final _confirm = TextEditingController();

  bool _sent = false;
  bool _obscure = true;
  String _destination = '';
  String? _localError;

  Timer? _cooldownTimer;
  int _cooldown = 0;

  @override
  void dispose() {
    _cooldownTimer?.cancel();
    _identifier.dispose();
    _code.dispose();
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

  Future<void> _request() async {
    final auth = context.read<AuthProvider>();
    setState(() => _localError = null);
    auth.clearError();

    if (_identifier.text.trim().isEmpty) {
      setState(() => _localError = 'Enter your email or phone number');
      return;
    }

    FocusScope.of(context).unfocus();
    final result = await auth.forgotPassword(_identifier.text.trim());
    if (result == null || !mounted) return;

    setState(() {
      _destination = '${result['destination'] ?? ''}';
      _sent = true;
    });
    _startCooldown();
  }

  Future<void> _reset() async {
    final auth = context.read<AuthProvider>();
    setState(() => _localError = null);
    auth.clearError();

    if (_code.text.length != AppConstants.otpLength) {
      setState(() => _localError = 'Enter the 6-digit code');
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
    final ok = await auth.resetPassword(
      identifier: _identifier.text.trim(),
      code: _code.text,
      password: _password.text,
    );

    if (!mounted) return;
    if (ok) {
      context.read<DataProvider>().load();
      Navigator.of(context).popUntil((r) => r.isFirst);
    } else {
      _code.clear();
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final error = _localError ?? auth.error;

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => Navigator.of(context).pop(),
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 8, 24, 32),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              AuthHeader(
                title: _sent ? 'Reset your password' : 'Forgot your password?',
                subtitle: _sent
                    ? 'Enter the code sent to $_destination and choose a new password'
                    : 'We will send a reset code to your email or phone',
              ),
              const SizedBox(height: 30),

              ErrorBanner(error),

              if (!_sent) ...[
                TextField(
                  controller: _identifier,
                  keyboardType: TextInputType.emailAddress,
                  onSubmitted: (_) => _request(),
                  decoration: const InputDecoration(
                    labelText: 'Email or phone',
                    hintText: '01712345678',
                    prefixIcon: Icon(Icons.person_outline_rounded),
                  ),
                ),
                const SizedBox(height: 26),
                ElevatedButton(
                  onPressed: auth.busy ? null : _request,
                  child: auth.busy
                      ? const SizedBox(
                          width: 22, height: 22,
                          child: CircularProgressIndicator(
                              strokeWidth: 2.2, color: Colors.white))
                      : const Text('Send reset code'),
                ),
              ] else ...[
                OtpField(controller: _code, enabled: !auth.busy),
                const SizedBox(height: 20),

                TextField(
                  controller: _password,
                  obscureText: _obscure,
                  decoration: InputDecoration(
                    labelText: 'New password',
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
                  onSubmitted: (_) => _reset(),
                  decoration: const InputDecoration(
                    labelText: 'Confirm new password',
                    prefixIcon: Icon(Icons.lock_outline_rounded),
                  ),
                ),
                const SizedBox(height: 26),

                ElevatedButton(
                  onPressed: auth.busy ? null : _reset,
                  child: auth.busy
                      ? const SizedBox(
                          width: 22, height: 22,
                          child: CircularProgressIndicator(
                              strokeWidth: 2.2, color: Colors.white))
                      : const Text('Reset password & sign in'),
                ),
                const SizedBox(height: 10),

                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    TextButton(
                      onPressed: () => setState(() {
                        _sent = false;
                        _code.clear();
                        _localError = null;
                      }),
                      child: const Text('Use a different account'),
                    ),
                    TextButton(
                      onPressed: (_cooldown > 0 || auth.busy) ? null : _request,
                      child: Text(_cooldown > 0 ? 'Resend in ${_cooldown}s' : 'Resend'),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
