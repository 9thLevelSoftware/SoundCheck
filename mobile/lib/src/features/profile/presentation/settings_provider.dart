import 'package:riverpod_annotation/riverpod_annotation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../../core/providers/providers.dart';

part 'settings_provider.g.dart';

const String _pushNotificationsKey = 'settings_push_notifications';

@riverpod
class NotificationSettings extends _$NotificationSettings {
  @override
  Future<bool> build() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_pushNotificationsKey) ?? true;
  }

  Future<void> setPushNotifications(bool isEnabled) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_pushNotificationsKey, isEnabled);
    await ref
        .read(pushNotificationServiceProvider)
        .syncDeviceRegistration(isEnabled);
    state = AsyncValue.data(isEnabled);
  }
}
