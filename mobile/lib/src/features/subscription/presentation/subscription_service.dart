import 'dart:io' show Platform;

import 'package:flutter/services.dart';
import 'package:purchases_flutter/purchases_flutter.dart';

import '../../../core/services/log_service.dart';

class SubscriptionService {
  static const _appleApiKey = String.fromEnvironment('RC_APPLE_KEY');
  static const _googleApiKey = String.fromEnvironment('RC_GOOGLE_KEY');
  static const _entitlementId = 'pro';

  static Future<void> initialize() async {
    if (!Platform.isIOS && !Platform.isAndroid) return;

    final apiKey = Platform.isIOS ? _appleApiKey : _googleApiKey;
    if (apiKey.isEmpty) {
      LogService.w('SubscriptionService: No RevenueCat API key -- subscriptions disabled');
      return;
    }

    await Purchases.setLogLevel(LogLevel.debug);
    await Purchases.configure(PurchasesConfiguration(apiKey));
  }

  static Future<void> login(String userId) async {
    try {
      if (!Platform.isIOS && !Platform.isAndroid) return;
      await Purchases.logIn(userId);
    } on PlatformException catch (e) {
      LogService.e('SubscriptionService.login error: $e');
    }
  }

  static Future<void> logout() async {
    try {
      if (!Platform.isIOS && !Platform.isAndroid) return;
      await Purchases.logOut();
    } on PlatformException catch (e) {
      LogService.e('SubscriptionService.logout error: $e');
    }
  }

  static Future<bool> isPremium() async {
    try {
      if (!Platform.isIOS && !Platform.isAndroid) return false;
      final customerInfo = await Purchases.getCustomerInfo();
      return customerInfo.entitlements.all[_entitlementId]?.isActive ?? false;
    } on PlatformException catch (e) {
      LogService.e('SubscriptionService.isPremium error: $e');
      return false;
    }
  }

  static Future<List<Package>> getPackages() async {
    try {
      final offerings = await Purchases.getOfferings();
      return offerings.current?.availablePackages ?? [];
    } on PlatformException catch (e) {
      LogService.e('SubscriptionService.getPackages error: $e');
      return [];
    }
  }

  /// Purchase a package. Returns CustomerInfo on success, null on user
  /// cancellation. Rethrows PlatformException for actual errors.
  static Future<CustomerInfo?> purchase(Package package) async {
    try {
      final result = await Purchases.purchasePackage(package);
      return result.customerInfo;
    } on PlatformException catch (e) {
      final errorCode = PurchasesErrorHelper.getErrorCode(e);
      if (errorCode == PurchasesErrorCode.purchaseCancelledError) {
        return null; // User cancelled -- not an error
      }
      rethrow; // Actual error -- let caller handle
    }
  }

  /// Restore purchases. Returns CustomerInfo on success, null on error.
  static Future<CustomerInfo?> restorePurchases() async {
    try {
      return await Purchases.restorePurchases();
    } on PlatformException catch (e) {
      final errorCode = PurchasesErrorHelper.getErrorCode(e);
      LogService.e('SubscriptionService.restorePurchases error: $errorCode');
      return null;
    }
  }
}
