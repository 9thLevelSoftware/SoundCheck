import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:soundcheck_flutter/src/shared/widgets/band_card.dart';
import 'package:soundcheck_flutter/src/features/bands/domain/band.dart';

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

  group('BandCard Widget', () {
    const testBand = Band(
      id: '1',
      name: 'Test Band',
      description: 'A great band',
      genre: 'Rock',
      averageRating: 4.5,
      totalCheckins: 150,
      isActive: true,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    );

    testWidgets('displays band name', (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: BandCard(band: testBand),
          ),
        ),
      );

      expect(find.text('Test Band'), findsOneWidget);
    });

    testWidgets('displays genre', (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: BandCard(band: testBand),
          ),
        ),
      );

      expect(find.text('Rock'), findsOneWidget);
    });

    testWidgets('displays total check-ins count', (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: BandCard(band: testBand),
          ),
        ),
      );

      expect(find.text('150 check-ins'), findsOneWidget);
    });

    testWidgets('shows music icon for genre', (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: BandCard(band: testBand),
          ),
        ),
      );

      expect(find.byIcon(Icons.music_note), findsOneWidget);
    });

    testWidgets('displays placeholder when no image URL', (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: BandCard(band: testBand),
          ),
        ),
      );

      expect(find.byIcon(Icons.music_video), findsOneWidget);
    });

    testWidgets('calls onTap when card is tapped', (WidgetTester tester) async {
      var tapped = false;
      
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: BandCard(
              band: testBand,
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

    testWidgets('does not show genre when it is null', (WidgetTester tester) async {
      const bandNoGenre = Band(
        id: '1',
        name: 'Test Band',
        averageRating: 4.5,
        totalCheckins: 150,
        isActive: true,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      );

      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: BandCard(band: bandNoGenre),
          ),
        ),
      );

      expect(find.byIcon(Icons.music_note), findsNothing);
    });
  });
}
