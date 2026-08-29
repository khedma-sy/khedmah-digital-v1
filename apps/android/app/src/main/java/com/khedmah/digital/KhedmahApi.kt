package com.khedmah.digital

import java.net.HttpURLConnection
import java.net.CookieManager
import java.net.CookiePolicy
import java.net.URLEncoder
import java.net.URL
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import android.util.Base64

data class KhedmahCategory(val code: String, val nameAr: String, val parentCode: String?)
data class KhedmahResult(val id: String, val title: String, val subtitle: String, val type: String)
data class KhedmahUser(val id: String, val email: String, val displayName: String)
data class KhedmahBusiness(val id: String, val name: String, val descriptionAr: String, val cityCode: String, val moderationStatus: String)
data class KhedmahMedia(val id: String, val publicUrl: String, val assetType: String)
data class KhedmahProduct(val id: String, val titleAr: String, val businessName: String, val price: Double, val currency: String, val availability: String, val imageUrl: String?)

class KhedmahApi(private val baseUrl: String = BuildConfig.KHEDMAH_API_BASE_URL.trimEnd('/')) {
    private val cookies = CookieManager(null, CookiePolicy.ACCEPT_ORIGINAL_SERVER)
    val configured: Boolean get() = baseUrl.startsWith("https://")

    suspend fun categories(): List<KhedmahCategory> = withContext(Dispatchers.IO) {
        val payload = get("/api/v1/categories")
        val values = payload.optJSONArray("categories") ?: return@withContext emptyList()
        List(values.length()) { index ->
            val item = values.getJSONObject(index)
            KhedmahCategory(
                code = item.getString("code"),
                nameAr = item.getString("nameAr"),
                parentCode = if (item.isNull("parentCode")) null else item.optString("parentCode").takeIf { it.isNotBlank() }
            )
        }
    }

