#!/usr/bin/env python3
"""Read public Cloud SQL price candidates for Preview; never provisions resources."""

import json
import os
import re
import subprocess
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

ACCOUNT = "haifawi30@gmail.com"
PROJECT = "khedmah-preview-v2-20261012"
PROJECT_NUMBER = "1044962071847"
REGION = "europe-west1"
ROOT = "https://cloudbilling.googleapis.com/v1/"
MAX_PAGE_BYTES = 24 * 1024 * 1024


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def cloud(*args):
    try:
        result = subprocess.run(
            ["gcloud", *args, "--account=" + ACCOUNT, "--project=" + PROJECT,
             "--user-output-enabled", "--verbosity=error"],
            stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=60,
            env=dict(os.environ, CLOUDSDK_CORE_LOG_HTTP="false",
                     CLOUDSDK_CORE_USER_OUTPUT_ENABLED="true"))
    except (OSError, subprocess.TimeoutExpired):
        raise SystemExit("STOP: GCLOUD_READ_FAILED") from None
    if result.returncode:
        raise SystemExit("STOP: GCLOUD_READ_FAILED")
    return result.stdout.strip()


def catalog(path, key, token, **params):
    if path != "services" and not re.fullmatch(
            r"services/[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}/skus", path):
        raise SystemExit("STOP: CATALOG_PATH_REJECTED")
    opener = urllib.request.build_opener(NoRedirect)
    seen_tokens = set()
    items = []
    for page in range(100):
        request = urllib.request.Request(
            ROOT + path + "?" + urllib.parse.urlencode(dict(pageSize=1000, **params)),
            headers={"Authorization": "Bearer " + token,
                     "X-Goog-User-Project": PROJECT}, method="GET")
        try:
            with opener.open(request, timeout=45) as response:
                raw = response.read(MAX_PAGE_BYTES + 1)
            if len(raw) > MAX_PAGE_BYTES:
                raise ValueError()
            data = json.loads(raw)
            if not isinstance(data, dict) or not isinstance(data.get(key, []), list):
                raise ValueError()
            rows = data.get(key, [])
            if any(not isinstance(row, dict) for row in rows):
                raise ValueError()
            next_page = data.get("nextPageToken", "")
            if not isinstance(next_page, str):
                raise ValueError()
        except urllib.error.HTTPError as error:
            raise SystemExit("STOP: CATALOG_HTTP_" + str(error.code)) from None
        except (ValueError, OSError):
            raise SystemExit("STOP: INVALID_OR_UNAVAILABLE_CATALOG") from None
        items.extend(rows)
        if not next_page:
            return items
        if next_page in seen_tokens:
            raise SystemExit("STOP: REPEATED_PAGE_TOKEN")
        seen_tokens.add(next_page)
        params["pageToken"] = next_page
    raise SystemExit("STOP: CATALOG_PAGE_LIMIT")


