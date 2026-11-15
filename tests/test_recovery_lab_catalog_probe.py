"""Offline safety-contract tests for lab-only catalog probe. No GCP calls."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

P = Path(__file__).resolve().parents[1] / "scripts/run-recovery-lab-catalog-probe.py"
spec = importlib.util.spec_from_file_location("lab_catalog", P)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def instance(public=False, private="10.166.4.5"):
    return {"name":m.SQL,"region":m.REGION,"state":"RUNNABLE",
            "databaseVersion":"POSTGRES_16",
            "settings":{"ipConfiguration":{"ipv4Enabled":public,
                        "sslMode":"ENCRYPTED_ONLY",
                        "privateNetwork":"projects/"+m.LAB+"/global/networks/"+m.NET}},
            "ipAddresses":[{"type":"PRIVATE","ipAddress":private}]}


def rules():
    base={"direction":"EGRESS","network":"projects/"+m.LAB+"/global/networks/"+m.NET}
    return [dict(base,name="khedmah-lab-deny-egress",priority=1000,
                 destinationRanges=["0.0.0.0/0"],denied=[{"IPProtocol":"all"}]),
            dict(base,name="khedmah-lab-allow-postgres",priority=900,
                 destinationRanges=[str(m.PSA)],allowed=[{"IPProtocol":"tcp","ports":["5432"]}])]


class CatalogSafety(unittest.TestCase):
    def test_private_ip_and_firewall_guards(self):
        self.assertEqual(m.require_private_instance(instance()),"10.166.4.5")
        for bad in (instance(public=True),instance(private="10.240.8.4"),
                    dict(instance(),state="FAILED")):
            with self.assertRaises(m.GuardStop):m.require_private_instance(bad)
        m.require_rules(rules())
        bad=rules()
        bad[0]["denied"]=[{"IPProtocol":"tcp","ports":["22"]}]
        with self.assertRaises(m.GuardStop):m.require_rules(bad)
        bad=rules()
        bad.append(dict(bad[0],name="unreviewed"))
        with self.assertRaises(m.GuardStop):m.require_rules(bad)

    def test_only_static_catalog_selects(self):
        text=m.CATALOG_SQL.lower()
        for name in ("core_user_accounts","fulfillment_orders","taxi_pricing_admin",
                     "category_admin","enforce_ad_free_slot_limit",
                     "ad_daily_quota_exhausted","ad_weekly_quota_exhausted",
                     "media_assets_verification_evidence_private_check"):
            self.assertIn(name,text)
        for forbidden in (" insert "," update "," delete "," drop "," truncate ",
                          " alter "," create ","pg_sleep","pg_notify"):
            self.assertNotIn(forbidden,text)
        self.assertEqual(text.count("select "),len(m.MARKERS)+4)

    def test_sanitization_and_identity_check(self):
        values={"DATABASE":"khedmah","READ_ONLY":"on","SUPERUSER":"false",
                "TABLE_SELECT":"false","CORE_001":"true","ORDER_026":"true","035":"true",
                "036":"false","037_TYPE":"false","037_PRIVATE":"false"}
        log="\n".join("LAB_PROBE_"+k+"="+v for k,v in values.items())
        result=m.classify_log("PRIVATE email@example.invalid\n"+log)
        self.assertEqual(result["036"],"false")
        self.assertNotIn("example.invalid",str(result))
        for bad in (log.replace("READ_ONLY=on","READ_ONLY=off"),
                    log.replace("SUPERUSER=false","SUPERUSER=true"),
                    log.replace("TABLE_SELECT=false","TABLE_SELECT=true"),
                    log.replace("LAB_PROBE_035=true",""),
                    log+"\nLAB_PROBE_036=true"):
            with self.assertRaises(m.GuardStop):m.classify_log(bad)

    def test_plan_no_mutations(self):
        commands=[]
        def mock(args,*,data=None,timeout=240,output_json=False):
            commands.append(args)
            if args[:3]==["compute","networks","describe"]:
                return {"autoCreateSubnetworks":False,"peerings":[{"name":"servicenetworking-googleapis-com","state":"ACTIVE"}]}
            if args[:3]==["compute","networks","subnets"]:
                return {"ipCidrRange":"10.240.8.0/24","network":"projects/"+m.LAB+"/global/networks/"+m.NET}
            if args[:3]==["compute","firewall-rules","list"]:return rules()
            if args[:3]==["sql","instances","list"]:return [{"name":m.SQL}]
            if args[:3]==["sql","instances","describe"]:return instance()
            if args[:3]==["sql","databases","list"]:return [{"name":"khedmah"}]
            if args[:3]==["sql","users","list"]:return [{"name":"postgres"}]
            raise AssertionError(args)
        with patch.object(m,"call",side_effect=mock):
            self.assertEqual(m.main(["--plan"]),0)
        for cmd in commands:
            self.assertFalse({"create","delete","update","enable","restore"}.intersection(cmd))

    def test_execute_is_lab_scoped_and_revokes_narrow_grants(self):
        commands = []
        auditor_created = False
        last_job = ""
        revoke = False
        def mock(args, *, data=None, timeout=240, output_json=False):
            nonlocal auditor_created, last_job, revoke
            commands.append(tuple(args))
            if args[:3] == ["run", "jobs", "list"]:return []
            if args[:3] == ["iam", "service-accounts", "list"]:return []
            if args[:2] == ["secrets", "list"]:return []
            if args[:3] == ["sql", "users", "create"]:auditor_created = True
            if args[:3] == ["sql", "users", "list"]:
                return [{"name":m.USER,"databaseRoles":[m.ROLE]}] if auditor_created else []
            if args[:3] == ["run", "jobs", "describe"]:
                return {"network":m.NET,"subnet":m.SUB,"egress":"ALL_TRAFFIC",
                        "serviceAccount":m.SA+"@"+m.LAB+".iam.gserviceaccount.com"}
            if args[:3] == ["run", "jobs", "execute"]:
                last_job = args[3]
                revoke = any(x.startswith("--update-env-vars=") for x in args)
            if args[:3] == ["run", "jobs", "executions"]:
                return {"name":last_job+"-exec1"}
            if args[:2] == ["logging", "read"]:
                if m.BOOT_JOB in last_job:
                    values = ({"REVOKED_CONNECT":"false","REVOKED_USAGE":"false"} if revoke else
                              {"GRANT_CONNECT":"true","GRANT_USAGE":"true","GRANT_CREATE":"false","GRANT_SELECT":"false"})
                else:
                    values={"PROBE_DATABASE":"khedmah","PROBE_READ_ONLY":"on",
                            "PROBE_SUPERUSER":"false","PROBE_TABLE_SELECT":"false",
                            "PROBE_CORE_001":"true","PROBE_ORDER_026":"true",
                            "PROBE_035":"true","PROBE_036":"false",
                            "PROBE_037_TYPE":"false","PROBE_037_PRIVATE":"false"}
                return [{"resource":{"labels":{"job_name":last_job}},
                         "labels":{"execution_name":last_job+"-exec1"},
                         "textPayload":"\n".join("LAB_"+k+"="+v for k,v in values.items())}]
            return ""
        with patch.object(m,"call",side_effect=mock):
            self.assertEqual(m.execute("10.166.4.5"),0)
        flat=" ".join(" ".join(c) for c in commands)
        self.assertNotIn("khedmah-preview-v2-20261012",flat)
        self.assertIn("--database-roles=pg_read_all_settings",flat)
        self.assertIn("--vpc-egress=all-traffic",flat)
        self.assertIn("--set-secrets=PGPASSWORD=",flat)
        self.assertIn("--instance="+m.SQL,flat)
        self.assertIn("set-password postgres",flat)
        self.assertIn("run jobs execute",flat)
        self.assertIn("--update-env-vars=CHECKS_B64=",flat)
        self.assertTrue(any(c[:2]==("logging","read") and "labels.execution_name=" in c[2]
                            for c in commands))
        self.assertTrue(any(c[:3]==("sql","users","delete") for c in commands))
        self.assertTrue(any(c[:2]==("secrets","delete") for c in commands))
        self.assertFalse(any("--project=khedmah-preview-v2-20261012" in arg for c in commands for arg in c))


if __name__=="__main__":unittest.main()
