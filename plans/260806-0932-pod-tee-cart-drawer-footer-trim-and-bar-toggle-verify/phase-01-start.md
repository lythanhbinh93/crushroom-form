---
phase: 1
title: "Green the baseline"
status: completed
priority: P1
effort: "0.5h"
dependencies: []
---

# Phase 1: Green the baseline

## Overview

Restore LF line endings in the working tree so the twelve source-shape tests
stop failing, and open the working branch. Nothing in this phase touches the
drawer.

## Requirements

**Functional**
- `npm test` exits 0 before any drawer edit
- The two modified sections and two untracked files in the tree survive intact
- Working branch `feat/cart-drawer-chrome-260806` exists, based on `d54412d`

**Non-functional**
- The line-ending fix produces **zero** content diff — it is a working-tree
  normalisation, not a rewrite
- The fix is durable for the next clone, not just this one

## Architecture

`core.autocrlf=true` converts LF→CRLF on checkout and CRLF→LF on staging. The
index therefore holds LF and the disk holds CRLF, and git reports the tree
clean because it compares post-filter. Yesterday's `git reset --hard` during the
rollback re-ran that filter across every tracked file, which is when the disk
copy flipped.

Twelve tests read asset files raw and match on patterns anchored with `\n  \}\n`
— for example `tests/cart-quickview.test.js:280`:

```js
const bind = js.match(/function bindDrawerSurface\(\)[\s\S]*?\n  \}\n/);
assert.ok(bind, 'bindDrawerSurface must exist');
```

`bindDrawerSurface` is present at `assets/dopamiles-cart.js:819`. The function is
fine; the file is `\r\n  }\r\n` and the regex cannot match it.

A `.gitattributes` declaring `eol=lf` pins the checkout filter for every clone,
which is correct for a theme repo whose files are both uploaded to Shopify and
regex-asserted by the test suite.

## Related Code Files

- Create: `.gitattributes`
- Touched by normalisation only (no content change): `assets/*.js`, `assets/*.css`,
  `sections/*.liquid`, `snippets/*.liquid`, `tests/*.js`

## Implementation Steps

### Step 1 — protect the uncommitted work, on its own

The tree holds work that is not ours:

```
 M sections/dopamiles-collection-grid.liquid
 M sections/dopamiles-home-shop-grid.liquid
?? tests/new-arrival-tag-window.test.js
?? scripts/sync-new-arrival-tags.js
```

Commit them to their current branch, or stash **including untracked**:

```bash
git stash push -u -m "wip: new-arrival tag sweep (pre cart-drawer-chrome)"
```

Do this as its own step and confirm it landed before continuing. A selective
`git add` is not protection — `reset --hard` ignores the index and has already
destroyed 231 lines of this repo's work once.

### Step 2 — branch

```bash
git switch -c feat/cart-drawer-chrome-260806 sync/live-collection-header-260731
```

`d54412d` is `e57f20f` plus the live collection/header sync, so this base is a
superset of the superseded plan's base and closer to what the store actually
serves — which matters because Phase 04 pushes it to a preview theme.

### Step 3 — pin the line endings

```
# .gitattributes
* text=auto eol=lf
*.png binary
*.jpg binary
*.jpeg binary
*.gif binary
*.webp binary
*.woff binary
*.woff2 binary
```

Then renormalise the working tree:

```bash
git add --renormalize .
```

### Step 4 — verify the normalisation is inert, then commit

```bash
git status --short
git diff --cached --stat
```

**Expected: `.gitattributes` as the only entry.** The index already holds LF, so
renormalising must not change file content.

**If any tracked file shows content changes, stop.** That means the index held
CRLF somewhere and this is no longer a no-op commit. Fall back to the local-only
route instead, which cannot alter history:

```bash
git config core.autocrlf false
git rm --cached -r -q .
git reset --hard
```

Record which route was taken in § Results.

### Step 5 — confirm the tree is LF and the suite is green

```bash
file assets/dopamiles-cart.js        # must NOT say "with CRLF line terminators"
npm test
```

