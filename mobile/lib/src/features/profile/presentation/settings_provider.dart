import 'package:riverpod_annotation/riverpod_annotation.dart';
import 'package:shared_preferences/shared_preferences.dart';

part 'settings_provider.g.dart';

const String _pushNotificationsKey = 'settings_push_notifications';
const String _emailNotificationsKey = 'settings_email_notifications';

@riverpod
class NotificationSettings extends _$NotificationSettings {
  @override
  Future<(bool, bool)> build() async {
    final prefs = await SharedPreferences.getInstance();
    final pushEnabled = prefs.getBool(_pushNotificationsKey) ?? true;
    final emailEnabled = prefs.getBool(_emailNotificationsKey) ?? false;
    return (pushEnabled, emailEnabled);
  }

  Future<void> setPushNotifications(bool isEnabled) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_pushNotificationsKey, isEnabled);
    state = AsyncValue.data((isEnabled, state.value!.$2));
  }

  Future<void> setEmailNotifications(bool isEnabled) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_emailNotificationsKey, isEnabled);
    state = AsyncValue.data((state.value!.$1, isEnabled));
  }
}
