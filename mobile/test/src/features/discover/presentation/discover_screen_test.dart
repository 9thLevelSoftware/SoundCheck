import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:soundcheck_flutter/src/core/error/failures.dart';
import 'package:soundcheck_flutter/src/core/providers/providers.dart';
import 'package:soundcheck_flutter/src/features/discover/presentation/discover_screen.dart';
import 'package:soundcheck_flutter/src/features/discover/presentation/providers/discover_providers.dart';
import 'package:soundcheck_flutter/src/features/trending/presentation/providers/trending_providers.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('failed recommendations show an error with retry', (
    tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        retry: (_, _) => null,
        overrides: [
          recommendedEventsProvider.overrideWith(
            (_) async => throw const ServerFailure('offline'),
          ),
          nearbyUpcomingEventsProvider.overrideWith((_) async => []),
          trendingNearbyEventsProvider.overrideWith((_) async => []),
          genreListProvider.overrideWith((_) async => []),
          popularBandsProvider.overrideWith((_) async => []),
          locationStatusProvider.overrideWith(
            (_) async => LocationStatus.granted,
          ),
          trendingFeedProvider.overrideWith((_) async => []),
        ],
        child: const MaterialApp(home: DiscoverScreen()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Couldn\'t load recommendations'), findsOneWidget);
    expect(find.text('Retry'), findsOneWidget);
    expect(find.text('No popular bands yet'), findsOneWidget);
  });
}
