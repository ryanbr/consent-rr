/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    extra/application-insights.js is not a cookie-consent resource and is not
    built into dist/, so it is read from extra/ - but still through
    parseResources, so the uBO line rules that drop the header are exercised
    the way they ship.

    Every expectation about their SDK was read off real builds:
    js.monitor.azure.com/scripts/b/ai.3.gbl.min.js (187522 bytes),
    /scripts/b/ai.2.min.js (123063) and /scripts/a/ai.0.js (96705).
    See extra/application-insights.md.

*/

import { strict as assert } from 'node:assert';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { before, describe, it } from 'node:test';
import { JSDOM, VirtualConsole } from 'jsdom';
import { parseResources, settle } from './helpers.mjs';

const HERE = path.join(
    import.meta.dirname, '..', 'extra', 'application-insights.js'
);
let code = '';

before(async ( ) => {
    code = parseResources(await fs.readFile(HERE, 'utf8'))
        .get('application-insights.js');
    assert.ok(typeof code === 'string' && code.length !== 0);
});

// Their page-side snippet, reduced to the parts a replacement meets: the
// object, the queue, and proxies that push a closure calling back onto it.
const SNIPPET = `<script>
window.appInsights = (function() {
    var sdk = { initialize: true, queue: [], sv: "7", version: 2.0,
        config: { instrumentationKey: "KEY", disableFetchTracking: false } };
    function proxy(name) {
        return function() {
            var args = arguments;
            sdk.queue.push(function() { sdk[name].apply(sdk, args); });
        };
    }
    var names = [ "getCookieMgr", "trackEvent", "trackPageView",
        "trackPageViewPerformance", "trackException", "_onerror",
        "trackTrace", "trackMetric", "startTrackPage", "stopTrackPage",
        "startTrackEvent", "stopTrackEvent" ];
    for ( var i = 0; i < names.length; i++ ) { sdk[names[i]] = proxy(names[i]); }
    return sdk;
}());
</script>`;

const boot = (options = {}) => {
    const head = (options.before || '') +
        `<script>${code}</script>` + (options.after || '');
    const dom = new JSDOM(
        `<!DOCTYPE html><html><head>${head}</head>` +
        `<body>${options.body || '<p id="content">x</p>'}</body></html>`,
        {
            runScripts: 'dangerously',
            url: options.url || 'https://www.example.com/page',
            virtualConsole: new VirtualConsole(),
        }
    );
    return dom.window;
};

