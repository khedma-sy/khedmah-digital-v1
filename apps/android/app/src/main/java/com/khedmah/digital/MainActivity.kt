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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.maps.android.compose.*
import kotlinx.coroutines.launch

private val Navy = Color(0xFF103452)
private val Green = Color(0xFF16875F)
private val Orange = Color(0xFFEE7C37)
private val Warm = Color(0xFFFFF9F0)

private enum class Destination(val label: String, val symbol: String) {
    Home("الرئيسية", "⌂"), Search("البحث", "⌕"), Map("الخريطة", "⌖")
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
    val scheme = lightColorScheme(primary = Green, secondary = Orange, background = Warm, surface = Color.White, onSurface = Navy)
    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
        MaterialTheme(colorScheme = scheme) {
            val api = remember { KhedmahApi() }
            var destination by remember { mutableStateOf(Destination.Home) }
            var categories by remember { mutableStateOf<List<KhedmahCategory>>(emptyList()) }
            var selectedCategory by remember { mutableStateOf<String?>(null) }
            var query by remember { mutableStateOf("") }
            var results by remember { mutableStateOf<List<KhedmahResult>>(emptyList()) }
            var loading by remember { mutableStateOf(false) }
            var error by remember { mutableStateOf<String?>(null) }
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
                if (api.configured) runCatching { api.categories() }.onSuccess { categories = it }.onFailure { error = it.message ?: "تعذر تحميل التصنيفات." }
            }

            Scaffold(containerColor = Warm, bottomBar = {
                NavigationBar(containerColor = Color.White) {
                    Destination.entries.forEach { item ->
                        NavigationBarItem(selected = destination == item, onClick = { destination = item }, icon = { Text(item.symbol, fontSize = 22.sp) }, label = { Text(item.label) })
                    }
                }
            }) { padding ->
                when (destination) {
                    Destination.Home -> HomeScreen(Modifier.padding(padding), query, { query = it }, categories, selectedCategory, { selectedCategory = it; runSearch() }, ::runSearch)
                    Destination.Search -> SearchScreen(Modifier.padding(padding), query, { query = it }, categories, selectedCategory, { selectedCategory = it }, results, loading, error, ::runSearch)
                    Destination.Map -> MapScreen(Modifier.padding(padding), locationGranted, onRequestLocation)
                }
            }
        }
    }
}

@Composable private fun BrandHeader() = Column(horizontalAlignment = Alignment.CenterHorizontally) {
    Image(painterResource(R.drawable.ic_khedmah_umbrella), null, Modifier.size(88.dp))
    Text("خدمة", color = Navy, fontSize = 34.sp, fontWeight = FontWeight.Black)
    Text("تحت مظلة واحدة", color = Green, fontSize = 12.sp, fontWeight = FontWeight.Bold)
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
        item { Text("كل ما تحتاجه أقرب إليك", color = Navy, fontSize = 27.sp, fontWeight = FontWeight.Black, textAlign = TextAlign.Center) }
        item { Text("ابحث حسب الفئة والموقع وتواصل مباشرة مع مقدم الخدمة.", color = Color(0xFF647789), textAlign = TextAlign.Center) }
        item { SearchBox(query, onQuery, onSearch) }
        item { Column(verticalArrangement = Arrangement.spacedBy(8.dp)) { Text("التصنيفات الرئيسية", color = Navy, fontWeight = FontWeight.Bold); CategoryRow(categories, selected, onCategory) } }
        item { Card(colors = CardDefaults.cardColors(Color.White), shape = RoundedCornerShape(18.dp), modifier = Modifier.fillMaxWidth()) { Column(Modifier.padding(18.dp)) { Text("وصول أوضح إلى الخدمة المناسبة", color = Navy, fontWeight = FontWeight.Bold); Text("معلومات واضحة · بحث حسب الموقع · تواصل مباشر", color = Green) } } }
    }
}

@Composable private fun SearchScreen(modifier: Modifier, query: String, onQuery: (String) -> Unit, categories: List<KhedmahCategory>, selected: String?, onCategory: (String?) -> Unit, results: List<KhedmahResult>, loading: Boolean, error: String?, onSearch: () -> Unit) {
    Column(modifier.fillMaxSize().padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("اكتشف الخدمات", color = Navy, fontSize = 26.sp, fontWeight = FontWeight.Black)
        SearchBox(query, onQuery, onSearch); CategoryRow(categories, selected, onCategory)
        when {
            loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Green) }
            error != null -> Card(colors = CardDefaults.cardColors(Color(0xFFFFEDEA))) { Text(error, color = Color(0xFF9C2B20), modifier = Modifier.padding(16.dp)) }
            results.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text("ابدأ البحث لعرض الأعمال والمهنيين والخدمات.", color = Color(0xFF647789), textAlign = TextAlign.Center) }
            else -> LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) { items(results, key = { "${it.type}:${it.id}" }) { result -> Card(colors = CardDefaults.cardColors(Color.White), shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth()) { Column(Modifier.padding(16.dp)) { Text(result.title, color = Navy, fontWeight = FontWeight.Bold); Text(result.subtitle, color = Color(0xFF647789), fontSize = 13.sp) } } } }
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
