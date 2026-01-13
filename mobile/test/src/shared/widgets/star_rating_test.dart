import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:soundcheck_flutter/src/shared/widgets/star_rating.dart';
import 'package:soundcheck_flutter/src/core/theme/app_theme.dart';

void main() {
  group('StarRating Widget', () {
    testWidgets('displays 5 stars', (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: StarRating(rating: 3.0),
          ),
        ),
      );

      final starIcons = find.byType(Icon);
      expect(starIcons, findsNWidgets(5));
    });

    testWidgets('displays full stars for integer rating', (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: StarRating(rating: 3.0),
          ),
        ),
      );

      final fullStars = find.byIcon(Icons.star);
      final emptyStars = find.byIcon(Icons.star_border);
      
      expect(fullStars, findsNWidgets(3));
      expect(emptyStars, findsNWidgets(2));
    });

    testWidgets('displays half star for decimal rating', (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: StarRating(rating: 3.5),
          ),
        ),
      );

      final fullStars = find.byIcon(Icons.star);
      final halfStars = find.byIcon(Icons.star_half);
      final emptyStars = find.byIcon(Icons.star_border);
      
      expect(fullStars, findsNWidgets(3));
      expect(halfStars, findsOneWidget);
      expect(emptyStars, findsOneWidget);
    });

    testWidgets('displays all full stars for rating 5.0', (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: StarRating(rating: 5.0),
          ),
        ),
      );

      final fullStars = find.byIcon(Icons.star);
      expect(fullStars, findsNWidgets(5));
    });

    testWidgets('displays all empty stars for rating 0.0', (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: StarRating(rating: 0.0),
          ),
        ),
      );

      final emptyStars = find.byIcon(Icons.star_border);
      expect(emptyStars, findsNWidgets(5));
    });

    testWidgets('uses custom size when provided', (WidgetTester tester) async {
      const customSize = 32.0;
      
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: StarRating(
              rating: 3.0,
              size: customSize,
            ),
          ),
        ),
      );

      final icon = tester.widget<Icon>(find.byType(Icon).first);
      expect(icon.size, customSize);
    });

    testWidgets('uses default warning color', (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: StarRating(rating: 3.0),
          ),
        ),
      );

      final icon = tester.widget<Icon>(find.byType(Icon).first);
      expect(icon.color, AppTheme.warning);
    });

    testWidgets('uses custom color when provided', (WidgetTester tester) async {
      const customColor = Colors.blue;
      
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: StarRating(
              rating: 3.0,
              color: customColor,
            ),
          ),
        ),
      );

      final icon = tester.widget<Icon>(find.byType(Icon).first);
      expect(icon.color, customColor);
    });
  });
}
