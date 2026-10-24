# Phase 19 Plan — Infrastructure, Acceptance Testing and Launch

Status: **Plan proposed; nothing provisioned.** Provisioning needs OD-18 (hosting, region, budget) and your approval of this plan; launch needs a separate approval. Date: 2026-10-24.

## 1. Proposed infrastructure (for your approval, OD-18 default: AWS ap-south-1)
| Component | Proposal | Notes |
|-----------|----------|-------|
| API | One container (Node 24) on ECS Fargate behind an Application Load Balancer, HTTPS only | One instance first: rate limits and jobs are in-process (D-047); before a second instance, move rate limits to a shared store and run jobs on one worker |
| Database | Amazon RDS PostgreSQL 18, Multi-AZ, encrypted, automated backups 14 days plus point-in-time recovery, deletion protection | Migrations run by a one-off task from the release image, after approval of each migration |
| Storefront and admin | Static builds on S3 behind CloudFront; admin on its own hostname; `/api/*` routed to the ALB so cookies stay same-site | The `__Host-` cookies need same-origin `/api` paths (D-132) |
| Media | S3 bucket for derivatives behind CloudFront (`MEDIA_PUBLIC_BASE_URL`, https), originals private | The API never serves media in production |
| Bots and SEO | CloudFront function routes crawler user agents for storefront pages to `/api/v1/seo/preview?path=…`; `/robots.txt` and `/sitemap.xml` to the API's SEO routes | D-166 |
| Secrets | AWS Secrets Manager into the task definition: `DATABASE_URL`, `CSRF_SECRET`, `MFA_ENCRYPTION_KEY`, `IP_HASH_KEY`, gateway keys (Phase 18) | Never in the image or repository |
| Email | Provider per OD-19 (for example Amazon SES with the shop's domain, SPF, DKIM, DMARC) | Log provider until then |
| Monitoring | CloudWatch logs (JSON, already redacted), alarms on 5xx rate, failed sign-in spikes, webhook signature failures, orders needing attention, database CPU and storage | security-design.md §9 |
| Edge protection | AWS WAF managed rules on CloudFront and the ALB | Rate limits remain in the API |

Cost is not estimated here; it depends on your region and traffic decisions (OD-18).

## 2. Configuration for production
`NODE_ENV=production`, https origins (enforced by config), `MEDIA_PUBLIC_BASE_URL` https, `TRUST_PROXY=1` (one ALB hop), `PAYMENT_PROVIDER=none` until Phase 18 is approved. The mock provider cannot start in production.

## 3. Backup and restore runbook
1. RDS automated backups and point-in-time recovery (14 days); a weekly logical dump (`pg_dump -Fc`, PostgreSQL 18 client) to a separate, encrypted S3 bucket with a 90-day lifecycle; order and payment records are kept for 8 years (database-design.md §5).
2. **Restore test (Phase 19 verification):** restore the latest snapshot into a new instance; run `prisma migrate status` (all applied); compare row counts of `order`, `payment`, `product`, `inventory_level`, `audit_log` with production; run the API against it in a private network and complete one COD checkout on TEST data; record the time taken and delete the instance.
3. Media: S3 versioning on the media bucket; restore by version.

**Not run here.** The build container has a PostgreSQL 18 server but only a PostgreSQL 16 `pg_dump`, which refuses: `pg_dump: error: aborting because of server version mismatch (server version: 18.4; pg_dump version: 16.15)`. The restore test must run on the real environment with matching client tools.

## 4. Deployment and rollback
- **Build:** CI (format, lint, typecheck, tokens, unit, database, build, audit, gitleaks, end-to-end) green on the release commit; one image per commit, tagged with the commit hash.
- **Release:** take a manual RDS snapshot; run new migrations (only approved ones) with `prisma migrate deploy`; deploy the API image (rolling, health check `/api/v1/health`); upload static builds to S3 with hashed assets and a short-cache `index.html`; invalidate `index.html` in CloudFront.
- **Rollback:** redeploy the previous image and previous static build (kept in S3). Migrations are additive in release one; if a migration must be undone, restore the pre-release snapshot (data written after it would be lost, so prefer a forward fix). Record each release and rollback in the decision log.

## 5. Launch checklist (each item needs evidence and, where marked, your sign-off)
| # | Item | State |
|---|------|-------|
| 1 | Phase gates 8–18 approved by you | Pending (all "evidence ready" or blocked) |
| 2 | All migrations approved before the production database exists | Pending: five migrations since Phase 7 |
| 3 | Real products, prices, stock and **photographs** (B-06); demo seed never run in production | Pending |
| 4 | Brand assets and colours (OD-01, OD-02) | Provisional |
| 5 | Landing page visual approval against the reference (B-03) | Blocked |
| 6 | Shipping fee, COD rules, returns text, launch offer (B-07) | Proposed defaults only |
| 7 | GST rates and invoices verified by an accountant (B-14) | Pending |
| 8 | Privacy policy, terms, retention by a lawyer (OD-12) | Pending |
| 9 | Rehma Foundation content verified by the Owner (OD-13) | Pending; page stays unpublished |
| 10 | Live gateway approved, sandbox tests passed, live keys configured by you (Phase 18, OD-06) | Blocked |
| 11 | Email provider and domain (OD-19) | Pending |
| 12 | Infrastructure plan approved and provisioned (OD-18) | Pending |
| 13 | Restore test passed on the real environment | Not run |
| 14 | Lighthouse and accessibility targets met (D-165) | Not measured |
| 15 | Independent security test (recommended) | Not done |
| 16 | User acceptance testing signed off by you | Not started |
| 17 | First Owner created with `npm run admin:create-owner`; staff invited with 2FA | Not done |
| 18 | Your explicit approval to launch | Not given |
