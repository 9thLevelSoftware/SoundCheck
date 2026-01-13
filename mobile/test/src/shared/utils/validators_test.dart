import 'package:flutter_test/flutter_test.dart';
import 'package:soundcheck_flutter/src/shared/utils/validators.dart';

void main() {
  group('Validators', () {
    group('email', () {
      test('returns null for valid email', () {
        expect(Validators.email('test@example.com'), null);
        expect(Validators.email('user.name@domain.co.uk'), null);
        expect(Validators.email('name+tag@example.com'), null);
      });

      test('returns error for empty email', () {
        expect(Validators.email(''), 'Email is required');
        expect(Validators.email(null), 'Email is required');
      });

      test('returns error for invalid email format', () {
        expect(Validators.email('notanemail'), isNotNull);
        expect(Validators.email('missing@domain'), isNotNull);
        expect(Validators.email('@example.com'), isNotNull);
        expect(Validators.email('user@'), isNotNull);
      });
    });

    group('password', () {
      test('returns null for valid password', () {
        // Backend requires: 8+ chars, uppercase, lowercase, number, special char
        expect(Validators.password('Password1!'), null);
        expect(Validators.password('SecureP@ss1'), null);
        expect(Validators.password('MyPass123!'), null);
      });

      test('returns error for empty password', () {
        expect(Validators.password(''), 'Password is required');
        expect(Validators.password(null), 'Password is required');
      });

      test('returns error for password less than 8 characters', () {
        expect(Validators.password('Pass1!'), 'Password must be at least 8 characters');
        expect(Validators.password('Aa1!xyz'), 'Password must be at least 8 characters');
      });

      test('returns error for password without lowercase', () {
        expect(
          Validators.password('PASSWORD1!'),
          'Password must contain at least one lowercase letter',
        );
      });

      test('returns error for password without uppercase', () {
        expect(
          Validators.password('password1!'),
          'Password must contain at least one uppercase letter',
        );
      });

      test('returns error for password without number', () {
        expect(
          Validators.password('Password!!'),
          'Password must contain at least one number',
        );
      });

      test('returns error for password without special character', () {
        expect(
          Validators.password('Password123'),
          contains('special character'),
        );
      });
    });

    group('username', () {
      test('returns null for valid username', () {
        expect(Validators.username('user123'), null);
        expect(Validators.username('test_user'), null);
        expect(Validators.username('validName'), null);
        expect(Validators.username('user.name'), null); // dots allowed
        expect(Validators.username('user-name'), null); // hyphens allowed
      });

      test('returns error for empty username', () {
        expect(Validators.username(''), 'Username is required');
        expect(Validators.username(null), 'Username is required');
      });

      test('returns error for username less than 3 characters', () {
        expect(Validators.username('ab'), 'Username must be at least 3 characters');
      });

      test('returns error for username more than 30 characters', () {
        expect(
          Validators.username('a' * 31),
          'Username must be no more than 30 characters',
        );
      });

      test('returns error for invalid characters in username', () {
        expect(
          Validators.username('user name'),
          'Username can only contain letters, numbers, dots, hyphens, and underscores',
        );
        expect(
          Validators.username('user@name'),
          'Username can only contain letters, numbers, dots, hyphens, and underscores',
        );
        expect(
          Validators.username('user!name'),
          'Username can only contain letters, numbers, dots, hyphens, and underscores',
        );
      });
    });

    group('required', () {
      test('returns null for non-empty value', () {
        expect(Validators.required('some value'), null);
      });

      test('returns error for empty value', () {
        expect(Validators.required(''), 'This field is required');
        expect(Validators.required(null), 'This field is required');
      });

      test('returns custom field name in error message', () {
        expect(
          Validators.required('', fieldName: 'Name'),
          'Name is required',
        );
      });
    });

    group('minLength', () {
      test('returns null for value meeting minimum length', () {
        expect(Validators.minLength('12345', 5), null);
        expect(Validators.minLength('123456', 5), null);
      });

      test('returns null for empty value', () {
        expect(Validators.minLength('', 5), null);
        expect(Validators.minLength(null, 5), null);
      });

      test('returns error for value below minimum length', () {
        expect(
          Validators.minLength('1234', 5),
          'This field must be at least 5 characters',
        );
      });

      test('returns custom field name in error message', () {
        expect(
          Validators.minLength('12', 5, fieldName: 'Password'),
          'Password must be at least 5 characters',
        );
      });
    });

    group('maxLength', () {
      test('returns null for value within maximum length', () {
        expect(Validators.maxLength('12345', 5), null);
        expect(Validators.maxLength('1234', 5), null);
      });

      test('returns null for empty value', () {
        expect(Validators.maxLength('', 5), null);
        expect(Validators.maxLength(null, 5), null);
      });

      test('returns error for value exceeding maximum length', () {
        expect(
          Validators.maxLength('123456', 5),
          'This field must be no more than 5 characters',
        );
      });

      test('returns custom field name in error message', () {
        expect(
          Validators.maxLength('123456', 5, fieldName: 'Bio'),
          'Bio must be no more than 5 characters',
        );
      });
    });

    group('phone', () {
      test('returns null for valid phone numbers', () {
        expect(Validators.phone('1234567890'), null);
        expect(Validators.phone('+1-234-567-8900'), null);
        expect(Validators.phone('(123) 456-7890'), null);
      });

      test('returns null for empty phone (optional field)', () {
        expect(Validators.phone(''), null);
        expect(Validators.phone(null), null);
      });

      test('returns error for invalid phone format', () {
        expect(Validators.phone('abc-def-ghij'), isNotNull);
        expect(Validators.phone('phone@number'), isNotNull);
      });
    });

    group('url', () {
      test('returns null for valid URLs', () {
        expect(Validators.url('https://example.com'), null);
        expect(Validators.url('http://www.example.com'), null);
        expect(Validators.url('https://example.com/path?query=value'), null);
      });

      test('returns null for empty URL (optional field)', () {
        expect(Validators.url(''), null);
        expect(Validators.url(null), null);
      });

      test('returns error for invalid URL format', () {
        expect(Validators.url('not a url'), isNotNull);
        expect(Validators.url('example.com'), isNotNull);
        expect(Validators.url('ftp://example.com'), isNotNull);
      });
    });

    group('rating', () {
      test('returns null for valid ratings', () {
        expect(Validators.rating(1.0), null);
        expect(Validators.rating(3.5), null);
        expect(Validators.rating(5.0), null);
      });

      test('returns error for null rating', () {
        expect(Validators.rating(null), 'Rating is required');
      });

      test('returns error for rating out of range', () {
        expect(Validators.rating(0.5), 'Rating must be between 1 and 5');
        expect(Validators.rating(5.5), 'Rating must be between 1 and 5');
        expect(Validators.rating(0.0), 'Rating must be between 1 and 5');
        expect(Validators.rating(6.0), 'Rating must be between 1 and 5');
      });
    });
  });
}
