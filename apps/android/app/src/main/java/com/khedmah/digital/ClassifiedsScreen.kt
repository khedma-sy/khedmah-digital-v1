package com.khedmah.digital

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage

/**
 * Read-only public classifieds directory. Creating or moderating ads remains
 * on the separately gated authenticated workflow, not this screen.
 */
@Composable
fun ClassifiedsScreen(
    modifier: Modifier,
    ads: List<KhedmahClassifiedAd>,
    loading: Boolean,
    error: String?,
    query: String,
    onQueryChange: (String) -> Unit,
    onSearch: () -> Unit
) {
    LazyColumn(
        modifier.fillMaxSize().padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            Text("الإعلانات المبوبة", fontSize = 20.sp, fontWeight = FontWeight.Black)
            Text("إعلانات منشورة بعد المراجعة، والتواصل والاتفاق مباشرة مع المعلن.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        item {
            OutlinedTextField(
                value = query,
                onValueChange = onQueryChange,
                modifier = Modifier.fillMaxWidth(),
                label = { Text("ابحث عن إعلان") },
                singleLine = true
            )
        }
        item {
            Button(onClick = onSearch, enabled = !loading, modifier = Modifier.fillMaxWidth()) {
                Text(if (loading) "جاري البحث…" else "بحث في الإعلانات")
            }
        }
        if (error != null) item {
            KhedmahStateCard("تعذر تحميل الإعلانات", error, KhedmahStateTone.Error)
        }
        if (!loading && error == null && ads.isEmpty()) item {
            KhedmahStateCard("لا توجد إعلانات مطابقة", "حاول تغيير عبارة البحث أو أعد المحاولة.")
        }
        items(ads, key = { it.id }) { ad ->
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(MaterialTheme.colorScheme.surface.copy(alpha = 0.82f))
            ) {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    ad.imageUrl?.let { url ->
                        AsyncImage(
                            model = url,
                            contentDescription = ad.titleAr,
                            contentScale = ContentScale.Fit,
                            modifier = Modifier.fillMaxWidth().height(180.dp)
                        )
                    }
                    Text(ad.titleAr, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
                    if (ad.descriptionAr.isNotBlank()) {
                        Text(ad.descriptionAr, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    val kindLabel = when (ad.kind) {
                        "sale" -> "للبيع"
                        "rent" -> "للإيجار"
                        "service" -> "خدمة"
                        "wanted" -> "مطلوب"
                        else -> "إعلان"
                    }
                    Text(
                        listOfNotNull(kindLabel, ad.cityCode).joinToString(" · "),
                        color = MaterialTheme.colorScheme.primary
                    )
                }
            }
        }
    }
}
