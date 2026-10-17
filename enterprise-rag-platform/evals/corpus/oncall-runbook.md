# Production On-Call Runbook

## Paging and Severity

A Sev1 page must be acknowledged within 5 minutes. If the on-call engineer has not
acknowledged within 15 minutes, the page escalates to the incident commander rotation.
Sev2 pages must be acknowledged within 30 minutes during business hours.

## Rolling Back a Deployment

To roll back a bad release run `deployctl rollback --service <name> --to previous`.
Rollbacks do not require change-advisory approval during an active incident.

```bash
deployctl rollback --service checkout-api --to previous
deployctl status --service checkout-api
```

## Database Failover

The primary PostgreSQL cluster fails over automatically to the standby in a second
availability zone. Manual failover is triggered with `dbctl failover --cluster main` and
must be announced in the incident channel.
