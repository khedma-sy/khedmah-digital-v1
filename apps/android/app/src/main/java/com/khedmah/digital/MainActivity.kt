package com.khedmah.digital

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.maps.android.compose.*
import kotlinx.coroutines.launch

private enum class Destination(val label: String, val symbol: String) {
    Home("الرئيسية", "⌂"), Search("البحث", "⌕"), Map("الخريطة", "⌖"), Account("حسابي", "◎")
}

class MainActivity : ComponentActivity() {
    private var locationGranted by mutableStateOf(false)
    private val locationPermission = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { grants ->
        locationGranted = grants[Manifest.permission.ACCESS_FINE_LOCATION] == true || grants[Manifest.permission.ACCESS_COARSE_LOCATION] == true
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        locationGranted = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED || ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        setContent { KhedmahApplication(locationGranted) { locationPermission.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)) } }
    }
}

@Composable
private fun KhedmahApplication(locationGranted: Boolean, onRequestLocation: () -> Unit) {
    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
        val context = LocalContext.current
        var themePreference by remember { mutableStateOf(loadThemePreference(context)) }
        KhedmahTheme(themePreference) {
            val api = remember { KhedmahApi() }
            val googleIdentity = remember(context) { GoogleIdentity(context) }
            var destination by remember { mutableStateOf(Destination.Home) }
            var categories by remember { mutableStateOf<List<KhedmahCategory>>(emptyList()) }
            var selectedCategory by remember { mutableStateOf<String?>(null) }
            var query by remember { mutableStateOf("") }
            var results by remember { mutableStateOf<List<KhedmahResult>>(emptyList()) }
            var loading by remember { mutableStateOf(false) }
            var error by remember { mutableStateOf<String?>(null) }
            var user by remember { mutableStateOf<KhedmahUser?>(null) }
            var accountMessage by remember { mutableStateOf<String?>(null) }
            var accountError by remember { mutableStateOf<String?>(null) }
            val scope = rememberCoroutineScope()

            fun runSearch() {
                destination = Destination.Search
                if (!api.configured) { error = "عنوان خادم خدمة غير مضبوط في نسخة التطبيق."; return }
                scope.launch {
                    loading = true; error = null
                    runCatching { api.search(query, selectedCategory) }.onSuccess { results = it }.onFailure { error = it.message ?: "تعذر تحميل النتائج." }
                    loading = false
                }
            }

            LaunchedEffect(api.configured) {
                if (api.configured) {
                    runCatching { api.categories() }.onSuccess { categories = it }.onFailure { error = it.message ?: "تعذر تحميل التصنيفات." }
                    user = api.session()
                }
            }

            Scaffold(containerColor = MaterialTheme.colorScheme.background, topBar = {
                ThemePreferenceBar(themePreference) { selected ->
                    themePreference = selected
                    saveThemePreference(context, selected)
                }
            }, bottomBar = {
                NavigationBar(containerColor = MaterialTheme.colorScheme.surface) {
                    Destination.entries.forEach { item ->
                        NavigationBarItem(selected = destination == item, onClick = { destination = item }, icon = { Text(item.symbol, fontSize = 22.sp) }, label = { Text(item.label) })
                    }
                }
            }) { padding ->
                when (destination) {
                    Destination.Home -> HomeScreen(Modifier.padding(padding), query, { query = it }, categories, selectedCategory, { selectedCategory = it; runSearch() }, ::runSearch)
                    Destination.Search -> SearchScreen(Modifier.padding(padding), query, { query = it }, categories, selectedCategory, { selectedCategory = it }, results, loading, error, ::runSearch)
                    Destination.Map -> MapScreen(Modifier.padding(padding), locationGranted, onRequestLocation)
                    Destination.Account -> AccountScreen(
                        modifier = Modifier.padding(padding), user = user, loading = loading,
                        message = accountMessage, error = accountError,
                        googleConfigured = googleIdentity.configured,
                        onLogin = { email, password ->
                            scope.launch {
                                loading = true; accountError = null; accountMessage = null
                                runCatching { api.login(email, password) }.onSuccess { user = it }.onFailure { accountError = it.message ?: "تعذر تسجيل الدخول." }
                                loading = false
                            }
                        },
                        onRegister = { email, password, name ->
                            scope.launch {
                                loading = true; accountError = null; accountMessage = null
                                runCatching { api.register(email, password, name) }
                                    .onSuccess { accountMessage = "تم إنشاء الحساب. تحقق من بريدك الإلكتروني قبل تسجيل الدخول." }
                                    .onFailure { accountError = it.message ?: "تعذر إنشاء الحساب." }
                                loading = false
                            }
                        },
                        onGoogle = {
                            scope.launch {
                                loading = true; accountError = null; accountMessage = null
                                runCatching { api.google(googleIdentity.firebaseIdToken()) }
                                    .onSuccess { user = it }
                                    .onFailure { accountError = it.message ?: "تعذر تسجيل الدخول عبر Google." }
                                loading = false
                            }
                        },
                        onLogout = {
                            scope.launch { loading = true; runCatching { api.logout() }; runCatching { googleIdentity.signOut() }; user = null; loading = false }
                        }
                    )
                }
            }
        }
    }
}