    suspend fun search(query: String, categoryCode: String?, latitude: Double? = null, longitude: Double? = null): List<KhedmahResult> = withContext(Dispatchers.IO) {
        val parameters = buildList {
            if (query.isNotBlank()) add("q=${encode(query)}")
            if (!categoryCode.isNullOrBlank()) add("categoryCode=${encode(categoryCode)}")
            if (latitude != null && longitude != null) {
                add("type=business")
                add("map=true")
                add("latitude=$latitude")
                add("longitude=$longitude")
            }
        }.joinToString("&")
        val payload = get("/api/v1/search?$parameters")
        buildList {
            payload.optJSONArray("businesses")?.let { items ->
                repeat(items.length()) { index ->
                    val item = items.getJSONObject(index)
                    add(KhedmahResult(
                        item.getString("id"),
                        item.optString("name", "نشاط تجاري"),
                        item.optString("cityCode"),
                        "business",
                        item.optString("phone").takeIf { it.isNotBlank() },
                        item.optDouble("distanceKm").takeIf { !it.isNaN() }
                    ))
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

    suspend fun products(): List<KhedmahProduct> = withContext(Dispatchers.IO) {
        val values = get("/api/v1/products").optJSONArray("products") ?: return@withContext emptyList()
        List(values.length()) { index ->
            val item = values.getJSONObject(index)
            KhedmahProduct(
                id = item.getString("id"),
                titleAr = item.optString("titleAr", "منتج"),
                businessName = item.optString("businessName", "نشاط على خدمة"),
                price = item.optDouble("price", 0.0),
                currency = item.optString("currency", "SYP"),
                availability = item.optString("availability", "in_stock"),
                imageUrl = item.optString("imageUrl").takeIf { it.isNotBlank() }?.let(::absoluteMediaUrl)
            )
        }
    }

    suspend fun login(email: String, password: String): KhedmahUser = withContext(Dispatchers.IO) {
        userFrom(request("/api/v1/auth/login", "POST", JSONObject().put("email", email).put("password", password)))
    }

    suspend fun register(email: String, password: String, displayName: String): KhedmahUser = withContext(Dispatchers.IO) {
        userFrom(request("/api/v1/auth/register", "POST", JSONObject().put("email", email).put("password", password).put("displayName", displayName)))
    }

    suspend fun google(idToken: String): KhedmahUser = withContext(Dispatchers.IO) {
        userFrom(request("/api/v1/auth/google", "POST", JSONObject().put("idToken", idToken)))
    }

    suspend fun session(): KhedmahUser? = withContext(Dispatchers.IO) {
        runCatching { userFrom(request("/api/v1/auth/session")) }.getOrNull()
    }

    suspend fun logout() = withContext(Dispatchers.IO) {
        request("/api/v1/auth/logout", "POST", JSONObject()); cookies.cookieStore.removeAll(); Unit
    }

    suspend fun myBusinesses(): List<KhedmahBusiness> = withContext(Dispatchers.IO) {
        val values = get("/api/v1/businesses/my").optJSONArray("businesses") ?: return@withContext emptyList()
        List(values.length()) { index ->
            val item = values.getJSONObject(index)
            KhedmahBusiness(item.getString("id"), item.optString("name", "نشاط"), item.optString("descriptionAr"), item.optString("cityCode"), item.optString("moderationStatus", "pending"))
        }
    }

    suspend fun businessMedia(businessId: String): List<KhedmahMedia> = withContext(Dispatchers.IO) {
        val values = get("/api/v1/businesses/${encode(businessId)}/media").optJSONArray("assets") ?: return@withContext emptyList()
        List(values.length()) { index ->
            val item = values.getJSONObject(index)
            KhedmahMedia(item.getString("id"), absoluteMediaUrl(item.optString("url")), item.optString("assetType", "gallery"))
        }
    }

    suspend fun uploadBusinessMedia(businessId: String, filename: String, mimeType: String, bytes: ByteArray, assetType: String, sortOrder: Int): Unit = withContext(Dispatchers.IO) {
        request("/api/v1/media", "POST", JSONObject()
            .put("ownerType", "business_profile").put("ownerId", businessId).put("visibility", "public")
            .put("filename", filename).put("mimeType", mimeType).put("sizeBytes", bytes.size)
            .put("content", Base64.encodeToString(bytes, Base64.NO_WRAP)).put("assetType", assetType).put("sortOrder", sortOrder))
        Unit
    }

    suspend fun deleteMedia(id: String): Unit = withContext(Dispatchers.IO) {
        request("/api/v1/media/${encode(id)}", "DELETE"); Unit
    }

    private fun encode(value: String) = URLEncoder.encode(value, Charsets.UTF_8.name())

    private fun absoluteMediaUrl(value: String): String = when {
        value.startsWith("https://") || value.startsWith("http://") -> value
        value.startsWith("/") -> "$baseUrl$value"
        else -> value
    }

    private fun get(path: String): JSONObject = request(path)

    private fun userFrom(payload: JSONObject): KhedmahUser {
        val user = payload.getJSONObject("user")
        return KhedmahUser(user.getString("id"), user.getString("email"), user.getJSONObject("profile").getString("displayName"))
    }

    private fun request(path: String, method: String = "GET", body: JSONObject? = null): JSONObject {
        check(configured) { "KHEDMAH_API_BASE_URL must be configured with HTTPS." }
        val connection = URL("$baseUrl$path").openConnection() as HttpURLConnection
        return try {
            connection.requestMethod = method
            connection.connectTimeout = 10_000
            connection.readTimeout = 15_000
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("X-Khedmah-Client", "android")
            cookies.get(connection.url.toURI(), emptyMap()).forEach { (name, values) -> connection.setRequestProperty(name, values.joinToString("; ")) }
            if (body != null) {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json")
                connection.outputStream.bufferedWriter().use { it.write(body.toString()) }
            }
            val status = connection.responseCode
            val responseHeaders = connection.headerFields.entries.mapNotNull { (name, values) -> name?.let { it to values } }.toMap()
            cookies.put(connection.url.toURI(), responseHeaders)
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val body = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            if (status !in 200..299) error("تعذر إكمال الطلب ($status)")
            JSONObject(body)
        } finally {
            connection.disconnect()
        }
    }
}
