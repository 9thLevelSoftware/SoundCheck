import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:soundcheck_flutter/src/shared/widgets/venue_card.dart';
import 'package:soundcheck_flutter/src/features/venues/domain/venue.dart';

void main() {
  // Mock the haptic feedback platform channel
  setUp(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(SystemChannels.platform, (MethodCall methodCall) async {
      return null;
    });
  });

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(SystemChannels.platform, null);
  });

  group('VenueCard Widget', () {
    const testVenue = Venue(
      id: '1',
      name: 'Test Venue',
      description: 'A great venue',
      city: 'San Francisco',
      state: 'CA',
      averageRating: 4.5,
      totalReviews: 100,
      isActive: true,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    );

    testWidgets('displays venue name', (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: VenueCard(venue: testVenue),
          ),
        ),
      );

      expect(find.text('Test Venue'), findsOneWidget);
    });

    testWidgets('displays city and state', (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: VenueCard(venue: testVenue),
          ),
        ),
      );

      expect(find.text('San Francisco, CA'), findsOneWidget);
    });

    testWidgets('displays total reviews count', (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: VenueCard(venue: testVenue),
          ),
        ),
      );

      expect(find.text('(100)'), findsOneWidget);
    });

    testWidgets('shows location icon', (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: VenueCard(venue: testVenue),
          ),
        ),
      );

      expect(find.byIcon(Icons.location_on), findsOneWidget);
    });

    testWidgets('displays placeholder when no image URL', (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: VenueCard(venue: testVenue),
          ),
        ),
      );

      expect(find.byIcon(Icons.location_city), findsOneWidget);
    });

    testWidgets('calls onTap when card is tapped', (WidgetTester tester) async {
      var tapped = false;
      
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: VenueCard(
              venue: testVenue,
              onTap: () => tapped = true,
            ),
          ),
        ),
      );

      // Use runAsync to handle the async haptic feedback in the onTap callback
      await tester.runAsync(() async {
        await tester.tap(find.byType(InkWell));
        await tester.pumpAndSettle();
      });

      expect(tapped, true);
    });

    testWidgets('does not show location when city and state are null', (WidgetTester tester) async {
      const venueNoLocation = Venue(
        id: '1',
        name: 'Test Venue',
        averageRating: 4.5,
        totalReviews: 100,
        isActive: true,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      );

      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: VenueCard(venue: venueNoLocation),
          ),
        ),
      );

      expect(find.byIcon(Icons.location_on), findsNothing);
    });
  });
}
