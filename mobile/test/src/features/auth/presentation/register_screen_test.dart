import 'package:dartz/dartz.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:soundcheck_flutter/src/core/api/dio_client.dart';
import 'package:soundcheck_flutter/src/core/error/failures.dart';
import 'package:soundcheck_flutter/src/core/providers/providers.dart';
import 'package:soundcheck_flutter/src/features/auth/data/auth_repository.dart';
import 'package:soundcheck_flutter/src/features/auth/domain/user.dart';
import 'package:soundcheck_flutter/src/features/auth/presentation/register_screen.dart';

void main() {
  testWidgets(
    'renders the mobile registration form and validates required data',
    (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            authRepositoryProvider.overrideWithValue(
              _UsernameRepository(isAvailable: true),
            ),
          ],
          child: const MaterialApp(home: RegisterScreen()),
        ),
      );

      expect(find.text('Join SoundCheck'), findsOneWidget);
      expect(find.widgetWithText(TextFormField, 'Email *'), findsOneWidget);
      expect(find.widgetWithText(TextFormField, 'Username *'), findsOneWidget);
      expect(
        find.widgetWithText(TextFormField, 'First Name (optional)'),
        findsOneWidget,
      );
      expect(
        find.widgetWithText(TextFormField, 'Last Name (optional)'),
        findsOneWidget,
      );
      expect(find.widgetWithText(TextFormField, 'Password *'), findsOneWidget);
      expect(
        find.widgetWithText(TextFormField, 'Confirm Password *'),
        findsOneWidget,
      );

      final createAccount = find.widgetWithText(
        ElevatedButton,
        'Create Account',
      );
      await tester.ensureVisible(createAccount);
      await tester.tap(createAccount);
      await tester.pump();

      expect(find.text('Email is required'), findsOneWidget);
      expect(find.text('Username is required'), findsOneWidget);
      expect(find.text('Password is required'), findsOneWidget);
      expect(find.text('Please confirm your password'), findsOneWidget);
    },
  );

  testWidgets('shows password strength and supports both visibility controls', (
    tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authRepositoryProvider.overrideWithValue(
            _UsernameRepository(isAvailable: true),
          ),
        ],
        child: const MaterialApp(home: RegisterScreen()),
      ),
    );

    final passwordForm = find.widgetWithText(TextFormField, 'Password *');
    final confirmForm = find.widgetWithText(
      TextFormField,
      'Confirm Password *',
    );
    await tester.enterText(passwordForm, 'StrongPass1!');
    await tester.pump();

    expect(find.text('Strong'), findsOneWidget);

    final passwordToggle = find.descendant(
      of: passwordForm,
      matching: find.byType(IconButton),
    );
    final confirmToggle = find.descendant(
      of: confirmForm,
      matching: find.byType(IconButton),
    );
    await tester.ensureVisible(passwordToggle);
    await tester.tap(passwordToggle);
    await tester.pump();
    await tester.ensureVisible(confirmToggle);
    await tester.tap(confirmToggle);
    await tester.pump();

    final passwordField = tester.widget<TextField>(
      find.descendant(of: passwordForm, matching: find.byType(TextField)),
    );
    final confirmField = tester.widget<TextField>(
      find.descendant(of: confirmForm, matching: find.byType(TextField)),
    );
    expect(passwordField.obscureText, isFalse);
    expect(confirmField.obscureText, isFalse);

    await tester.enterText(confirmForm, 'DifferentPass1!');
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pump();
    expect(find.text('Passwords do not match'), findsOneWidget);
  });

  testWidgets('debounces username checks and reports unavailable names', (
    tester,
  ) async {
    final repository = _UsernameRepository(isAvailable: false);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [authRepositoryProvider.overrideWithValue(repository)],
        child: const MaterialApp(home: RegisterScreen()),
      ),
    );

    final usernameForm = find.widgetWithText(TextFormField, 'Username *');
    await tester.enterText(usernameForm, 'taken_name');
    await tester.pump(const Duration(milliseconds: 550));
    await tester.pump();

    expect(repository.requestedUsernames, ['taken_name']);
    expect(find.text('Username is already taken'), findsOneWidget);
  });

  testWidgets('shows the same check-your-email confirmation after submit', (
    tester,
  ) async {
    const message = 'Check your email to finish creating your account.';
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authRepositoryProvider.overrideWithValue(
            _UsernameRepository(isAvailable: true, registerMessage: message),
          ),
        ],
        child: const MaterialApp(home: RegisterScreen()),
      ),
    );

    await tester.enterText(
      find.widgetWithText(TextFormField, 'Email *'),
      'fan@example.com',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Username *'),
      'fan_name',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Password *'),
      'StrongPass1!',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Confirm Password *'),
      'StrongPass1!',
    );

    final createAccount = find.widgetWithText(ElevatedButton, 'Create Account');
    await tester.ensureVisible(createAccount);
    await tester.tap(createAccount);
    await tester.pumpAndSettle();

    expect(find.text(message), findsOneWidget);
    expect(find.text('Check your email'), findsOneWidget);
    expect(find.text('Then sign in with your password.'), findsOneWidget);
    expect(find.text('Back to sign in'), findsOneWidget);
    expect(
      find.text('An account with this email already exists'),
      findsNothing,
    );
    expect(find.text('Account created successfully!'), findsNothing);
  });
}

class _UsernameRepository extends AuthRepository {
  _UsernameRepository({required this.isAvailable, this.registerMessage})
    : super(
        dioClient: DioClient(secureStorage: const FlutterSecureStorage()),
        secureStorage: const FlutterSecureStorage(),
      );

  final bool isAvailable;
  final String? registerMessage;
  final requestedUsernames = <String>[];

  @override
  Future<Either<Failure, bool>> checkUsernameAvailability(
    String username,
  ) async {
    requestedUsernames.add(username);
    return Right(isAvailable);
  }

  @override
  Future<Either<Failure, String>> register(RegisterRequest request) async {
    return Right(
      registerMessage ?? 'Check your email to finish creating your account.',
    );
  }
}
