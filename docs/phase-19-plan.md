# Phase 19 Plan — Infrastructure, Acceptance Testing and Launch

Status: **Infrastructure plan approved 2026-10-27 (D-197); nothing is provisioned or billed yet.** Provisioning starts when the prerequisites in §9 exist (AWS account and provisioning role, domain, alert email, budget limit). Hosting is AWS, region ap-south-1 (Mumbai) (D-196). The index gates this phase twice: **you approve this plan (and its budget) before anything is created, and you approve launch separately.** Phase 18's gate (the PhonePe sandbox run and your gateway approval) also comes before launch.

## 1. Scope (index Phase 19)

Hosting plan, provisioning, secrets management, backups and restore test, monitoring, user acceptance testing, launch checklist. Verification: the restore test succeeds; user acceptance sign-off is recorded.

## 2. What the application needs from hosting

| Need | Why |
|------|-----|
| **PostgreSQL 18** | The migrations use `uuidv7()`, which arrived in PostgreSQL 18. If Amazon RDS in ap-south-1 does not offer 18 when we provision, the choice comes back to you (§9) |
| One API instance | Stock expiry, order and refund jobs run in the API process every minute (one instance by design; two would need a job lock first) |
| A persistent folder for media | Uploaded originals and public derivatives live on disk (`MEDIA_STORAGE_DIR`); the public part is served as static files, never through the API |
| HTTPS on two hostnames | The shop and the admin are separate origins; admin cookies are `__Host-` and need https |
| Crawler routing | Link-preview bots go to `/api/v1/seo/preview` (Phase 17, D-194) |
| Outbound https | PhonePe (Phase 18); email provider (OD-19) |

## 3. Proposed architecture (launch size)

```
                   Route 53 (DNS + health check on /api/v1/health)
                                   │
            shop.<domain>, admin.<domain>  (HTTPS, Let's Encrypt via Caddy)
                                   │
        ┌──────────────── EC2 t4g.small, Amazon Linux 2023, Docker ──────────────┐
        │  web (Caddy): storefront + admin builds, /media files, bot routing    │
        │  api (Node 24): Express API, in-process jobs                          │
        │  EBS gp3 30 GB: /var/lib/sanea/media   (AWS Backup, daily)            │
        └───────────────────────────────┬───────────────────────────────────────┘
                                        │ private subnet, port 5432 from the EC2 group only
                        RDS for PostgreSQL 18, db.t4g.micro, 20 GB gp3, encrypted,
                        automated backups 14 days + point-in-time restore, deletion protection
```

| Component | Choice | Notes |
|-----------|--------|-------|
| Compute | One EC2 `t4g.small` (2 vCPU, 2 GB, Graviton) | Docker Compose with `deploy/compose.production.yaml`; images from `deploy/Dockerfile`. No SSH: Systems Manager Session Manager only. Security group: 80 and 443 in, nothing else |
| Database | RDS for PostgreSQL 18, `db.t4g.micro`, single-AZ | Private subnets, no public access, TLS required, encrypted with KMS. Multi-AZ is one switch later (about double the database cost) |
| Media | EBS gp3 30 GB on the instance | Daily AWS Backup, 35-day retention. Moving media to S3 is a later code change (`MediaStorage` is already an interface) |
| Images | Amazon ECR, `sanea-api`, `sanea-web`, `sanea-migrate` | Tagged with the git commit; lifecycle keeps the last 20 |
| Secrets | Systems Manager Parameter Store, SecureString (KMS), under `/sanea/<stage>/` | Written to `/etc/sanea/api.env` (root-only) at boot and on each release; never in git, images or logs |
| Email | Amazon SES in ap-south-1 (if you choose SES for OD-19) | Needs your domain verified (DKIM, SPF, DMARC) and SES production access |
| Logs and alarms | CloudWatch Logs (`/sanea/<stage>/api`, `/web`), 30-day retention; alarms to your email | §6 |
| Staging | Same shape, `t4g.micro` + `db.t4g.micro`, PhonePe sandbox only | Stopped when not in use; used for UAT and the Phase 18 webhook replay |