@Composable
private fun ThemePreferenceBar(selected: KhedmahThemePreference, onSelect: (KhedmahThemePreference) -> Unit) {
    Surface(color = MaterialTheme.colorScheme.surface, tonalElevation = 2.dp) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp),
            horizontalArrangement = Arrangement.End,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("المظهر", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, modifier = Modifier.padding(end = 8.dp))
            KhedmahThemePreference.entries.forEach { option ->
                FilterChip(
                    selected = selected == option,
                    onClick = { onSelect(option) },
                    label = { Text(option.label, fontSize = 11.sp) },
                    modifier = Modifier.padding(horizontal = 2.dp)
                )
            }
        }
    }
}

@Composable private fun AccountScreen(modifier: Modifier, user: KhedmahUser?, loading: Boolean, message: String?, error: String?, googleConfigured: Boolean, onLogin: (String, String) -> Unit, onRegister: (String, String, String) -> Unit, onGoogle: () -> Unit, onLogout: () -> Unit) {
    var registering by remember { mutableStateOf(false) }
    var displayName by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    LazyColumn(modifier.fillMaxSize().padding(18.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item { BrandHeader() }
        if (user != null) {
            item { Text("مرحباً ${user.displayName}", color = MaterialTheme.colorScheme.onBackground, fontSize = 26.sp, fontWeight = FontWeight.Black) }
            item { Text(user.email, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            item { Button(onLogout, enabled = !loading, modifier = Modifier.fillMaxWidth()) { Text(if (loading) "جاري الخروج..." else "تسجيل الخروج") } }
        } else {
            item { Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) { FilterChip(!registering, { registering = false }, label = { Text("تسجيل الدخول") }, modifier = Modifier.weight(1f)); FilterChip(registering, { registering = true }, label = { Text("سجل الآن") }, modifier = Modifier.weight(1f)) } }
            if (registering) item { OutlinedTextField(displayName, { displayName = it }, Modifier.fillMaxWidth(), singleLine = true, label = { Text("الاسم الكامل") }) }
            item { OutlinedTextField(email, { email = it }, Modifier.fillMaxWidth(), singleLine = true, label = { Text("البريد الإلكتروني") }) }
            item { OutlinedTextField(password, { password = it }, Modifier.fillMaxWidth(), singleLine = true, visualTransformation = PasswordVisualTransformation(), label = { Text("كلمة المرور") }) }
            if (message != null) item { Text(message, color = MaterialTheme.colorScheme.primary, textAlign = TextAlign.Center) }
            if (error != null) item { Text(error, color = MaterialTheme.colorScheme.error, textAlign = TextAlign.Center) }
            item { Button(onClick = { if (registering) onRegister(email, password, displayName) else onLogin(email, password) }, enabled = !loading && email.isNotBlank() && password.length >= 8 && (!registering || displayName.isNotBlank()), modifier = Modifier.fillMaxWidth()) { Text(if (loading) "جاري المعالجة..." else if (registering) "إنشاء حساب" else "تسجيل الدخول") } }
            if (googleConfigured) {
                item { HorizontalDivider() }
                item { OutlinedButton(onGoogle, enabled = !loading, modifier = Modifier.fillMaxWidth()) { Text("المتابعة باستخدام Google") } }
            }
        }
    }
}

@Composable private fun BrandHeader() = Column(horizontalAlignment = Alignment.CenterHorizontally) {
    Image(painterResource(R.drawable.ic_khedmah_umbrella), null, Modifier.size(88.dp))
    Text("خدمة", color = MaterialTheme.colorScheme.onBackground, fontSize = 34.sp, fontWeight = FontWeight.Black)
    Text("تحت مظلة واحدة", color = MaterialTheme.colorScheme.primary, fontSize = 12.sp, fontWeight = FontWeight.Bold)
}

@Composable private fun SearchBox(query: String, onQuery: (String) -> Unit, onSearch: () -> Unit) = Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
    OutlinedTextField(query, onQuery, Modifier.weight(1f), singleLine = true, label = { Text("ما الخدمة التي تبحث عنها؟") })
    Button(onSearch, Modifier.height(56.dp), shape = RoundedCornerShape(14.dp)) { Text("ابحث") }
}

@Composable private fun CategoryRow(categories: List<KhedmahCategory>, selected: String?, onSelect: (String?) -> Unit) = LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
    item { FilterChip(selected == null, { onSelect(null) }, label = { Text("الكل") }) }
    items(categories, key = { it.code }) { category -> FilterChip(selected == category.code, { onSelect(category.code) }, label = { Text(category.nameAr) }) }
}

