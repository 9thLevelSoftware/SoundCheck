import '../../../core/api/dio_client.dart';
import '../domain/subscription_state.dart';

class SubscriptionRepository {
  final DioClient _dioClient;
  SubscriptionRepository(this._dioClient);

  Future<SubscriptionStatus> getStatus() async {
    final response = await _dioClient.get('/subscription/status');
    return SubscriptionStatus.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  }
}
