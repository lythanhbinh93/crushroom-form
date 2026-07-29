# Phase 03 — Role enforcement and per-user mood board

**Depends on:** 02 · **Blocks:** 04

Two separable jobs that share every file, so they ship together: stop users
writing shared data, and give each user their own mood board.

## Where the writes are — verified 2026-07-29

Ten call sites, five files. This list is the phase's checklist.

| File:line | Call | After |
|---|---|---|
| `brand_detail.py:61` | `set_traffic` | admin |
| `brand_detail.py:67` | `rescore_now` | admin |
| `brand_detail.py:80` | `set_star` | admin |
| `brand_detail.py:84` | `set_notes` | admin |
| `data_health.py:50` | `restore_brand` | admin |
| `data_health.py:65` | `reimport_sheet` | admin |
| `design_finder.py:318` | `exclude_brand` | admin |
| `ranked_board.py:74` | `promote_brand` | admin |
| `brand_card.py:63` | `set_star` | admin |
| `brand_card.py:68` | `exclude_brand` | admin |

Everything in `design_state` — `set_favorite`, `set_mood`, `set_workflow` and
the design note — stays available to both roles and becomes per-user.

## Enforcement, in the right place

**Hiding the button is not the check.** Streamlit has no client-side API, so an
unrendered widget is genuinely unreachable — but a session that was an admin
when the page rendered, a role changed a moment ago, or any future entry point
all defeat it. So:

1. `data_access` admin functions raise `PermissionError` unless the current
   session's role is admin. That is the authorization.
2. The UI additionally does not render the control for a user. That is the
   user experience.

Both, not either. The check reads the role from `session_state` populated by
`require_auth()` in phase 02 — never from a widget, a query param, or a cookie
claim.

The Data health tab disappears from `design_system.SLUG_VIEW` / `top_nav` for
users, **and** `data_health.render()` refuses to run for a non-admin, so a
hand-typed `?view=health` gets nothing.

## Ownership

`design_state`'s primary key became `(domain, handle, owner)` in phase 01.
Every read and write of that table now carries the current username:

- `get_design_state`, `_set_design_state`, `set_favorite`, `set_mood`,
  `set_workflow` gain an owner argument, threaded from the session — **not**
  defaulted. A default is how one user's board silently becomes everyone's.
- `mood_board_feed()` filters to the current owner.
- `design_feed()` and `new_designs_feed()` join `design_state` to show
  favourite state on cards; those joins must be owner-scoped too, or user B
  sees user A's hearts. **Check every join to `design_state`, not just the
  obvious two functions.**
- `pod_radar/db.py:upsert_design_state` takes owner as a required argument.
  It is called from the dashboard only; the harvest does not touch this table,
  and that must stay true.

## Steps

1. Thread owner through `pod_radar/db.py` and `dashboard/data_access.py`.
2. Add the role check to the ten admin functions.
3. Gate the ten call sites and the Data health nav entry.
4. Grep for every `design_state` reference and confirm each is owner-scoped.
5. Tests.

## Validation

- Two accounts favourite the same design; each sees exactly their own board,
  and neither sees the other's heart on a design-finder card.
- A user session calling each of the ten admin functions **directly** raises
  `PermissionError` — this is the acceptance criterion, and testing it through
  the UI proves the wrong thing.
- `?view=health` as a user renders nothing useful.
- Admin behaviour is unchanged from today, end to end.
- `run_weekly.py --stage score` still runs with no user context — the harvest
  must not have acquired an auth dependency through `db.py`.

## Risks

- **The `design_state` joins are the leak.** Owner-scoping the obvious writer
  functions while leaving a feed join unscoped shows user A's favourites to
  user B, and it looks like a UI quirk rather than a data-isolation failure.
  The grep in step 4 is the control.
- **`PermissionError` must not be caught by an existing broad `except`.**
  `design_finder.py` already has one around the export path; check each
  admin-op call site for a swallow that would turn a refusal into a silent
  no-op.
- A defaulted owner argument anywhere collapses all boards into one. Required
  arguments, not defaults.
