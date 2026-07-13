import 'package:flutter/material.dart';
import 'package:pin_code_fields/pin_code_fields.dart';

import '../utils/constants.dart';

/// Six boxes that behave like one field: typing advances, backspace retreats, an
/// SMS autofill or a paste fills the row.
class OtpField extends StatelessWidget {
  const OtpField({
    super.key,
    required this.controller,
    this.onCompleted,
    this.enabled = true,
    this.autoFocus = true,
  });

  final TextEditingController controller;
  final void Function(String code)? onCompleted;
  final bool enabled;
  final bool autoFocus;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final dark = theme.brightness == Brightness.dark;

    return PinCodeTextField(
      appContext: context,
      controller: controller,
      length: AppConstants.otpLength,
      enabled: enabled,
      autoFocus: autoFocus,
      keyboardType: TextInputType.number,
      // Lets Android drop the SMS code straight in.
      enablePinAutofill: true,
      animationType: AnimationType.fade,
      animationDuration: const Duration(milliseconds: 150),
      cursorColor: theme.colorScheme.primary,
      textStyle: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w600),
      pastedTextStyle: theme.textTheme.titleLarge,
      onCompleted: onCompleted,
      onChanged: (_) {},
      pinTheme: PinTheme(
        shape: PinCodeFieldShape.box,
        borderRadius: BorderRadius.circular(12),
        fieldHeight: 56,
        fieldWidth: 46,
        borderWidth: 1.4,
        activeColor: theme.colorScheme.primary,
        selectedColor: theme.colorScheme.primary,
        inactiveColor: theme.colorScheme.outline,
        activeFillColor: dark ? theme.colorScheme.surface : Colors.white,
        selectedFillColor: dark ? theme.colorScheme.surface : Colors.white,
        inactiveFillColor: dark ? theme.colorScheme.surface : Colors.white,
      ),
      enableActiveFill: true,
    );
  }
}
