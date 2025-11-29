import 'package:flutter/services.dart';
import 'package:local_auth/local_auth.dart';
import 'log_service.dart';

class BiometricService {
  final LocalAuthentication _auth = LocalAuthentication();

  Future<bool> isBiometricAvailable() async {
    try {
      final bool canAuthenticateWithBiometrics = await _auth.canCheckBiometrics;
      final bool canAuthenticate =
          canAuthenticateWithBiometrics || await _auth.isDeviceSupported();
      return canAuthenticate;
    } on PlatformException catch (e) {
      LogService.e('Error checking biometrics', e);
      return false;
    }
  }

  Future<bool> authenticate() async {
    try {
      return await _auth.authenticate(
        localizedReason: 'Please authenticate to log in',
        // options parameter seems to be missing or changed in local_auth 3.0.0 for Windows
        // or causing build issues. Using defaults for now.
      );
    } on PlatformException catch (e) {
      LogService.e('Error authenticating', e);
      // Handle specific error codes if needed by checking e.code string directly
      // e.g. if (e.code == 'NotAvailable') ...
      return false;
    }
  }
}