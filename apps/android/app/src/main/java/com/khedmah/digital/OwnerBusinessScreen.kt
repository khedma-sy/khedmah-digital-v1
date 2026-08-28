package com.khedmah.digital

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage

private val mediaLabels = mapOf("logo" to "شعار النشاط", "cover" to "صورة الغلاف", "gallery" to "معرض الصور")

@Composable
fun OwnerBusinessScreen(
    modifier: Modifier = Modifier,
    business: KhedmahBusiness,
    media: List<KhedmahMedia>,
    loading: Boolean,
    message: String?,
    error: String?,
    onBack: () -> Unit,
    onUpload: (Uri, String) -> Unit,
    onDelete: (String) -> Unit
) {
    var assetType by remember { mutableStateOf("gallery") }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri -> if (uri != null) onUpload(uri, assetType) }
    LazyColumn(modifier.fillMaxSize().padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item {
            TextButton(onBack) { Text("العودة إلى أنشطتي") }
            Text(business.name, color = MaterialTheme.colorScheme.onBackground, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Black)
            Text("إدارة صور النشاط", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (message != null) item { KhedmahStateCard("تم التنفيذ", message) }
        if (error != null) item { KhedmahStateCard("تعذر تنفيذ العملية", error, KhedmahStateTone.Error) }
        item {
            Card(colors = CardDefaults.cardColors(MaterialTheme.colorScheme.surface.copy(alpha = 0.82f)), shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("إضافة صورة", fontWeight = FontWeight.Bold)
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        mediaLabels.forEach { (value, label) ->
                            FilterChip(selected = assetType == value, onClick = { assetType = value }, label = { Text(label) }, modifier = Modifier.weight(1f))
                        }
                    }
                    Text("JPG أو PNG أو WebP، بحد أقصى 5 ميغابايت. يُستبدل الشعار أو الغلاف السابق تلقائياً.", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
                    Button(onClick = { picker.launch("image/*") }, enabled = !loading && (assetType != "gallery" || media.count { it.assetType == "gallery" } < 12), modifier = Modifier.fillMaxWidth()) {
                        if (loading) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp) else Text("اختيار الصورة ورفعها")
                    }
                }
            }
        }
        if (media.isEmpty()) item { KhedmahStateCard("لا توجد صور بعد", "أضف شعار النشاط وصورة الغلاف وصوراً حقيقية لأعمالك.") }
        items(media, key = { it.id }) { asset ->
            Card(colors = CardDefaults.cardColors(MaterialTheme.colorScheme.surface.copy(alpha = 0.82f)), shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth()) {
                Column {
                    AsyncImage(model = asset.publicUrl, contentDescription = mediaLabels[asset.assetType] ?: "صورة النشاط", modifier = Modifier.fillMaxWidth().aspectRatio(4f / 3f), contentScale = ContentScale.Fit)
                    Row(Modifier.fillMaxWidth().padding(12.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                        Text(mediaLabels[asset.assetType] ?: "صورة", fontWeight = FontWeight.Bold)
                        TextButton(onClick = { onDelete(asset.id) }, enabled = !loading, colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error)) { Text("حذف") }
                    }
                }
            }
        }
    }
}
