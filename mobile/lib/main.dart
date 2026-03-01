import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'src/core/theme/app_theme.dart';
import 'src/core/router/app_router.dart';
import 'src/core/services/crash_reporting_service.dart';
import 'src/core/services/analytics_service.dart';
import 'src/features/subscription/presentation/subscription_service.dart';

void main() {
  // Capture async errors not caught by Flutter
  // NOTE: All initialization must happen inside the same zone as runApp
  runZonedGuarded(
    () async {
      // Ensure Flutter binding is initialized (inside zone)
      WidgetsFlutterBinding.ensureInitialized();

      // Initialize crash reporting (Sentry)
      await CrashReportingService.init();

      // Initialize analytics (Firebase Analytics)
      await AnalyticsService.initialize();

      // Initialize RevenueCat subscriptions
      await SubscriptionService.initialize();

      // Capture Flutter framework errors
      FlutterError.onError = (FlutterErrorDetails details) {
        FlutterError.presentError(details);

        // Send to crash reporting service
        CrashReportingService.captureException(
          details.exception,
          details.stack,
        );
      };

      runApp(
        const ProviderScope(
          child: SoundCheckApp(),
        ),
      );
    },
    CrashReportingService.captureException,
  );
}

class SoundCheckApp extends ConsumerWidget {
  const SoundCheckApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(goRouterProvider);

    return MaterialApp.router(
      title: 'SoundCheck',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.lightTheme,
      darkTheme: AppTheme.darkTheme,
      themeMode: ThemeMode.dark, // Beta: dark-only
      routerConfig: router,
    );
  }
}
