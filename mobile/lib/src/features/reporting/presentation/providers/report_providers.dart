import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/providers/providers.dart';
import '../../data/report_repository.dart';

/// Report repository provider.
/// Manual Riverpod provider (not @riverpod codegen) per Phase 10 decision [10-05].
final reportRepositoryProvider = Provider<ReportRepository>((ref) {
  final dioClient = ref.watch(dioClientProvider);
  return ReportRepository(dioClient: dioClient);
});
