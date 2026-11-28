# extra/vwo.js

Notes for the VWO replacement - Visual Website Optimizer, by Wingify.
Every number and name here was read off real payloads and never from
documentation. Four of them, fetched 2026-11-28:

```
a=1072524  vn=2.1 x=true     157063 bytes
a=884728   vn=2.1 x=true      61059
a=725143   vn=1.5 f=1         36870   their older snippet version
a=645322   vn=1.3 f=1         39085   older still, 11 members only
a=833471   vn=2.1 x=true      62991
```

The page-hiding contract is identical in all four, the older snippet
version included: `_vis_opt_path_hides`, `hide_element_style`,
`removeLoaderAndOverlay`, `_vwo_settings_timer`, `_vwo_code.finish` and
the `vwoCode` element are in every one, so one reveal covers both snippet
versions, and the rule matches all four urls as written.

## Contents

- [What this is, and the rule](#what-this-is-and-the-rule)
- [Why blocking it alone hides the page](#why-blocking-it-alone-hides-the-page)
- [What it publishes, and where each member came from](#what-it-publishes-and-where-each-member-came-from)
- [The flag it must never set](#the-flag-it-must-never-set)
- [How it has to be delivered](#how-it-has-to-be-delivered)
- [What a page keeps, and what it loses](#what-a-page-keeps-and-what-it-loses)
- [The mutation sweep](#the-mutation-sweep)
- [What is not done here](#what-is-not-done-here)

The `vn` parameter is the snippet version and it does not change what this
file has to do. One account, 366687, asked seven ways - vn=2.1, 2.3, 2.4,
2.5, 2.6, 3.0 and 3.1 - returns the same six contract markers at the same
counts and the same 18 public members every time, and the five of those
this file leaves out are the same five in all seven. The responses differ
only by a fresh `visUuid` and a reordered campaign JSON, so their hashes
never match while their surface always does. Changing `vn` is not a way to
get a different api.

## What this is, and the rule

One endpoint carries both the campaign settings and the library:

```
||dev.visualwebsiteoptimizer.com/j.php$script,redirect=vwo.js
```

`a` is the account id, `u` the page url, `vn` the snippet version. The
response is `application/javascript` despite what a devtools pane may
label it, and it is one 157KB script: an error reporter, the tracking
endpoints, the loader for their worker and tag files, and the campaign
data.

The collection paths - `s.gif`, `e.gif`, `c.gif`, `h.gif`, `l.gif`,
`ee.gif` on their host and on `collect.wingify.net` - are plain blocks,
not replacements, and a test asserts the rule above does not reach them.
The worker and tag files the payload would fetch (`vanj.js`,
`edrv/va_gq-*.gz.js`, `tags.js_*`) are never asked for once this stands
in, because the thing that asks for them is what was replaced.

## Their other endpoint, /dcdn/settings.js

`dev.visualwebsiteoptimizer.com/dcdn/settings.js?a=<id>&settings_type=4&ts=
<stamp>&dt=desktop&cc=<country>` is a companion settings file, not a
second delivery of the library, and the rule above deliberately does not
cover it:

```
_vis_opt_path_hides      0   it hides nothing, so a block is not a blank page
_vwo_settings_timer      0
vwoCode                  0
needs _vwo_s()           2   the settings function only their library defines
needs VWO._.coreLib      1   called as coreLib.lS(tag) in a tag loop
```

The library asks for it - the url is in `window._VWO.dcdnUrl` - so once
`j.php` is replaced nothing requests it. A plain block is the right
treatment if a site serves it directly; there is nothing for a replacement
to do.

It is worth knowing how it behaves beside this file, because it guards
nothing. It opens on a bare `VWO._`, as `dtc = VWO._.dtc = VWO._.dtc || {
ctId: ctId, js: {}, tag: [] }`, so the member has to be an object and not
merely present - which it is here, and a test pins that with their own
opening lines. It then only DEFINES `dtc.js[ctId]`, and the thing that
calls it is the library, so the tag loop that would reach for
`VWO._.coreLib` never runs. Its own catch reports through `VWO.collect`,
which is a no-op here, so a throw of theirs sends no pixel.

## Why blocking it alone hides the page

Their snippet, the script element with id `vwoCode`, writes a style with
id `_vis_opt_path_hides` that hides `hide_element` - the body on a default
install - and arms `window._vwo_settings_timer` for `settings_tolerance`
milliseconds, 2000 by default. The page is invisible until the settings
answer or that timer expires.

So a block on its own is a blank page for two seconds and then a page that
renders. This replacement takes the hiding away at once, through their own
exits:

```
window._vwo_code.removeLoaderAndOverlay()   their overlay, filterTime balanced
window._vwo_code.finish()                   sets the flag finished() reports,
                                            and removes the style
every #_vis_opt_path_hides element          the belt under it
clearTimeout(window._vwo_settings_timer)    saves a stray wake-up
```

Calling theirs rather than only removing the node matters because a page
can ask `_vwo_code.finished()`, and their flag is the only honest answer
to that.

`querySelectorAll` and not `getElementById`, because a page can carry two
of those styles - their own cleanup indexes
`querySelectorAll('#_vis_opt_path_hides')` as `h[h.length>1?1:0]` for
exactly that reason, and `getElementById` only ever finds the first. A
test asserts both are gone in the single pass, before any deferred one
runs, because a page whose `readyState` is already past `loading` gets no
second pass.

Their exits run once. The reveal pass runs again as the document arrives,
and `finish` guards itself while `removeLoaderAndOverlay` does not - it
was called three times before a test pinned it to the one their own code
makes.

## What it publishes, and where each member came from

Counted across the four payloads, keeping `window.VWO` apart from
`window._VWO`. A census matching `VWO.(\w+)` alone credits the public
object with the dup-code object's members, because `_VWO.sCL` contains
`VWO.sCL` - it had to be redone that way:

```
published here, in 4 of 4 payloads
  push                the queue a page reaches for
  collect             their pixel sender - a no-op
  load_co             injects a script element - a no-op, or the
                      replacement fetches the library the rule keeps out
  nonce visUuid data appliedCampaigns
  _                   sE, domains, sD
published here, after the four-payload census
  get         3/4     asked for one key only, "visitor.id", 15 times
  init        3/4     called UNGUARDED from a OneTrustGroupsUpdated
                      listener, so a missing one throws
  event       2/4     they install it themselves when absent
  consentMode 3/4     read as consentMode.cReady
  ssMeta      4/4     their literal, { enabled: 0, noSS: 0 }
left out, guarded at every call site seen
  initVWOLib  3/4     window.VWO.initVWOLib && window.VWO.initVWOLib()
  consentState 3/4    var e = window.VWO.consentState; return e && ...
  WorkerRef   4/4     window.VWO.WorkerRef || window.Worker
  siteWideCode 1/4    their own site-wide code, which they call
  caE sTs     4/4     written by them, read by nothing observed
  dNR featureInfo     vn=1.3 only, assigned once and read by nothing
on window._VWO, which this file never creates
  sCL sCDD dcdnUrl fSeg _vis_nc_lib
```

`_.sE` is their safeExecute: their first lines wrap everything in it, so
anything of theirs arriving from a first-party proxy finds it. It is a
regular function rather than an arrow so the caller keeps its `this`,
which a test pins, and it swallows a throw the way theirs does.

`get` returning an empty string is not a shrug. Their guarded caller is
`window.VWO && window.VWO.get ? window.VWO.get("visitor.id") || "" : ""`
feeding an `if`, so empty means no visitor and their GA4 bridge skips.
Their other shape is `window.VWO && window.VWO.get("visitor.id")`, which
tests that `VWO` is there and never that `get` is - so publishing this
object without the member would turn a safe short-circuit into a
TypeError. A partial stub can be worse than no stub, which is what
`extra/adobe-launch.md` records for a visitor id that answered null.

`init` is the other one a page can reach: three of the four payloads call it
unguarded from a `OneTrustGroupsUpdated` listener with a number for the
consent state, so a site carrying their integration code calls it whether or
not this file is standing in.

`push` absorbs and runs nothing. What a page queues are their campaign and
tracking calls, which is the thing being replaced; running a page's queued
callbacks is not this file's job.

## The flag it must never set

Their payload opens with this, and it is the whole reason the member list
above is not longer:

```
if (window._VWO.sCL) { window._vwo_mt = 'dupCode'; ... return; }
...
window._VWO.sCL = true;
```

`_VWO.sCL` is their double-init guard. A stub that sets it makes a real
payload log `dupCode` and return without applying anything - so the
library stands down and leaves a stub that cannot answer in its place.
This file never writes `_VWO`, and a test asserts both `_VWO` and
`_vwo_mt` stay undefined.

That is not hypothetical. The same mistake shipped in
`extra/adobe-launch.js` with `window.__satelliteLoaded`, took a field
report to find, and the notes there had recorded the flag being set three
commits before the report came in. Censusing the vendor's own guard before
writing the stub is the cheap way round it.

## How it has to be delivered

On Firefox the `$redirect=` rule above works. On Chromium a redirect
naming a USER resource neither injects nor blocks - the request is simply
allowed and the real library runs. Measured, and recorded in
`extra/adobe-launch.md`. There it has to be a scriptlet beside a blocking
rule:

```
www.example.com##+js(vwo)
||dev.visualwebsiteoptimizer.com/j.php$script,important
```

Which is also why the reveal cannot be a single pass: a scriptlet runs at
`document_start`, where their snippet has not run, so neither `_vwo_code`
nor the style exists yet.

## What a page keeps, and what it loses

Keeps: a visible page immediately rather than after their timeout, a
`window.VWO` whose members answer, `_vwo_code.finished()` reporting the
truth, and no requests to their collection endpoints.

Loses: every experiment. No variation is applied, `VWO.data` is empty and
`appliedCampaigns` is a list of none - a page that renders differently per
variation renders its control. Anything a page queued is dropped rather
than run.

## The mutation sweep

```
node tools/mutate.mjs vwo
```

32 mutations, 30 killed, 2 named equivalents with their reasons in
`tools/mutations/vwo.json`. Three of those kills came from repairing tests
that did not test what they claimed: a timer assertion that outlived
nothing because a real tolerance is 2000ms and the suite finished first, a
two-style check that passed only because a later pass cleaned up what the
first missed, and a missing assertion that the observer is disconnected
and watches the head alone.

One test was deleted rather than defended. It asserted that clearing their
timer after their `finish` keeps a safety net when `finish` throws, and it
failed: the timer is gone either way, and the style removal already does
what `finish` would have. The comment in the resource claimed a property
the code did not have, so the claim was corrected and the mutation is
carried as an equivalent.

## What is not done here

No `window.VWO` queue draining, no `_vis_opt_*` helpers, and no jQuery -
`use_existing_jquery` is in their snippet contract but nothing in the
payload makes a page need it from us.

First-party proxied installs, where a site serves VWO from its own
hostname, need a rule per site and are not covered by the rule above. The
resource itself works wherever it is injected.
