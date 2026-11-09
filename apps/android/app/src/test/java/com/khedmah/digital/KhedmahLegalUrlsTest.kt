package com.khedmah.digital

import java.net.URI
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test

/** Guard app-store review URLs against accidental redirects or data leakage. */
class KhedmahLegalUrlsTest {
    @Test fun linksAreFirstPartyHttpsWithoutUserIdentifiers() {
        for (value in listOf(KhedmahLegalUrls.privacy, KhedmahLegalUrls.terms, KhedmahLegalUrls.deleteAccount)) {
            val uri = URI(value)
            assertEquals("https", uri.scheme)
            assertEquals("khedmah.uk", uri.host)
            assertNull(uri.userInfo)
            assertNull(uri.query)
            assertNull(uri.fragment)
            assertFalse(uri.path.isNullOrBlank())
        }
    }

    @Test fun privacyTermsAndDeletionHaveDistinctPublicRoutes() {
        assertEquals("/platform/privacy", URI(KhedmahLegalUrls.privacy).path)
        assertEquals("/platform/terms", URI(KhedmahLegalUrls.terms).path)
        assertEquals("/platform/delete-account", URI(KhedmahLegalUrls.deleteAccount).path)
    }
}
