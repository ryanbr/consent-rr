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

Two hosts serve the same builds, so both need covering. The portable form,
which works in every browser and for any request type:

```
example.com##+js(application-insights)
||js.monitor.azure.com/scripts/
||az416426.vo.msecnd.net/scripts/
```

and the redirect form, Firefox only, carrying both types because a site
can fetch a script itself rather than let a snippet build an element - see
`extra/vwo.md`, where that cost a correction:

```
||js.monitor.azure.com/scripts/$xhr,script,redirect=application-insights.js
||az416426.vo.msecnd.net/scripts/$xhr,script,redirect=application-insights.js
```

No `$important` on either: a plain block composes with an allowlist
exception for a site that genuinely needs their SDK.

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

No `onInit`. The snippet supports a config callback of that name but none
of the three builds mentions it, so there is nothing measured to copy; a
page waiting on one would still wait. It is the first thing to add if a
page turns up that needs it.

No instrumentation key handling, no `config` defaults beyond keeping
theirs, and no ETW-style plugin surface: `getPlugin` answers a disabled
handle rather than pretending a plugin is there.
