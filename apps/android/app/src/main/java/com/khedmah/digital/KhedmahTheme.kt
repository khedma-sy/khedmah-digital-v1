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

val Navy = Color(0xFF173247)
val Green = Color(0xFF16875F)
val Orange = Color(0xFFE97835)
val Warm = Color(0xFFF8FAF9)
val DarkCanvas = Color(0xFF101315)
val DarkSurface = Color(0xFF1C2124)
val DarkSurfaceRaised = Color(0xFF22282B)
val DarkText = Color(0xFFF0F4F2)
val DarkMuted = Color(0xFFADB8B3)
val DarkBorder = Color(0xFF343C3F)
val DarkGreen = Color(0xFF56C79D)
val DarkOrange = Color(0xFFF39A63)

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
    surfaceVariant = Color(0xFFF2F6F4),
    onBackground = Navy,
    onSurface = Navy,
    outline = Color(0xFFDCE6E1),
    error = Color(0xFFB42318)
)

private val KhedmahTypography = Typography(
    displayLarge = TextStyle(fontSize = 26.sp, lineHeight = 34.sp, fontWeight = FontWeight.Black),
    headlineLarge = TextStyle(fontSize = 21.sp, lineHeight = 29.sp, fontWeight = FontWeight.Bold),
    headlineMedium = TextStyle(fontSize = 19.sp, lineHeight = 27.sp, fontWeight = FontWeight.Bold),
    titleLarge = TextStyle(fontSize = 17.sp, lineHeight = 24.sp, fontWeight = FontWeight.Bold),
    titleMedium = TextStyle(fontSize = 15.sp, lineHeight = 22.sp, fontWeight = FontWeight.SemiBold),
    bodyLarge = TextStyle(fontSize = 14.sp, lineHeight = 22.sp),
    bodyMedium = TextStyle(fontSize = 13.sp, lineHeight = 20.sp),
    bodySmall = TextStyle(fontSize = 11.sp, lineHeight = 17.sp)
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