@Composable private fun HomeScreen(modifier: Modifier, query: String, onQuery: (String) -> Unit, categories: List<KhedmahCategory>, selected: String?, onCategory: (String?) -> Unit, onSearch: () -> Unit) {
    LazyColumn(modifier.fillMaxSize().padding(horizontal = 18.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(18.dp)) {
        item { Spacer(Modifier.height(18.dp)); BrandHeader() }
        item { Text("كل ما تحتاجه أقرب إليك", color = MaterialTheme.colorScheme.onBackground, fontSize = 27.sp, fontWeight = FontWeight.Black, textAlign = TextAlign.Center) }
        item { Text("ابحث حسب الفئة والموقع وتواصل مباشرة مع مقدم الخدمة.", color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center) }
        item { SearchBox(query, onQuery, onSearch) }
        item { Column(verticalArrangement = Arrangement.spacedBy(8.dp)) { Text("التصنيفات الرئيسية", color = MaterialTheme.colorScheme.onBackground, fontWeight = FontWeight.Bold); CategoryRow(categories, selected, onCategory) } }
        item { Card(colors = CardDefaults.cardColors(MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(18.dp), modifier = Modifier.fillMaxWidth()) { Column(Modifier.padding(18.dp)) { Text("وصول أوضح إلى الخدمة المناسبة", color = MaterialTheme.colorScheme.onSurface, fontWeight = FontWeight.Bold); Text("معلومات واضحة · بحث حسب الموقع · تواصل مباشر", color = MaterialTheme.colorScheme.primary) } } }
    }
}

@Composable private fun SearchScreen(modifier: Modifier, query: String, onQuery: (String) -> Unit, categories: List<KhedmahCategory>, selected: String?, onCategory: (String?) -> Unit, results: List<KhedmahResult>, loading: Boolean, error: String?, onSearch: () -> Unit) {
    Column(modifier.fillMaxSize().padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("اكتشف الخدمات", color = MaterialTheme.colorScheme.onBackground, fontSize = 26.sp, fontWeight = FontWeight.Black)
        SearchBox(query, onQuery, onSearch); CategoryRow(categories, selected, onCategory)
        when {
            loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = MaterialTheme.colorScheme.primary) }
            error != null -> Card(colors = CardDefaults.cardColors(MaterialTheme.colorScheme.errorContainer)) { Text(error, color = MaterialTheme.colorScheme.onErrorContainer, modifier = Modifier.padding(16.dp)) }
            results.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text("ابدأ البحث لعرض الأعمال والمهنيين والخدمات.", color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center) }
            else -> LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) { items(results, key = { "${it.type}:${it.id}" }) { result -> Card(colors = CardDefaults.cardColors(MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth()) { Column(Modifier.padding(16.dp)) { Text(result.title, color = MaterialTheme.colorScheme.onSurface, fontWeight = FontWeight.Bold); Text(result.subtitle, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp) } } } }
        }
    }
}

@Composable private fun MapScreen(modifier: Modifier, locationGranted: Boolean, onRequestLocation: () -> Unit) {
    val camera = rememberCameraPositionState { position = CameraPosition.fromLatLngZoom(LatLng(33.5138, 36.2765), 12f) }
    Box(modifier.fillMaxSize()) {
        GoogleMap(
            modifier = Modifier.fillMaxSize(),
            cameraPositionState = camera,
            properties = MapProperties(isMyLocationEnabled = locationGranted),
            uiSettings = MapUiSettings(myLocationButtonEnabled = locationGranted, zoomControlsEnabled = false)
        )
        if (!locationGranted) Button(onRequestLocation, Modifier.align(Alignment.TopCenter).padding(16.dp)) { Text("تفعيل موقعي") }
    }
}
