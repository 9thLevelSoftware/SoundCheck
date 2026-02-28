import '../../../core/api/dio_client.dart';
import '../../sharing/data/share_repository.dart';
import '../domain/wrapped_stats.dart';

class WrappedRepository {
  final DioClient _dioClient;
  WrappedRepository(this._dioClient);

  Future<WrappedStats> getWrappedStats(int year) async {
    final response = await _dioClient.get('/wrapped/$year');
    return WrappedStats.fromJson(response.data['data'] as Map<String, dynamic>);
  }

  Future<WrappedStats> getWrappedDetailStats(int year) async {
    final response = await _dioClient.get('/wrapped/$year/detail');
    return WrappedStats.fromJson(response.data['data'] as Map<String, dynamic>);
  }

  Future<ShareCardUrls> generateSummaryCard(int year) async {
    final response = await _dioClient.post('/wrapped/$year/card/summary');
    final data = response.data['data'] as Map<String, dynamic>;
    return ShareCardUrls(
      ogUrl: data['ogUrl'] as String,
      storiesUrl: data['storiesUrl'] as String,
    );
  }

  Future<ShareCardUrls> generateStatCard(int year, String statType) async {
    final response = await _dioClient.post('/wrapped/$year/card/$statType');
    final data = response.data['data'] as Map<String, dynamic>;
    return ShareCardUrls(
      ogUrl: data['ogUrl'] as String,
      storiesUrl: data['storiesUrl'] as String,
    );
  }
}
