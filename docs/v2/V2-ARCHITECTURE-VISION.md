# V2 Architecture Vision

**الحالة:** Target Architecture مقترحة ومشروطة؛ لا تفوض التنفيذ.

## 1. محركات القرار

ترث V2 اتجاه Next.js/NestJS/TypeScript/PostgreSQL وREST-first وresponsive-web-first من ADRs المعتمدة، وترث قرار modular monorepo وعدم البدء بـmicroservices. تحل الرؤية فجوات Mission-070: انقسام runtime/domain، lineage مزدوجة، persistence غير إنتاجي، وعدم وجود deployment authority أو production evidence.

## 2. مقارنة V1 الحالي بـV2 المستهدف

| المجال | V1 المثبت | V2 المستهدف | فجوة/بوابة |
|---|---|---|---|
| Architecture | `apps/*` runtimes؛ `backend/modules` canonical domain غير مكتمل الدمج | modular monolith بعقود ومنافذ واضحة؛ extraction بالدليل فقط | Architecture Authority + conformance tests |
| Backend | Nest host وfoundations/operations؛ كثير من persistence داخل الذاكرة | adapters رقيقة، domain واحد، idempotent application services | parity slice قبل التوسع |
| Frontend | Next.js عربي/RTL ورحلات محدودة، بلا production UX acceptance | design system عربي أول، accessible، contract client، admin منفصل | browser acceptance + API contract |
| Database | PostgreSQL اتجاه مع `backend/migrations` رسمي و`infra/database` legacy؛ applied-state غير مثبت | lineage واحدة، ownership واضح، reversible rehearsals، audited access | DB Authority Gate |
| Security | validation/session/audit foundations وضوابط محلية | threat models، least privilege، secrets/SBOM/scanning، incident evidence | independent security gate |
| Scalability | modular baseline؛ لا دليل load/production | SLO-driven vertical/read scale ثم extraction عند thresholds | capacity model/load gate |
| Operations | build/test محلي؛ لا مسار نشر رسمي مثبت | immutable artifacts، env separation، progressive delivery، rollback/DR | operational readiness review |
| AI Readiness | AI implementation ممنوع وanalytics privacy hold | data catalog/evaluation/red-team/human control فقط؛ use cases بقرار مستقل | AI governance gate |
| Analytics | allowlisted operational events وaggregate-only direction | privacy-safe metrics layer، retention/deletion، no profiling/ranking | privacy impact assessment |
| Governance | وثائق واسعة وtraceability ناقصة؛ hosted controls غير مثبتة | decision/evidence registry، signed gates، waivers expiring | G0/G1 |
| Marketplace | مستبعد من MVP ومحجوز مستقبلاً | bounded context **محجوز** لا ينشأ إلا بعد business/legal decision | Marketplace Gate مستقل |
| Integrations | لا external integrations معتمدة | gateway/ports وسياسات egress/secrets؛ connectors بقرارات منفصلة | partner/security/data gate |

## 3. النموذج المنطقي المستهدف

```text
Arabic-first Web / Separate Admin
              |
       Versioned REST boundary
              |
 Nest executable host (transport/composition)
              |
 Application ports + policy/authority resolution
              |
 Canonical domain modules
              |
 Governed repository adapters / job ports / integration ports
              |
 PostgreSQL (one lineage) + object storage when authorized

Cross-cutting: identity | authorization | audit | privacy | observability | evidence
Reserved boundaries: Marketplace | AI use cases | partner connectors
```

### قواعد الحدود

1. `apps/backend` يملك bootstrap والنقل، ولا يكرر invariants أو ownership/lifecycle decisions.
2. canonical domain لا يستورد Nest أو frontend أو vendor SDK.
3. repository adapters لا تقرر authorization/trust؛ frontend لا يصل إلى database.
4. audit للمساءلة، logs للتشغيل، analytics للقياس المجمع؛ لا يدمج أحدها بالآخر.
5. jobs تعلن idempotency key وretry/dead-letter/owner/SLO وحدث audit قبل الاعتماد.
6. connector خارجي خلف port، مع data classification وegress allowlist وkill switch.

## 4. سلطة البيانات

### DB-01 — Golden Lineage

