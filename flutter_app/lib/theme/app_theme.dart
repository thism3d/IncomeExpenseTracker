import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';

/// Colours and theme. One place, so no screen hardcodes a hex.
///
/// The chart colours are NOT decorative — they mirror the validated palette the
/// web app uses (see web/src/lib/viz.ts):
///   income vs expense = a diverging pair (polarity), never two arbitrary hues.
///   categories        = 8 categorical slots in a fixed order, never cycled.
///   budget state      = status tokens, always paired with an icon + label.
class AppColors {
  AppColors._();

  // Brand — from the SisirBindu logo.
  static const brand = Color(0xFF0E7C66);
  static const brandDark = Color(0xFF14B892);

  // Polarity: income / expense. Both clear WCAG AA on their own surface.
  static const incomeLight = Color(0xFF0A7D63);
  static const expenseLight = Color(0xFFC8322F);
  static const incomeDark = Color(0xFF2FC79F);
  static const expenseDark = Color(0xFFF4796F);

  // Surfaces
  static const bgLight = Color(0xFFFAFAF9);
  static const surfaceLight = Color(0xFFFFFFFF);
  static const bgDark = Color(0xFF12121A);
  static const surfaceDark = Color(0xFF1A1A24);

  static const inkLight = Color(0xFF1C1917);
  static const mutedLight = Color(0xFF78716C);
  static const inkDark = Color(0xFFF5F5F4);
  static const mutedDark = Color(0xFFA1A1AA);

  static const borderLight = Color(0xFFE7E5E4);
  static const borderDark = Color(0xFF2A2A36);

  // Status — a state, never a series.
  static const good = Color(0xFF0CA30C);
  static const warning = Color(0xFFB45309);
  static const critical = Color(0xFFC8322F);

  /// Eight categorical slots, in the CVD-validated order. A 9th category folds
  /// into "Other" — the list is never cycled.
  static const categoricalLight = <Color>[
    Color(0xFF0A9C7C), Color(0xFF7C3AED), Color(0xFFE34948), Color(0xFFEDA100),
    Color(0xFFE87BA4), Color(0xFF008300), Color(0xFF2A78D6), Color(0xFFEB6834),
  ];
  static const categoricalDark = <Color>[
    Color(0xFF0D9E7B), Color(0xFF9B7CF0), Color(0xFFE05352), Color(0xFFBD8200),
    Color(0xFFCF6389), Color(0xFF22A222), Color(0xFF4D95E8), Color(0xFFDD6A3A),
  ];

  static Color income(bool dark) => dark ? incomeDark : incomeLight;
  static Color expense(bool dark) => dark ? expenseDark : expenseLight;
  static List<Color> categorical(bool dark) => dark ? categoricalDark : categoricalLight;
  static Color series(int i, bool dark) {
    final slots = categorical(dark);
    return slots[i % slots.length];
  }

  /// Parse the '#RRGGBB' a category carries from the server.
  static Color fromHex(String? hex, {Color fallback = mutedLight}) {
    if (hex == null || hex.isEmpty) return fallback;
    final cleaned = hex.replaceFirst('#', '');
    if (cleaned.length != 6) return fallback;
    final value = int.tryParse(cleaned, radix: 16);
    return value == null ? fallback : Color(0xFF000000 | value);
  }
}

class AppTheme {
  AppTheme._();

  static const _radius = 14.0;

  static ThemeData light() => _build(Brightness.light);
  static ThemeData dark() => _build(Brightness.dark);

  static ThemeData _build(Brightness brightness) {
    final isDark = brightness == Brightness.dark;

    final scheme = ColorScheme.fromSeed(
      seedColor: AppColors.brand,
      brightness: brightness,
    ).copyWith(
      primary: isDark ? AppColors.brandDark : AppColors.brand,
      onPrimary: isDark ? AppColors.bgDark : Colors.white,
      surface: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
      onSurface: isDark ? AppColors.inkDark : AppColors.inkLight,
      error: isDark ? AppColors.expenseDark : AppColors.expenseLight,
      outline: isDark ? AppColors.borderDark : AppColors.borderLight,
    );

    final base = ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: scheme,
      scaffoldBackgroundColor: isDark ? AppColors.bgDark : AppColors.bgLight,
    );

