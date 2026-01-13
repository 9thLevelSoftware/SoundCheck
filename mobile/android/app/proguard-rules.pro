# Flutter ProGuard Rules

# Keep Flutter wrapper classes
-keep class io.flutter.app.** { *; }
-keep class io.flutter.plugin.** { *; }
-keep class io.flutter.util.** { *; }
-keep class io.flutter.view.** { *; }
-keep class io.flutter.** { *; }
-keep class io.flutter.plugins.** { *; }

# Keep Dart VM
-keep class io.flutter.embedding.** { *; }

# Ignore warnings about missing Play Core classes (deferred components)
-dontwarn com.google.android.play.core.splitcompat.**
-dontwarn com.google.android.play.core.splitinstall.**
-dontwarn com.google.android.play.core.tasks.**

# Preserve annotations
-keepattributes *Annotation*
-keepattributes Signature
-keepattributes InnerClasses
-keepattributes SourceFile,LineNumberTable

# Keep native methods
-keepclasseswithmembernames class * {
    native <methods>;
}

# Dio HTTP client
-keep class com.google.gson.** { *; }
-keep class retrofit2.** { *; }
-keepattributes Signature

# Gson/JSON serialization
-keepattributes Signature
-keepattributes *Annotation*
-dontwarn sun.misc.**
-keep class com.google.gson.examples.android.model.** { <fields>; }
-keep class * implements com.google.gson.TypeAdapter
-keep class * implements com.google.gson.TypeAdapterFactory
-keep class * implements com.google.gson.JsonSerializer
-keep class * implements com.google.gson.JsonDeserializer

# Keep data model classes (update with your actual model package if needed)
-keep class com.soundcheck.app.models.** { *; }

# OkHttp
-dontwarn okhttp3.**
-dontwarn okio.**
-keepnames class okhttp3.internal.publicsuffix.PublicSuffixDatabase

# flutter_secure_storage
-keep class com.it_nomads.fluttersecurestorage.** { *; }

# Keep image_picker
-keep class io.flutter.plugins.imagepicker.** { *; }

# Keep url_launcher
-keep class io.flutter.plugins.urllauncher.** { *; }

# Keep shared_preferences
-keep class io.flutter.plugins.sharedpreferences.** { *; }

# Keep cached_network_image
-keep class com.github.flutter_image_cache.** { *; }

# Preserve line numbers for debugging stack traces
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
