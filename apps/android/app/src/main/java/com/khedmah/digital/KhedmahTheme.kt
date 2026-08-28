package com.khedmah.digital

import android.content.Context
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.material3.Typography
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

val Navy = Color(0xFF103452)
val Green = Color(0xFF16875F)
val Orange = Color(0xFFEE7C37)
val Warm = Color(0xFFFFF9F0)
val DarkCanvas = Color(0xFF07131C)
val DarkSurface = Color(0xFF102431)
val DarkSurfaceRaised = Color(0xFF15303F)
val DarkText = Color(0xFFEDF7F4)
val DarkMuted = Color(0xFFABC0C5)
val DarkBorder = Color(0xFF294653)
val DarkGreen = Color(0xFF4FC49A)
val DarkOrange = Color(0xFFFF9A5F)

enum class KhedmahThemePreference(val storageValue: String, val label: String) {
    System("system", "حسب الجهاز"),
    Light("light", "نهاري"),
    Dark("dark", "مظلم")
}

private const val THEME_STORAGE = "khedmah-preferences"
private const val THEME_KEY = "theme"

fun loadThemePreference(context: Context): KhedmahThemePreference {
    val value = context.getSharedPreferences(THEME_STORAGE, Context.MODE_PRIVATE).getString(THEME_KEY, "system")
    return KhedmahThemePreference.entries.firstOrNull { it.storageValue == value } ?: KhedmahThemePreference.System
}

fun saveThemePreference(context: Context, preference: KhedmahThemePreference) {
    context.getSharedPreferences(THEME_STORAGE, Context.MODE_PRIVATE).edit().putString(THEME_KEY, preference.storageValue).apply()
}

private val KhedmahLightColors = lightColorScheme(
    primary = Green,
    onPrimary = Color.White,
    secondary = Orange,
    background = Warm,
    surface = Color.White,
    surfaceVariant = Color(0xFFF8FAFB),
    onBackground = Navy,
    onSurface = Navy,
    outline = Color(0xFFE8DFD4),
    error = Color(0xFFB42318)
)

private val KhedmahTypography = Typography(
    displayLarge = TextStyle(fontSize = 30.sp, lineHeight = 38.sp, fontWeight = FontWeight.Black),
    headlineLarge = TextStyle(fontSize = 24.sp, lineHeight = 32.sp, fontWeight = FontWeight.Bold),
    headlineMedium = TextStyle(fontSize = 21.sp, lineHeight = 29.sp, fontWeight = FontWeight.Bold),
    titleLarge = TextStyle(fontSize = 18.sp, lineHeight = 26.sp, fontWeight = FontWeight.Bold),
    titleMedium = TextStyle(fontSize = 16.sp, lineHeight = 23.sp, fontWeight = FontWeight.SemiBold),
    bodyLarge = TextStyle(fontSize = 15.sp, lineHeight = 23.sp),
    bodyMedium = TextStyle(fontSize = 14.sp, lineHeight = 21.sp),
    bodySmall = TextStyle(fontSize = 12.sp, lineHeight = 18.sp)
)

private val KhedmahDarkColors = darkColorScheme(
    primary = DarkGreen,
    onPrimary = DarkCanvas,
    secondary = DarkOrange,
    background = DarkCanvas,
    surface = DarkSurface,
    surfaceVariant = DarkSurfaceRaised,
    onBackground = DarkText,
    onSurface = DarkText,
    onSurfaceVariant = DarkMuted,
    outline = DarkBorder,
    error = Color(0xFFFF8A80)
)

@Composable
fun KhedmahTheme(preference: KhedmahThemePreference, content: @Composable () -> Unit) {
    val dark = when (preference) {
        KhedmahThemePreference.System -> isSystemInDarkTheme()
        KhedmahThemePreference.Light -> false
        KhedmahThemePreference.Dark -> true
    }
    MaterialTheme(colorScheme = if (dark) KhedmahDarkColors else KhedmahLightColors, typography = KhedmahTypography, content = content)
}