    return base.copyWith(
      textTheme: GoogleFonts.interTextTheme(base.textTheme).apply(
        bodyColor: isDark ? AppColors.inkDark : AppColors.inkLight,
        displayColor: isDark ? AppColors.inkDark : AppColors.inkLight,
      ),

      appBarTheme: AppBarTheme(
        backgroundColor: isDark ? AppColors.bgDark : AppColors.bgLight,
        surfaceTintColor: Colors.transparent,
        foregroundColor: isDark ? AppColors.inkDark : AppColors.inkLight,
        elevation: 0,
        scrolledUnderElevation: 0.5,
        centerTitle: false,
        titleTextStyle: GoogleFonts.inter(
          fontSize: 18,
          fontWeight: FontWeight.w600,
          color: isDark ? AppColors.inkDark : AppColors.inkLight,
        ),
        systemOverlayStyle: isDark ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark,
      ),

      cardTheme: CardThemeData(
        color: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(_radius + 2),
          side: BorderSide(color: isDark ? AppColors.borderDark : AppColors.borderLight),
        ),
      ),

      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(_radius - 2),
          borderSide: BorderSide(color: isDark ? AppColors.borderDark : AppColors.borderLight),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(_radius - 2),
          borderSide: BorderSide(color: isDark ? AppColors.borderDark : AppColors.borderLight),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(_radius - 2),
          borderSide: BorderSide(color: scheme.primary, width: 1.6),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(_radius - 2),
          borderSide: BorderSide(color: scheme.error),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(_radius - 2),
          borderSide: BorderSide(color: scheme.error, width: 1.6),
        ),
        hintStyle: TextStyle(color: isDark ? AppColors.mutedDark : AppColors.mutedLight),
        prefixIconColor: isDark ? AppColors.mutedDark : AppColors.mutedLight,
        suffixIconColor: isDark ? AppColors.mutedDark : AppColors.mutedLight,
      ),

      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: scheme.primary,
          foregroundColor: scheme.onPrimary,
          minimumSize: const Size(double.infinity, 54),
          elevation: 0,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(_radius - 2)),
          textStyle: GoogleFonts.inter(fontSize: 16, fontWeight: FontWeight.w600),
        ),
      ),

      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: isDark ? AppColors.inkDark : AppColors.inkLight,
          minimumSize: const Size(0, 48),
          side: BorderSide(color: isDark ? AppColors.borderDark : AppColors.borderLight),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(_radius - 2)),
          textStyle: GoogleFonts.inter(fontSize: 15, fontWeight: FontWeight.w600),
        ),
      ),

      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: scheme.primary,
          textStyle: GoogleFonts.inter(fontSize: 14, fontWeight: FontWeight.w600),
        ),
      ),

      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size(0, 48),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(_radius - 2)),
          textStyle: GoogleFonts.inter(fontSize: 15, fontWeight: FontWeight.w600),
        ),
      ),

      chipTheme: ChipThemeData(
        backgroundColor: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
        side: BorderSide(color: isDark ? AppColors.borderDark : AppColors.borderLight),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
        labelStyle: GoogleFonts.inter(fontSize: 13, fontWeight: FontWeight.w500),
      ),

      bottomNavigationBarTheme: BottomNavigationBarThemeData(
        backgroundColor: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
        selectedItemColor: scheme.primary,
        unselectedItemColor: isDark ? AppColors.mutedDark : AppColors.mutedLight,
        type: BottomNavigationBarType.fixed,
        elevation: 0,
      ),

      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
        surfaceTintColor: Colors.transparent,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
        ),
        showDragHandle: true,
      ),

      dialogTheme: DialogThemeData(
        backgroundColor: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      ),

      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(_radius - 2)),
        backgroundColor: isDark ? AppColors.surfaceLight : AppColors.inkLight,
        contentTextStyle: GoogleFonts.inter(
          fontSize: 14,
          color: isDark ? AppColors.inkLight : Colors.white,
        ),
      ),

      dividerTheme: DividerThemeData(
        color: isDark ? AppColors.borderDark : AppColors.borderLight,
        thickness: 1,
        space: 1,
      ),

      listTileTheme: const ListTileThemeData(
        contentPadding: EdgeInsets.symmetric(horizontal: 16),
      ),

      progressIndicatorTheme: ProgressIndicatorThemeData(color: scheme.primary),
    );
  }
}
