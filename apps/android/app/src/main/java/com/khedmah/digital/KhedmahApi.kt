package com.khedmah.digital

import java.net.HttpURLConnection
import java.net.URLEncoder
import java.net.URL
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

data class KhedmahCategory(val code: String, val nameAr: String)
data class KhedmahResult(val id: String, val title: String, val subtitle: String, val type: String)

class KhedmahApi(private val baseUrl: String = BuildConfig.KHEDMAH_API_BASE_URL.trimEnd('/')) {
    val configured: Boolean get() = baseUrl.startsWith("https://")

    suspend fun categories(): List<KhedmahCategory> = withContext(Dispatchers.IO) {
        val payload = get("/api/v1/categories")
        val values = payload.optJSONArray("categories") ?: return@withContext emptyList()
        List(values.length()) { index ->
            val item = values.getJSONObject(index)
            KhedmahCategory(item.getString("code"), item.getString("nameAr"))
        }
    }

    suspend fun search(query: String, categoryCode: String?): List<KhedmahResult> = withContext(Dispatchers.IO) {
        val parameters = buildList {
            if (query.isNotBlank()) add("q=${encode(query)}")
            if (!categoryCode.isNullOrBlank()) add("categoryCode=${encode(categoryCode)}")
        }.joinToString("&")
        val payload = get("/api/v1/search?$parameters")
        buildList {
            payload.optJSONArray("businesses")?.let { items ->
                repeat(items.length()) { index ->
                    val item = items.getJSONObject(index)
                    add(KhedmahResult(item.getString("id"), item.optString("name", "نشاط تجاري"), item.optString("cityCode"), "business"))
                }
            }
            payload.optJSONArray("professionals")?.let { items ->
                repeat(items.length()) { index ->
                    val item = items.getJSONObject(index)
                    add(KhedmahResult(item.getString("id"), item.optString("headlineAr", "مقدم خدمة"), item.optString("cityCode"), "professional"))
                }
            }
            payload.optJSONArray("services")?.let { items ->
                repeat(items.length()) { index ->
                    val item = items.getJSONObject(index)
                    add(KhedmahResult(item.getString("id"), item.optString("titleAr", "خدمة"), item.optString("priceType"), "service"))
                }
            }
        }
    }

    private fun encode(value: String) = URLEncoder.encode(value, Charsets.UTF_8.name())

    private fun get(path: String): JSONObject {
        check(configured) { "KHEDMAH_API_BASE_URL must be configured with HTTPS." }
        val connection = URL("$baseUrl$path").openConnection() as HttpURLConnection
        return try {
            connection.requestMethod = "GET"
            connection.connectTimeout = 10_000
            connection.readTimeout = 15_000
            connection.setRequestProperty("Accept", "application/json")
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val body = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            if (status !in 200..299) error("تعذر الاتصال بخدمة البحث ($status)")
            JSONObject(body)
        } finally {
            connection.disconnect()
        }
    }
}
