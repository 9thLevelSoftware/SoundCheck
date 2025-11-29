import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'src/core/theme/app_theme.dart';
import 'src/core/theme/theme_provider.dart';
import 'src/core/router/app_router.dart';
import 'src/core/services/crash_reporting_service.dart';

void main() async {
  // Ensure Flutter binding is initialized
  WidgetsFlutterBinding.ensureInitialized();

  // Initialize crash reporting (Sentry)
  await CrashReportingService.init();

  // Capture Flutter framework errors
  FlutterError.onError = (FlutterErrorDetails details) {
    FlutterError.presentError(details);

    // Send to crash reporting service
    CrashReportingService.captureException(
      details.exception,
      details.stack,
    );
  };

  // Capture async errors not caught by Flutter
  runZonedGuarded(
    () {
      runApp(
        const ProviderScope(
          child: PitPulseApp(),
        ),
      );
    },
    CrashReportingService.captureException,
  );
}

class PitPulseApp extends ConsumerWidget {
  const PitPulseApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(goRouterProvider);
    final themeMode = ref.watch(themeSettingProvider.notifier).getThemeMode();

    return MaterialApp.router(
      title: 'PitPulse',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.lightTheme,
      darkTheme: AppTheme.darkTheme,
      themeMode: themeMode,
      routerConfig: router,
    );
  }
}
