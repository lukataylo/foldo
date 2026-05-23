# Runbook log

Append one row for every production deploy of note, every incident
(any severity), and every operational drill (rollback, restore, comms).
The pattern of entries is itself the evidence that the runbooks work
— an empty log means we're flying blind even when we think we aren't.

For incident entries, link the post-mortem in the Notes column. For
drills, link the date in the relevant runbook section (e.g.
`DEPLOYMENT.md §5.3` for the rollback drill).

Newest entries at the top.

| Date       | Type    | Duration | Outcome | Notes                                                                                          |
|------------|---------|----------|---------|------------------------------------------------------------------------------------------------|
| 2026-05-23 | deploy  | 5 min    | success | A+ W1 ops slice merged: static `serve`, backup cron, post-deploy smoke webhook, CI gates, runbooks. |
