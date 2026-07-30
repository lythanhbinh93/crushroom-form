# Phase 03 — In-session tabs

**Depends on:** 02

The single highest-value change: removes the page load, the session-restore
round trip and the `_load_user()` connection from every tab click at once.

## Files

`dashboard/components/design_system.py` (`top_nav`), `dashboard/app.py`
(routing), `tests/test_nav_routing.py` (new).

## Steps

### 1. Tabs stop being anchors

`top_nav` currently renders `<a class="pr-tab" href="?view={slug}" target="_self">`
inside one `st.markdown`. Each click is therefore a document load.

Replace with controls that set `st.query_params["view"]` and rerun in-session.
The URL must still update — a deep link that is pasted or bookmarked has to keep
working, and `st.query_params` assignment updates the address bar without a
navigation.

Keep the visual result identical. The nav is one styled markdown block today; a
row of `st.button`s will not match it without work. Prefer reusing the existing
`clickable_html_grid` component pattern — it already renders arbitrary HTML in
an iframe and reports clicks back over the websocket, which is exactly this
problem, and it means the CSS in `design_system.inject_theme` is untouched.

### 2. Routing in `app.py`

`?view=` and `?domain=` keep their current meaning, so a cold load of either
still resolves. Only the *transition* becomes in-session.

`?refresh=1` and `?logout=1` stay anchors — both intentionally want a full
document load, and both are rare.

### 3. Widget state

Anchors reset widget state as a side effect of being a fresh document. Switching
in-session keeps `session_state`, so filters, page numbers and dialog state now
persist across a view change where they previously did not.

Walk `_clear_filters` and `_reset_page_on_change` in `design_finder.py`, and the
`page` number_input in `ranked_board.py`. Decide per case whether persistence is
an improvement or a surprise — this is the part of the phase most likely to
produce a "that's not what it used to do".

### 4. Tests

- Clicking a tab updates `st.query_params["view"]` and does not require a
  document load.
- A cold load of `?view=movers` and of `?domain=x` still routes correctly.
- An unknown `?view=` slug still falls back to Design finder.
- An admin-only view is still refused for a `user` when reached in-session —
  the role gate must not depend on the routing shape.

## Validation

- Tab click renders in under 300ms with **no document navigation** in DevTools.
- Deep links pasted cold still work.
- Driven in a real browser, not only in tests: sign in, click three tabs, open a
  brand, follow a deep link, refresh, sign out.
- Full suite green.

## Risks

- **The admin gate is currently enforced in `app.py`'s routing block.** Moving
  routing must not move it past the check. `data_access` still refuses
  independently, so this is defence in depth rather than the only barrier — but
  the nav must keep hiding admin views from a `user`.
- **Losing Back and open-in-new-tab** on the tabs. Accepted; recorded here
  because it is the one thing a user will notice as worse.
- **The restore pass still happens on cold loads** — deep links, refresh, first
  visit. Rare after this, not zero.
