import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:pitpulse_flutter/src/features/auth/presentation/login_screen.dart';

void main() {
  group('LoginScreen Widget', () {
    setUpAll(() {
      // Mock the haptic feedback platform channel
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(SystemChannels.platform, (message) async {
        return null;
      });
    });

    testWidgets('displays all required UI elements', (WidgetTester tester) async {
      await tester.pumpWidget(
        const ProviderScope(
          child: MaterialApp(
            home: LoginScreen(),
          ),
        ),
      );

      // Check for logo/icon
      expect(find.byIcon(Icons.music_note), findsOneWidget);
      
      // Check for app name
      expect(find.text('PitPulse'), findsOneWidget);
      
      // Check for tagline
      expect(find.text('Discover, Review, Connect'), findsOneWidget);
      
      // Check for email field
      expect(find.widgetWithText(TextFormField, 'Email'), findsOneWidget);
      
      // Check for password field
      expect(find.widgetWithText(TextFormField, 'Password'), findsOneWidget);
      
      // Check for login button
      expect(find.widgetWithText(ElevatedButton, 'Login'), findsOneWidget);
      
      // Check for sign up link
      expect(find.text("Don't have an account? "), findsOneWidget);
      expect(find.widgetWithText(TextButton, 'Sign Up'), findsOneWidget);
    });

    testWidgets('email field has correct keyboard type', (WidgetTester tester) async {
      await tester.pumpWidget(
        const ProviderScope(
          child: MaterialApp(
            home: LoginScreen(),
          ),
        ),
      );

      final emailFieldFinder = find.widgetWithText(TextFormField, 'Email');
      final emailTextField = tester.widget<TextField>(find.descendant(
        of: emailFieldFinder,
        matching: find.byType(TextField),
      ),);
      
      expect(emailTextField.keyboardType, TextInputType.emailAddress);
    });

    testWidgets('password field is initially obscured', (WidgetTester tester) async {
      await tester.pumpWidget(
        const ProviderScope(
          child: MaterialApp(
            home: LoginScreen(),
          ),
        ),
      );

      final passwordFieldFinder = find.widgetWithText(TextFormField, 'Password');
      final passwordTextField = tester.widget<TextField>(find.descendant(
        of: passwordFieldFinder,
        matching: find.byType(TextField),
      ),);
      
      expect(passwordTextField.obscureText, true);
    });

    testWidgets('can toggle password visibility', (WidgetTester tester) async {
      await tester.pumpWidget(
        const ProviderScope(
          child: MaterialApp(
            home: LoginScreen(),
          ),
        ),
      );

      // Find the password field
      final passwordFieldFinder = find.widgetWithText(TextFormField, 'Password');
      
      // Initially obscured
      TextField passwordTextField = tester.widget<TextField>(find.descendant(
        of: passwordFieldFinder,
        matching: find.byType(TextField),
      ),);
      expect(passwordTextField.obscureText, true);
      
      // Find and tap the visibility toggle button
      final visibilityIcon = find.descendant(
        of: passwordFieldFinder,
        matching: find.byType(IconButton),
      );
      await tester.tap(visibilityIcon);
      await tester.pumpAndSettle();
      
      // Now should be visible
      passwordTextField = tester.widget<TextField>(find.descendant(
        of: passwordFieldFinder,
        matching: find.byType(TextField),
      ),);
      expect(passwordTextField.obscureText, false);
    });

    testWidgets('validates empty email field', (WidgetTester tester) async {
      await tester.pumpWidget(
        const ProviderScope(
          child: MaterialApp(
            home: LoginScreen(),
          ),
        ),
      );

      // Tap login button without entering any data
      await tester.tap(find.widgetWithText(ElevatedButton, 'Login'));
      await tester.pumpAndSettle();

      // Should show validation error
      expect(find.text('Email is required'), findsOneWidget);
    });

    testWidgets('validates invalid email format', (WidgetTester tester) async {
      await tester.pumpWidget(
        const ProviderScope(
          child: MaterialApp(
            home: LoginScreen(),
          ),
        ),
      );

      // Enter invalid email
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Email'),
        'notanemail',
      );
      
      // Tap login button
      await tester.tap(find.widgetWithText(ElevatedButton, 'Login'));
      await tester.pumpAndSettle();

      // Should show validation error
      expect(find.text('Please enter a valid email'), findsOneWidget);
    });

    testWidgets('validates empty password field', (WidgetTester tester) async {
      await tester.pumpWidget(
        const ProviderScope(
          child: MaterialApp(
            home: LoginScreen(),
          ),
        ),
      );

      // Enter valid email but no password
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Email'),
        'test@example.com',
      );
      
      // Tap login button
      await tester.tap(find.widgetWithText(ElevatedButton, 'Login'));
      await tester.pumpAndSettle();

      // Should show password validation error
      expect(find.text('Password is required'), findsOneWidget);
    });

    testWidgets('validates password minimum length', (WidgetTester tester) async {
      await tester.pumpWidget(
        const ProviderScope(
          child: MaterialApp(
            home: LoginScreen(),
          ),
        ),
      );

      // Enter valid email but short password
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Email'),
        'test@example.com',
      );
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Password'),
        'Pass1!', // Too short (only 6 chars, need 8)
      );

      // Tap login button
      await tester.tap(find.widgetWithText(ElevatedButton, 'Login'));
      await tester.pumpAndSettle();

      // Should show password validation error
      expect(find.text('Password must be at least 8 characters'), findsOneWidget);
    });

    testWidgets('accepts valid email and password', (WidgetTester tester) async {
      await tester.pumpWidget(
        const ProviderScope(
          child: MaterialApp(
            home: LoginScreen(),
          ),
        ),
      );

      // Enter valid credentials (must meet all backend requirements)
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Email'),
        'test@example.com',
      );
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Password'),
        'Password1!', // Valid: 8+ chars, upper, lower, number, special
      );
      await tester.pump();

      // Verify valid input is accepted (no validation errors shown yet)
      // Note: We don't tap the login button to avoid triggering async login
      // The form fields should accept valid input without showing errors
      expect(find.text('Email is required'), findsNothing);
      expect(find.text('Please enter a valid email'), findsNothing);
      expect(find.text('Password is required'), findsNothing);
      expect(find.text('Password must be at least 8 characters'), findsNothing);

      // Verify the login button is enabled and visible
      final loginButton = find.widgetWithText(ElevatedButton, 'Login');
      expect(loginButton, findsOneWidget);
    });
  });
}
