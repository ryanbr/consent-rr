# extra/application-insights.js

Notes for the Microsoft Application Insights replacement - the Azure
Monitor web SDK. Everything here was read off real builds fetched
2026-11-28, never from documentation:

```
js.monitor.azure.com/scripts/b/ai.3.gbl.min.js   187522 bytes
js.monitor.azure.com/scripts/b/ai.3.min.js       187699
js.monitor.azure.com/scripts/b/ai.2.min.js       123063
js.monitor.azure.com/scripts/a/ai.0.js            96705   unminified v1
az416426.vo.msecnd.net/scripts/b/ai.2.min.js     123063   the older host,
                                                         the same bytes
```

## Contents

- [What this is, and the rules](#what-this-is-and-the-rules)
- [Why a block alone breaks little](#why-a-block-alone-breaks-little)
- [The shape it must not take](#the-shape-it-must-not-take)
- [What it publishes, and where each came from](#what-it-publishes-and-where-each-came-from)
- [Their snippet, and the queue](#their-snippet-and-the-queue)
- [Is the coverage complete](#is-the-coverage-complete)
- [What it costs a page](#what-it-costs-a-page)
- [The mutation sweep](#the-mutation-sweep)
- [What is not done here](#what-is-not-done-here)

## What this is, and the rules

Two hosts serve the same builds, so both need covering. A redirect, and
unlike `extra/vwo.js` that is the right way round here:

```
||js.monitor.azure.com/scripts/$xhr,script,redirect=application-insights.js
||az416426.vo.msecnd.net/scripts/$xhr,script,redirect=application-insights.js
```

Nothing here is hidden, so there is no reason to run at `document_start` -
this only has to exist where their SDK would have been. And it is a
generic third-party SDK on thousands of sites: a scriptlet needs a domain
list, a redirect keys off the vendor's own url. Both types, because a site
can fetch a script itself rather than let a snippet build an element -
`extra/vwo.md` records what that cost there.

On Chromium a redirect naming a user resource neither injects nor blocks,
so pair it with a plain block:

```
||js.monitor.azure.com/scripts/
||az416426.vo.msecnd.net/scripts/
```

A bare block is benign for this vendor - their snippet keeps stubbing and
queueing, and no page is hidden - so a Chromium user loses only the calls
that return something, which is the narrow thing this file fixes. No
`$important` on either form: a plain block composes with an allowlist
exception for a site that genuinely needs their SDK.

A scriptlet is still worth it per-site, and does something a redirect
cannot. Their snippet opens with

```
let aiSdk = win[aiName] || (function (aiConfig, aiExtensions) {
    ...everything: the object, the proxies, the script element...
})(cfg.cfg);
```

so an object already on `window` short-circuits that whole body: no
proxies are built, no script element is created, and their SDK is never
requested at all. What follows the IIFE still runs, which is why the drain
matters - the snippet's last lines are `queue.push(_onInit)` and
`trackPageView({})`.

## Why a block alone breaks little

This one hides nothing and gates no render - it is telemetry, not an
experiment framework. There is no `_vis_opt_path_hides`, no
`settings_tolerance`, nothing to reveal. And their page-side snippet
already stubs the calls a page makes, pushing each onto a queue, so a
blocked SDK usually leaves a page working.

What a block does leave broken is narrower and worth stating, because it
is the whole reason this file exists:

```
every call that RETURNS something   getCookieMgr().get("ai_user"),
                                    getTraceCtx().getTraceId(),
                                    context.user.id - the snippet
                                    proxies return undefined
a page with no snippet at all       window.appInsights never exists,
                                    so the first call throws
Microsoft.ApplicationInsights       SeverityLevel.Error, which a page
                                    passes back into trackTrace
```

## The shape it must not take

Their loader decides whether to take over a page like this, read off
`ai.2.min.js`:

```
name = window.appInsightsSDK || "appInsights"
window[name] !== undefined
  && ( 2 <= snippet.version && window[name].initialize
       OR snippet.version === undefined )
  && getAppInsights(snippet, ...)
```

So an object carrying `version >= 2` WITHOUT `initialize` makes the real
SDK skip the page entirely - this vendor's stand-down shape, the same
hazard as `__satelliteLoaded` in `extra/adobe-launch.md` and `_VWO.sCL` in
`extra/vwo.md`. What is published here carries both, exactly as their own
snippet does, so an SDK that is not blocked still takes over and still
works. A test asserts their condition against this object rather than
asserting the two fields, so it fails the way their loader would.

## What it publishes, and where each came from

Two lists, and they are not the same list. Inside `ai.3.gbl.min.js` the
SDK carries twelve names, `trackException` among them as a minified
constant:

```
SDK, ai.3.gbl.min.js:
  getCookieMgr trackEvent trackPageView trackPageViewPerformance
  trackException _onerror trackTrace trackMetric startTrackPage
  stopTrackPage startTrackEvent stopTrackEvent

their snippet, aiSupport.ts aiMethod - fifteen, and a different set:
  trackEvent trackException trackPageView trackPageViewPerformance
  addTelemetryInitializer trackTrace trackDependencyData trackMetric
  startTrackPage stopTrackPage startTrackEvent stopTrackEvent
  setAuthenticatedUserContext clearAuthenticatedUserContext flush
```

The snippet proxies `addTelemetryInitializer` and `flush`, which the SDK's
own list leaves out, and leaves out `getCookieMgr` and `_onerror`, which
it carries. What is published here is a superset of both, which is the
only safe reading of two lists that disagree.

Plus the rest of the instance a page can reach, quoted in the v2 and v3
builds: `trackDependencyData`, `flush`, `onunloadFlush`, `unload`,
`pollInternalLogs`, `addPlugin`, `getPlugin`, `addTelemetryInitializer`,
`addDependencyInitializer`, `addDependencyListener`,
`setAuthenticatedUserContext`, `clearAuthenticatedUserContext`,
`getTraceCtx`.

Where theirs return an object, this returns one, because a page writing
`getCookieMgr().get("ai_user")` breaks on `undefined` exactly as it would
with no stub at all. The cookie manager answers `isEnabled() -> false`,
`get() -> ""`, `set() -> false`; the trace context answers empty ids; the
initializers hand back a `{ remove }` handle.

`window.Microsoft.ApplicationInsights` carries the constants a page passes
back in - `SeverityLevel`, `DistributedTracingModes`,
`DisabledPropertyName`, the three plugin identifiers and the Breeze
endpoint. The v2 build exports 15 names there; the ones left as empty
objects are `Util`, `CoreUtils`, `Telemetry` and `RequestHeaders`, which
nothing observed reads from a page. An existing namespace is never
replaced, because a live SDK fills it with far more than this.

### What a re-review of this file found

Three defects, all from reading their snippet source after the resource
was written rather than before:

**`SeverityLevel` was on the namespace only.** Their snippet also puts it
on the INSTANCE - `appInsights["SeverityLevel"] = { Verbose: 0, ... }` -
and a page passes it straight back into `trackTrace`, so
`appInsights.SeverityLevel.Error` threw against this file.

**The manual setup was broken.** `new
Microsoft.ApplicationInsights.ApplicationInsights(cfg).loadAppInsights()`
is their documented way to set up without a snippet - and the page with no
snippet is half the reason this file exists. The namespace constructor
answered a no-op and `loadAppInsights` was not published at all, though it
is in all three builds.

**It would run twice over its own queue.** The stand-aside test was
`existing.core !== undefined`, which a live SDK has and this file does
not, so two matching requests on one page would run it twice and the
second drain would re-run entries the first already ran. It now also
stands aside on `getTraceCtx`, which a live SDK has and this publishes,
and which is NOT one of the fifteen their snippet proxies - so a bare
snippet is still adopted. A mutation that widens it to `trackEvent` is
killed by six tests.

## Their snippet, and the queue

Their snippet builds the object, a `queue`, and one proxy per name above;
each proxy pushes a closure that calls `sdk[name]` back. Their SDK
replaces the proxies and then drains. This does the same, in that order,
and the order is the point: draining before replacing them would have each
closure call a proxy, which pushes again, forever.

It adopts the object in place rather than publishing a new one, because
those closures hold a reference to it, and it keeps their `config` - the
instrumentation key is in there and a page may read it back. Pushes after
the takeover drain as they arrive, once each, with the index kept.

## Is the coverage complete

Blocking the host outright is what breaks sites, so the question that
matters is whether anything a page can call is missing. Checked against
their own source rather than the bundles - `AISku.ts`, the class
`js.monitor.azure.com` ships - which declares 41 public members. All 38
that are methods are published:

```
_onerror addDependencyInitializer addDependencyListener
addHousekeepingBeforeUnload addPlugin addTelemetryInitializer addUnloadCb
clearAuthenticatedUserContext emptyQueue evtNamespace flush getActiveSpan
getCookieMgr getPlugin getTraceCtx getTraceProvider loadAppInsights
onCfgChange onunloadFlush pollInternalLogs setAuthenticatedUserContext
setTraceCtx startSpan startTrackEvent startTrackPage
stopPollingInternalLogs stopTrackEvent stopTrackPage trackDependencyData
trackEvent trackException trackMetric trackPageView
trackPageViewPerformance trackTrace unload updateCfg
updateSnippetDefinitions
```

Shapes come from their signatures. A `void` return is a no-op;
`startSpan`, `getActiveSpan` and `getTraceProvider` are declared `| null`
and answer null, which a page written against them already handles;
`evtNamespace` answers a string; `onCfgChange` and the three initializers
hand back their `IUnloadHook`, which carries BOTH `remove` and `rm` - a
page calling `.rm()` threw while this published only `remove`.

Two are deliberately left out, for the reason `extra/vwo.md` gives about
`track`: their shape cannot be established, and a wrong shape fails
exactly as a missing member does. `setActiveSpan` returns an `ISpanScope`
that is not in the repo at the path its siblings are, and `getSender`
returns a `Sender` whose surface is large and which nothing page-side was
seen to call. If a page reports either, its own call names the shape.

The namespace took a second pass. v2 exports 15 names and v3 exports 13,
and they are not the same 13 - v3 drops `Util`, `CoreUtils` and
`Telemetry` and adds `EventPersistence`. Of the 16 across both, this
publishes 14. `PerfManager` and `PerfEvent` are constructors a page can
`new`, so they answer objects built from their own interfaces: `create` is
declared `IPerfEvent | null | undefined` and answers null, and the event
carries the twelve members `IPerfEvent` declares.

`EventPersistence` is the one left out of the namespace. It is an enum
whose values are not in the bundle in a readable form and whose source
file is not where its siblings are, and a wrong enum is worse than a
missing one - a page reading `EventPersistence.High` would get a number
that means something else instead of undefined it can test for.

Three properties from their snippet's own type are published too:
`cookie`, `extensions` and `isInitialized`. That last answers TRUE,
because this is the thing standing in and a page gating on it would
otherwise wait for something that is never coming.

`core` is deliberately absent, and it is the one place where being
incomplete is the point: it is how this file recognises a live SDK and a
second run of itself. A page reading `appInsights.core.logger` would throw
- nothing observed does, and the alternative is a stub that cannot tell
whether it has already run.

Also checked: `IAppInsights`, the analytics interface, has 13 members and
every one is published. The snippet's `aiMethod` list has 15 and the SDK's
internal list 12, neither a subset of the other, and what is published
covers both.

## What it costs a page

```
file on disk      11900 bytes
injected           7375 bytes
globals set       window[appInsightsSDK || "appInsights"], adopted in
                  place when their snippet made one, and
                  window.Microsoft.ApplicationInsights
listeners         none
observers         none
requests          none
```

Injected was 7439 until the comments moved into the header, which uBO
drops. Only a `//` followed by a SPACE is dropped, which is worth stating
because a bare `//` separator line is NOT - 27 of those were shipping
across the six resources in this directory before this pass, and
`extra/vwo.js` alone carried nine. They are `// --` now.

The trim is comments only; the code lines are byte-identical before and
after, which was checked rather than assumed, and the suite and the sweep
were re-run against it.

## The mutation sweep

```
node tools/mutate.mjs application-insights
```

43 mutations, 43 killed, no equivalents. One of them is their stand-down
shape and one is the drain replaying the queue.

The filters test caught something worth repeating: a line in the header
that begins with two pipes reads as a filter rule, and the pseudo-code
quoting their takeover condition started one. The rules in a header are
parsed by a test, so prose there cannot start that way.

## What is not done here

`onInit` is answered, and the first version of these notes said it was
not. Counting `onInit` in the three SDK builds gives zero, which is true
and beside the point: it lives in their SNIPPET, whose last lines are

```
if (aiSdk.queue && aiSdk.queue.length === 0) {
    aiSdk.queue.push(_onInit);
    aiSdk.trackPageView({});
}
function _onInit() { if (cfg.onInit) { cfg.onInit(aiSdk); } }
```

So a page that passed an `onInit` callback is waiting on a queue entry,
and the drain here is what answers it. A test runs those lines in their
own shape. Reading the vendor's bundles is not the same as reading their
page-side snippet, which is the same blind spot that made the `$xhr` claim
in `extra/vwo.md` wrong.

No instrumentation key handling, no `config` defaults beyond keeping
theirs, and no ETW-style plugin surface: `getPlugin` answers a disabled
handle rather than pretending a plugin is there.