describe('extra/application-insights.js', ( ) => {

    it('publishes the twelve their snippet proxies', async ( ) => {
        const win = boot();
        await settle();
        for ( const name of [
            'getCookieMgr', 'trackEvent', 'trackPageView',
            'trackPageViewPerformance', 'trackException', '_onerror',
            'trackTrace', 'trackMetric', 'startTrackPage', 'stopTrackPage',
            'startTrackEvent', 'stopTrackEvent',
        ] ) {
            assert.equal(typeof win.appInsights[name], 'function', name);
        }
    });

    it('publishes the rest of the instance a page can reach', async ( ) => {
        const win = boot();
        await settle();
        for ( const name of [
            'trackDependencyData', 'flush', 'onunloadFlush', 'unload',
            'pollInternalLogs', 'addTelemetryInitializer',
            'addDependencyInitializer', 'addDependencyListener',
            'setAuthenticatedUserContext', 'clearAuthenticatedUserContext',
            'addPlugin', 'getPlugin', 'getTraceCtx',
        ] ) {
            assert.equal(typeof win.appInsights[name], 'function', name);
        }
    });

    it('answers with objects where theirs do', async ( ) => {
        // A page writing getCookieMgr().get("ai_user") breaks on undefined
        // exactly as it would with no stub at all, so the shape matters
        // more than the value.
        const win = boot();
        await settle();
        const ai = win.appInsights;
        assert.equal(ai.getCookieMgr().get('ai_user'), '');
        assert.equal(ai.getCookieMgr().isEnabled(), false);
        assert.equal(ai.getCookieMgr().set('a', 'b'), false);
        assert.equal(ai.getTraceCtx().getTraceId(), '');
        assert.equal(typeof ai.addTelemetryInitializer(( ) => {}).remove,
            'function');
        assert.equal(ai.getPlugin('x').isEnabled(), false);
        assert.equal(ai.context.user.id, '');
        assert.equal(ai.context.session.getSessionId(), '');
    });

    it('keeps the shape their loader needs to take over', async ( ) => {
        // Their test, from ai.2.min.js: w[name] !== undefined && (2 <=
        // version && w[name].initialize || version === undefined). An
        // object with version >= 2 and no initialize makes the real SDK
        // skip the page, which is this vendor's stand-down shape.
        const win = boot();
        await settle();
        const ai = win.appInsights;
        const takesOver = ai !== undefined &&
            (ai.version >= 2 && ai.initialize || ai.version === undefined);
        assert.equal(takesOver, true,
            'their own SDK would skip the page against this');
    });

    it('carries their documented setup with no snippet at all', async ( ) => {
        // new Microsoft.ApplicationInsights.ApplicationInsights(cfg)
        // .loadAppInsights() is how a page sets this up without the
        // snippet - and the page with no snippet is half the reason this
        // file exists, since window.appInsights never exists for it.
        const win = boot({
            after: '<script>window.made = new Microsoft.ApplicationInsights' +
                '.ApplicationInsights({ config: { instrumentationKey: "K" } })' +
                '.loadAppInsights();' +
                'window.made.trackEvent({ name: "x" });' +
                'window.ok = typeof window.made.getCookieMgr().get;</script>',
        });
        await settle();
        assert.equal(win.ok, 'function', 'their manual setup threw');
        assert.equal(typeof win.made.trackPageView, 'function');
    });

    it('puts SeverityLevel on the instance, where their snippet puts it',
    async ( ) => {
        // appInsights["SeverityLevel"] = { Verbose: 0, ... } in their
        // snippet, and a page passes it straight back into trackTrace.
        const win = boot({
            after: '<script>appInsights.trackTrace({ message: "x",' +
                ' severityLevel: appInsights.SeverityLevel.Error });' +
                'window.level = appInsights.SeverityLevel.Error;</script>',
        });
        await settle();
        assert.equal(win.level, 3, 'a page reading it off the instance threw');
    });

    it('stands aside on a second run of itself', async ( ) => {
        // Two matching requests on one page would run this twice, and a
        // second drain would re-run entries the first already ran.
        const win = boot({
            before: SNIPPET +
                '<script>appInsights.queue.push(function() {' +
                'window.ran = (window.ran || 0) + 1; });</script>',
            after: `<script>${code}</script>`,
        });
        await settle();
        assert.equal(win.ran, 1, 'a queued call ran twice');
    });

    it('stands aside for an SDK that already initialised', async ( ) => {
        // core is theirs: the snippet never makes one.
        const win = boot({
            before: '<script>window.appInsights = { core: { mine: true },' +
                ' trackEvent: function() { window.theirs = true; } };</script>',
        });
        await settle();
        win.appInsights.trackEvent({ name: 'x' });
        assert.equal(win.theirs, true, 'a live SDK was replaced');
        assert.equal(win.appInsights.getTraceCtx, undefined);
    });

    it('follows the global their snippet renamed', async ( ) => {
        const win = boot({
            before: '<script>window.appInsightsSDK = "myInsights";</script>',
        });
        await settle();
        assert.equal(typeof win.myInsights.trackEvent, 'function');
        assert.equal(win.appInsights, undefined, 'it published the wrong name');
    });

    it('publishes their namespace, with the levels a page passes back',
    async ( ) => {
        const win = boot();
        await settle();
        const ns = win.Microsoft.ApplicationInsights;
        assert.equal(ns.SeverityLevel.Error, 3);
        assert.equal(ns.SeverityLevel.Critical, 4);
        assert.equal(ns.DistributedTracingModes.W3C, 2);
        assert.equal(
            ns.DisabledPropertyName,
            'Microsoft_ApplicationInsights_BypassAjaxInstrumentation'
        );
    });

    it('leaves an ApplicationInsights namespace that is already there',
    async ( ) => {
        // Their own SDK fills this with 15 exports. Replacing it with the
        // handful published here would take away the rest.
        const win = boot({
            before: '<script>window.Microsoft = { ApplicationInsights: {' +
                ' SeverityLevel: { Error: 3 }, Telemetry: { mine: true },' +
                ' ApplicationInsights: function() {} } };</script>',
        });
        await settle();
        assert.equal(
            win.Microsoft.ApplicationInsights.Telemetry.mine, true,
            'a namespace that was already there got replaced'
        );
    });

    it('leaves a Microsoft namespace someone else made', async ( ) => {
        const win = boot({
            before: '<script>window.Microsoft = { Maps: { mine: true } };' +
                '</script>',
        });
        await settle();
        assert.equal(win.Microsoft.Maps.mine, true, 'it clobbered a namespace');
        assert.equal(typeof win.Microsoft.ApplicationInsights, 'object');
    });

});

