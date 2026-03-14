import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/providers/providers.dart';
import '../../../core/error/failures.dart';
import '../../../shared/utils/validators.dart';

/// Forgot Password Screen - Two-state screen for requesting password reset.
///
/// State 1 (Request): Email form with "Send Reset Link" button.
/// State 2 (Sent): Success message with "Back to Login" button.
class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  ConsumerState<ForgotPasswordScreen> createState() =>
      _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends ConsumerState<ForgotPasswordScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  bool _isLoading = false;
  bool _emailSent = false;
  String _responseMessage = '';

  @override
  void dispose() {
    _emailController.dispose();
    super.dispose();
  }

  Future<void> _handleSubmit() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _isLoading = true);

    try {
      final dioClient = ref.read(dioClientProvider);
      final response = await dioClient.post(
        '/auth/forgot-password',
        data: {'email': _emailController.text.trim()},
      );

      if (!mounted) return;

      final data = response.data;
      final message = data is Map<String, dynamic>
          ? (data['data']?['message'] as String? ?? '')
          : '';

      setState(() {
        _emailSent = true;
        _responseMessage = message.isNotEmpty
            ? message
            : "If an account exists for that email, we've sent a reset link. Check your inbox.";
        _isLoading = false;
      });
    } catch (e) {
      if (!mounted) return;

      String errorMessage = 'Something went wrong. Please try again.';

      if (e is Failure) {
        // Check for rate limit (429)
        if (e.message.contains('Too many') || e.message.contains('rate')) {
          errorMessage = 'Too many requests. Please try again later.';
        } else {
          errorMessage = e.message;
        }
      }

      setState(() => _isLoading = false);

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(errorMessage),
          backgroundColor: AppTheme.error,
          behavior: SnackBarBehavior.floating,
          margin: const EdgeInsets.all(16),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: AppBar(
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        title: const Text('Forgot Password'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.pop(),
        ),
      ),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(AppTheme.spacing24),
            child: _emailSent ? _buildSentState() : _buildRequestState(),
          ),
        ),
      ),
    );
  }

  /// Request state: email form with submit button.
  Widget _buildRequestState() {
    return Form(
      key: _formKey,
      autovalidateMode: AutovalidateMode.onUserInteraction,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Icon
          const Icon(
            Icons.lock_reset,
            size: 64,
            color: AppTheme.primary,
          ),
          const SizedBox(height: AppTheme.spacing24),

          // Title
          Text(
            'Reset your password',
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  color: AppTheme.textPrimary,
                  fontWeight: FontWeight.bold,
                ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: AppTheme.spacing8),

          // Description
          Text(
            'Enter the email address associated with your account and we\'ll send you a link to reset your password.',
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: AppTheme.textSecondary,
                ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: AppTheme.spacing32),

          // Email field
          TextFormField(
            controller: _emailController,
            keyboardType: TextInputType.emailAddress,
            autofillHints: const [AutofillHints.email],
            textInputAction: TextInputAction.done,
            onFieldSubmitted: (_) => _handleSubmit(),
            decoration: InputDecoration(
              labelText: 'Email',
              hintText: 'name@example.com',
              prefixIcon: const Icon(Icons.email_outlined),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            validator: Validators.email,
            enabled: !_isLoading,
          ),
          const SizedBox(height: AppTheme.spacing24),

          // Submit button
          ElevatedButton(
            onPressed: _isLoading ? null : _handleSubmit,
            style: ElevatedButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 16),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
              backgroundColor: AppTheme.primary,
              foregroundColor: Theme.of(context).scaffoldBackgroundColor,
              elevation: 0,
            ),
            child: _isLoading
                ? const SizedBox(
                    height: 20,
                    width: 20,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Theme.of(context).scaffoldBackgroundColor,
                    ),
                  )
                : const Text(
                    'Send Reset Link',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                  ),
          ),
        ],
      ),
    );
  }

  /// Sent state: success message with back-to-login button.
  Widget _buildSentState() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Success icon
        const Icon(
          Icons.mark_email_read_outlined,
          size: 64,
          color: AppTheme.primary,
        ),
        const SizedBox(height: AppTheme.spacing24),

        // Title
        Text(
          'Check your inbox',
          style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                color: AppTheme.textPrimary,
                fontWeight: FontWeight.bold,
              ),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: AppTheme.spacing16),

        // Message from server
        Text(
          _responseMessage,
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: AppTheme.textSecondary,
              ),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: AppTheme.spacing32),

        // Back to login button
        ElevatedButton(
          onPressed: () => context.pop(),
          style: ElevatedButton.styleFrom(
            padding: const EdgeInsets.symmetric(vertical: 16),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
            backgroundColor: AppTheme.primary,
            foregroundColor: Theme.of(context).scaffoldBackgroundColor,
            elevation: 0,
          ),
          child: const Text(
            'Back to Login',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
          ),
        ),
      ],
    );
  }
}