Why not containers on ECS Fargate or App Runner at launch: media on local disk needs one persistent host, and the jobs need one instance. Both change only when traffic needs more than one machine; the images stay the same.

## 4. Cost estimate (to confirm before approval)

**Estimates in US dollars per month, ap-south-1 on-demand prices as I understand them; not quoted by AWS.** Confirm them in the AWS Pricing Calculator before approving. AWS bills from India add 18% GST.

| Item | Production | Staging (always on) |
|------|-----------:|--------------------:|
| EC2 (t4g.small / t4g.micro) | 13–15 | 7–8 |
| EBS 30 GB gp3 + snapshots | 4–6 | 2–3 |
| RDS db.t4g.micro single-AZ + 20 GB + backups | 17–22 | 17–22 |
| Route 53 zone and health check | 1–2 | — |
| CloudWatch logs and alarms | 3–6 | 1–2 |
| ECR, SES, Parameter Store, data transfer at launch volume | 2–5 | 1 |
| **Total** | **≈ 40–56** | **≈ 28–36** (much less when stopped) |

Multi-AZ RDS adds about 17–22 a month. A budget alarm (§6) warns at 80% of whatever limit you set.

## 5. Backups and the restore test

| What | How | Kept |
|------|-----|------|
| Database | RDS automated backups with point-in-time restore; a manual snapshot before every release | 14 days; release snapshots 90 days |
| Media | AWS Backup of the EBS volume, daily | 35 days |
| Configuration | Parameter Store (versioned) and this repository | — |

**Restore test (index verification), before launch and then every quarter:**
1. Restore the latest automated backup to a new instance `sanea-restore-test` (and the media volume from its latest backup).
2. `SOURCE_DATABASE_URL=<production, read-only user> RESTORED_DATABASE_URL=<restore> npm run verify:restore -- --allow-newer`: the applied migrations must match and no table may have fewer rows than at the restore point.
3. Point the staging API at the restore; the health check and a staff sign-in must pass.
4. Record the times (restore start, ready) in this plan; delete the test instance.

`scripts/verify-restore.ts` was tested on 2026-10-27 against a copy of a migrated database with the demo catalogue: an exact copy passes (37 tables, 462 rows, 9 migrations); deleting one row fails with the table named. The AWS steps run after your approval.

## 6. Monitoring and alerts

| Alarm | Threshold |
|-------|-----------|
| Route 53 health check on `https://shop.<domain>/api/v1/health` | 3 failures in a row |
| EC2 status check failed; CPU > 80% for 15 minutes | — |
| RDS CPU > 80%, free storage < 20%, connections > 80% of the limit | — |
| API error logs (`level >= 50`) | > 5 in 5 minutes |
| Payment events stored but not applied (`payment event not applied`, `gateway refund not processed`) | any |
| Monthly cost | 80% of your budget |

Alerts go by email to the address you choose (SNS).

## 7. Release and rollback

**Release:** tag the commit; build the three images (`docker build -f deploy/Dockerfile --target api|web|migrate`) and push them to ECR; on the instance: take an RDS snapshot, `RELEASE=<tag> docker compose -f deploy/compose.production.yaml run --rm migrate`, then `up -d api web`; check the health endpoint and one storefront page.

**Rollback:** `RELEASE=<previous tag> docker compose … up -d api web`. Migrations are additive (expand first, contract in a later release), so the previous release runs on the newer schema. Restoring the database from the pre-release snapshot is only for data damage, and loses orders taken since.

## 8. User acceptance testing

Run on staging with the PhonePe sandbox; you (or your staff) sign each line.