describe('filters, application-insights', ( ) => {

    let rules = [];

    before(async ( ) => {
        const text = await fs.readFile(HERE, 'utf8');
        rules = text.split('\n')
            .map(line => line.replace(/^\/\/\s*/, '').trim())
            .filter(line => line.startsWith('||'));
    });

    it('leads with the redirect, for both types', ( ) => {
        // A redirect and not a scriptlet: nothing here is hidden, so there
        // is no document_start requirement, and a generic third-party SDK
        // on thousands of sites cannot be reached by a domain list.
        const redirects = rules.filter(rule => rule.includes('redirect='));
        assert.equal(redirects.length, 2);
        assert.ok(rules.indexOf(redirects[0]) === 0, 'the redirect moved down');
        for ( const rule of redirects ) {
            assert.ok(
                rule.endsWith('$xhr,script,redirect=application-insights.js'),
                rule
            );
        }
    });

    it('offers a plain block for Chromium, with no option at all', ( ) => {
        const blocks = rules.filter(rule => rule.includes('$') === false);
        assert.equal(blocks.length, 2, 'the Chromium rules moved');
        for ( const rule of blocks ) {
            assert.equal(rule.includes('$'), false, rule);
        }
    });

    it('covers every build seen served, on both hosts', ( ) => {
        const matches = url => rules.some(rule => {
            const pattern = rule.slice(2).split('$')[0];
            return url.includes('//' + pattern);
        });
        for ( const url of [
            'https://js.monitor.azure.com/scripts/b/ai.3.gbl.min.js',
            'https://js.monitor.azure.com/scripts/b/ai.3.min.js',
            'https://js.monitor.azure.com/scripts/b/ai.2.min.js',
            'https://js.monitor.azure.com/scripts/a/ai.0.js',
            'https://az416426.vo.msecnd.net/scripts/b/ai.2.min.js',
        ] ) {
            assert.ok(matches(url), 'not covered: ' + url);
        }
    });

});

describe('extra/application-insights.js, their snippet', ( ) => {

    it('adopts the object in place, keeping their config', async ( ) => {
        // The snippet's own closures hold a reference to it, so replacing
        // it would leave those calling a different object.
        const win = boot({ before: SNIPPET });
        await settle();
        assert.equal(win.appInsights.config.instrumentationKey, 'KEY',
            'their config was thrown away');
        assert.equal(win.appInsights.sv, '7');
        assert.equal(win.appInsights.version, 2);
        assert.equal(typeof win.appInsights.getTraceCtx, 'function');
    });

    it('drains what the page queued, without looping', async ( ) => {
        // Each entry calls sdk[name] - a proxy before this ran, which
        // would push again and never end. Overwriting the proxies first
        // is what makes the drain safe, and is what their SDK does too.
        const win = boot({
            before: SNIPPET +
                '<script>appInsights.trackEvent({ name: "a" });' +
                'appInsights.trackPageView({ name: "b" });</script>',
        });
        await settle();
        assert.equal(win.appInsights.queue.length, 2,
            'the queue is not theirs any more');
        // Two entries in, two entries run, and nothing re-queued.
        win.appInsights.trackEvent({ name: 'c' });
        assert.equal(win.appInsights.queue.length, 2,
            'a call after the takeover was queued again');
    });

    it('drains one the page queues later', async ( ) => {
        const win = boot({ before: SNIPPET });
        await settle();
        let ran = 0;
        win.appInsights.queue.push(( ) => { ran += 1; });
        assert.equal(ran, 1, 'a later push was left sitting in the queue');
        win.appInsights.queue.push(( ) => { ran += 1; });
        assert.equal(ran, 2);
    });

    it('answers their onInit, which the snippet queues last', async ( ) => {
        // From their snippet source: win[aiName] = aiSdk, then
        //   if (aiSdk.queue && aiSdk.queue.length === 0) {
        //       aiSdk.queue.push(_onInit); aiSdk.trackPageView({}); }
        //   function _onInit() { if (cfg.onInit) { cfg.onInit(aiSdk); } }
        // So a page that passed onInit is waiting on a queue entry, and
        // the drain is what answers it.
        const win = boot({
            before: SNIPPET +
                '<script>(function() {' +
                'var cfg = { onInit: function(sdk) {' +
                'window.initWith = typeof sdk.trackEvent; } };' +
                'function _onInit() { if ( cfg.onInit ) { cfg.onInit(appInsights); } }' +
                'if ( appInsights.queue && appInsights.queue.length === 0 ) {' +
                'appInsights.queue.push(_onInit); appInsights.trackPageView({}); }' +
                '}());</script>',
        });
        await settle();
        assert.equal(win.initWith, 'function',
            'a page waiting on onInit was left waiting');
    });

    it('survives a queued call that throws', async ( ) => {
        const win = boot({
            before: SNIPPET +
                '<script>appInsights.queue.push(function() {' +
                'window.first = true; throw new Error("from the page"); });' +
                'appInsights.queue.push(function() { window.second = true; });' +
                '</script>',
        });
        await settle();
        assert.equal(win.first, true);
        assert.equal(win.second, true, 'one throwing entry stopped the rest');
    });

});
