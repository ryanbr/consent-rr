/// application-insights.js
// Resource replacement for the Microsoft Application Insights web SDK,
// served from js.monitor.azure.com/scripts/ and the older
// az416426.vo.msecnd.net/scripts/ - ai.3.gbl.min.js is 187KB, ai.2.min.js
// 123KB, ai.0.js 96KB, and the legacy host serves the same bytes.
// Not a cookie-consent resource: it lives outside src/ and is not built
// into dist/ by tools/build.mjs. Hand-maintained, ship as-is.
// THE NOTES ARE IN extra/application-insights.md - the snippet contract,
// every member and where it came from, and what a page keeps and loses.
// The comments below are a line each; the reasoning for them is there.
// --
// THE RULES
//   ||js.monitor.azure.com/scripts/$xhr,script,redirect=application-insights.js
//   ||az416426.vo.msecnd.net/scripts/$xhr,script,redirect=application-insights.js
// A redirect, not a scriptlet, and unlike extra/vwo.js that is the right
// way round here. Nothing is hidden, so there is no reason to run at
// document_start - this only has to exist where their SDK would have
// been. And it is a generic third-party SDK on thousands of sites: a
// scriptlet needs a domain list, a redirect keys off the vendor's own url.
// Both types, because a site can fetch a script itself.
// --
// On Chromium a redirect naming a USER resource neither injects nor
// blocks, so pair it with a plain block there:
//   ||js.monitor.azure.com/scripts/
//   ||az416426.vo.msecnd.net/scripts/
// A bare block is benign for this vendor - their snippet keeps stubbing
// and queueing, and no page is hidden - so Chromium users lose only the
// calls that return something, which is what this file is for.
// No $important: a plain block composes with an allowlist exception for a
// site that genuinely needs their SDK.
// --
// A scriptlet IS worth it per-site, and does something a redirect cannot.
// Their snippet opens with
//   let aiSdk = win[aiName] || (function(){ ...everything... })(cfg.cfg)
// so an object already on window short-circuits the whole body: no
// proxies are made, no script element is created, and their SDK is never
// even requested. What follows still runs, which is why the queue drain
// below matters - the snippet ends with queue.push(_onInit) and
// trackPageView({}).
// --
// NOTHING HERE IS ABOUT HIDING A PAGE
// Unlike VWO or Adobe Target, this SDK hides nothing and gates no render:
// it is telemetry. So a block alone breaks very little, because their
// page-side snippet already stubs the calls a page makes and queues them.
// What a block does leave broken is every call that RETURNS something -
// getCookieMgr().get(...), getTraceCtx(), context.user.id - and any page
// that loads the SDK with no snippet at all, where window.appInsights
// never exists and the first call throws. That is what this is for.
// --
// THE SHAPE IT MUST NOT TAKE
// Their takeover test, read off ai.2.min.js:
//   w[name] !== undefined
//     && ( 2 <= snippet.version && w[name].initialize
//          OR snippet.version === undefined )
//     && getAppInsights(snippet, ...)
// (the OR is theirs, written out here because a line starting with two
// pipes in this header reads as a filter rule - a test counts them)
// So an object carrying version >= 2 WITHOUT initialize makes the real SDK
// skip the page entirely - this vendor's stand-down shape. What is
// published below therefore carries both, exactly as their own snippet
// does, so an SDK that is not blocked still takes over and still works.
// --
// WHAT IT PUBLISHES, and why
//   the twelve their snippet proxies, which is the page-facing set:
//     getCookieMgr trackEvent trackPageView trackPageViewPerformance
//     trackException _onerror trackTrace trackMetric startTrackPage
//     stopTrackPage startTrackEvent stopTrackEvent
//   the rest of the instance a page can reach: trackDependencyData,
//     flush, onunloadFlush, unload, pollInternalLogs, addPlugin, getPlugin,
//     addTelemetryInitializer, addDependencyInitializer,
//     addDependencyListener, setAuthenticatedUserContext,
//     clearAuthenticatedUserContext, getTraceCtx
//   state: config, context, queue, initialize, version, sv
//   window.Microsoft.ApplicationInsights, whose 15 exports include the
//     SeverityLevel a page passes to trackTrace
// Objects are returned where theirs return one, because a page writing
// getCookieMgr().get("ai_user") breaks on undefined exactly as it would
// with no stub at all.
// --
// A blank line ends the resource, so none may appear below.
(function() {
    'use strict';
    const w = window;
    const noopfn = ( ) => { };
    // The snippet may rename the global, and their loader reads this first.
    const name = typeof w.appInsightsSDK === 'string' && w.appInsightsSDK !== ''
        ? w.appInsightsSDK
        : 'appInsights';
    const existing = w[name];
    // core is a live SDK's, getTraceCtx is one too and is also ours -
    // which is what makes a second run of this stand aside.
    if (
        existing !== null && existing !== undefined &&
        (
            existing.core !== undefined ||
            typeof existing.getTraceCtx === 'function'
        )
    ) {
        return;
    }
    // In place: their closures hold this object.
    const sdk = existing !== null && typeof existing === 'object'
        ? existing
        : {};
    const cookieMgr = {
        isEnabled: ( ) => false,
        setEnabled: noopfn,
        set: ( ) => false,
        get: ( ) => '',
        del: ( ) => false,
        purge: ( ) => false,
        unload: noopfn,
    };
    const traceCtx = {
        getName: ( ) => '',
        setName: noopfn,
        getTraceId: ( ) => '',
        setTraceId: noopfn,
        getSpanId: ( ) => '',
        setSpanId: noopfn,
        getTraceFlags: ( ) => undefined,
        setTraceFlags: noopfn,
    };
    // Their IUnloadHook carries BOTH names; onCfgChange returns one too.
    const handle = { remove: noopfn, rm: noopfn };
    Object.assign(sdk, {
        getCookieMgr: ( ) => cookieMgr,
        trackEvent: noopfn,
        trackPageView: noopfn,
        trackPageViewPerformance: noopfn,
        trackException: noopfn,
        trackTrace: noopfn,
        trackMetric: noopfn,
        trackDependencyData: noopfn,
        startTrackPage: noopfn,
        stopTrackPage: noopfn,
        startTrackEvent: noopfn,
        stopTrackEvent: noopfn,
        _onerror: noopfn,
        flush: noopfn,
        onunloadFlush: noopfn,
        unload: noopfn,
        pollInternalLogs: noopfn,
        addTelemetryInitializer: ( ) => handle,
        addDependencyInitializer: ( ) => handle,
        addDependencyListener: ( ) => handle,
        setAuthenticatedUserContext: noopfn,
        clearAuthenticatedUserContext: noopfn,
        addPlugin: noopfn,
        getPlugin: ( ) => ({
            plugin: undefined,
            setEnabled: noopfn,
            isEnabled: ( ) => false,
            remove: noopfn,
        }),
        getTraceCtx: ( ) => traceCtx,
        // Their documented manual setup ends with this call.
        loadAppInsights: ( ) => sdk,
        // The rest of AISku.ts: void is a no-op, "| null" answers null.
        setTraceCtx: noopfn,
        stopPollingInternalLogs: noopfn,
        updateCfg: noopfn,
        onCfgChange: ( ) => handle,
        addUnloadCb: noopfn,
        addHousekeepingBeforeUnload: noopfn,
        updateSnippetDefinitions: noopfn,
        emptyQueue: noopfn,
        evtNamespace: ( ) => '',
        startSpan: ( ) => null,
        getActiveSpan: ( ) => null,
        getTraceProvider: ( ) => null,
    });
    // Theirs keeps the snippet it came from, and this is it.
    if ( sdk.snippet === undefined ) { sdk.snippet = sdk; }
    // On the INSTANCE as well as the namespace, as their snippet does.
    const severity = {
        Verbose: 0,
        Information: 1,
        Warning: 2,
        Error: 3,
        Critical: 4,
    };
    if ( sdk.SeverityLevel === undefined ) { sdk.SeverityLevel = severity; }
    // Kept if the snippet has it: their key is in config.
    if ( sdk.config === undefined ) { sdk.config = {}; }
    if ( sdk.context === undefined ) {
        sdk.context = {
            user: { id: '', authenticatedId: '', accountId: '' },
            session: { id: '', getSessionId: ( ) => '' },
            device: {},
            application: { ver: '', build: '' },
            location: {},
            telemetryTrace: { traceID: '', parentID: '', name: '' },
        };
    }
    // Both, never one - see the header.
    sdk.initialize = true;
    if ( sdk.version === undefined ) { sdk.version = 2; }
    if ( sdk.sv === undefined ) { sdk.sv = ''; }
    const queue = Array.isArray(sdk.queue) ? sdk.queue : [];
    sdk.queue = queue;
    w[name] = sdk;
    // Closures the snippet pushed, each calling a method above - now a
    // no-op - and their _onInit, which answers a page waiting on it.
    let drained = 0;
    const drain = ( ) => {
        while ( drained < queue.length ) {
            const entry = queue[drained];
            drained += 1;
            if ( typeof entry !== 'function' ) { continue; }
            try { entry(); } catch ( ex ) { }
        }
    };
    const push = queue.push;
    queue.push = function(...args) {
        const count = push.apply(this, args);
        drain();
        return count;
    };
    drain();
    // Their namespace, with the constants a page passes back in.
    const ns = w.Microsoft !== null && typeof w.Microsoft === 'object'
        ? w.Microsoft
        : {};
    if ( ns.ApplicationInsights === undefined ) {
        ns.ApplicationInsights = {
            SeverityLevel: severity,
            LoggingSeverity: { CRITICAL: 1, WARNING: 2, DEBUG: 3 },
            DistributedTracingModes: { AI: 0, AI_AND_W3C: 1, W3C: 2 },
            DisabledPropertyName: 'Microsoft_ApplicationInsights_BypassAjaxInstrumentation',
            AnalyticsPluginIdentifier: 'ApplicationInsightsAnalytics',
            PropertiesPluginIdentifier: 'AppInsightsPropertiesPlugin',
            BreezeChannelIdentifier: 'AppInsightsChannelPlugin',
            DEFAULT_BREEZE_ENDPOINT: 'https://dc.services.visualstudio.com',
            Util: {},
            CoreUtils: {},
            Telemetry: {},
            RequestHeaders: {},
            // Their setup without a snippet; see the header.
            ApplicationInsights: function() { return sdk; },
        };
    }
    w.Microsoft = ns;
})();
