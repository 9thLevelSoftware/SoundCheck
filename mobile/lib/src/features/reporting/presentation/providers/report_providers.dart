import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../../../core/providers/providers.dart';
import '../../data/report_repository.dart';

part 'report_providers.g.dart';

/// Report repository provider.
@Riverpod(keepAlive: true)
ReportRepository reportRepository(Ref ref) {
  final dioClient = ref.watch(dioClientProvider);
  return ReportRepository(dioClient: dioClient);
}
