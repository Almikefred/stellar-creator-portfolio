# Security Policy

## Supported Versions

Only the latest commit on `main` receives security patches. Older releases are
not supported.

## Reporting a Vulnerability

**Do not open a public issue.** Instead, use one of the following channels:

- **GitHub private vulnerability reporting** (preferred):
  Repository → Security → Report a vulnerability
- **Email**: security@tamgora.io (PGP key fingerprint published on keybase)

We will acknowledge your report within **48 hours** and provide a status update
within **5 business days**. We follow coordinated disclosure and ask that you
give us at least **90 days** before public disclosure.

---

## Dependency Vulnerability Triage (Snyk & Dependabot)

### Ownership

| Role             | Team / Person              | Responsibility                                    |
|------------------|----------------------------|---------------------------------------------------|
| Security lead    | @yosemite01                | Final triage decisions, escalations               |
| On-call engineer | rotating (see CODEOWNERS)  | First responder for new alerts, Monday 09:00 UTC  |

### Triage Cadence

| Trigger                         | Action                                                                     |
|---------------------------------|----------------------------------------------------------------------------|
| New Snyk alert on `main`        | On-call reviews within **1 business day**                                  |
| New Dependabot PR               | On-call reviews/merges within **3 business days**                          |
| Weekly Snyk schedule (Mon 08:30)| On-call reviews summary, files issues for unresolved findings              |

### SLA by Severity

| Severity    | Fix or accepted-risk decision within |
|-------------|--------------------------------------|
| Critical    | **3 calendar days**                  |
| High        | **7 calendar days**                  |
| Medium      | **30 calendar days**                 |
| Low         | Next sprint / best-effort            |

"Accepted risk" means a GitHub Security Advisory is marked *dismissed* with an
explicit reason (e.g. not reachable in our deployment) and a linked issue for
future review.

### Snyk Workflow

The `.github/workflows/snyk.yml` workflow runs on every push to `main`, on
every PR targeting `main`, and on a weekly schedule. It scans:

- npm/pnpm dependencies (`--severity-threshold=high`)
- Cargo (Rust) dependencies (`--severity-threshold=high`)
- Static code (SAST) with `snyk code test`

Results are uploaded to the **GitHub Security tab** as SARIF. Findings at
`high` or `critical` severity **fail the workflow step**, blocking the merge.

### Dependabot Grouping

Dependabot is configured in `.github/dependabot.yml` to open grouped PRs
once per week so the PR queue stays manageable. Groups:

| Group          | Ecosystems           | Schedule  |
|----------------|----------------------|-----------|
| `npm-patch`    | npm (patch only)     | weekly    |
| `npm-minor`    | npm (minor + patch)  | weekly    |
| `cargo`        | cargo                | weekly    |
| `github-actions`| github-actions      | weekly    |

### Runbook

1. Check the **Security tab** (GitHub → Security → Code scanning alerts) every
   Monday after the scheduled Snyk run.
2. For each new alert, read the finding, check if the vulnerable code path is
   reachable in production.
3. If reachable: open a fix PR linked to the alert; set the SLA deadline as a
   GitHub milestone.
4. If not reachable: dismiss the alert with reason "Vulnerable code is not
   reachable" and add a comment explaining the reasoning.
5. Dependabot PRs: check CI, review the changelog, merge if green. If a major
   version bump is required, open a tracking issue.
6. Update this document if the process changes.

### Never Log or Commit

- Stellar secret seeds (strings starting with `S...`)
- Database connection strings / `DATABASE_URL`
- JWT signing secrets
- Stripe / AWS secret keys
- Full PII (email, phone, address) in log lines

### Threat Model Summary

The primary assets are user funds (Stellar XLM/USDC held in escrow contracts)
and creator PII. The most likely attackers are:

- **Supply-chain attacker** injecting malicious code via a compromised npm or
  Cargo dependency → mitigated by Snyk + Dependabot with the SLAs above.
- **Authenticated insider** abusing tRPC procedures → mitigated by Zod input
  validation and row-level Prisma policies.
- **Unauthenticated web attacker** exploiting a public API endpoint → mitigated
  by deny-by-default input validation (Zod schemas reject unknown fields) and
  rate limiting.
