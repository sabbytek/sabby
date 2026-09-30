# QA toolkit

Supporting files for [`docs/QA-TEST-GUIDE.md`](../QA-TEST-GUIDE.md). Everything
here runs over HTTP against the deployed QA service — nothing needs a database,
a local checkout of the API, or any credentials beyond the logins you were given.

| File | Purpose |
| --- | --- |
| `payloads/*.json` | Request bodies for every endpoint — valid, boundary and invalid — plus query-string examples and the webhook-signing commands. Placeholders look like `<ORDER_ID>`; fill them from earlier responses. |
| `smoke.sh` | Optional one-command sanity check before a full pass: health, signup, auth, trial-plan feature gates, the full growth-plan journey (catalogue → stock → order → invoice → ledger → reports → activity trail), plane separation and session teardown. |

```bash
# smoke run (needs curl and jq)
BASE=https://<qa-host> \
MERCHANT_SLUG=<slug> MERCHANT_EMAIL=<owner email> MERCHANT_PASSWORD=<password> \
./docs/qa/smoke.sh

# pull a single payload out of a bundle
jq -c .order_create_multi_line_with_discount payloads/03-customers-orders.json
```

`smoke.sh` exits non-zero if any assertion fails, and prints the response body
for each failure so you can paste it straight into a bug report.
