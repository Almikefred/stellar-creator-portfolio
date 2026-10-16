# PostgreSQL Restore Runbook & Quarterly Drill

How to restore the database from the WAL-G backups described in
[`DATABASE_BACKUP_STRATEGY.md`](./DATABASE_BACKUP_STRATEGY.md), and the
checklist for proving it works every quarter. The automated monthly drill
CronJob is still a placeholder, so this manual drill is the real evidence.

## Before you start

- Credentials: the same `WALG_S3_PREFIX`, `AWS_*` and `PG*` variables the
  backup CronJob reads from its Kubernetes secret.
- An **empty** target: a scratch instance for drills, or a fresh volume for a
  real recovery. Never restore over the live primary's data directory.
- Tools: `wal-g` and the same PostgreSQL major version as production.

## Restore steps

1. **Pick the backup.** List what is available and note the newest full backup
   before your target time:

   ```bash
   wal-g backup-list --detail
   ```

2. **Stop PostgreSQL** on the target and clear its data directory:

   ```bash
   pg_ctl -D "$PGDATA" stop -m fast
   rm -rf "${PGDATA:?}"/*
   ```

3. **Fetch the base backup** (`LATEST` or a name from step 1):

   ```bash
   wal-g backup-fetch "$PGDATA" LATEST
   ```

4. **Configure WAL replay.** For point-in-time recovery add a target time;
   omit it to replay everything available:

   ```bash
   cat >> "$PGDATA/postgresql.auto.conf" <<'EOF'
   restore_command = 'wal-g wal-fetch %f %p'
   recovery_target_time = '2026-01-01 12:00:00+00'
   recovery_target_action = 'promote'
   EOF
   touch "$PGDATA/recovery.signal"
   ```

5. **Start PostgreSQL** and watch the log until recovery finishes and the
   server is promoted:

   ```bash
   pg_ctl -D "$PGDATA" start
   psql -c "SELECT pg_is_in_recovery();"   # expect: f
   ```

6. **Run the smoke checks** below. Only then point the app at the restored
   instance (update the `DATABASE_URL` secret and restart the deployment).

## Smoke checks

```sql
SELECT count(*) FROM "User";
SELECT count(*) FROM "CreatorProfile";
SELECT count(*) FROM "Bounty";
SELECT max("createdAt") FROM "User";   -- should be close to the recovery target
```

Then run `pnpm prisma migrate status` against the restored database; it must
report no pending or failed migrations.

## Rollback

A restore never touches the backups in S3, so a bad restore is undone by
wiping the target and repeating from step 2 with a different backup or
target time. If the app was already switched over, point `DATABASE_URL` back
at the previous instance first.

## Quarterly drill checklist

Run in the first week of each quarter against a scratch instance, and record
the result in the `AuditLog` (`action: restore_drill`) with real numbers.

- [ ] Restore `LATEST` into a scratch instance following the steps above
- [ ] Restore to a point in time from the previous day (tests WAL replay)
- [ ] All smoke checks pass and row counts look plausible against production
- [ ] `prisma migrate status` is clean
- [ ] Wall-clock time from step 1 to passing smoke checks is recorded and
      within the 4-hour RTO
- [ ] Newest restored row is within the 1-hour RPO of the target time
- [ ] Any step that failed or was unclear is fixed in this runbook
- [ ] Scratch instance and its volume are deleted afterwards
