# extra/vwo.js

Notes for the VWO replacement - Visual Website Optimizer, by Wingify.
Every number and name here was read off real payloads and never from
documentation. Four of them, fetched 2026-11-28:

```
a=1072524  vn=2.1 x=true     157063 bytes
a=884728   vn=2.1 x=true      61059
a=725143   vn=1.5 f=1         36870   their older snippet version
a=645322   vn=1.3 f=1         39085   older still, 11 members only
a=177644   f=1 r=<random>       110   no vn at all: execution stopped
a=1216514  vn=2.2 ph=1 consent=2,2
                                76504   a consent signal in the request
a=833471   vn=2.1 x=true      62991
```

The page-hiding contract is identical in all four, the older snippet
version included: `_vis_opt_path_hides`, `hide_element_style`,
`removeLoaderAndOverlay`, `_vwo_settings_timer`, `_vwo_code.finish` and
the `vwoCode` element are in every one, so one reveal covers both snippet
versions, and the rule matches all four urls as written.

## Contents

- [What this is, and the rule](#what-this-is-and-the-rule)
- [The hide is two shapes, and one of them reached a P1 report](#the-hide-is-two-shapes-and-one-of-them-reached-a-p1-report)
- [Their second entry point, /tag/<id>.js](#their-second-entry-point-tagidjs)
- [Their own answer, and the second snippet global](#their-own-answer-and-the-second-snippet-global)
- [Why blocking it alone hides the page](#why-blocking-it-alone-hides-the-page)
- [What it publishes, and where each member came from](#what-it-publishes-and-where-each-member-came-from)
- [The flags it must never set](#the-flags-it-must-never-set)
- [How it has to be delivered](#how-it-has-to-be-delivered)
- [What a page keeps, and what it loses](#what-a-page-keeps-and-what-it-loses)
- [What it costs a page](#what-it-costs-a-page)
- [The mutation sweep](#the-mutation-sweep)
- [A tag-first account, and the two page-facing members not published](#a-tag-first-account-and-the-two-page-facing-members-not-published)
- [What actually prevents breakage](#what-actually-prevents-breakage)
- [Is the coverage complete](#is-the-coverage-complete)
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

Two more of theirs, both JavaScript and both plain blocks rather than
replacements, because the thing that requests them is what gets replaced:
`/v2/dyn?a=<id>&uuid=<id>&d=<url>&scope=vis`, 921 bytes, which only
defines `window.VWO.consentMode.vTC` and self-defaults `consentMode`
first; and `/info?a=<id>`, 477 bytes, which fills `VWO.data.accountJSInfo`
and a timestamp. Both decorate state beside this file without throwing,
because `data` is an object here and `consentMode` is one too.

The collection paths - `s.gif`, `e.gif`, `c.gif`, `h.gif`, `l.gif`,
`ee.gif` on their host and on `collect.wingify.net` - are plain blocks,
not replacements, and a test asserts the rule above does not reach them.
The worker and tag files the payload would fetch (`vanj.js`,
`edrv/va_gq-*.gz.js`, `tags.js_*`) are never asked for once this stands
in, because the thing that asks for them is what was replaced.

### The portable form, and why widening a type list is the wrong lever

Their own code fetches both entry points as script elements: `j.php` goes
through `_vwo_code.load(...)`, which builds one, and there are 52
`createElement("script")` calls across the vendor files with no XHR of
`j.php` in any of them.

That is not the whole picture, and the first version of this section said
it was. A SITE can fetch the settings itself instead of letting their
snippet build the element, and at least one does - on dailymail, `j.php`
is an XHR. A census of the vendor's files cannot show that, because the
code doing it belongs to the page. So the redirect form needs both types:

```
||dev.visualwebsiteoptimizer.com/j.php$xhr,script,redirect=vwo.js
||dev.visualwebsiteoptimizer.com/tag/*.js$xhr,script,redirect=vwo.js
```

Without `$xhr` that request is not matched at all, so the real settings
arrive and they run in full - the rule reads as protection and does
nothing, which is the same trap as a Chromium redirect to a user resource.

A type list is still the weaker lever. When the request is an XHR the
fetcher receives this file as TEXT, and whether it runs is the page's
business: it does if the page evals or injects what it fetched, which is
the usual consent-gated pattern, and it does not if the page parses it as
data. The recommended form does not depend on that luck, because it takes
the type out of the question entirely:

```
example.com##+js(vwo)
||dev.visualwebsiteoptimizer.com/j.php$important
||dev.visualwebsiteoptimizer.com/tag/*.js$important
```

The execution comes from the scriptlet and the network from a block that
names no type, so `$xhr`, `ping`, `other` and whatever they move to next
are all covered without listing any of them. This works because nothing in
this file reads `document.currentScript` or its own `src` - a test asserts
that - so it behaves identically injected. `extra/adobe-launch.js` cannot
make the same claim: it takes the property and environment id off the
element it replaced, which is context a scriptlet does not have.

The redirect form is Firefox-only and `$script`-only, and the two forms
should not be combined: an untyped `$important` block wins over the
redirect, so the resource would never be served. Use one or the other, and
the portable one if only one.

Adding `$xhr` would be valid and would do nothing here, but the general
point is worth keeping: this resource only helps if it EXECUTES. A
redirect that satisfies an XHR hands the fetcher the file as text, so
nothing runs and nothing is revealed - for such a path a block, or a
redirect to an empty resource, is the right treatment rather than a stub.
The exception is a fetcher that evals what it got, which their code does
elsewhere - 16 `eval(` and 10 `new Function` across the libraries, on the
`getSettings` and `dcdn` route - so if a settings path ever turns up being
fetched that way it gets decided on its own evidence instead of by
widening a rule.

## The hide is two shapes, and one of them reached a P1 report

`#_vis_opt_path_hides` is not always a `<style>`. Their own code branches
on it - `_vwo_style.classList.contains("_vis_hide_layer")`, in 15 of the
files collected - and the other shape is a full-screen white div:

```
<div id="_vis_opt_path_hides" class="_vis_hide_layer"
     style="z-index: 2147483647 !important; position: fixed !important;
            left: 0px !important; top: 0px !important;
            width: 100% !important; height: 100% !important;
            background: white !important; display: block !important;">
```

That is the element from AdguardFilters#217216, a P1 white page on
dominos.jp reported 2025-11-07 and closed with a cosmetic hiding rule. The
site carries the snippet with `hide_element = 'body'`, `hide_element_style
= 'opacity:0 !important'` and `settings_tolerance = 2000`, so blocking
their settings without a replacement is a white page until that timer -
which is what the reporter described, and what a hiding rule treats the
symptom of.

This file removes by id with `querySelectorAll`, so it takes both shapes
and takes them wherever they were attached - the style goes in the head,
the overlay does not have to. Two tests pin it, one built from their
element attribute for attribute, and narrowing the selector to
`style#_vis_opt_path_hides` fails both.

## Their second entry point, /tag/<id>.js

`dev.visualwebsiteoptimizer.com/tag/1039738.js` is their newer unified
tag, 180152 bytes, and it is an entry point rather than a companion: it
fetches `j.php`, the lib, `edrv` and `dcdn` itself, and it manages the
page-hiding, so blocking it on its own hides the page the same way. Hence
the second rule.

It lives on both namespaces - 223 `Wingify.*` references and 484 `VWO._` -
and it reveals through `window._vwo_style ||
document.getElementById("_vis_opt_path_hides")`, and in one place CREATES
that style itself for its text-config feature. The reveal here removes
every element with that id, so it covers both the snippet's and the tag's.

Whether this file breaks it when nothing blocked it was settled the same
way as for the library: for every member, does the tag assign it or only
call it?

```
assigns load_co _sG modules data collect consentMode v_e _   ours overwritten
calls   get   3 calls, 0 assignments      ours answers ''
        push  2 calls, 0 assignments      the array's own push
```

Which is the array shape earning its keep a second time. A test runs their
opening guard in its own shape and checks the tag is neither stood down
nor thrown.

It also carries an escape hatch worth knowing about:
`/__(vwo|wingify)_disable__/.test(window.location.search)` makes the tag
return immediately, so `?__vwo_disable__` on a url turns it off without
any filter at all.

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

## Their own answer, and the second snippet global

Two of the urls tried returned this, 110 bytes, from `j.php?a=177644&...`
and from `/lib/677629.js` - what they serve for an account whose execution
is stopped:

```
/* VWO execution stopped */
try{let code=window._vwo_code||window._wingify_code;code&&code.finish()}
catch(e){}
```

Which is the first thing this file does, from the vendor themselves, and
it named a gap: `_wingify_code` is the other snippet global, used by the
Wingify-branded install. Their tag reads `window._wingify_code ||
window._vwo_code` and their stub reads them the other way round, so the
two are interchangeable. This file checked only `_vwo_code` until that
turned up - the style-removal belt would still have unhidden such a page,
but their `finish` would never have run, so `finished()` would have lied
to a page that asked and the overlay would have stayed up. Both are read
now, and a test covers the Wingify-branded snippet on its own.

It also means `/lib/<id>.js` is a real path on their host. For a live
account it serves the library; there is nothing for a replacement to do
there, because the thing that requests it is what gets replaced.

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
  push                NOT a member - their array's own push, see below
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

## The shape it has to be, and why it is an array

This publishes an array with the members hung on it, not an object,
because that is the shape their snippet makes - `window.VWO = window.VWO
|| []` - and the shape their library is written to find. From `vanj.js`:

```
init:            i || (i = window.VWO = window.VWO || []);
                 process(c, e, i); addPushListener(c, e, i)
process:         for ( e.sort(fn); d < e.length; ) processEvent(e[d], ...)
addPushListener: var d = e.push;
                 e.push = function(a) {
                     d.apply(e, [].slice.call(arguments));
                     e[e.length-1] === a && processEvent(a, ...)
                 }
```

A plain object breaks that twice over in the case this file has to survive
- the scriptlet ran, nothing was blocked, and their library loads straight
after. `e.sort` is not a function, so their init throws `TypeError`; and
their push wrapper captures whatever `push` it finds, so an absorbing one
leaves `e[e.length-1]` never equal to what was pushed and every page call
is dropped. Both were measured before the fix, and both are tests now, one
of them using their init in its own shape.

So `push` is deliberately NOT a member here: `Array.prototype.push` is
better than anything this file could write, and with nothing to drain the
queue a page pushing to it is absorbed anyway. A queue the snippet already
filled is adopted rather than replaced, and a test pins that both entries
still reach their library, sorted with `config` first the way theirs does
it.

The stand-aside test is `typeof existing.load_co === 'function'` and not
`Array.isArray`, because theirs stays an array once it is up - and so is
this. Their settings payload assigns `load_co` 22 times across the
payloads seen; a bare queue from the snippet has it on neither shape.

This is the same class of mistake as a double-init flag, found by reading
their library rather than from a report. The census that found it is worth
repeating for any stub with a queue: for every member published, count
whether they ASSIGN it or only CALL it. Everything here is assigned by
them except `push` and `get` - 57 and 73 calls, no assignments - which is
exactly why those two are the ones that can be inherited and do harm.

Request parameters vary more than the surface does. `vn` from 1.3 to 3.1,
`f=1`, `x=true`, `ph=1`, `st=<ms>`, `r=<random>`, `consent=2,2` and no
`vn` at all have all been seen, and the 18-member surface and the six
contract markers are the same in every live one. The `consent=2,2` payload
mentions consent 30 times internally and publishes nothing new for it.

## The flags it must never set

Their payload opens with this, and it is the whole reason the member list
above is not longer:

```
if (window._VWO.sCL) { window._vwo_mt = 'dupCode'; ... return; }
...
window._VWO.sCL = true;
```

There are two. `_VWO.sCL` is the library's double-init guard, and
`window.Wingify.tagLoaded` is the tag's - it early-returns on
`window.Wingify && window.Wingify.tagLoaded`. The tag sets
`window.VWO.tagLoaded` as well but reads only the Wingify one. Nothing
here writes `_VWO`, `Wingify` or `tagLoaded`, and not publishing `Wingify`
at all is what keeps the tag's guard passing; their own call sites
self-default it as `window.Wingify || []`.

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

## What it costs a page

```
file on disk      7151 bytes
injected          4816 bytes
globals set       window.VWO only, as an array carrying its members
listeners         one, DOMContentLoaded on the document
observers         one, the head's own children, disconnected at that event
requests          none
```

Injected was 7945 until the comments moved. Only a `//` at column zero is
dropped by uBO, so an indented comment ships: 5616 of those 7945 bytes
were comment text inside the function, for a 166-line resource whose code
is 80 lines. The reasoning now lives in the header, which costs nothing
because uBO drops it, and in this file; what stays beside the code is a
line each where an edit could go wrong.

The trim is comments only - the code lines are byte-identical before and
after, which was checked rather than assumed, and the suite and the sweep
were re-run against it. For scale, the siblings: optimizely ships 25625
bytes with 1685 of comment, tealium 12622 with 1168, perimeterx 8971 with
533. This one carried more comment bytes than optimizely at a sixth of its
size, which is what prompted the second pass.

## The mutation sweep

```
node tools/mutate.mjs vwo
```

45 mutations, 43 killed, 2 named equivalents with their reasons in
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

## A tag-first account, and the two page-facing members not published

Account 972639 is laid out the other way round from the others, and it is
worth knowing the shape exists:

```
j.php          8968 bytes   a shim: 4 members, no _VWO.sCL, and it mentions
                            Wingify.tagLoaded - it defers to the tag
tag/972639.js  591568       45 members, the real entry point
v2/dyn            914       4 members, all published here
info              477       3 members
```

So on a newer install the tag is the primary and `j.php` is almost
nothing. Both rules already cover it. One detail in that tag settles an
earlier decision for good: it references `VWO.length`, which only makes
sense against the array this file publishes - a plain object would have
answered `undefined`.

Its unguarded calls on members this file does not publish -
`visitorNotEligible`, `config`, `isSampledOut`, `onEventReceive` - are all
inside their own safe wrapper, as `window.VWO._sG(() =>
window.VWO.config())`, so none of them can throw out of their code even
when the member is missing.

Two members are page-facing and deliberately NOT published: `optOut` and
`track`. Both are assigned by the tag and by the libraries and called
nowhere in any of the 27 vendor files collected, which is what page-facing
looks like - their own code never needs to call them. The hazard from the
`get` case applies: a page writing `window.VWO && window.VWO.optOut()`
short-circuits safely with no stub at all, and throws against this one.

They are left out because their shape cannot be read off the files with
any confidence. The tag has `window.VWO.track || {}`, so `track` is a
namespace object rather than a function, and nothing shows what is inside
it; `optOut`'s definition is a fragment in both the library and the tag.
Publishing a function where they have an object, or an empty object where
a page calls a member of it, fails exactly as a missing member does - so
it would buy nothing and claim more than is known. If a page ever reports
this, its own call names the member and the shape, and that is the
evidence to add it on.

## What actually prevents breakage

In the order that matters, which is not the order of api surface:

**1. Delivery.** On Chromium a `$redirect=` naming a user resource neither
injects nor blocks, so a list that ships only the redirect form leaves
those users with no stub at all - and whichever entry point is blocked
without one hides the page for `settings_tolerance`. Both forms have to
ship: the two redirect rules for Firefox, and `##+js(vwo)` beside a
blocking rule for Chromium. More members fix nothing if the file never
runs.

**2. The reveal.** This is what a blank page actually is: both snippet
globals (`_vwo_code` and `_wingify_code`), their `finish` so `finished()`
answers honestly, their overlay, every `#_vis_opt_path_hides` element and
not just the first, their timer, and a second pass as the document arrives
because a scriptlet runs before their snippet.

**3. Settling the queue, not absorbing it.** A page that pushes a callback
and waits for it never renders, which is the same failure as a visitor id
that never comes back. `push` wraps the array's own: it appends with it,
so their listener's capture-and-wrap still works, and then runs any
function in the entry.

```
at DOMContentLoaded and on every push after it
never before the document arrives   a page may still be parsing what the
                                    callback wants to touch
never when window._vwo_s exists     their library is up and processes the
                                    queue itself: settling here too would
                                    call a page's callback twice
once per entry, index kept          or every push replays the queue and a
                                    page's analytics double-counts
callbacks called with no arguments  theirs would hand over campaign data
                                    and there is none; one that needs it
                                    throws into a catch, which still beats
                                    never being called
```

**4. What no stub can fix.** No variation is applied, so a page renders
its control. A page whose content only exists inside a VWO variation shows
nothing, and that is the point of blocking rather than a defect.

**5. The two members left out on purpose.** `optOut` and `track` are
page-facing and unpublished because their shape is not readable from the
files. For `track` specifically, publishing `{}` would be worse than
nothing: a page writing `if (VWO.track)` would then proceed into a
namespace with no members and throw deeper in, where absence makes it
skip.

## Is the coverage complete

Audited across 25 vendor files from eight accounts - both entry points,
four library builds, the dcdn and dyn and info endpoints, and snippet
versions 1.3 to 3.1. 82 distinct `window.VWO` members appear in them:

```
13   published here
62   left out safely, by one of three tests:
        nothing calls it - state they write and nobody reads
        guarded at every call site - typeof, && or ||
        they assign it before calling it, so ours is overwritten
 7   called without one of those guards, each checked by hand:
        visitorNotEligible, isSampledOut   inside their own
                                           _sG(() => ...) wrapper
        phoenix                            window.VWO.phoenix &&
                                           window.VWO.phoenix(...)
        onVariationApplied, getVisitorProps, visitor, onEventReceive
                                           internal plumbing in the tag,
                                           assigned in module files that
                                           never load once the entry point
                                           is replaced
```

So for `window.VWO` it is complete with respect to that corpus, with the
two deliberate exceptions above: `optOut` and `track`, left out because
their shape cannot be read off the files.

Three things are outside it, and none is an oversight:

`window.Wingify` is not published at all, which is required: the tag
early-returns on `window.Wingify && window.Wingify.tagLoaded`, so
publishing the namespace risks standing their own code down for no gain.
Their own call sites self-default it as `window.Wingify || []`.

The 39 other globals their payloads write - `_vwo_acc_id`, `_vwo_cdn`,
`_vwo_mt`, `vwo_ga4_uuid`, `VWOOmni` and the rest - are state, written by
them and read by nothing in the corpus. `VWOOmni` is self-defaulting and
empty in every payload seen.

And the limit of the method: a census of their files finds what THEIR code
touches. A member only one site's own custom code calls cannot appear in
it, and no amount of reading their payloads will surface it. That is what
a field report is for, and the probe pattern in
`extra/adobe-launch-probe.js` is how to catch one if it matters.

## What is not done here

No `window.VWO` queue draining, no `_vis_opt_*` helpers, and no jQuery -
`use_existing_jquery` is in their snippet contract but nothing in the
payload makes a page need it from us.

First-party proxied installs, where a site serves VWO from its own
hostname, need a rule per site and are not covered by the rule above. The
resource itself works wherever it is injected.
