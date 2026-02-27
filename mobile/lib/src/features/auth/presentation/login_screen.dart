import 'dart:io' show Platform;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/providers/providers.dart';
import '../../../core/error/failures.dart';
import '../../../shared/utils/validators.dart';
import '../../../shared/utils/haptic_feedback.dart';
import '../data/social_auth_service.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  SocialAuthService? _socialAuthService;
  bool _isLoading = false;
  bool _obscurePassword = true;

  @override
  void initState() {
    super.initState();
    _initSocialAuth();
  }

  void _initSocialAuth() {
    final dioClient = ref.read(dioClientProvider);
    final secureStorage = ref.read(secureStorageProvider);
    _socialAuthService = SocialAuthService(
      dioClient: dioClient,
      secureStorage: secureStorage,
    );
  }

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _handleLogin() async {
    if (!_formKey.currentState!.validate()) {
      await HapticFeedbackUtil.errorVibration();
      return;
    }

    await HapticFeedbackUtil.mediumImpact();
    setState(() => _isLoading = true);

    await ref.read(authStateProvider.notifier).login(
          _emailController.text.trim(),
          _passwordController.text,
        );

    if (!mounted) return;

    // Check the state for errors (AsyncValue.guard stores errors in state)
    final authState = ref.read(authStateProvider);
    authState.whenOrNull(
      error: (error, stackTrace) async {
        await HapticFeedbackUtil.errorVibration();

        // Extract error message - Failure objects have a message property
        String errorMessage = 'Login failed';

        if (error is AuthFailure) {
          errorMessage = 'Invalid email or password';
        } else if (error is NetworkFailure) {
          errorMessage = error.message;
        } else if (error is Failure) {
          errorMessage = error.message;
        } else {
          final errorString = error.toString();
          if (errorString.contains('401') ||
              errorString.contains('Invalid') ||
              errorString.contains('invalid')) {
            errorMessage = 'Invalid email or password';
          } else if (errorString.contains('network') ||
              errorString.contains('connection')) {
            errorMessage = 'Network error. Please check your connection.';
          } else if (errorString.contains('timeout')) {
            errorMessage = 'Request timed out. Please try again.';
          }
        }

        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(errorMessage),
            backgroundColor: AppTheme.error,
            behavior: SnackBarBehavior.floating,
            margin: const EdgeInsets.all(16),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
          ),
        );
      },
      data: (user) async {
        if (user != null) {
          await HapticFeedbackUtil.successVibration();
          // Navigation is handled by the router redirecting based on auth state
        }
      },
    );

    setState(() => _isLoading = false);
  }

  /// Converts social auth exceptions to user-friendly error messages.
  String _getSocialAuthErrorMessage(dynamic error) {
    final errorString = error.toString().toLowerCase();
    if (errorString.contains('canceled') || errorString.contains('cancelled')) {
      return 'Sign-in was cancelled';
    } else if (errorString.contains('network')) {
      return 'Network error. Please check your connection.';
    } else if (errorString.contains('popup_closed') || errorString.contains('user_cancelled')) {
      return 'Sign-in was cancelled';
    }
    return 'Sign-in failed. Please try again.';
  }

  Future<void> _handleGoogleSignIn() async {
    await HapticFeedbackUtil.mediumImpact();
    setState(() => _isLoading = true);

    try {
      final result = await _socialAuthService?.signInWithGoogle();
      if (!mounted) return;

      if (result != null) {
        // Refresh user state after social auth
        await ref.read(authStateProvider.notifier).refreshUser();
        await HapticFeedbackUtil.successVibration();
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Google Sign-In successful: ${result.user.email}'),
            backgroundColor: AppTheme.success,
            behavior: SnackBarBehavior.floating,
            margin: const EdgeInsets.all(16),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
          ),
        );
      }
    } catch (e) {
      if (!mounted) return;
      await HapticFeedbackUtil.errorVibration();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(_getSocialAuthErrorMessage(e)),
          backgroundColor: AppTheme.error,
          behavior: SnackBarBehavior.floating,
          margin: const EdgeInsets.all(16),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        ),
      );
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _handleAppleSignIn() async {
    await HapticFeedbackUtil.mediumImpact();
    setState(() => _isLoading = true);

    try {
      final result = await _socialAuthService?.signInWithApple();
      if (!mounted) return;

      if (result != null) {
        // Refresh user state after social auth
        await ref.read(authStateProvider.notifier).refreshUser();
        await HapticFeedbackUtil.successVibration();
        if (!mounted) return;
        final displayText = result.user.email.isNotEmpty
            ? result.user.email
            : 'User authenticated';
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Apple Sign-In successful: $displayText'),
            backgroundColor: AppTheme.success,
            behavior: SnackBarBehavior.floating,
            margin: const EdgeInsets.all(16),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
          ),
        );
      }
    } catch (e) {
      if (!mounted) return;
      await HapticFeedbackUtil.errorVibration();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(_getSocialAuthErrorMessage(e)),
          backgroundColor: AppTheme.error,
          behavior: SnackBarBehavior.floating,
          margin: const EdgeInsets.all(16),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        ),
      );
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.backgroundDark,
      resizeToAvoidBottomInset: true,
      body: Stack(
        children: [
          SafeArea(
            child: Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(AppTheme.spacing24),
                child: Form(
                  key: _formKey,
                  autovalidateMode: AutovalidateMode.onUserInteraction,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      // Logo/Title
                      Semantics(
                        label: 'SoundCheck logo',
                        image: true,
                        child: const Icon(
                          Icons.music_note,
                          size: 80,
                          color: AppTheme.primary,
                        ),
                      ),
                      const SizedBox(height: AppTheme.spacing16),
                      
                      Text(
                        'SoundCheck',
                        style: Theme.of(context).textTheme.displayLarge?.copyWith(
                              color: AppTheme.primary,
                              fontWeight: FontWeight.bold,
                            ),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: AppTheme.spacing8),
                      
                      Text(
                        'Discover, Review, Connect',
                        style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                              color: AppTheme.textSecondary,
                            ),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: AppTheme.spacing48),
                      
                      // Email Field
                      TextFormField(
                        controller: _emailController,
                        keyboardType: TextInputType.emailAddress,
                        autofillHints: const [AutofillHints.email],
                        textInputAction: TextInputAction.next,
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
                      const SizedBox(height: AppTheme.spacing16),

                      // Password Field
                      TextFormField(
                        controller: _passwordController,
                        obscureText: _obscurePassword,
                        autofillHints: const [AutofillHints.password],
                        textInputAction: TextInputAction.done,
                        onFieldSubmitted: (_) => _handleLogin(),
                        decoration: InputDecoration(
                          labelText: 'Password',
                          hintText: 'Enter your password',
                          prefixIcon: const Icon(Icons.lock_outlined),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                          suffixIcon: IconButton(
                            icon: Icon(
                              _obscurePassword
                                  ? Icons.visibility_outlined
                                  : Icons.visibility_off_outlined,
                            ),
                            onPressed: () async {
                              await HapticFeedbackUtil.selectionClick();
                              setState(() => _obscurePassword = !_obscurePassword);
                            },
                          ),
                        ),
                        validator: Validators.password,
                        enabled: !_isLoading,
                      ),
                      
                      Align(
                        alignment: Alignment.centerRight,
                        child: TextButton(
                          onPressed: () {
                            if (mounted) {
                              context.push('/forgot-password');
                            }
                          },
                          child: Text(
                            'Forgot password?',
                            style: TextStyle(
                              color: AppTheme.textSecondary,
                            ),
                          ),
                        ),
                      ),

                      const SizedBox(height: AppTheme.spacing24),
                      
                      // Login Button
                      ElevatedButton(
                        onPressed: _isLoading ? null : _handleLogin,
                        style: ElevatedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                          backgroundColor: AppTheme.primary,
                          foregroundColor: AppTheme.backgroundDark, // Dark text on volt lime
                          elevation: 0,
                        ),
                        child: const Text(
                          'Login',
                          style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                        ),
                      ),
                      
                      const SizedBox(height: AppTheme.spacing32),

                      // Divider
                      Row(
                        children: [
                          const Expanded(child: Divider()),
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 16),
                            child: Text(
                              'OR',
                              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                color: AppTheme.textSecondary,
                              ),
                            ),
                          ),
                          const Expanded(child: Divider()),
                        ],
                      ),
                      
                      const SizedBox(height: AppTheme.spacing24),
                      
                      // Social Login Buttons
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                        children: [
                          // Apple Sign-In only available on iOS/macOS
                          if (Platform.isIOS || Platform.isMacOS)
                            _SocialLoginButton(
                              icon: Icons.apple,
                              onTap: _isLoading ? null : _handleAppleSignIn,
                            ),
                          _SocialLoginButton(
                            icon: Icons.g_mobiledata, // Google icon
                            onTap: _isLoading ? null : _handleGoogleSignIn,
                          ),
                        ],
                      ),

                      const SizedBox(height: AppTheme.spacing32),

                      // Register Link
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text(
                            "Don't have an account? ",
                            style: Theme.of(context).textTheme.bodyMedium,
                          ),
                          TextButton(
                            onPressed: () async {
                              await HapticFeedbackUtil.lightImpact();
                              if (context.mounted) {
                                // Clear stack prevents back button to login
                                context.push('/register'); 
                              }
                            },
                            child: const Text(
                              'Sign Up',
                              style: TextStyle(fontWeight: FontWeight.bold),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
          
          // Loading Overlay
          if (_isLoading)
            Container(
              color: Colors.black.withValues(alpha:0.3),
              child: const Center(
                child: CircularProgressIndicator(),
              ),
            ),
        ],
      ),
    );
  }
}

class _SocialLoginButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback? onTap;

  const _SocialLoginButton({
    required this.icon,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isEnabled = onTap != null;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(50),
      child: Opacity(
        opacity: isEnabled ? 1.0 : 0.5,
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            border: Border.all(color: AppTheme.surfaceVariantDark),
            shape: BoxShape.circle,
          ),
          child: Icon(
            icon,
            size: 28,
            color: AppTheme.textPrimary,
          ),
        ),
      ),
    );
  }
}