import 'package:flutter/material.dart';

/// AppTheme defines the application's visual design
/// 2025 Trend: "Bio-Luminescent" - Acid Lime on Deep Gunmetal
/// High energy, high contrast, avoiding the "AI Purple" stereotype.
class AppTheme {
  // Private constructor to prevent instantiation
  AppTheme._();

  // SoundCheck Brand Colors - "High Voltage" Style
  // 2025 Trend: Acid/Volt Greens are dominating dark mode interfaces for energetic brands
  static const Color voltLime = Color(0xFFD2FF00); // Primary Accent (High visibility)
  static const Color voltLimeLight = Color(0xFFE4FF5F);
  static const Color voltLimeDark = Color(0xFF9FB300);

  // Secondary Accents
  // "Electric Blue" pairs well for cool contrast without blending into purple
  static const Color electricBlue = Color(0xFF00F0FF);
  static const Color hotOrange = Color(0xFFFF3D00); // "Live Now" / Urgent indicator

  // Semantic Colors
  static const Color liveIndicator = hotOrange;
  static const Color toastGold = Color(0xFFFFD700); // Kept for legacy "Toast" feature

  // Accent color aliases
  static const Color accentCyan = electricBlue;
  static const Color accentAlert = hotOrange;
  static const Color accentTeal = electricBlue; // Alias for backward compatibility
  static const Color accentOrange = hotOrange;

  // Background Colors - "Moonlit Grey" Palette (inline values for internal theme use)
  // Avoids pure black (#000000) for better eye comfort and depth
  static const Color _backgroundDark = Color(0xFF0D0F11); // Very deep slate/almost black
  static const Color _surfaceDark = Color(0xFF161B22); // Slightly lighter gunmetal
  static const Color _surfaceVariantDark = Color(0xFF21262D); // Borders/Inputs
  static const Color _cardDark = Color(0xFF1C2128);

  // Text Colors - High Contrast
  static const Color textPrimary = Color(0xFFF0F6FC); // Off-white/Ice
  static const Color textSecondary = Color(0xFF8B949E);
  static const Color textTertiary = Color(0xFF6E7681);
  static const Color textMuted = Color(0xFF484F58);

  // Status Colors
  static const Color success = voltLime;
  static const Color error = Color(0xFFFF5252);
  static const Color warning = Color(0xFFFFAB00);
  static const Color info = electricBlue;

  // Rating Colors (for 5-icon rating system)
  static const Color ratingActive = voltLime;
  static const Color ratingInactive = Color(0xFF30363D);

  // Rating Color Scale
  static const Color ratingExcellent = voltLime; // 4.5+
  static const Color ratingGood = Color(0xFF2EA043); // 4.0+ (Forest Green)
  static const Color ratingAverage = Color(0xFFFFAB00); // 3.0+
  static const Color ratingPoor = Color(0xFFFF5252); // Below 3.0

  // Primary alias for convenience
  static const Color primary = voltLime;

