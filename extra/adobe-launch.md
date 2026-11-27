# extra/adobe-launch.js, the notes

What the Adobe Experience Platform Tags replacement does, what it keeps
working for a page, what it refuses, and where every claim came from. The
resource is hand-maintained and ships as it is, so the notes live here
rather than in its header.

Everything below was read off a real runtime or measured. The runtime is

```
https://assets.adobedtm.com/5d4962a43b79/96fada676f0e/launch-95431b44ee81.min.js
```

1.8MB unminified-in-name-only, turbine 29.1.0, built 2026-11-17. Quoted
strings and function bodies in this document are theirs.

## Contents

- [What this is, and the rule](#what-this-is-and-the-rule)
- [Why the runtime and not the RC files](#why-the-runtime-and-not-the-rc-files)
- [What a page keeps, and what it loses](#what-a-page-keeps-and-what-it-loses)
- [And the extension's own library code](#and-the-extensions-own-library-code)
- [The hosted library files stop too](#the-hosted-library-files-stop-too)
- [What it breaks, and the check before shipping a rule](#what-it-breaks-and-the-check-before-shipping-a-rule)
- [What it publishes, and where each member came from](#what-it-publishes-and-where-each-member-came-from)
- [The census, which is how the list above was closed](#the-census-which-is-how-the-list-above-was-closed)
- [The decisions](#the-decisions)
- [What it costs per page](#what-it-costs-per-page)
- [The mutation sweep](#the-mutation-sweep)
- [What is not done here](#what-is-not-done-here)

## What this is, and the rule

Adobe's tag manager has had three names - DTM, then Launch, now Experience
Platform Tags - and one global, `_satellite`. The runtime is served from

```
||assets.adobedtm.com/*/launch-*.min.js$script,redirect=adobe-launch.js
||assets.adobedtm.com/launch-*.min.js$script,redirect=adobe-launch.js
||assets.adobedtm.com/*/satelliteLib-*.js$script,redirect=adobe-launch.js
||assets.adobedtm.com/satelliteLib-*.js$script,redirect=adobe-launch.js
||lightning.cnn.com/launch/*/launch-*.min.js$script,redirect=adobe-launch.js
```

The first is the current shape,
`assets.adobedtm.com/<property>/<environment>/launch-<build>.min.js`. The
second is the older flat one, `launch-EN<32 hex>.min.js`, still served.

The last two are the filename a property migrated from DTM keeps,
`assets.adobedtm.com/<hash>/satelliteLib-<hash>.js`, and **the name is the
only thing old about it.** One was read in full:

```
turbineVersion   29.1.0           the same as the launch- build read here
buildDate        2026-11-25       newer than it
_satellite       19 names         the same surface, name for name
track            same wording     "X" does not match any direct call identifiers.
```

So it is this replacement and not an older one. The environment id for
that shape lives in the container rather than the path - the one read says
`ENf535e47c14e34217baab978db67bcfcc` - so nothing is reported for it, and
nothing is invented.

A redirect leaves the script element carrying the url it was going to
fetch, which is the only place the property and environment hashes
survive.

## Why the runtime and not the RC files

The files that look like the thing to block are the rule components:

```
assets.adobedtm.com/<property>/<env>/<build>/RC<uuid>-source.min.js
```

Each is one custom-code action. Four from one real property: three were a
few hundred bytes of first-party code - a privacy preference call, a
third-party pixel loader, a cookie and localStorage write - and the fourth
was 413KB, a whole Web SDK bundle. They are worth stopping.

They are not worth a rule, for two reasons, both of them in their own
runtime rather than in anybody's opinion.

**Nothing but the runtime asks for them.** The chain is

```
core/src/lib/actions/customCode.js      (isExternal)
  -> ./helpers/loadCodeSequentially(url)
  -> ./helpers/getSourceByUrl(url)
  -> @adobe/reactor-load-script(url)    injects the script element
```

So a replaced runtime, which has no rules and runs no actions, asks for
none of them - whatever the property adds later, and however many there
are.

**Blocking one breaks nothing, so redirecting one buys nothing.** This is
`getSourceByUrl`, theirs, reformatted:

```
var o = {};                              // url -> registered code
var s = {};                              // in-flight loads
var c = function(e) { return s[e] || (s[e] = loadScript(e)), s[e]; };

_satellite.__registerScript = function(e, t) {
    var n;
    if (document.currentScript) n = document.currentScript.getAttribute("src");
    else { var i = new RegExp(".*" + e + ".*"); n = byRegexPattern(i).getAttribute("src"); }
    o[n] = t;
};

module.exports = function(e) {
    return o[e] ? Promise.resolve(o[e]) : new Promise(function(t) {
        c(e).then(function() { t(o[e]); }, function() { t(); });
    });
};
```

The failure handler is `function() { t(); }` - it **resolves** with
`undefined`, it does not reject. And the action does

```
return settings.isExternal
    ? loadCodeSequentially(source).then(function(code) {
          return code ? (n = decorateCode(r, code), postscribe(n.code), n.promise)
                      : Promise.resolve();
      })
    : ...
```

`code ? run : resolve()`. A blocked RC file is a skipped action, and the
rest of the rule's actions still run. There is no error path to repair,
which is the opposite of the tealium case, where a block takes out the
page's own inline calls and everything after them in that script.

Two details worth keeping: `__registerScript` keys the registry by
`document.currentScript.getAttribute("src")`, the **element's src**, not
by its first argument - the argument is only a regex fallback for finding
the element. And the registry is checked before loading, so an RC file
already in the page is never fetched twice.

### And the extension's own library code

A fourth shape, and the last of their four library types to turn up
served:

```
assets.adobedtm.com/<property>/<env>/<build>/EX<id>-libraryCode_source.min.js
```

An `EX` file is an extension's library code, and unlike an `RC` component
it is not wrapped in `__registerScript` at all - it is plain script that
installs globals the extension's modules then call. The one read defines
`_trackData`, `window.TMS_getQueryParam`, `window.TMS_AdobeInit` and a
`#TMS_State` element.

Its own container names who fetches it, and which library type it is:

```
"adobe-analytics": { settings: { libraryCode: {
    type: "custom",
    source: ".../9aeb474cc2a9/EX<id>-libraryCode_source.min.js" } } }
```

`type: "custom"` is the `CUSTOM` entry of the `LIB_TYPES` enum below, so
all four of their types now have a case: `MANAGED` is the
`/extensions/EP<id>/` files, `CUSTOM` is an `EX` file like this, `REMOTE`
is an arbitrary url, and `PREINSTALLED` is the page's own copy. Only the
last is outside a replaced runtime's reach.

A second one, from another property, is the same shape with different
contents: it installs `window._uxa`, which is Contentsquare's queue, a
global `s_doPlugins`, which is the hook AppMeasurement calls on every
beacon, and `window.s_objectID` for ActivityMap. Both are `type: "custom"`
in their containers.

One caveat this shape raises and does not settle: an `EX` library installs
globals in the page's namespace, so unlike a rule component it *could* be
what page code calls. Nothing outside that container references the four
above, but the site refuses an automated fetch of its pages, so page-level
use there is unchecked rather than ruled out.

### The hosted library files stop too

Two more url shapes turn up on the same host and look like separate
things to block:

```
assets.adobedtm.com/extensions/EP<id>/AppMeasurement.min.js
assets.adobedtm.com/extensions/EP<id>/AppMeasurement_Module_ActivityMap.min.js
```

The first is stock Adobe Analytics 2.27.0, installing `AppMeasurement`,
`s_gi`, `s_c_il`, `window.s` and `s_objectID`; the second is its
ActivityMap click-tracking module. They are *managed library files*,
fetched by the Analytics extension inside the runtime, and their own
source names them:

```
adobe-analytics/src/lib/helpers/settingsHelper.js
  LIB_TYPES: { MANAGED, PREINSTALLED, REMOTE, CUSTOM }
  MANAGED_LIB_PATHS: {
      APP_MEASUREMENT:     "AppMeasurement.js",
      ACTIVITY_MAP:        "AppMeasurement_Module_ActivityMap.js",
      AUDIENCE_MANAGEMENT: "AppMeasurement_Module_AudienceManagement.js" }

extensions: { core: { hostedLibFilesBaseUrl:
      "https://assets.adobedtm.com/extensions/EP<id>/" } }
```

So a replaced runtime asks for these as well, and they need no rule of
their own - the same argument as the rule components. The tie is direct
rather than inferred: a runtime read here carries
`hostedLibFilesBaseUrl:
"https://assets.adobedtm.com/extensions/EP31dbb9c60e404ba1aa6e746d49be6f29/"`
under its `adobe-analytics` extension, which is the exact path those two
files came from - and the same `EP` id appeared for a different property,
because the id is the extension package rather than the property. The
exception is the
`PREINSTALLED` type, where the property uses an AppMeasurement the page
installed itself: that copy is embedded by the page, usually from its own
host, and nothing here touches it.

## What a page keeps, and what it loses

The page keeps a working `window._satellite`: `getVar`, `setVar`, `track`,
`pageBottom`, `cookie`, `logger`, `notify`, the three deprecated cookie
aliases, `getVisitorId`, `setDebug`, `__registerScript`, and the
`property`, `company`, `environment`, `buildInfo` and `_container`
objects. Page code and container code that calls into it proceeds instead
of meeting `undefined`.

What it loses is every rule, data element and extension: no Analytics, no
Target, no Audience Manager, no ECID, no Web SDK, no direct-call rules, no
page-bottom or DOM-ready or history-change rules, and no custom code
fetched from their CDN.

## What it breaks, and the check before shipping a rule

A tag manager is not a tracker with a fixed api: it is a general-purpose
code injector, and what a redirect removes depends on what the property
was injecting. The api stays - nothing throws - but the work stops.

From the four rule components of one real property, read in full:

- one reads the `CPRA` cookie and calls
  `allytm.extensions.privacy.processCustomerPreference(false)`, then
`allytm.CustomerPreferences.removeUnusedCookies()`
- one writes the `AllyLoginLOB` and `_dtm_cid_guid` cookies, copies a guid
  into `localStorage.CPRAGUID`, and then **dispatches a `guidSet`
CustomEvent at `document`**
- one loads a third-party tag and fires its pixel
- one is a 413KB Web SDK bundle

Two of those four are not only tracking. A page listening for `guidSet`
never hears it, and a login flow reading `AllyLoginLOB` loses a cookie
somebody meant to be functional. That is the shape of the breakage: not
the interface, which this keeps, but the side effects the container had.

**The worst case is a consent manager deployed through Launch.** The
container that was read here resolves `OptanonConsent`, so OneTrust is in
that property. If a property *injects* its banner from a Launch rule, a
redirect takes the banner with it - and AGENTS.md is explicit that a
resource which cannot store the refusal must not remove the UI that could.

**Against a block this is better or equal, and on the sample read so far
it is equal.** Blocked, `_satellite` is undefined, so an unguarded caller
throws and takes out the rest of its script; redirected, it answers. But
the page-level calls that were actually found do not need it. Of the four
sites behind the sample urls, two call `_satellite` from their own html
and both guard it:

```
nvidia       //if(typeof _satellite !== "undefined"){
             //    _satellite.pageBottom();
             //}                                     (commented out entirely)

canadapost   typeof(_satellite) !== "undefined" ? _satellite.pageBottom() : null;
```

`pageBottom` is the only member either page calls, and Adobe's own
documented snippet is guarded, which is presumably why. The other two
sites load the library from script rather than markup, and their
first-party bundles - 225KB and 96KB, both read - reference `_satellite`
not once.

So the honest position: this does not repair a breakage that was
demonstrated on these urls, the way the tealium replacement repairs an
inline `utag.view(...)` that a block takes out. What it does buy is that
the request succeeds rather than failing, that an unguarded caller - page
code, or a first-party wrapper that is not public - finds an object
instead of `undefined`, and that none of the rule components is ever
requested. A sample of four is also not a licence to assume every page
guards its calls.

### The signals a container makes, which are the real loss

The api survives a redirect; a signal the container invented does not. Two
from the corpus, both of them things a page can be waiting for:

```
ally       document.dispatchEvent(new CustomEvent("guidSet", { ... }))
           plus the AllyLoginLOB and _dtm_cid_guid cookies it writes first

another    let e = new Event("pmSegmentsUpdated");
           window.pmSegmentsUpdated = false;
           alloy("getIdentity").then(function (t) { ecid = t.identity.ECID; ... })
```

The second is the sharper case, because it sets a flag on `window` as well
as dispatching at `window`: a page can poll `window.pmSegmentsUpdated` or
listen for the event, and with the runtime replaced it gets neither.
Nothing in the resource can help - the signal is the container's, not
Adobe's, and there is no list of them.

A third shape of the same risk, from another property: not an event or a
flag but an api the container installs on `window`, with the `X = X || {}`
idiom that augments whatever the page already made.

```
window.wgLaunch = window.wgLaunch || {};
window.wgLaunch.ddEventControl = window.wgLaunch.ddEventControl || {};
    ... registerEventListener, eventListeners, processingReady ...

window.digitalData = window.digitalData || {};
    ... page.pageInfo.pageTemplate, derived from location.pathname ...
```

Page code calling `wgLaunch.ddEventControl.registerEventListener(...)` or
reading `digitalData.page.pageInfo.pageTemplate` loses it when the runtime
goes, even though the object it hangs on survives because the page made
it. That is harder to spot than a missing event, because the object is
still there and only some of its contents are gone.

Which makes the pre-flight grep worth running on a property's components
before shipping a rule for its site: `dispatchEvent`, `new CustomEvent`,
and `window.<name> =`, that last one catching the augmenting idiom as
well. What turns up is either telemetry, which is the point of replacing
the runtime, or a page surface, which is a reason to leave that site
alone.

### Body hiding, which is the one that would be a blank page

The other property read here, a satelliteLib one, runs `adobe-target-v2`
with

```
bodyHidingEnabled: true
bodyHiddenStyle:   "body {opacity: 0}"
```

Adobe Target hides the whole body until it answers, which is the worst
thing a replacement could leave behind. It does not happen here: at.js is
bundled **inside** the library being replaced, so with a stub in place the
style is never applied at all.

The case to watch is the separate pre-hiding snippet Adobe recommends
inlining in the page's own `<head>`. That one is not in this file's reach:
it hides the body itself and reveals on its own timeout, so a page
carrying it flashes blank for as long as that timeout. It is the same
shape as the Alloy pre-hiding in tealium's `utag.sync.js`, described in
`tealium.md`, and like that one it needs its own rule or scriptlet, not
this.

### Reading a consent manager is not deploying one

The worst case above needs a sharper test than "is OneTrust mentioned".
One property's components include a 251KB MetaRouter bundle, a customer
data platform, whose settings are

```
privacy: {
    consentProvider: "OneTrust",
    cookieName: "OptanonConsent",
    impliedConsent: true,
    defaultGroupsValue: true
}
```

That is MetaRouter *reading* OneTrust's state to decide what it may send.
It does not load OneTrust, and no `otSDKStub`, `cdn.cookielaw` or
`OptanonWrapper` appears anywhere in it. Replacing the runtime there
removes MetaRouter and leaves the banner, which is the right way round.

A property that injects the banner itself would carry the loader - the
stub url or the host - and that is the string to search for, not the
cookie name.

A second property shows the same thing more plainly. One of its components
is

```
"object" == typeof OneTrust &&
"function" == typeof OneTrust.OnConsentChanged &&
OneTrust.OnConsentChanged(function (e) {
    ... alloy("setConsent", { consent: [ r ] }) ...
})
```

It subscribes to OneTrust and forwards the answer to the Web SDK, gating
what may be sent. No `otSDKStub`, no `cdn.cookielaw`, no `OptanonWrapper`,
no `createElement` anywhere in it. Replacing the runtime removes the
consumer and the Web SDK it gates, and leaves the banner - the direction
every property read so far points in. It also guards every `_satellite`
access with a `typeof` check, the same way the pages do.

### The check

The container is inside the `launch-*.min.js` file, so what a property
injects can be read before a rule is written for it. Fetch the embed and
look at the `modulePath` values and the extension names in
`_satellite.container`:

```
adobe-analytics
core
```

is what one of the properties read here carries - analytics and custom
code, and nothing else, so a redirect there loses tracking and nothing
more. The other carries

```
adobe-analytics
adobe-target-v2
common-analytics-plugins
core
youtube-playback
```

which is a property where the answer is not automatic: Target can
personalise or redirect a page, and losing it changes what a visitor sees
rather than only what is measured. A property carrying something that is
not measurement needs the rule written per site, or not at all - and the
corpus holds four such extensions rather than hypothetical ones:
`adobe-target-v2`, which personalises or redirects a page;
`qualtrics-website-feedback` and `medallia-for-adobe-launch`, which put a
survey in front of a visitor; `branch-mobile-growth`, which handles deep
links into an app; and `adobegoogledatalayer`, which bridges a data layer
the page may read itself. Searching its `RC<uuid>-source.min.js` files for
`dispatchEvent`, `document.cookie`, `localStorage` and third-party script
loaders finds the rest in minutes.

## What it publishes, and where each member came from

Their public API is assembled in one block in the runtime, and this is the
list it assigns - which is why this resource publishes these and not a
guess:

```
n.track, n.getVisitorId, n.property, n.company, n.buildInfo,
n.environment, n.logger, n.notify, n.getVar, n.setVar, n.setCookie,
n.readCookie, n.removeCookie, n.cookie, n.pageBottom, n.setDebug,
Object.defineProperty(n, "_container", ...)
```

plus, from elsewhere in the same library, `__registerScript`,
`_onCustomCodeSuccess`, `_onCustomCodeFailure` and `_monitors`, and
`container` beside `_container`.

### `getVar`

Returns `''` for a name it does not hold. This is a deliberate divergence
and the most important line in the file: a real container calls string
methods straight on the answer. From the one read:

```
var n = _satellite.getVar("OptanonConsentVariable").toLowerCase(),
    i = _satellite.getVar("OptanonConsent").toLowerCase();
```

Theirs can answer that because data elements carry a `defaultValue`,
almost always `''`. A stub that answered `undefined` would throw a
TypeError inside the page's own code, which is worse than answering
nothing.

### `setVar`

Writes a custom var that `getVar` reads back, including the object form
`setVar({ guid: ..., cif: ... })`. Their own custom-code examples use
both.

### `track`

With no rules of any kind, theirs logs exactly

```
"<identifier>" does not match any direct call identifiers.
```

so the stub says their words rather than inventing a message. It trims the
identifier as theirs does. Theirs would throw on a non-string, because it
calls `.trim()` unguarded; this coerces instead, which is the one place
the stub is kinder than the original.

### `pageBottom`

A no-op. Theirs is bound to the page-bottom lifecycle trigger, and in the
custom-script context theirs is literally `function(){}`. With no rules,
nothing is waiting on it either way.

### `notify`

Deprecated in theirs, and still present. The level mapping is copied: 3 is
`info`, 4 is `warn`, 5 is `error`, anything else is `log`, and every call
carries their deprecation notice.

### `cookie`

`get` reads the document's own jar and decodes the value. `remove` writes
the expiry. `set` is a no-op - see the decisions below.

### `setCookie`, `readCookie`, `removeCookie`

The deprecated aliases, each printing the wording theirs prints, including
the suggested replacement call with the arguments interpolated.

### `getVisitorId`

`null`. Not a stand-in: the custom-script surface in their own runtime is
`n.getVisitorId = function() { return null; }`, and the ECID extension
replaces it with the real one when it loads.

### `_container` and `container`

`_container` is a getter that warns once, with their wording - "may change
at any time and should only be used for debugging" - and answers a
container shaped like theirs: `buildInfo`, `environment`, `property`,
`company`, `dataElements`, `rules`, `extensions`, with the collections
empty.

### `window.__satelliteLoaded`

Not on the object, and the only global besides `_satellite` that this
sets. Every runtime read does, at the point
it hydrates the satellite object:

```
if ( container && !window.__satelliteLoaded ) {
    window.__satelliteLoaded = true;
    ...
```

It is their guard against a second copy of the library initialising over
the first, so a page polling it for readiness gets the same answer it
would from theirs. It is set here for the same reason and in the same
place - after the object is published, and not at all when this stands
aside for a real runtime.

The consequence is worth stating: a real library arriving later, from a
path no rule covers, reads the flag and stands down. That is what theirs
does to any second copy, so it is faithful rather than a trick, but it
does mean this neutralises a copy it did not block.

### `_monitors`

A page or a debugger can set `window._satellite = { _monitors: [ ... ] }`
before the library loads, and theirs keeps it, because it does
`window._satellite = window._satellite || {}` and assigns onto that. This
adopts the same object and keeps whatever array is there, so a monitor
installed early is not thrown away.

### `buildInfo`

`minified: true`, the turbine version, and empty build dates. The version
is one a real runtime reports, 29.1.0. It varies: eighteen of the nineteen
read say 29.1.0 and one says 28.0.0, so this is the modal answer rather
than the only one, and a page that compares it against something exact
will not find what it expects. Nothing read so far compares it at all.

### The census, which is how the list above was closed

Every `_satellite` reference in the nineteen runtimes and the seventy-nine
rule components was counted and diffed against what this publishes. The
union is exactly the 22 members here, plus two typos in properties' own
custom code: `_satellite.geVar`, and `_satellite.looger.error(e)` inside a
`catch`, which against the real library throws a second TypeError out of
the error handler. Both are undefined against their library too, so
matching theirs means not adding them.

A cross-check that does not depend on counting references: the members a
runtime assigns directly, as `_satellite.X = ...` rather than through its
local alias, are `__registerScript`, `_onCustomCodeFailure`,
`_onCustomCodeSuccess`, `container`, `getVisitorId`, `pageBottom` and
`track`. All seven are published here.

The sub-objects were counted the same way: `cookie.get` 53 times,
`cookie.set` 20, `cookie.remove` 4, `logger.log` 14, `logger.info` 4,
`company.orgId` 6, `environment.stage` 7, `environment.id` 1,
`property.name` 4, `buildInfo.buildDate` 1. All present.

A second outlier is worth more than a mention, because it looks exactly
like a missing member. One property's container calls

```
"doi" !== _satellite.getQueryParam("pageMode") ? ... : ...
```

`getQueryParam` was a DTM member and turbine dropped it. No runtime read
here assigns `_satellite.getQueryParam` - the two apparent definitions
turn out to be AppMeasurement's own `s.Util.getQueryParam`, which hangs
off `window.s`, and the `common-analytics-plugins` plugin module of the
same name. So that call throws a TypeError against Adobe's own library too, and
matching theirs means not publishing it. Two properties carry such a call
now, and the second shows why nobody notices - it is inside a `try`:

```
try {
    e = digitalData.page.attributes.productFindingMethod ||
        _satellite.getQueryParam("view")
} catch (e) { }
```
 A container migrated from DTM can carry calls its
own runtime no longer answers.

What the census did find is a second class of api, and it is deliberately
not here: the vendor libraries the runtime bundles install their own
globals, and those go with it. Counted across the corpus -
`adobe.target.getOffers` 9, `applyOffers` 9, `getOffer` 6, `triggerView`
5, `trackEvent` 2, `registerExtension` 4, `VERSION` 4;
`Visitor.getInstance` 4; `adobeDataLayer.getState` 4, `push` 6, `version`
2; `AppMeasurement` 20; `s_gi` 5; `alloy` 57.

Every one of those calls is made by container code or by the bundled
library itself - code that no longer runs - so none of it is page-level
breakage in this corpus. The one to watch is `adobeDataLayer.getState`,
because the client data layer library is bundled in the runtime and
upgrades the page's plain `adobeDataLayer` array in place: a page that
calls `getState()` itself gets a TypeError, and the check is a grep of the
page rather than of the container.

One finding from the census went into the resource. A container's custom
code flattens its data layer into `setVar` calls and then **reassigns
`_satellite.getVar`** with a wrapper of its own. A stub that published its
members read-only would throw there, so the surface is writable and a test
pins it.

## The decisions

**`getVar` answers `''`, not `undefined`.** The evidence is above. It is a
divergence from theirs for unknown names, and it is the difference between
a page continuing and a page throwing.

**`cookie.set` writes nothing, `cookie.remove` removes.** A write is the
thing being removed - this is how their containers persist identifiers
like `_dtm_cid_guid` and `s_ecid`. A removal only ever takes something
away, so it is honoured. A read answers the page about state it already
has, over no network, so it is honoured too. The asymmetry is deliberate,
and the cost is real: a page that round-trips its own value through
`_satellite.cookie` gets nothing back. `setCookie`, the deprecated alias,
goes through the same no-op.

**Nothing about the property is invented.** `property.name`, `property.id`
and `company.orgId` are empty strings, because they live in the container
and not in the url. `environment.id` is the hash the url carries, and
`stage` is `production`, which is what a `launch-<build>.min.js` without a
`-staging` or `-development` suffix is.

**Empty strings rather than absent members**, for the same reason as
`getVar`: page code reaches through these.

**It says nothing until a page asks.** `setDebug(true)` is the only thing
that turns the logger on, matching a runtime whose logger checks a debug
flag before printing. `setDebug` does not persist the flag anywhere;
theirs writes it to storage, and a replacement that writes storage to
record its own debug state would be writing storage.

## What it costs per page

```
file on disk      11024 bytes
injected          8540 bytes
compile           0.052 ms (median of 200)
boot              0.13 ms (median of 25, in jsdom)
timers            0
listeners         0
cookie reads      0
cookie writes     0
storage calls     0
requests          0
```

Every zero is pinned by a test that wraps the accessor before any script
runs, rather than reading the result afterwards: `document.cookie` both
ways, all five methods on `Storage.prototype`, `fetch`, `sendBeacon`,
`XMLHttpRequest`, script insertion, and `addEventListener` on window and
document. The expected record is empty - unlike the other three, this one
installs no listener at all, because it has no lifecycle to run.

## The mutation sweep

`tools/mutations/adobe-launch.json`, run by `npm run mutate --
adobe-launch`:

```
68 mutations: 66 killed, 2 expected survivors
```

Four of the first pass's six survivors were worth the sweep on their own.
One was not a weak test but a defect: the legacy flat-embed branch parsed
a build id that nothing publishes, so it was dead code shipping to every
user, and it was deleted rather than tested. The other three were real
gaps - a cookie name matched as a prefix rather than exactly, which a
property writing both `CPRA` and `CPRAGUID` would get wrong; a throwing
`__satelliteLoadedCallback` reaching the page as an uncaught error; and a
stub that locks `window._satellite` so the real library could never take
over. The two that remain cannot be killed, and the file names why, with
the paired mutation that kills the second one when both of its guards go
at once.

## What is not done here

**The corpus, and what it still cannot say.** Nineteen runtimes were read
in full, seventy-nine rule components and two extension libraryCode files,
across twenty-seven properties - twenty-three identified by the hash in their
path, plus four flat `launch-EN<id>.min.js` embeds whose url carries no property
at all - and four of the pages that embed them. The counts are derived
from the files rather than remembered: every rule component names its own
url inside its `__registerScript` call, so the properties can be counted
by reading them.

All nineteen runtimes carry the same `_satellite` surface, checked three
independent ways - the members each one references, the members each one
assigns directly, and their own string literals rather than minified
variable names. Eighteen are turbine 29.1.0 and one is 28.0.0, which is
better evidence than a single version would have been: the surface is the
same across two majors. tealium and perimeterx were written against dozens
of builds each, so this is still the thinnest corpus of the four, and what
it cannot tell is how a property unlike these twenty-seven behaves.

Two of those runtimes were worth reading for one line each: the sixth is
where `window.__satelliteLoaded` was found, and the eighth is where
`_satellite.getQueryParam` turned out not to be missing.

**No `s_code` or `AppMeasurement` stub.** This replaces the tag manager,
not the Analytics library it fetches - and when the runtime is replaced
that library is never fetched, so there is nothing to stub. What is not
covered is a page that embeds AppMeasurement itself, their `PREINSTALLED`
library type: those `window.s` calls would meet a blocked script rather
than this. That is a second resource, not a rule here.

**A self-hosted runtime needs its own line.** One is in the rules above. A
site can serve the whole thing from its own host, and the layout is
Adobe's mirrored exactly:

```
<host>/launch/<property>/<env>/launch-<build>.min.js
<host>/launch/<property>/<env>/<build>/RC<id>-source.min.js
<host>/launch/<property>/<env>/<build>/hostedLibFiles/EP<id>/AppMeasurement.min.js
```

The runtime read from one is turbine 29.1.0 with the same surface and
nothing unpublished, so the resource is already right for it; what is
missing is only a rule, and there is no generic one to write. The path
shape is Adobe's and the host is anybody's, so a pattern over hosts would
replace whatever else happened to use the same layout. Each site is its
own line, written against a url somebody has seen, and a test asserts no
rule here carries a wildcard in its host.

It is also where this resource matters most. Everything that deployment
fetches - the components, the Analytics library under its own
`hostedLibFiles/EP<id>/` path - is first-party as well, so nothing else
there can be reached by host without hitting the site's own scripts.
Replacing the runtime is the only clean lever.

**Nothing for a property's private additions.** Two routes were seen, both
made by code that no longer runs once the runtime is replaced, and neither
with a list to publish from. One container's scroll-depth trigger keeps
its state on `_satellite._ags055`, created by the extension that reads it -
`ags055-time-spent-and-scroll-depth-combined-event`, which is in two of
the properties read.
Another defines a helper on the object from a custom-code action with
`global: true`, the author's comment included:

```
//utility function so you don't always have to do a bunch of
//redundant typeof if statements
_satellite.safeCheck = function (obj) {
    ... _satellite.logger.warn("safeCheck error:" + e) ...
}
```

`safeCheck` is in one of nineteen runtimes. This is the boundary tealium's
notes draw around per-tenant extension members, with one addition: a
container can extend `_satellite` itself, so a member a census finds is
not necessarily Adobe's.

A property can also *read* members that something outside the runtime
wrote. One has a `javascriptVariable` data element whose path is
`"_satellite.db.currentOPrAURL"`, and another reads `_satellite._db`
defensively, falling back to `adobeDataLayer.getState()`. No runtime
assigns either, so the writer is the page or another tag - which is why
this publishes an extensible object, with a test pinning
`Object.isExtensible` and both of those names. Sealing it would break that
silently in strict mode and loudly outside it.

**Nothing for the RC files, by choice.** See above: their loader resolves
a failed one to `undefined` and the rule carries on.