Baseline to beat: `tests 218, pass 206, fail 12`. Target: `fail 0`.

The twelve are all source-shape regex tests across
`tests/cart-quickview.test.js`, the shipping-protection orphan tests and the
`fn()` helper's callers — every one of them anchored on `\n  \}\n`. If some
still fail after the endings are fixed, they are real defects and belong in
their own report; do not start Phase 02 on top of them.

Commit:

```
chore(repo): pin line endings to LF so source-shape tests can match
```

## Success Criteria

- [x] Uncommitted WIP committed or stashed with `-u`, verified present afterwards
- [x] `feat/cart-drawer-chrome-260806` created off `d54412d`
- [x] `.gitattributes` committed; `git diff --cached --stat` showed no other file
- [x] `file assets/dopamiles-cart.js` reports no CRLF
- [x] `npm test` exits 0 — **210** tests, 0 failures (218 once the stash returns)
- [x] `shopify theme check` clean — 237 files, 0 offenses

## Results — DONE 2026-08-06

| Check | Result |
|---|---|
| WIP parked | `stash@{0}` — 2 modified sections, 3 untracked (`new-arrival` ribbon tag + sync script + its 8 tests) |
| Branch | `feat/cart-drawer-chrome-260806` off `sync/live-collection-header-260731` @ `d54412d` |
| Route | `.gitattributes` **plus** forced re-materialization. See correction below |
| Files in the normalisation commit | 1 — `.gitattributes` only (`f186f2b`) |
| `npm test` before, pre-stash | tests 218, pass 206, fail 12 |
| `npm test` before, post-stash | tests 210, pass 198, fail 12 |
| `npm test` after | **tests 210, pass 210, fail 0** |
| `theme check` | 237 files, 0 offenses |

**Baseline moved 218 → 210** because the stashed `tests/new-arrival-tag-window.test.js`
contributes 8 tests and `node --test` discovers it. Restore the stash and the
target becomes 218. All twelve failures were line endings; none were code.

### Correction — Step 4 had the two routes backwards

The plan treated `git add --renormalize .` as the fix and the forced
re-checkout as a fallback. It is the other way round.

`--renormalize` re-stages files through the corrected filter, so it fixes the
**index**. The index was already LF, so it staged **zero** changes — which is
exactly the "inert" signal Step 4 asked for, and it is also why it fixed
nothing. The tests read the **working tree**, which was still CRLF afterwards:

```
$ git add --renormalize .
$ git diff --cached --stat        # (empty)
$ file assets/dopamiles-cart.js
assets/dopamiles-cart.js: ... with CRLF line terminators
```

Git will not re-checkout files it considers unchanged, so the tree has to be
forced through the new filter:

```bash
git add .gitattributes && git commit    # .gitattributes must be in HEAD first
git rm --cached -r -q .                 # index only; working tree untouched
git reset --hard                        # re-materialises everything as LF
```

Both steps are needed, in that order. Diagnosis was confirmed empirically before
any git operation, rather than reasoned about:

```
has CRLF        : true
match as-is     : false
match after LF  : true
```

### Deviation from Step 1

Stashed rather than committed. The WIP is a coherent, unrelated change
(`new-arrival` tag support in two ribbon blocks, plus a script and 8 tests) but
inventing a commit message for someone else's in-flight work is not this phase's
call. `git stash push -u` is reversible and the plan sanctioned either route.

## Risk Assessment

| Risk | Mitigation |
|---|---|
| The stash is forgotten and the WIP is lost | Step 1 is a discrete step with its own verification; the stash message names the work |
| `git rm --cached -r .` in the fallback looks alarming | It only clears the index; `reset --hard` immediately restores every tracked file through the corrected filter. Untracked files are untouched — but Step 1 has already stashed them regardless |
| `.gitattributes` causes a large renormalisation commit | Step 4 checks the staged diff before committing and switches to the local-only route if it is not empty |
| Some of the twelve failures are real bugs, not endings | Step 5 says so explicitly and refuses to carry them into Phase 02 |