- المصدر الوحيد المقترح: `backend/migrations/versions/` بعد قرار applied-state.
- `infra/database/` يبقى legacy/quarantine ولا ينفذ أو يمتد.
- لا Migration قبل dictionary معتمد، ownership، privacy classification، forward/rollback pair، واختبار PostgreSQL فعلي.
- schema-per-module ليست إذناً بالتقسيم الفيزيائي؛ ملكية الكتابة منطقية وموثقة.

### تصنيف البيانات

| الفئة | أمثلة | القاعدة |
|---|---|---|
| Public | حقول ملف business المسموح بها | projection allowlist، لا نسخ private fields |
| Private | identifiers/contact/session context | purpose-bound، encrypted transport/storage، وصول أدنى |
| Restricted | credentials، verification evidence، security records | لا analytics، redaction، access evidence، retention قصير مبرر |
| Aggregate | counts/rates بعد thresholds | منع إعادة التعريف أو competitor ranking |

كل dataset يحتاج owner، purpose، lawful/approved basis، source، quality tests، retention، deletion path، consumers، وAI eligibility (الافتراضي: غير مؤهل).

## 5. Security and Trust Architecture

- threat model لكل bounded context وتغيير trust boundary.
- deny-by-default RBAC/policy resolution، وفصل platform admin عن business roles.
- sessions/tokens hashed or protected وفق العقد، rotation وrevocation وgeneric failures.
- validation عند external boundary وdomain invariants داخل المصدر canonical.
- tamper-evident audit references للعمليات الحساسة، بلا أسرار أو payloads خاصة كاملة.
- rate limits ومكافحة spam/abuse قابلة للعمل بين instances قبل Alpha.
- dependency/SBOM/secret/static/dynamic scans ضمن evidence pack؛ الاستثناء له مالك وانتهاء.

## 6. Scalability and Reliability

لا Microservices-first. تبدأ V2 modular monolith، ثم يسمح بالاستخراج فقط إذا اجتمعت: SLO breach متكرر، hotspot مقاس، ملكية بيانات واضحة، عقد versioned، runbook مستقل، وقدرة تشغيلية على tracing/incident response.

| SLO class | القياس قبل تحديد الرقم | آلية الحماية |
|---|---|---|
| Availability | رحلة health/auth/profile/inquiry | timeouts، health/readiness، progressive rollout |
| Latency | p50/p95/p99 لكل رحلة لا متوسط فقط | budget per layer، query budgets |
| Correctness | domain/audit/persistence error rate | constraints، contract/integration tests |
| Recovery | RTO/RPO وrestore success | encrypted backup وrestore drills |

القيم الرقمية تعتمد في G3 بعد workload baseline؛ يمنع اختلاق SLO لا يمكن قياسه.

## 7. AI Readiness بلا تفويض AI

AI readiness تعني inventory وquality/privacy/evaluation، لا model endpoint. أي use case مستقبلي يحتاج: purpose، data eligibility، Arabic evaluation set، bias/safety tests، explainability، human review، opt-out/deletion، cost/latency، vendor/egress review، وkill switch. يحظر automated ranking/recommendation/trust/credit/eligibility decisions ضمن هذا baseline.

## 8. Architecture Decision Gates

| Gate | دليل الدخول | دليل الخروج |
|---|---|---|
| A0 Authority | المدخلات canonical مكتملة | precedence وowners وhashes معتمدة |
| A1 Domain | context map وinvariants/conflicts | مصدر قرار واحد وcontract tests مصممة |
| A2 Data | ERD/dictionary/classification/applied-state | lineage/rollback/retention معتمدة |
| A3 Security | threat/privacy models | high risks مغلقة أو waiver تنفيذي مؤقت |
| A4 Operations | artifacts/SLO/runbooks/DR | rehearsal وrollback وrestore evidence |
| A5 Scale/Extract | metrics وcost model | قرار keep modular أو extract، بلا افتراض |

## 9. القرارات المؤجلة صراحة

لا تختار هذه الرؤية provider سحابياً، vendor AI، payment rail، marketplace model، native mobile، GraphQL، event bus، microservices، أو production topology. كل منها يحتاج ADR وbusiness/risk gate مستقلاً، ولا تستنتج الحاجة إليه من كلمة V2.
