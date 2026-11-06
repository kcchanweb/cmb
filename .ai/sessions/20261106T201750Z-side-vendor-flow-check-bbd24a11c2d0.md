# Isolated vendor.py flow checks

Request: run commands based on vendor.py to test the flow. Side-conversation scope only; no parent-thread implementation or deployment work was resumed.

Read the current endpoints and stub controls; main API/database were healthy and migrations001/002 present. Main vendor was in500 mode with strict validation enabled. Used the exact deployed API image digest in a temporary container on localhost13002, a separate unchanged vendor.py process on localhost19002, and an owned disposable PostgreSQL database. Existing vendor configuration/counters were observed unchanged during the successful test run; no controls or resets were sent to the main vendor. No application source or project configuration was edited.

All16 checks passed: API/strict-stub readiness; source persistence and sanitized normalized vendor delivery; identical duplicate no-send; eight concurrent duplicates yielding one DB row/one vendor request; changed-content conflict409; skipped ineligible event stored/no-send; missing-field422 and malformed-JSON400;500 retained/retried with explicit recovery;429 retained/retried with explicit recovery; permanent400 rejection not blindly retried; bounded timeouts retained as uncertain and explicitly recovered; raw-source direct vendor request rejected422. Vendor observed five unique accepted events and zero duplicate accepted deliveries. Timed-out stub requests complete after30s, so completed-request counters do not immediately include them; no counters were reset.

Cleanup succeeded: stopped/removed the temporary API, removed only the owned disposable database, and stopped the isolated vendor. Main API, database, and vendor were left intact. The test runner and full report are under /private/tmp/cmb-vendor-flow-check/. The initial combined write/run invocation could not connect locally under its sandbox; running the already-written test command directly succeeded. No escalated permissions requested.

No new test results were written into docs/poc.md because the request was to run commands, not edit the main-thread document. Report: /private/tmp/cmb-vendor-flow-check/report.json.