def project_row(sku):
    regions = sku.get("serviceRegions", [])
    geo = sku.get("geoTaxonomy", {})
    category = sku.get("category", {})
    description = sku.get("description", "")
    if (not isinstance(regions, list) or not isinstance(geo, dict)
            or not isinstance(category, dict) or not isinstance(description, str)):
        raise SystemExit("STOP: INVALID_SKU_METADATA")
    if category.get("usageType") != "OnDemand":
        return None
    geo_regions = geo.get("regions", [])
    if not isinstance(geo_regions, list):
        raise SystemExit("STOP: INVALID_SKU_REGIONS")
    regional = REGION in regions or REGION in geo_regions
    global_price = geo.get("type") == "GLOBAL" or regions == ["global"]
    if not regional and not global_price:
        return None
    lower = description.lower()
    postgres = "postgres" in lower
    shared = any(name in lower for name in ("db-f1-micro", "db-g1-small"))
    generic_support = (
        not any(name in lower for name in ("mysql", "sql server", "sqlserver"))
        and (category.get("resourceFamily") == "Storage"
             or any(word in lower for word in ("backup", "ip address", "transaction log"))))
    if not (postgres or shared or generic_support):
        return None
    prices = sku.get("pricingInfo")
    if not isinstance(prices, list) or not prices:
        raise SystemExit("STOP: MATCHING_SKU_HAS_NO_PRICE")
    for price in prices:
        if not isinstance(price, dict) or not price.get("effectiveTime"):
            raise SystemExit("STOP: INVALID_PRICE_METADATA")
        expression = price.get("pricingExpression", {})
        rates = expression.get("tieredRates", []) if isinstance(expression, dict) else []
        if not expression.get("usageUnit") or not rates or not isinstance(rates, list):
            raise SystemExit("STOP: INVALID_PRICE_EXPRESSION")
        for rate in rates:
            money = rate.get("unitPrice", {}) if isinstance(rate, dict) else {}
            if money.get("currencyCode") != "USD":
                raise SystemExit("STOP: PRICE_CURRENCY_MISMATCH")
    return {
        "sku": sku.get("name"),
        "description": description,
        "category": category,
        "region_scope": REGION if regional else "GLOBAL_CANDIDATE",
        "serviceRegions": regions,
        "geoTaxonomy": geo,
        "pricingInfo": prices,
    }


def main():
    for key in ("impersonate_service_account", "access_token_file",
                "credential_file_override"):
        if cloud("config", "get-value", "auth/" + key) not in ("", "(unset)"):
            raise SystemExit("STOP: AUTH_OVERRIDE_PRESENT")
    try:
        project = json.loads(cloud("projects", "describe", PROJECT, "--format=json"))
    except ValueError:
        raise SystemExit("STOP: PROJECT_METADATA_INVALID") from None
    if (not isinstance(project, dict) or project.get("projectId") != PROJECT
            or str(project.get("projectNumber")) != PROJECT_NUMBER
            or project.get("lifecycleState") != "ACTIVE"
            or project.get("parent") != {"type": "organization", "id": "594049370623"}):
        raise SystemExit("STOP: PROJECT_IDENTITY_MISMATCH")
    token = cloud("auth", "print-access-token")
    if not token or any(c.isspace() for c in token):
        raise SystemExit("STOP: TOKEN_UNAVAILABLE")
    services = catalog("services", "services", token)
    matches = [s for s in services if s.get("displayName") == "Cloud SQL"]
    if len(matches) != 1 or not re.fullmatch(
            r"services/[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}", matches[0].get("name", "")):
        raise SystemExit("STOP: CLOUD_SQL_SERVICE_NOT_UNIQUE")
    service = matches[0]["name"]
    skus = catalog(service + "/skus", "skus", token, currencyCode="USD")
    rows = []
    seen = set()
    for sku in skus:
        name = sku.get("name", "")
        if not isinstance(name, str) or not name.startswith(service + "/skus/") or name in seen:
            raise SystemExit("STOP: INVALID_OR_DUPLICATE_SKU")
        seen.add(name)
        row = project_row(sku)
        if row:
            rows.append(row)
    if not rows or len(rows) > 160:
        raise SystemExit("STOP: PRICE_CANDIDATE_COUNT_OUT_OF_BOUNDS")
    print(json.dumps({"evidence_utc": datetime.now(timezone.utc).isoformat(),
                      "quota_project": PROJECT, "region": REGION, "currency": "USD",
                      "service": service, "catalog_skus_read": len(skus),
                      "candidate_count": len(rows), "read_only": True}))
    for row in sorted(rows, key=lambda x: (x["description"], x["sku"])):
        print(json.dumps(row, separators=(",", ":"), ensure_ascii=True))
    print("PREVIEW_SQL_PUBLIC_PRICE_CANDIDATES_READ")
    print("CANDIDATES_REQUIRE_TIER_AND_UNIT_REVIEW_NOT_A_TOTAL_QUOTE")


if __name__ == "__main__":
    main()
