package com.khedmah.digital

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.google.android.gms.maps.model.LatLng
import java.net.URLEncoder

@Composable
fun StoreScreen(
    modifier: Modifier,
    products: List<KhedmahProduct>,
    loading: Boolean,
    error: String?,
    onRefresh: () -> Unit
) {
    LazyColumn(modifier.fillMaxSize().padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Text("متجر خدمة", color = MaterialTheme.colorScheme.onBackground, fontSize = 20.sp, fontWeight = FontWeight.Black)
            Text("منتجات منشورة من أنشطة معتمدة. التواصل والاتفاق مباشرة مع النشاط.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        item { OutlinedButton(onRefresh, enabled = !loading, modifier = Modifier.fillMaxWidth()) { Text(if (loading) "جاري التحديث…" else "تحديث المنتجات") } }
        if (error != null) item { KhedmahStateCard("تعذر تحميل المتجر", error, KhedmahStateTone.Error) }
        if (!loading && error == null && products.isEmpty()) item { KhedmahStateCard("لا توجد منتجات منشورة", "تظهر هنا المنتجات بعد مراجعتها واعتمادها.") }
        items(products, key = { it.id }) { product ->
            Card(colors = CardDefaults.cardColors(MaterialTheme.colorScheme.surface.copy(alpha = 0.82f)), modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (product.imageUrl != null) AsyncImage(
                        model = product.imageUrl,
                        contentDescription = product.titleAr,
                        contentScale = ContentScale.Fit,
                        modifier = Modifier.fillMaxWidth().height(190.dp)
                    )
                    Text(product.titleAr, color = MaterialTheme.colorScheme.onSurface, fontWeight = FontWeight.Black)
                    Text(product.businessName, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text("${formatProductPrice(product.price)} ${product.currency}", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
                    Text(if (product.availability == "in_stock") "متوفر" else if (product.availability == "made_to_order") "حسب الطلب" else "غير متوفر", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
fun MobilityScreen(
    modifier: Modifier,
    currentLocation: LatLng?,
    locationGranted: Boolean,
    loading: Boolean,
    error: String?,
    providers: List<KhedmahResult>,
    onRequestLocation: () -> Unit,
    onSearch: (String, LatLng) -> Unit
) {
    val context = LocalContext.current
    var type by remember { mutableStateOf("taxi") }
    var destination by remember { mutableStateOf("") }
    LazyColumn(modifier.fillMaxSize().padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        item {
            Text("تاكسي ومندوب توصيل", color = MaterialTheme.colorScheme.onBackground, fontSize = 20.sp, fontWeight = FontWeight.Black, textAlign = TextAlign.Center)
            Text("ابحث عن أقرب نشاط معتمد من موقعك الحالي، ثم تواصل معه مباشرة.", color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
        }
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(type == "taxi", { type = "taxi" }, label = { Text("تاكسي") }, modifier = Modifier.weight(1f))
                FilterChip(type == "delivery_courier", { type = "delivery_courier" }, label = { Text("مندوب توصيل") }, modifier = Modifier.weight(1f))
            }
        }
        if (!locationGranted) item { Button(onRequestLocation, Modifier.fillMaxWidth()) { Text("تفعيل موقعي") } }
        if (locationGranted && currentLocation == null) item { KhedmahStateCard("الموقع غير متاح بعد", "شغّل خدمة الموقع في جهازك ثم أعد فتح الصفحة.") }
        item {
            OutlinedTextField(destination, { destination = it }, Modifier.fillMaxWidth(), singleLine = true, label = { Text("الوجهة") }, placeholder = { Text("اكتب الوجهة لفتحها في Google Maps") })
        }
        item {
            Button(
                onClick = { currentLocation?.let { onSearch(type, it) } },
                enabled = !loading && currentLocation != null,
                modifier = Modifier.fillMaxWidth()
            ) { Text(if (loading) "جاري البحث…" else if (type == "taxi") "ابحث عن تاكسي" else "ابحث عن مندوب") }
        }
        item {
            OutlinedButton(
                onClick = {
                    val origin = currentLocation ?: return@OutlinedButton
                    val encodedDestination = URLEncoder.encode(destination, Charsets.UTF_8.name())
                    val url = "https://www.google.com/maps/dir/?api=1&origin=${origin.latitude},${origin.longitude}&destination=$encodedDestination&travelmode=driving"
                    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                },
                enabled = currentLocation != null && destination.isNotBlank(),
                modifier = Modifier.fillMaxWidth()
            ) { Text("افتح المسار في Google Maps") }
        }
        if (error != null) item { KhedmahStateCard("تعذر البحث", error, KhedmahStateTone.Error) }
        if (!loading && error == null && providers.isEmpty()) item { KhedmahStateCard("اختر نوع الخدمة", "لا تُعد الرحلة مؤكدة حتى يقبلها مزود الخدمة مباشرة.") }
        items(providers, key = { it.id }) { provider ->
            Card(colors = CardDefaults.cardColors(MaterialTheme.colorScheme.surface.copy(alpha = 0.82f)), modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
                    Text(provider.title, color = MaterialTheme.colorScheme.onSurface, fontWeight = FontWeight.Bold)
                    Text(buildString { append(provider.subtitle); provider.distanceKm?.let { append(" · ${String.format("%.1f", it)} كم") } }, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    if (provider.phone != null) OutlinedButton(
                        onClick = { context.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:${provider.phone}"))) },
                        modifier = Modifier.fillMaxWidth()
                    ) { Text("اتصال بالمزود") }
                }
            }
        }
    }
}

private fun formatProductPrice(price: Double): String = if (price % 1.0 == 0.0) price.toLong().toString() else String.format("%.2f", price)