  // Gradients
  // 2025 Trend: Subtle, "Brand-Centric" gradients rather than generic mesh
  static const LinearGradient primaryGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [voltLime, Color(0xFF8CFF00)], // Subtle lime shift
  );

  static const LinearGradient checkInGradient = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [voltLime, voltLimeDark],
  );

  static const LinearGradient cardOverlayGradient = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [Colors.transparent, Color(0xCC0D0F11)], // Matches backgroundDark
  );

  // Spacing
  static const double spacing4 = 4.0;
  static const double spacing8 = 8.0;
  static const double spacing12 = 12.0;
  static const double spacing16 = 16.0;
  static const double spacing20 = 20.0;
  static const double spacing24 = 24.0;
  static const double spacing32 = 32.0;
  static const double spacing48 = 48.0;
  static const double spacing64 = 64.0;

  // Border Radius
  static const double radiusSmall = 8.0;
  static const double radiusMedium = 12.0;
  static const double radiusLarge = 16.0;
  static const double radiusXLarge = 24.0;
  static const double radiusFull = 9999.0;

  // Check-in Button Size
  static const double checkInButtonSize = 64.0;
  static const double checkInButtonElevation = 8.0;

  // Dark Theme (Primary - Bio-Luminescent)
  static ThemeData darkTheme = ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    colorScheme: const ColorScheme.dark(
      primary: voltLime,
      secondary: electricBlue,
      tertiary: hotOrange,
      surface: _surfaceDark,
      surfaceContainerHigh: _cardDark,
      surfaceContainerHighest: _surfaceVariantDark,
      error: error,
      onPrimary: _backgroundDark, // Dark text on Lime button for contrast
      onSecondary: _backgroundDark,
      onSurface: textPrimary,
      onError: Colors.white,
    ),
    scaffoldBackgroundColor: _backgroundDark,

    // AppBar Theme - Brutalist/Minimal
    appBarTheme: const AppBarTheme(
      elevation: 0,
      centerTitle: false,
      scrolledUnderElevation: 0,
      backgroundColor: _backgroundDark,
      foregroundColor: textPrimary,
      titleTextStyle: TextStyle(
        fontSize: 24,
        fontWeight: FontWeight.bold,
        color: textPrimary,
        letterSpacing: -0.5,
      ),
      iconTheme: IconThemeData(color: textPrimary),
    ),

    // Card Theme - Dark with subtle border
    cardTheme: CardThemeData(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(radiusLarge),
        side: const BorderSide(color: _surfaceVariantDark, width: 1),
      ),
      color: _cardDark,
      margin: const EdgeInsets.symmetric(
        horizontal: spacing16,
        vertical: spacing8,
      ),
    ),

    // Input Decoration Theme - Integrated
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: _surfaceVariantDark,
      hintStyle: const TextStyle(color: textTertiary),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(radiusMedium),
        borderSide: BorderSide.none,
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(radiusMedium),
        borderSide: BorderSide.none,
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(radiusMedium),
        borderSide: const BorderSide(color: voltLime, width: 1),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(radiusMedium),
        borderSide: const BorderSide(color: error, width: 1),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(radiusMedium),
        borderSide: const BorderSide(color: error, width: 2),
      ),
      contentPadding: const EdgeInsets.symmetric(
        horizontal: spacing20,
        vertical: spacing16,
      ),
    ),

    // Elevated Button Theme - "High Voltage"
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: voltLime,
        foregroundColor: _backgroundDark, // Dark text on Lime
        minimumSize: const Size.fromHeight(56),
        padding: const EdgeInsets.symmetric(
          horizontal: spacing32,
          vertical: spacing16,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radiusMedium),
        ),
        elevation: 0,
        textStyle: const TextStyle(
          fontSize: 16,
          fontWeight: FontWeight.bold,
          letterSpacing: 0.5,
        ),
      ),
    ),

    // Filled Button Theme
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: voltLime,
        foregroundColor: _backgroundDark,
        minimumSize: const Size.fromHeight(56),
        padding: const EdgeInsets.symmetric(
          horizontal: spacing32,
          vertical: spacing16,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radiusMedium),
        ),
        elevation: 0,
        textStyle: const TextStyle(
          fontSize: 16,
          fontWeight: FontWeight.bold,
          letterSpacing: 0.5,
        ),
      ),
    ),

    // Text Button Theme
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: voltLime,
        padding: const EdgeInsets.symmetric(
          horizontal: spacing20,
          vertical: spacing12,
        ),
        textStyle: const TextStyle(
          fontSize: 15,
          fontWeight: FontWeight.w600,
          letterSpacing: 0.3,
        ),
      ),
    ),

    // Outlined Button Theme
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: voltLime,
        side: const BorderSide(color: voltLime, width: 1.5),
        minimumSize: const Size.fromHeight(56),
        padding: const EdgeInsets.symmetric(
          horizontal: spacing32,
          vertical: spacing16,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radiusMedium),
        ),
        textStyle: const TextStyle(
          fontSize: 16,
          fontWeight: FontWeight.bold,
        ),
      ),
    ),

    // Bottom Navigation Bar Theme - Clean
    bottomNavigationBarTheme: const BottomNavigationBarThemeData(
      backgroundColor: _surfaceDark,
      selectedItemColor: voltLime,
      unselectedItemColor: textTertiary,
      type: BottomNavigationBarType.fixed,
      elevation: 0,
      selectedLabelStyle: TextStyle(
        fontWeight: FontWeight.w600,
        fontSize: 11,
      ),
      unselectedLabelStyle: TextStyle(
        fontWeight: FontWeight.w500,
        fontSize: 11,
      ),
    ),

    // Chip Theme - Vibe Tags
    chipTheme: ChipThemeData(
      backgroundColor: _surfaceVariantDark,
      selectedColor: voltLime.withValues(alpha: 0.2),
      deleteIconColor: textSecondary,
      labelStyle: const TextStyle(
        color: textPrimary,
        fontWeight: FontWeight.w500,
        fontSize: 13,
      ),
      secondaryLabelStyle: const TextStyle(
        color: voltLime,
        fontWeight: FontWeight.w600,
      ),
      padding: const EdgeInsets.symmetric(
        horizontal: spacing12,
        vertical: spacing8,
      ),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(radiusFull),
        side: const BorderSide(color: Colors.transparent),
      ),
    ),

    // Floating Action Button Theme - Check-In Button
    floatingActionButtonTheme: const FloatingActionButtonThemeData(
      backgroundColor: voltLime,
      foregroundColor: _backgroundDark,
      elevation: 4,
      shape: CircleBorder(),
      sizeConstraints: BoxConstraints.tightFor(
        width: checkInButtonSize,
        height: checkInButtonSize,
      ),
    ),

    // Divider Theme
    dividerTheme: const DividerThemeData(
      color: _surfaceVariantDark,
      thickness: 1,
      space: spacing16,
    ),

    // Tab Bar Theme
    tabBarTheme: const TabBarThemeData(
      labelColor: voltLime,
      unselectedLabelColor: textTertiary,
      indicatorColor: voltLime,
      indicatorSize: TabBarIndicatorSize.label,
      labelStyle: TextStyle(
        fontSize: 14,
        fontWeight: FontWeight.w600,
      ),
      unselectedLabelStyle: TextStyle(
        fontSize: 14,
        fontWeight: FontWeight.w500,
      ),
    ),

    // Text Theme
    textTheme: const TextTheme(
      displayLarge: TextStyle(
        fontSize: 40,
        fontWeight: FontWeight.bold,
        color: textPrimary,
        letterSpacing: -1.0,
        height: 1.2,
      ),
      displayMedium: TextStyle(
        fontSize: 32,
        fontWeight: FontWeight.bold,
        color: textPrimary,
        letterSpacing: -0.8,
        height: 1.2,
      ),
      displaySmall: TextStyle(
        fontSize: 28,
        fontWeight: FontWeight.bold,
        color: textPrimary,
        letterSpacing: -0.5,
        height: 1.3,
      ),
      headlineLarge: TextStyle(
        fontSize: 24,
        fontWeight: FontWeight.bold,
        color: textPrimary,
        letterSpacing: -0.3,
        height: 1.3,
      ),
      headlineMedium: TextStyle(
        fontSize: 20,
        fontWeight: FontWeight.w700,
        color: textPrimary,
        letterSpacing: 0,
        height: 1.4,
      ),
      headlineSmall: TextStyle(
        fontSize: 18,
        fontWeight: FontWeight.w700,
        color: textPrimary,
        letterSpacing: 0,
        height: 1.4,
      ),
      titleLarge: TextStyle(
        fontSize: 18,
        fontWeight: FontWeight.w600,
        color: textPrimary,
        letterSpacing: 0,
        height: 1.4,
      ),
      titleMedium: TextStyle(
        fontSize: 16,
        fontWeight: FontWeight.w600,
        color: textPrimary,
        letterSpacing: 0.1,
        height: 1.5,
      ),
      titleSmall: TextStyle(
        fontSize: 14,
        fontWeight: FontWeight.w600,
        color: textPrimary,
        letterSpacing: 0.1,
        height: 1.5,
      ),
      bodyLarge: TextStyle(
        fontSize: 16,
        fontWeight: FontWeight.normal,
        color: textPrimary,
        letterSpacing: 0.15,
        height: 1.6,
      ),
      bodyMedium: TextStyle(
        fontSize: 14,
        fontWeight: FontWeight.normal,
        color: textPrimary,
        letterSpacing: 0.15,
        height: 1.6,
      ),
      bodySmall: TextStyle(
        fontSize: 12,
        fontWeight: FontWeight.normal,
        color: textSecondary,
        letterSpacing: 0.2,
        height: 1.5,
      ),
      labelLarge: TextStyle(
        fontSize: 14,
        fontWeight: FontWeight.w600,
        color: textPrimary,
        letterSpacing: 0.5,
        height: 1.4,
      ),
      labelMedium: TextStyle(
        fontSize: 12,
        fontWeight: FontWeight.w600,
        color: textPrimary,
        letterSpacing: 0.5,
        height: 1.4,
      ),
      labelSmall: TextStyle(
        fontSize: 11,
        fontWeight: FontWeight.w500,
        color: textSecondary,
        letterSpacing: 0.5,
        height: 1.4,
      ),
    ),

    // Icon Theme
    iconTheme: const IconThemeData(
      color: textPrimary,
      size: 24,
    ),

    // Progress Indicator Theme
    progressIndicatorTheme: const ProgressIndicatorThemeData(
      color: voltLime,
    ),

    // Slider Theme (for ratings)
    sliderTheme: SliderThemeData(
      activeTrackColor: voltLime,
      inactiveTrackColor: _surfaceVariantDark,
      thumbColor: voltLime,
      overlayColor: voltLime.withValues(alpha: 0.2),
      valueIndicatorColor: voltLime,
      valueIndicatorTextStyle: const TextStyle(
        color: _backgroundDark,
        fontWeight: FontWeight.bold,
      ),
    ),

    // Switch Theme
    switchTheme: SwitchThemeData(
      thumbColor: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.selected)) {
          return voltLime;
        }
        return textTertiary;
      }),
      trackColor: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.selected)) {
          return voltLime.withValues(alpha: 0.5);
        }
        return _surfaceVariantDark;
      }),
    ),

    // Bottom Sheet Theme
    bottomSheetTheme: const BottomSheetThemeData(
      backgroundColor: _surfaceDark,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(
          top: Radius.circular(radiusXLarge),
        ),
      ),
    ),

    // Dialog Theme
    dialogTheme: DialogThemeData(
      backgroundColor: _surfaceDark,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(radiusLarge),
      ),
    ),

    // Snackbar Theme
    snackBarTheme: SnackBarThemeData(
      backgroundColor: _cardDark,
      contentTextStyle: const TextStyle(color: textPrimary),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(radiusMedium),
      ),
      behavior: SnackBarBehavior.floating,
    ),
  );

  // Light Theme (Clean Technical)
  static ThemeData lightTheme = ThemeData(
    useMaterial3: true,
    colorScheme: const ColorScheme.light(
      primary: Color(0xFF2E7D32), // Darker Green for light mode readability
      secondary: Color(0xFF0091EA),
      tertiary: hotOrange,
      surface: Colors.white,
      error: error,
      onPrimary: Colors.white,
      onSecondary: Colors.white,
      onSurface: Color(0xFF0D0F11),
      onError: Colors.white,
    ),
    scaffoldBackgroundColor: const Color(0xFFF0F2F5),

    appBarTheme: const AppBarTheme(
      elevation: 0,
      centerTitle: false,
      scrolledUnderElevation: 0,
      backgroundColor: Colors.white,
      foregroundColor: Color(0xFF0D0F11),
      titleTextStyle: TextStyle(
        fontSize: 24,
        fontWeight: FontWeight.bold,
        color: Color(0xFF0D0F11),
        letterSpacing: -0.5,
      ),
      iconTheme: IconThemeData(color: Color(0xFF0D0F11)),
    ),

    // Icon Theme
    iconTheme: const IconThemeData(
      color: Color(0xFF0D0F11),
      size: 24,
    ),

    cardTheme: CardThemeData(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(radiusLarge),
        side: BorderSide(color: Colors.grey.shade200, width: 1),
      ),
      color: Colors.white,
      margin: const EdgeInsets.symmetric(
        horizontal: spacing16,
        vertical: spacing8,
      ),
    ),

    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: const Color(0xFFF0F0F0),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(radiusMedium),
        borderSide: BorderSide.none,
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(radiusMedium),
        borderSide: BorderSide.none,
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(radiusMedium),
        borderSide: const BorderSide(color: Color(0xFF2E7D32), width: 1),
      ),
      contentPadding: const EdgeInsets.symmetric(
        horizontal: spacing20,
        vertical: spacing16,
      ),
    ),

    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: const Color(0xFF2E7D32),
        foregroundColor: Colors.white,
        minimumSize: const Size.fromHeight(56),
        padding: const EdgeInsets.symmetric(
          horizontal: spacing32,
          vertical: spacing16,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radiusMedium),
        ),
        elevation: 0,
        textStyle: const TextStyle(
          fontSize: 16,
          fontWeight: FontWeight.bold,
          letterSpacing: 0.5,
        ),
      ),
    ),

    bottomNavigationBarTheme: const BottomNavigationBarThemeData(
      backgroundColor: Colors.white,
      selectedItemColor: Color(0xFF2E7D32),
      unselectedItemColor: Color(0xFF6E7681),
      type: BottomNavigationBarType.fixed,
      elevation: 8,
      selectedLabelStyle: TextStyle(
        fontWeight: FontWeight.w600,
        fontSize: 11,
      ),
      unselectedLabelStyle: TextStyle(
        fontWeight: FontWeight.w500,
        fontSize: 11,
      ),
    ),

    chipTheme: ChipThemeData(
      backgroundColor: const Color(0xFFF0F0F0),
      selectedColor: const Color(0xFF2E7D32),
      labelStyle: const TextStyle(
        color: Color(0xFF0D0F11),
        fontWeight: FontWeight.w500,
        fontSize: 13,
      ),
      padding: const EdgeInsets.symmetric(
        horizontal: spacing12,
        vertical: spacing8,
      ),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(radiusFull),
      ),
    ),

    floatingActionButtonTheme: const FloatingActionButtonThemeData(
      backgroundColor: Color(0xFF2E7D32),
      foregroundColor: Colors.white,
      elevation: checkInButtonElevation,
      shape: CircleBorder(),
      sizeConstraints: BoxConstraints.tightFor(
        width: checkInButtonSize,
        height: checkInButtonSize,
      ),
    ),

    tabBarTheme: const TabBarThemeData(
      labelColor: Color(0xFF2E7D32),
      unselectedLabelColor: Color(0xFF6E7681),
      indicatorColor: Color(0xFF2E7D32),
      indicatorSize: TabBarIndicatorSize.label,
    ),

    textTheme: const TextTheme(
      displayLarge: TextStyle(
        fontSize: 40,
        fontWeight: FontWeight.bold,
        color: Color(0xFF0D0F11),
        letterSpacing: -1.0,
      ),
      displayMedium: TextStyle(
        fontSize: 32,
        fontWeight: FontWeight.bold,
        color: Color(0xFF0D0F11),
        letterSpacing: -0.8,
      ),
      displaySmall: TextStyle(
        fontSize: 28,
        fontWeight: FontWeight.bold,
        color: Color(0xFF0D0F11),
        letterSpacing: -0.5,
      ),
      headlineLarge: TextStyle(
        fontSize: 24,
        fontWeight: FontWeight.bold,
        color: Color(0xFF0D0F11),
      ),
      headlineMedium: TextStyle(
        fontSize: 20,
        fontWeight: FontWeight.w700,
        color: Color(0xFF0D0F11),
      ),
      headlineSmall: TextStyle(
        fontSize: 18,
        fontWeight: FontWeight.w700,
        color: Color(0xFF0D0F11),
      ),
      titleLarge: TextStyle(
        fontSize: 18,
        fontWeight: FontWeight.w600,
        color: Color(0xFF0D0F11),
      ),
      titleMedium: TextStyle(
        fontSize: 16,
        fontWeight: FontWeight.w600,
        color: Color(0xFF0D0F11),
      ),
      titleSmall: TextStyle(
        fontSize: 14,
        fontWeight: FontWeight.w600,
        color: Color(0xFF0D0F11),
      ),
      bodyLarge: TextStyle(
        fontSize: 16,
        fontWeight: FontWeight.normal,
        color: Color(0xFF0D0F11),
      ),
      bodyMedium: TextStyle(
        fontSize: 14,
        fontWeight: FontWeight.normal,
        color: Color(0xFF0D0F11),
      ),
      bodySmall: TextStyle(
        fontSize: 12,
        fontWeight: FontWeight.normal,
        color: Color(0xFF6E7681),
      ),
      labelLarge: TextStyle(
        fontSize: 14,
        fontWeight: FontWeight.w600,
        color: Color(0xFF0D0F11),
      ),
      labelMedium: TextStyle(
        fontSize: 12,
        fontWeight: FontWeight.w600,
        color: Color(0xFF0D0F11),
      ),
      labelSmall: TextStyle(
        fontSize: 11,
        fontWeight: FontWeight.w500,
        color: Color(0xFF6E7681),
      ),
    ),
  );
}