| # | Who | Journey |
|---|-----|---------|
| U-1 | Shopper, phone and desktop | Browse, filter, product page, size guide, add to bag, change quantity |
| U-2 | Shopper | COD order; confirmation email; status page |
| U-3 | Shopper | PhonePe sandbox order: pay, decline, retry; status page updates by itself |
| U-4 | Owner | First sign-in and two-factor set-up; invite each role |
| U-5 | Catalogue editor | Create a product with variants and real photographs; publish |
| U-6 | Fulfilment | Confirm, pack (packing slip), dispatch with tracking, deliver |
| U-7 | Manager | Cancel a paid order; refund through PhonePe settles |
| U-8 | Owner | Store settings: shipping, COD, WhatsApp; home page content |
| U-9 | Anyone | Enquiry form and WhatsApp link reach you |

Sign-off is recorded in `DECISION-LOG.md` with the date and who signed.

## 9. Launch checklist

Nothing here is done yet unless marked.

| Item | Owner | Status |
|------|-------|--------|
| This plan approved | You | **Done (D-197)** |
| Monthly budget limit for the cost alarm | You | Open |
| AWS account for Sanéa Pret (root MFA, billing alerts) and an IAM role for provisioning | You | Open |
| Domain and its DNS moved to Route 53 (or records added) | You | Open |
| PostgreSQL 18 available on RDS ap-south-1 | Engineering, at provisioning | Unverified |
| Phase 18 gate: PhonePe sandbox run, webhook replay, your gateway approval; production keys and `PHONEPE_LIVE_APPROVED=true` set on production only | You, then engineering | Open |
| Email provider and sender domain (OD-19, B-08) | You | Open |
| Lawyer-approved privacy policy and terms (OD-12) and returns text (OD-09) published | You and your lawyer | Open |
| GST rates, HSN codes and seller GSTIN verified by your accountant (B-14) | You | Open |
| Real product photographs and data (B-06); the demo catalogue never loaded in production | You; engineering | Open |
| WhatsApp number (OD-16) | You | Open |
| Rehma Foundation content verified before it is published (OD-13) | You | Open |
| Launch mode (OD-22) | You | Open |
| Independent security review | You choose the reviewer | Open |
| Restore test (§5) recorded | Engineering | Open |
| UAT sign-off (§8) recorded | You | Open |
| Your launch approval | You | Open |

## 10. Built so far (not yet run on AWS)

| File | Purpose | Checked |
|------|---------|---------|
| `deploy/cloudformation.yaml` | The approved architecture for one stage: VPC with public and private subnets, security groups (80 and 443 in; database from the instance only; no SSH), EC2 from a launch template (IMDSv2 only, encrypted disks), a separate encrypted media volume, RDS for PostgreSQL 18 with a managed password, ECR repositories, log groups, a least-privilege instance role, AWS Backup, alarms to email, the production health check, and the monthly budget | Parsed; every reference, attribute and substitution resolves (43 resources); the first-boot script and the two commands it installs pass `bash -n`. Not validated by AWS (no account access) |
| `deploy/Dockerfile`, `.dockerignore` | The `api`, `migrate` and `web` images; `.env`, local installs and test output never enter the build | Built by the new CI job `Production images` on the next pull request (no Docker daemon here) |
| `deploy/compose.production.yaml` | The services on the instance; logs to CloudWatch; the RDS certificate mounted for TLS checks | With the release script, on staging |
| `deploy/Caddyfile` | TLS, the two apps, `/media`, `/api`, robots and sitemap at the root, bot routing to the preview endpoint | `caddy validate` in the CI job |
| `deploy/runbook.md` | Secrets, stack creation, release, rollback, the restore test and alarm responses | — |
| `scripts/verify-restore.ts` (`npm run verify:restore`) | The restore check | Tested locally (§5) |
| `.github/workflows/ci.yml` job `images` | Builds the three images, validates the Caddyfile, checks that the compose file travels in the migrate image and that no `.env` is in the API image | Runs on pull requests and `main` |
