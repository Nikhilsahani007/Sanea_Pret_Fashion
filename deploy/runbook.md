# Sanéa Pret — Operations Runbook (AWS ap-south-1)

For the approved infrastructure plan (`docs/phase-19-plan.md`, D-197). Run every step for **staging first**, then production. Commands assume the AWS CLI v2 with credentials for the Sanéa Pret account and `--region ap-south-1`.

Nothing in this runbook has been run yet. Items marked **check on staging** are assumptions to confirm the first time.

## 1. Before the first stack

- An AWS account for Sanéa Pret: root user with MFA and no access keys; billing alerts on; an IAM role or user for provisioning.
- The domain, with DNS you can edit (Route 53 or your registrar).
- The alert email address and the monthly budget for each stage.
- **Check on staging:** RDS for PostgreSQL 18 is offered in ap-south-1: `aws rds describe-db-engine-versions --engine postgres --query "DBEngineVersions[?starts_with(EngineVersion,'18')].EngineVersion"`. If RDS needs a full version (for example `18.1`), pass it as `DbEngineVersion`.

## 2. Secrets (Parameter Store)

Create these as **SecureString** under `/sanea/<stage>/` before the first release. The parameter name is the variable name. Generate random values on your own machine; never paste them into chat, tickets or git.

| Parameter | Value |
|-----------|-------|
| `CSRF_SECRET` | `openssl rand -base64 48` |
| `MFA_ENCRYPTION_KEY` | `openssl rand -base64 32` (keep a copy offline: losing it locks every staff two-factor set-up) |
| `MFA_ENCRYPTION_KEY_VERSION` | `1` |
| `IP_HASH_KEY` | `openssl rand -base64 48` |
| `PAYMENT_PROVIDER` | `phonepe` (or `none` until the gateway is approved) |
| `PHONEPE_ENV` | `sandbox` on staging; `production` only after your gateway approval |
| `PHONEPE_CLIENT_ID`, `PHONEPE_CLIENT_SECRET`, `PHONEPE_CLIENT_VERSION` | From the PhonePe dashboard for that environment |
| `PHONEPE_WEBHOOK_USERNAME`, `PHONEPE_WEBHOOK_PASSWORD` | As set on the PhonePe dashboard |
| `PHONEPE_LIVE_APPROVED` | `true` on production only, after your approval (Phase 18 gate) |
| `LOG_LEVEL` | `info` |

```
aws ssm put-parameter --name /sanea/staging/CSRF_SECRET --type SecureString --value "$(openssl rand -base64 48)"
```

`NODE_ENV`, `DATABASE_URL`, the origins and `MEDIA_PUBLIC_BASE_URL` are written by `sanea-env` on the instance. The database password never leaves RDS and Secrets Manager.

## 3. Create the stack

```
aws cloudformation deploy --stack-name sanea-staging \
  --template-file deploy/cloudformation.yaml --capabilities CAPABILITY_IAM \
  --parameter-overrides Stage=staging ShopDomain=staging.<domain> \
    AdminDomain=admin-staging.<domain> AlertEmail=<you> MonthlyBudgetUsd=35 \
    InstanceType=t4g.micro
```

Then:
1. Confirm the SNS subscription email.
2. Point the shop and admin A records at the stack output `PublicIp`. Caddy obtains the TLS certificates once DNS resolves.
3. Production only: create the health-check alarm in us-east-1, where Route 53 publishes its metrics:
   ```
   aws cloudwatch put-metric-alarm --region us-east-1 --alarm-name sanea-production-health \
     --namespace AWS/Route53 --metric-name HealthCheckStatus \
     --dimensions Name=HealthCheckId,Value=<HealthCheckId output> \
     --statistic Minimum --period 60 --evaluation-periods 3 --threshold 1 \
     --comparison-operator LessThanThreshold --alarm-actions <an SNS topic in us-east-1>
   ```

## 4. Release

On a machine with Docker and push rights to ECR, from a clean checkout of the release commit:

```
TAG=$(git rev-parse --short=12 HEAD)
REG=<account>.dkr.ecr.ap-south-1.amazonaws.com
aws ecr get-login-password | docker login --username AWS --password-stdin $REG
# The instances are Graviton (arm64): build for linux/arm64.
for t in api web migrate; do
  docker buildx build --platform linux/arm64 -f deploy/Dockerfile --target $t \
    -t $REG/sanea-staging-$t:$TAG --push .
done
```

1. Take a database snapshot: `aws rds create-db-snapshot --db-instance-identifier sanea-staging --db-snapshot-identifier sanea-staging-$TAG`.
2. On the instance (Session Manager: `aws ssm start-session --target <InstanceId>`), run `sudo sanea-release <TAG>`. It refreshes `/etc/sanea/api.env`, pulls the images, runs the migrations, starts the API and Caddy, and waits for the health check.
3. Check one storefront page and the admin sign-in.

**Check on staging:** that Prisma's migration connection accepts `sslmode=require&sslcert=…&sslaccept=strict` (`MIGRATE_DATABASE_URL`), and the API `sslmode=verify-full&sslrootcert=…`, against RDS.

The first release on an empty database also needs the Owner account: `docker compose -f /opt/sanea/compose.yaml run --rm api node apps/api/src/modules/auth/create-owner.ts --email <owner>`. It prints a one-time set-up link. **Never load the demo catalogue on production.**

## 5. Rollback

- **Application:** `sudo sanea-release <previous TAG>` (it is in `/opt/sanea/current` before the release). Migrations are additive, so the previous release runs on the newer schema.
- **Data damage only:** restore the pre-release snapshot or a point in time to a new instance, check it (§6), then point the stack at it. Orders taken since the restore point are lost; export them first.

## 6. Restore test (before launch, then quarterly)

1. `aws rds restore-db-instance-to-point-in-time --source-db-instance-identifier sanea-production --target-db-instance-identifier sanea-restore-test --use-latest-restorable-time --db-subnet-group-name <stack DbSubnets> --vpc-security-group-ids <DbSecurityGroup> --no-publicly-accessible`
2. Restore the latest media recovery point from the AWS Backup vault to a new volume.
3. From the instance, run `SOURCE_DATABASE_URL=<production> RESTORED_DATABASE_URL=<restore> npm run verify:restore -- --allow-newer`, using `docker compose run --rm migrate sh -c '…'` because the migrate image has the repository and Node. The applied migrations must match, and no table may hold fewer rows than at the restore point.
4. Record the start and ready times and the result in `docs/phase-19-plan.md` §5, then delete the test instance and volume.

## 7. When an alarm fires

| Alarm | First steps |
|-------|-------------|
| Health or instance status | `docker compose -f /opt/sanea/compose.yaml ps`; the logs in CloudWatch (`/sanea/<stage>/api`); `sudo sanea-release $(cat /opt/sanea/current)` restarts the current release |
| API errors | CloudWatch Logs Insights on `/sanea/<stage>/api`: `filter level >= 50 \| sort @timestamp desc` |
| Payment problems | The event is stored (`payment_event` without `processed_at`); the order job reconciles payments stuck over 30 minutes and retries gateway refunds every minute. If it persists, check the order in the admin and PhonePe's dashboard |
| Database CPU or storage | Storage grows automatically up to 100 GB; check slow queries; raise `DbInstanceClass` through the stack |
| Budget | Cost Explorer, by service |
