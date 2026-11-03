package com.khedmah.digital

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test

class ClassifiedsContractTest {
    private fun ad(
        id: String = "ad-1",
        title: String = "إعلان تجريبي",
        image: String? = "/api/v1/classifieds/media/public/media-1"
    ): JSONObject = JSONObject()
        .put("id", id)
        .put("titleAr", title)
        .put("descriptionAr", "وصف")
        .put("kind", "sale")
        .put("cityCode", "damascus")
        .put("imageUrls", if (image == null) JSONArray() else JSONArray().put(image))

    private fun decode(vararg items: JSONObject): List<KhedmahClassifiedAd> =
        decodePublicClassifieds(
            JSONObject().put("ads", JSONArray().apply { items.forEach { put(it) } }),
            { "https://api.khedmah.uk$it" }
        )

    @Test fun emptyListIsAccepted() {
        assertEquals(0, decode().size)
    }

    @Test fun relativeMediaLinkResolvesAndFieldsAreRetained() {
        val result = decode(ad()).single()
        assertEquals("ad-1", result.id)
        assertEquals("إعلان تجريبي", result.titleAr)
        assertEquals("damascus", result.cityCode)
        assertEquals("sale", result.kind)
        assertEquals("https://api.khedmah.uk/api/v1/classifieds/media/public/media-1", result.imageUrl)
    }

    @Test fun existingHttpsMediaLinkIsPreserved() {
        val actual = decodePublicClassifieds(
            JSONObject().put("ads", JSONArray().put(ad(image = "https://cdn.example.com/a.jpg"))),
            { it }
        ).single()
        assertEquals("https://cdn.example.com/a.jpg", actual.imageUrl)
    }

    @Test fun unsafeMediaLinksAreNotLoaded() {
        for (unsafe in listOf("http://example.com/x.jpg", "//example.com/x.jpg", "javascript:alert(1)")) {
            assertNull(decode(ad(image = unsafe)).single().imageUrl)
        }
    }

    @Test fun duplicateIdsAreRejected() {
        assertThrows(IllegalArgumentException::class.java) {
            decode(ad(id = "same"), ad(id = "same"))
        }
    }

    @Test fun missingRequiredFieldsAreRejected() {
        assertThrows(Exception::class.java) {
            decode(JSONObject().put("titleAr", "بدون معرف"))
        }
        assertThrows(IllegalArgumentException::class.java) {
            decode(ad(title = " "))
        }
    }

    @Test fun missingAdsArrayIsRejected() {
        assertThrows(Exception::class.java) {
            decodePublicClassifieds(JSONObject(), { it })
        }
    }

    @Test fun excessivelyLargePageIsRejected() {
        val items = JSONArray()
        repeat(101) { items.put(ad(id = "ad-$it")) }
        assertThrows(IllegalArgumentException::class.java) {
            decodePublicClassifieds(JSONObject().put("ads", items), { it })
        }
    }
}
