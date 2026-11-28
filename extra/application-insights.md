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

The twelve names their snippet proxies, taken from the list inside
`ai.3.gbl.min.js` - this is the page-facing set, and `trackException` is
the one their minifier had turned into a constant:

```
getCookieMgr trackEvent trackPageView trackPageViewPerformance
trackException _onerror trackTrace trackMetric startTrackPage
stopTrackPage startTrackEvent stopTrackEvent
```

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

## The mutation sweep

```
node tools/mutate.mjs application-insights
```

23 mutations, 23 killed, no equivalents. One of them is their stand-down
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
