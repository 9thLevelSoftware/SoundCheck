import 'package:flutter/material.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';
import 'package:shared_preferences/shared_preferences.dart';

part 'theme_provider.g.dart';

/// Theme mode options
enum AppThemeMode {
  light,
  dark,
  system,
}

@Riverpod(keepAlive: true)
class ThemeSetting extends _$ThemeSetting {
  static const String _themeKey = 'theme_mode';

  @override
  AppThemeMode build() {
    _loadTheme();
    return AppThemeMode.system; // Default value
  }

  Future<void> _loadTheme() async {
    final prefs = await SharedPreferences.getInstance();
    final themeModeString = prefs.getString(_themeKey);
    if (themeModeString != null) {
      state = AppThemeMode.values.firstWhere(
        (mode) => mode.toString() == themeModeString,
        orElse: () => AppThemeMode.system,
      );
    }
  }

  Future<void> _saveTheme(AppThemeMode mode) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_themeKey, mode.toString());
  }

  Future<void> setLightTheme() async {
    state = AppThemeMode.light;
    await _saveTheme(AppThemeMode.light);
  }

  Future<void> setDarkTheme() async {
    state = AppThemeMode.dark;
    await _saveTheme(AppThemeMode.dark);
  }

  Future<void> setSystemTheme() async {
    state = AppThemeMode.system;
    await _saveTheme(AppThemeMode.system);
  }

  Future<void> setTheme(AppThemeMode mode) async {
    switch (mode) {
      case AppThemeMode.light:
        await setLightTheme();
        break;
      case AppThemeMode.dark:
        await setDarkTheme();
        break;
      case AppThemeMode.system:
        await setSystemTheme();
        break;
    }
  }

  Future<void> toggleTheme() async {
    if (state == AppThemeMode.light) {
      await setDarkTheme();
    } else {
      await setLightTheme();
    }
  }
  
  ThemeMode getThemeMode() {
    switch (state) {
      case AppThemeMode.light:
        return ThemeMode.light;
      case AppThemeMode.dark:
        return ThemeMode.dark;
      case AppThemeMode.system:
      default:
        return ThemeMode.system;
    }
  }
}

/// Provider to check if dark mode is currently active
@riverpod
bool isDarkMode(IsDarkModeRef ref) {
  final themeMode = ref.watch(themeSettingProvider);
  final brightness = WidgetsBinding.instance.platformDispatcher.platformBrightness;
  
  switch (themeMode) {
    case AppThemeMode.light:
      return false;
    case AppThemeMode.dark:
      return true;
    case AppThemeMode.system:
      return brightness == Brightness.dark;
  }
}
