import 'dart:io' show Platform;

import 'package:purchases_flutter/purchases_flutter.dart';

class SubscriptionService {
  static const _appleApiKey = String.fromEnvironment('RC_APPLE_KEY');
  static const _googleApiKey = String.fromEnvironment('RC_GOOGLE_KEY');
  static const _entitlementId = 'pro';

  static Future<void> initialize() async {
    if (!Platform.isIOS && !Platform.isAndroid) return;

    final apiKey = Platform.isIOS ? _appleApiKey : _googleApiKey;
    if (apiKey.isEmpty) {
      // ignore: avoid_print
      print('SubscriptionService: No RevenueCat API key — subscriptions disabled');
      return;
    }

    await Purchases.setLogLevel(LogLevel.debug);
    await Purchases.configure(PurchasesConfiguration(apiKey));
  }

  static Future<void> login(String userId) async {
    try {
      if (!Platform.isIOS && !Platform.isAndroid) return;
      await Purchases.logIn(userId);
    } catch (e) {
      // ignore: avoid_print
      print('SubscriptionService.login error: $e');
    }
  }

  static Future<void> logout() async {
    try {
      if (!Platform.isIOS && !Platform.isAndroid) return;
      await Purchases.logOut();
    } catch (e) {
      // ignore: avoid_print
      print('SubscriptionService.logout error: $e');
    }
  }

  static Future<bool> isPremium() async {
    try {
      if (!Platform.isIOS && !Platform.isAndroid) return false;
      final customerInfo = await Purchases.getCustomerInfo();
      return customerInfo.entitlements.all[_entitlementId]?.isActive ?? false;
    } catch (e) {
      return false;
    }
  }

  static Future<List<Package>> getPackages() async {
    try {
      final offerings = await Purchases.getOfferings();
      return offerings.current?.availablePackages ?? [];
    } catch (e) {
      return [];
    }
  }

  static Future<bool> purchase(Package package) async {
    try {
      await Purchases.purchasePackage(package);
      final customerInfo = await Purchases.getCustomerInfo();
      return customerInfo.entitlements.all[_entitlementId]?.isActive ?? false;
    } catch (e) {
      return false;
    }
  }

  static Future<bool> restorePurchases() async {
    try {
      final customerInfo = await Purchases.restorePurchases();
      return customerInfo.entitlements.all[_entitlementId]?.isActive ?? false;
    } catch (e) {
      return false;
    }
  }
}
