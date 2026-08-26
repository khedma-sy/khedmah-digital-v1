package com.khedmah.digital

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

enum class KhedmahStateTone { Info, Error }

@Composable
fun KhedmahStateCard(title: String, description: String, tone: KhedmahStateTone = KhedmahStateTone.Info) {
    val container = if (tone == KhedmahStateTone.Error) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.surface
    val content = if (tone == KhedmahStateTone.Error) MaterialTheme.colorScheme.onErrorContainer else MaterialTheme.colorScheme.onSurface
    Card(colors = CardDefaults.cardColors(container), shape = RoundedCornerShape(18.dp), modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(18.dp)) {
            Text(title, color = content, fontWeight = FontWeight.Bold, fontSize = 17.sp)
            Text(description, color = if (tone == KhedmahStateTone.Error) content else MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Start, modifier = Modifier.padding(top = 5.dp))
        }
    }
}

@Composable
fun KhedmahResultCard(title: String, subtitle: String) {
    Card(colors = CardDefaults.cardColors(MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Text(title, color = MaterialTheme.colorScheme.onSurface, fontWeight = FontWeight.Bold)
            Text(subtitle, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp)
        }
    }
}
