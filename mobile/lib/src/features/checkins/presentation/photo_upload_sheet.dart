import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/theme/app_theme.dart';
import '../domain/checkin.dart';
import 'providers/checkin_providers.dart';

/// Modal bottom sheet for adding photos to a check-in after creation.
///
/// Provides camera/gallery picker, client-side compression via flutter_image_compress,
/// upload progress indicators per photo, and direct-to-R2 upload via presigned URLs.
///
/// Max 4 photos per check-in enforced.
class PhotoUploadSheet extends ConsumerStatefulWidget {
  const PhotoUploadSheet({
    required this.checkinId,
    required this.onComplete,
    this.existingPhotoCount = 0,
    super.key,
  });

  final String checkinId;
  final void Function(CheckIn updatedCheckIn) onComplete;
  final int existingPhotoCount;

  @override
  ConsumerState<PhotoUploadSheet> createState() => _PhotoUploadSheetState();
}

class _PhotoUploadSheetState extends ConsumerState<PhotoUploadSheet> {
  final ImagePicker _imagePicker = ImagePicker();
  final List<XFile> _selectedPhotos = [];
  final Map<int, double> _uploadProgress = {};
  bool _isUploading = false;
  String? _errorMessage;

  static const int _maxPhotos = 4;

  int get _remainingSlots => _maxPhotos - widget.existingPhotoCount - _selectedPhotos.length;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Handle bar
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: AppTheme.textTertiary,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 16),

            // Header
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Add Photos (${widget.existingPhotoCount + _selectedPhotos.length}/$_maxPhotos)',
                  style: const TextStyle(
                    color: AppTheme.textPrimary,
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                if (_selectedPhotos.isNotEmpty && !_isUploading)
                  TextButton(
                    onPressed: _uploadAll,
                    child: const Text(
                      'Upload',
                      style: TextStyle(
                        color: AppTheme.voltLime,
                        fontWeight: FontWeight.bold,
                        fontSize: 16,
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 16),

            // Photo thumbnails (horizontal scroll)
            if (_selectedPhotos.isNotEmpty) ...[
              SizedBox(
                height: 120,
                child: ListView.builder(
                  scrollDirection: Axis.horizontal,
                  itemCount: _selectedPhotos.length,
                  itemBuilder: (context, index) {
                    return _buildPhotoThumbnail(index);
                  },
                ),
              ),
              const SizedBox(height: 16),
            ],

            // Error message
            if (_errorMessage != null) ...[
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppTheme.error.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.error_outline, color: AppTheme.error, size: 20),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        _errorMessage!,
                        style: const TextStyle(color: AppTheme.error, fontSize: 13),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
            ],

            // Action buttons (Camera / Gallery)
            if (!_isUploading && _remainingSlots > 0) ...[
              Row(
                children: [
                  Expanded(
                    child: _ActionButton(
                      icon: Icons.camera_alt,
                      label: 'Camera',
                      color: AppTheme.hotOrange,
                      onTap: _pickFromCamera,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _ActionButton(
                      icon: Icons.photo_library,
                      label: 'Gallery',
                      color: AppTheme.voltLime,
                      onTap: _pickFromGallery,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
            ],

            // Upload progress indicator
            if (_isUploading)
              Column(
                children: [
                  LinearProgressIndicator(
                    color: AppTheme.voltLime,
                    backgroundColor: Theme.of(context).colorScheme.surfaceContainerHighest,
                  ),
                  const SizedBox(height: 12),
                  const Text(
                    'Uploading photos...',
                    style: TextStyle(color: AppTheme.textSecondary, fontSize: 14),
                  ),
                  const SizedBox(height: 16),
                ],
              ),

            // Done button
            SizedBox(
              width: double.infinity,
              height: 48,
              child: ElevatedButton(
                onPressed: _isUploading ? null : () => Navigator.pop(context),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Theme.of(context).colorScheme.surfaceContainerHighest,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: Text(
                  _selectedPhotos.isEmpty ? 'Skip' : 'Done',
                  style: const TextStyle(
                    color: AppTheme.textPrimary,
                    fontWeight: FontWeight.w600,
                    fontSize: 16,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  Widget _buildPhotoThumbnail(int index) {
    final progress = _uploadProgress[index];

    return Container(
      width: 100,
      height: 120,
      margin: const EdgeInsets.only(right: 12),
      child: Stack(
        children: [
          // Image
          ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: Image.file(
              File(_selectedPhotos[index].path),
              width: 100,
              height: 120,
              fit: BoxFit.cover,
            ),
          ),

          // Upload progress overlay
          if (progress != null && progress < 1.0)
            Positioned.fill(
              child: Container(
                decoration: BoxDecoration(
                  color: Colors.black54,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Center(
                  child: SizedBox(
                    width: 36,
                    height: 36,
                    child: CircularProgressIndicator(
                      value: progress,
                      color: AppTheme.voltLime,
                      strokeWidth: 3,
                    ),
                  ),
                ),
              ),
            ),

          // Completed checkmark
          if (progress != null && progress >= 1.0)
            Positioned(
              bottom: 4,
              right: 4,
              child: Container(
                padding: const EdgeInsets.all(4),
                decoration: const BoxDecoration(
                  color: AppTheme.voltLime,
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.check, color: Colors.white, size: 14),
              ),
            ),

          // Remove button (only when not uploading)
          if (!_isUploading)
            Positioned(
              top: 4,
              right: 4,
              child: GestureDetector(
                onTap: () => _removePhoto(index),
                child: Container(
                  padding: const EdgeInsets.all(4),
                  decoration: BoxDecoration(
                    color: AppTheme.error.withValues(alpha: 0.9),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.close, color: Colors.white, size: 14),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Future<void> _pickFromGallery() async {
    if (_remainingSlots <= 0) {
      _showMaxPhotosMessage();
      return;
    }

    try {
      final XFile? image = await _imagePicker.pickImage(
        source: ImageSource.gallery,
        maxWidth: 1920,
        maxHeight: 1080,
        imageQuality: 85,
      );

      if (image != null) {
        setState(() {
          _selectedPhotos.add(image);
          _errorMessage = null;
        });
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _errorMessage = 'Failed to pick image. Please try again.';
      });
    }
  }

  Future<void> _pickFromCamera() async {
    if (_remainingSlots <= 0) {
      _showMaxPhotosMessage();
      return;
    }

    try {
      final XFile? image = await _imagePicker.pickImage(
        source: ImageSource.camera,
        maxWidth: 1920,
        maxHeight: 1080,
        imageQuality: 85,
      );

      if (image != null) {
        setState(() {
          _selectedPhotos.add(image);
          _errorMessage = null;
        });
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _errorMessage = 'Failed to take photo. Please try again.';
      });
    }
  }

  void _removePhoto(int index) {
    setState(() {
      _selectedPhotos.removeAt(index);
      _uploadProgress.remove(index);
      _errorMessage = null;
    });
  }

  void _showMaxPhotosMessage() {
    setState(() {
      _errorMessage = 'Maximum $_maxPhotos photos per check-in.';
    });
  }

  Future<void> _uploadAll() async {
    if (_selectedPhotos.isEmpty || _isUploading) return;

    setState(() {
      _isUploading = true;
      _errorMessage = null;
    });

    try {
      final uploadRepo = ref.read(uploadRepositoryProvider);
      final updatedCheckIn = await uploadRepo.uploadPhotos(
        widget.checkinId,
        _selectedPhotos,
        onProgress: (index, progress) {
          if (mounted) {
            setState(() {
              _uploadProgress[index] = progress;
            });
          }
        },
      );

      if (!mounted) return;

      updatedCheckIn.fold(
        (failure) {
          setState(() {
            _isUploading = false;
            _errorMessage = failure.message;
          });
        },
        (checkIn) {
          if (checkIn != null) {
            widget.onComplete(checkIn);
          }
          Navigator.pop(context);
        },
      );
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _isUploading = false;
        _errorMessage = 'Upload failed. Please try again.';
      });
    }
  }
}

/// Reusable action button for camera/gallery selection
class _ActionButton extends StatelessWidget {
  const _ActionButton({
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Add photo from $label',
      button: true,
      child: GestureDetector(
        onTap: onTap,
        child: Container(
        padding: const EdgeInsets.symmetric(vertical: 16),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.15),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: color.withValues(alpha: 0.3)),
        ),
        child: Column(
          children: [
            Icon(icon, color: color, size: 28),
            const SizedBox(height: 6),
            Text(
              label,
              style: TextStyle(
                color: color,
                fontWeight: FontWeight.w600,
                fontSize: 14,
              ),
            ),
          ],
        ),
        ),
      ),
    );
  }
}
