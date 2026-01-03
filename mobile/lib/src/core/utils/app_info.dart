import 'package:package_info_plus/package_info_plus.dart';

class AppInfo {
  static PackageInfo? _packageInfo;

  static Future<void> init() async {
    _packageInfo = await PackageInfo.fromPlatform();
  }

  static String get version => _packageInfo?.version ?? 'Unknown';
  static String get buildNumber => _packageInfo?.buildNumber ?? '';
  static String get fullVersion => '$version+$buildNumber';
}
