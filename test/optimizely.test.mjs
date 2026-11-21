/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    extra/optimizely.js is not a cookie-consent resource and is not built into
    dist/, so it is read from extra/ - but still through parseResources, so the
    uBO line rules that drop the header are exercised the way they ship.

    These tests run the page's own scripts (runScripts: 'dangerously') rather
    than using the eval helpers: the resource stands in for a <script> in the
    head, and what matters is what it does to a command queued by an earlier
    tag and to a listener registered by a later one. A fixture that evals the
    resource after the document is parsed cannot see either.

*/

import { strict as assert } from 'node:assert';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { before, describe, it } from 'node:test';
import { JSDOM, VirtualConsole } from 'jsdom';
import { parseResources, settle } from './helpers.mjs';

const SNIPPET_URL = 'https://cdn.optimizely.com/js/5530288147660800.js';
const PREVIEW_URL = 'https://cdn.optimizely.com/js/preview2/5530288147660800.js';
// The same client served for Performance Edge: /public/<account>/<project>/
// <revision>_<sha256>_edge_helper.js
const EDGE_URL = 'https://cdn.optimizely.com/public/275532918/20917322951/' +
    '10012_c2dd97f885d305fc03c78148ada49be2c09fac33ec4e25036c0f4cd7cbdd8a8c' +
    '_edge_helper.js';
const PROJECT_ID = '5530288147660800';

let code;

before(async ( ) => {
    const text = await fs.readFile(
        path.join(import.meta.dirname, '..', 'extra', 'optimizely.js'), 'utf8'
    );
    code = parseResources(text).get('optimizely.js');
    assert.ok(typeof code === 'string' && code.length !== 0);
});

// The resource inline in <head>, with the page's own tags around it.
const boot = (options = {}) => {
    const head = (options.before || '') +
        `<script>${code}</script>` + (options.after || '');
    const dom = new JSDOM(
        `<!DOCTYPE html><html><head>${head}</head>` +
        `<body>${options.body || '<p id="content">x</p>'}</body></html>`,
        {
            runScripts: 'dangerously',
            url: options.url || 'https://example.com/page',
            // A real referrer, so a test that expects the stub to withhold it
            // is not passing on jsdom's empty default.
            referrer: 'https://referrer.example/from',
            virtualConsole: new VirtualConsole(),
        }
    );
    return dom.window;
};

// The same resource where the request was redirected: the script element keeps
// the snippet's own src, which is the only place the project id survives.
const bootRedirected = (src = SNIPPET_URL) => {
    const dom = new JSDOM(
        `<!DOCTYPE html><html><head><script src="${src}"></script>` +
        `</head><body></body></html>`,
        {
            runScripts: 'dangerously',
            url: 'https://example.com/page',
            virtualConsole: new VirtualConsole(),
        }
    );
    const win = dom.window;
    const el = win.document.querySelector('script[src*="optimizely"]');
    new win.Function('el', [
        "Object.defineProperty(document, 'currentScript',",
        '{ value: el, configurable: true });',
        code,
    ].join(''))(el);
    return win;
};

// Counters installed before any script runs, so the resource's own observer
// and timers are the ones measured.
const bootCounted = ( ) => {
    const counts = {
        made: 0, observed: 0, disconnected: 0, intervals: 0, cleared: 0,
    };
    const dom = new JSDOM(
        `<!DOCTYPE html><html><head><script>${code}</script></head>` +
        `<body><p id="content">x</p></body></html>`,
        {
            runScripts: 'dangerously',
            url: 'https://example.com/page',
            virtualConsole: new VirtualConsole(),
            beforeParse(win) {
                const RealObserver = win.MutationObserver;
                win.MutationObserver = class {
                    constructor(callback) {
                        counts.made += 1;
                        this.inner = new RealObserver(callback);
                    }
                    observe(...args) {
                        counts.observed += 1;
                        this.inner.observe(...args);
                    }
                    disconnect() {
                        counts.disconnected += 1;
                        this.inner.disconnect();
                    }
                    takeRecords() { return this.inner.takeRecords(); }
                };
                const realSetInterval = win.setInterval;
                win.setInterval = (...args) => {
                    counts.intervals += 1;
                    return realSetInterval(...args);
                };
                const realClearInterval = win.clearInterval;
                win.clearInterval = id => {
                    counts.cleared += 1;
                    return realClearInterval(id);
                };
            },
        }
    );
    return { win: dom.window, counts };
};

// Console captured before any script runs, so the resource's own lines are
// the ones collected. The other fixtures use a VirtualConsole, which drops
// them.
const bootLogged = ( ) => {
    const lines = { warn: [], error: [] };
    const dom = new JSDOM(
        `<!DOCTYPE html><html><head><script>${code}</script></head>` +
        `<body></body></html>`,
        {
            runScripts: 'dangerously',
            url: 'https://example.com/page',
            beforeParse(win) {
                win.console.warn = (...parts) => {
                    lines.warn.push(parts);
                };
                win.console.error = (...parts) => {
                    lines.error.push(parts.join(' '));
                };
            },
        }
    );
    return { win: dom.window, lines };
};

// cdn3/geo4.js verbatim in shape - the || [] idiom, the array-form push, and
// the IIFE split across lines as they ship it - with a documentation address
// in place of the real one. The probe after it records what push answered,
// since the route matters as much as the absence of residue.
const GEO4 = '<script>(function(){\n' +
    '  window["optimizely"] = window["optimizely"] || [];\n' +
    '  window["optimizely"].push(["activateGeoDelayedExperiments", {\n' +
    '    "location":{ "city": "TESTCITY", "continent": "XX", "country": "ZZ",' +
    ' "region": "RR", "dma": "" },\n' +
    '    "ip":"203.0.113.9"\n' +
    '  }]);\n' +
    '})\n()\n;</script>' +
    '<script>window.geoAccepted = window.optimizely.push(' +
    '["activateGeoDelayedExperiments", { "ip": "203.0.113.9" }]);</script>';

const QUEUE_LISTENER =
    '<script>window.optimizely = window.optimizely || [];' +
    "window.optimizely.push({ type: 'addListener'," +
    " filter: { type: 'lifecycle', name: 'initialized' }," +
    ' handler: function() { window.heard = true; } });</script>';

describe('optimizely', ( ) => {

    it('installs the api at document_start', ( ) => {
        const win = boot({ before: '<script>window.readyAt = document.readyState;</script>' });
        assert.equal(win.readyAt, 'loading');
        assert.equal(typeof win.optimizely.push, 'function');
        assert.equal(typeof win.optimizely.get, 'function');
        assert.equal(win.optimizely.initialized, true);
        assert.match(win.optimizely.data.note, /Obsolete/);
        assert.deepEqual(Object.keys(win.optimizely.state), []);
    });

    it('applies a command queued before it ran', async ( ) => {
        const win = boot({ before: QUEUE_LISTENER });
        await settle(60);
        assert.equal(win.heard, true);
    });

    it('reaches a listener registered by a later tag', async ( ) => {
        const win = boot({
            before: '<script>window.optimizely = [];</script>',
            after: QUEUE_LISTENER,
        });
        await settle(60);
        assert.equal(win.heard, true);
    });

    it('reports no experiments through state', ( ) => {
        const state = boot().optimizely.get('state');
        assert.deepEqual(Object.keys(state.getCampaignStates()), []);
        assert.deepEqual(Object.keys(state.getCampaignStateLists()), []);
        assert.deepEqual(Object.keys(state.getExperimentStates()), []);
        assert.deepEqual(Object.keys(state.getPageStates()), []);
        assert.deepEqual(Object.keys(state.getVariationMap()), []);
        assert.deepEqual(Object.keys(state.getTrafficExclusionStats()), []);
        assert.equal(state.getActiveExperimentIds().length, 0);
        assert.equal(state.getActivationId(), null);
        assert.equal(state.getDecisionObject(), null);
        assert.equal(state.getDecisionString(), null);
        assert.equal(state.getRedirectInfo(), null);
        assert.equal(state.isGlobalHoldback(), false);
    });

    it('reports an empty project through data', ( ) => {
        const data = boot().optimizely.get('data');
        assert.deepEqual(Object.keys(data.audiences), []);
        assert.deepEqual(Object.keys(data.campaigns), []);
        assert.deepEqual(Object.keys(data.events), []);
        assert.deepEqual(Object.keys(data.experiments), []);
        assert.deepEqual(Object.keys(data.groups), []);
        assert.deepEqual(Object.keys(data.pages), []);
        assert.deepEqual(Object.keys(data.variations), []);
        assert.equal(data.clientName, 'js');
        assert.equal(data.accountId, null);
        assert.equal(data.revision, null);
    });

    it('carries the project id over from the redirected src', ( ) => {
        const data = bootRedirected().optimizely.get('data');
        assert.equal(data.projectId, PROJECT_ID);
        assert.equal(data.snippetId, PROJECT_ID);
    });

    it('takes account, project and revision from the edge helper path', ( ) => {
        const data = bootRedirected(EDGE_URL).optimizely.get('data');
        assert.equal(data.accountId, '275532918');
        assert.equal(data.projectId, '20917322951');
        assert.equal(data.snippetId, '20917322951');
        assert.equal(data.revision, '10012');
    });

    it('leaves account and revision unknown on the snippet path', ( ) => {
        // /js/<project>.js carries the project id and nothing else, so
        // claiming an account there would be inventing one.
        const data = bootRedirected().optimizely.get('data');
        assert.equal(data.projectId, PROJECT_ID);
        assert.equal(data.accountId, null);
        assert.equal(data.revision, null);
    });

    it('carries it over from the preview client path too', ( ) => {
        // ||cdn.optimizely.com/js/ catches /js/preview2/<id>.js as well, and
        // the id sits one directory deeper there.
        const data = bootRedirected(PREVIEW_URL).optimizely.get('data');
        assert.equal(data.projectId, PROJECT_ID);
    });

    it('carries every key their profile providers declare', ( ) => {
        const visitor = boot().optimizely.get('visitor');
        // The fourteen every snippet read bundles, plus the eight a project
        // only gets when its audiences ask for them.
        for ( const key of [
            'browserId', 'browserVersion', 'campaign', 'currentTimestamp',
            'custom', 'customBehavior', 'device', 'device_type', 'events',
            'first_session', 'offset', 'referrer', 'source_type', 'visitorId',
            'IP', 'cookies', 'dcpData', 'language', 'location', 'platform',
            'queryParams', 'url',
        ] ) {
            assert.ok(key in visitor, `visitor is missing ${key}`);
        }
        // Keys I had invented, which no snippet declares.
        assert.equal('lineItems' in visitor, false);
        assert.equal('dimensions' in visitor, false);
        assert.equal('campaigns' in visitor, false, 'campaigns belongs to data');
        // dcpData is what their dynamic_customer_profile matcher reads, and
        // it guards the first level only: (visitor.dcpData || {}).results
        assert.equal(typeof visitor.dcpData, 'object');
        // location must be walkable, which is what geo.js does to it.
        assert.equal(visitor.location.country, '');
        assert.equal(typeof visitor.currentTimestamp, 'number');
        assert.equal(visitor.first_session, true);
    });

    it('reports an empty visitor and leaks no referrer', ( ) => {
        const visitor = boot().optimizely.get('visitor');
        assert.deepEqual(Object.keys(visitor.custom), []);
        assert.equal(visitor.events.length, 0);
        assert.equal(visitor.visitorId, null);
        assert.notEqual(boot().document.referrer, '');
        assert.equal(visitor.referrer, '');
    });

    it('answers visitor_id with a per-load id that is never stored', async ( ) => {
        const win = boot();
        await settle(60);
        assert.match(
            win.optimizely.get('visitor_id').randomId,
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
        );
        assert.equal(win.document.cookie, '');
        assert.deepEqual(Object.keys(win.localStorage), []);
    });

    it('returns undefined for a module it does not carry', ( ) => {
        const win = boot();
        assert.equal(win.optimizely.get('dcp'), undefined);
        assert.equal(win.optimizely.get('session'), undefined);
        assert.equal(win.optimizely.get(), undefined);
    });

    it('accepts every command form and refuses what it does not know', ( ) => {
        const win = boot();
        assert.equal(win.optimizely.push({ type: 'activate' }), true);
        assert.equal(win.optimizely.push([ 'trackEvent', { eventName: 'x' } ]), true);
        // The string and array forms are version 0 calls, and activate is a
        // version 1 name, so their client refuses both.
        assert.equal(win.optimizely.push('activate'), false);
        assert.equal(win.optimizely.push([ 'activate' ]), false);
        assert.equal(win.optimizely.push({ type: 'notACommand' }), false);
        assert.equal(win.optimizely.push(42), false);
    });

    it('swallows a bad listener the way push does', ( ) => {
        const win = boot();
        assert.equal(win.optimizely.push({ type: 'addListener', handler: 'nope' }), true);
    });

    it('replays a lifecycle state a late listener missed, but not an edge', async ( ) => {
        const win = boot();
        await settle(60);
        let initialized = false;
        let activate = false;
        win.optimizely.push({
            type: 'addListener',
            filter: { type: 'lifecycle', name: 'initialized' },
            handler: ( ) => { initialized = true; },
        });
        win.optimizely.push({
            type: 'addListener',
            filter: { type: 'lifecycle', name: 'activate' },
            handler: ( ) => { activate = true; },
        });
        assert.equal(initialized, true);
        assert.equal(activate, false);
    });

    it('stops delivering to a removed listener', async ( ) => {
        const win = boot();
        let hits = 0;
        win.optimizely.push({
            type: 'addListener',
            token: 'tok1',
            filter: { type: 'lifecycle' },
            handler: ( ) => { hits += 1; },
        });
        win.optimizely.push({ type: 'removeListener', token: 'tok1' });
        await settle(60);
        assert.equal(hits, 0);
    });

    it('keeps the utils helpers working', async ( ) => {
        const win = boot();
        const utils = win.optimizely.get('utils');
        for ( const name of [
            'observeSelector', 'onUrlChange', 'persistHtml', 'poll',
            'Promise', 'waitForElement', 'waitUntil',
        ] ) {
            assert.ok(name in utils, name);
        }
        const seen = [];
        const stop = utils.observeSelector('.watched', el => { seen.push(el.id); });
        const first = win.document.createElement('div');
        first.className = 'watched';
        first.id = 'one';
        win.document.body.appendChild(first);
        await settle(60);
        assert.deepEqual(seen, [ 'one' ]);
        stop();
        const second = win.document.createElement('div');
        second.className = 'watched';
        second.id = 'two';
        win.document.body.appendChild(second);
        await settle(60);
        assert.deepEqual(seen, [ 'one' ]);
    });

    it('resolves waitForElement when the node arrives', async ( ) => {
        const win = boot();
        let resolved = false;
        win.optimizely.get('utils').waitForElement('.later').then(( ) => {
            resolved = true;
        });
        const node = win.document.createElement('span');
        node.className = 'later';
        win.document.body.appendChild(node);
        await settle(80);
        assert.equal(resolved, true);
    });

    it('resolves waitUntil on the condition, and at once when already met', async ( ) => {
        const win = boot();
        const utils = win.optimizely.get('utils');
        let late = false;
        let flag = false;
        utils.waitUntil(( ) => flag).then(( ) => { late = true; });
        assert.equal(late, false);
        win.setTimeout(( ) => { flag = true; }, 10);
        let immediate = false;
        utils.waitUntil(( ) => true).then(( ) => { immediate = true; });
        await settle(120);
        assert.equal(late, true);
        assert.equal(immediate, true);
    });

    it('rejects the arguments the real helpers reject', ( ) => {
        const utils = boot().optimizely.get('utils');
        assert.throws(( ) => utils.observeSelector('>>bad<<', ( ) => {}), /css selector/);
        assert.throws(( ) => utils.observeSelector('.ok', 'notAFunction'), /function/);
        assert.throws(( ) => utils.persistHtml('', '.ok'), /non-empty string/);
        assert.throws(( ) => utils.persistHtml('<b>x</b>', '.ok', 'sideways'), /placement/);
    });

    it('makes no observer and no timer until utils is used', async ( ) => {
        const { win, counts } = bootCounted();
        for ( let batch = 0; batch < 5; batch += 1 ) {
            for ( let i = 0; i < 50; i += 1 ) {
                win.document.body.appendChild(win.document.createElement('div'));
            }
            await settle(20);
        }
        assert.deepEqual(counts, {
            made: 0, observed: 0, disconnected: 0, intervals: 0, cleared: 0,
        });
    });

    it('drops its observer once nothing is watching', async ( ) => {
        const { win, counts } = bootCounted();
        const stop = win.optimizely.get('utils').observeSelector('.x', ( ) => {});
        assert.equal(counts.observed, 1);
        assert.equal(counts.disconnected, 0);
        stop();
        assert.equal(counts.disconnected, 1);
        // And again for a one-shot, which removes its own entry.
        const second = bootCounted();
        await new Promise(resolve => {
            second.win.optimizely.get('utils').waitForElement('.target').then(resolve);
            const node = second.win.document.createElement('div');
            node.className = 'target';
            second.win.document.body.appendChild(node);
        });
        assert.equal(second.counts.disconnected, 1);
    });

    it('scans once per mutation batch, not once per node', async ( ) => {
        const win = boot();
        let scans = 0;
        const real = win.Document.prototype.querySelectorAll;
        win.Document.prototype.querySelectorAll = function(selector) {
            scans += 1;
            return real.call(this, selector);
        };
        let seen = 0;
        win.optimizely.get('utils').observeSelector('.match', ( ) => { seen += 1; });
        for ( let batch = 0; batch < 5; batch += 1 ) {
            for ( let i = 0; i < 50; i += 1 ) {
                const node = win.document.createElement('div');
                node.className = i === 0 ? 'match' : 'row';
                win.document.body.appendChild(node);
            }
            await settle(20);
        }
        assert.equal(seen, 5);
        // One scan on register, one per batch. 250 nodes would be 251.
        assert.ok(scans <= 6, `${scans} scans for 5 batches`);
    });

    it('shares one timer between waiters on the same period', async ( ) => {
        const { win, counts } = bootCounted();
        const utils = win.optimizely.get('utils');
        let flag = false;
        const done = [];
        for ( let i = 0; i < 10; i += 1 ) {
            utils.waitUntil(( ) => flag).then(( ) => { done.push(i); });
        }
        await settle(60);
        assert.equal(counts.intervals, 1);
        assert.equal(counts.cleared, 0);
        flag = true;
        await settle(60);
        assert.equal(done.length, 10);
        assert.equal(counts.cleared, 1);
    });

    it('keeps a separate timer per period and cancels by waiter', async ( ) => {
        const { win, counts } = bootCounted();
        const utils = win.optimizely.get('utils');
        const noop = ( ) => {};
        const cancelFast = utils.poll(noop, 20);
        const cancelSlow = utils.poll(noop, 50);
        const cancelTwin = utils.poll(noop, 20);
        assert.equal(counts.intervals, 2);
        cancelFast();
        assert.equal(counts.cleared, 0, 'the twin on 20 is still waiting');
        cancelTwin();
        assert.equal(counts.cleared, 1);
        cancelSlow();
        assert.equal(counts.cleared, 2);
    });

    it('accepts the legacy array-form commands a page still pushes', ( ) => {
        const win = boot();
        const legacy = [
            [ 'activateSiteCatalyst', { sVariable: 's1' } ],
            [ 'bucketVisitor', '1234', 0 ],
            [ 'setCookieDomain', '.example.com' ],
            [ 'setCookieExpiration', 90 ],
            [ 'setDimensionValue', 'plan', 'pro' ],
            [ 'setGA4UserId', 'ga-1' ],
            [ 'setUserId', 'user-1' ],
            [ 'storeThirdPartyData', { segment: 'x' } ],
            [ 'trackEvent', 'signup' ],
            [ 'log' ],
            [ 'disable' ],
            [ 'optOut', true ],
        ];
        for ( const command of legacy ) {
            assert.equal(win.optimizely.push(command), true, command[0]);
        }
    });

    it('takes the geo callback and keeps the address out of the page', ( ) => {
        // cdn3/geo4.js is injected by their client when an audience needs an
        // address, and calls back with the visitor's own IP and location. The
        // stub never injects it, and takes the call without keeping anything.
        const win = boot();
        const payload = {
            location: {
                city: 'TESTCITY', continent: 'XX', country: 'ZZ',
                region: 'RR', dma: '',
            },
            ip: '203.0.113.9',
        };
        assert.equal(
            win.optimizely.push([ 'activateGeoDelayedExperiments', payload ]),
            true
        );
        const visitor = win.optimizely.get('visitor');
        const serialised = JSON.stringify([
            visitor, win.optimizely.get('data'), win.document.cookie,
            Object.entries(win.localStorage),
        ]);
        assert.ok(serialised.includes('203.0.113.9') === false, 'ip retained');
        assert.ok(serialised.includes('TESTCITY') === false, 'city retained');
        assert.deepEqual(Object.values(visitor.location), [ '', '', '', '', '' ]);
    });

    it('answers the Classic api a pre-migration snippet installs', ( ) => {
        // Projects last saved before the migration still serve Optimizely
        // Classic from the same /js/<id>.js path, and it puts its api on the
        // object rather than behind push and get.
        const o = boot().optimizely;
        for ( const name of [
            'activate', 'trackEvent', 'bucketUser', 'setUserId', 'disable',
            'optOut', 'addToAudience', 'removeFromSegment', 'customTag',
            'setDimensionValue', 'timeout', 'verbose', 'overrideUrl',
            'activateSiteCatalyst', 'sc_activate', 'storeThirdPartyData',
        ] ) {
            assert.equal(typeof o[name], 'function', `missing ${name}`);
            assert.equal(o[name](), undefined, `${name} returned something`);
        }
        for ( const name of [
            'variationMap', 'variation_map', 'variationIdsMap',
            'variationNamesMap', 'allExperiments', 'all_experiments',
            'allVariations',
        ] ) {
            assert.equal(Object.keys(o[name]).length, 0, name);
        }
        assert.equal(o.activeExperiments.length, 0);
        assert.equal(typeof o.getElementsByClassName, 'function');
        // data keeps the obsolete note the current client answers with, and
        // carries the Classic shape beside it.
        assert.ok(o.data.note.startsWith('Obsolete'));
        assert.equal(Object.keys(o.data.experiments).length, 0);
        assert.equal(o.data.state.activeExperiments.length, 0);
        assert.equal(o.data.state.enabled, true);
        assert.equal(Object.keys(o.data.state.variationMap).length, 0);
        assert.equal(o.data.state.integrations.activeOAuthClientIds.length, 0);
        assert.equal(o.data.state.redirectExperiment, undefined);
        // A Classic variation reads two levels into the visitor, so the
        // chain has to hold, and the referrer stays withheld here too.
        assert.equal(o.data.visitor.referrer, '');
        assert.equal(o.data.visitor.browser, '');
        assert.equal(Object.keys(o.data.visitor.params).length, 0);
        assert.equal(Object.keys(o.data.visitor.location).length, 0);
    });

    it('takes the project id into the Classic getters too', ( ) => {
        const o = bootRedirected().optimizely;
        assert.equal(o.getProjectId(), PROJECT_ID);
        assert.equal(o.getAccountId(), null);
        assert.equal(o.revision, null);
        const edge = bootRedirected(EDGE_URL).optimizely;
        assert.equal(edge.getProjectId(), '20917322951');
        assert.equal(edge.getAccountId(), '275532918');
        assert.equal(edge.revision, '10012');
    });

    it('hands back the page jquery through the Classic $ as well', ( ) => {
        const win = boot();
        assert.equal(win.optimizely.$, undefined);
        const jq = ( ) => {};
        win.$ = jq;
        assert.equal(win.optimizely.$, jq, 'not read at the time it is asked');
    });

    it('honours the high-priority flag their boot pass uses', ( ) => {
        // initializePlugins does
        //   window.optimizely = window.optimizely.filter(c => !push(c, true))
        // so the six high-priority names run out of the queue early and
        // everything else stays in the array. With the flag, anything else is
        // ignored and reports false.
        const win = boot();
        // The whitelist is checked by name, but the table is still chosen by
        // version: disable and optOut are in both, the other four only in v1.
        const highPriority = [
            [ 'disable' ], [ 'optOut', true ],
            { type: 'clientMetadata' }, { type: 'cookieDomain' },
            { type: 'disable' }, { type: 'load' }, { type: 'optOut' },
            { type: 'rum' },
        ];
        for ( const command of highPriority ) {
            assert.equal(
                win.optimizely.push(command, true), true,
                'flagged ' + JSON.stringify(command)
            );
        }
        // The whitelist does not bypass the table lookup: rum is high
        // priority but v1 only, so the array form is still refused.
        assert.equal(win.optimizely.push([ 'rum' ], true), false, 'v0 rum');
        const refused = [
            [ 'activateGeoDelayedExperiments', {} ], [ 'trackEvent', 'x' ],
            [ 'setUserId', 'u' ], [ 'log' ],
        ];
        for ( const command of refused ) {
            assert.equal(
                win.optimizely.push(command, true), false,
                'flagged ' + command[0]
            );
            assert.equal(
                win.optimizely.push(command), true,
                'unflagged ' + command[0]
            );
        }
        assert.equal(win.optimizely.push({ type: 'activate' }, true), false);
        assert.equal(win.optimizely.push({ type: 'activate' }), true);
    });

    it('does not run the command it refuses on the high-priority pass', ( ) => {
        // log is not high priority, so the flagged push must not turn the
        // console on - the warn that follows has to stay unprinted.
        const { win, lines } = bootLogged();
        assert.equal(win.optimizely.push([ 'log' ], true), false);
        win.optimizely.push([ 'nosuchcommand' ]);
        assert.equal(lines.warn.length, 0, 'logging was enabled anyway');
        assert.equal(win.optimizely.push([ 'log' ]), true);
        win.optimizely.push([ 'nosuchcommand' ]);
        assert.equal(lines.warn.length, 1, 'the unflagged log did not take');
        // Their flag check runs before the table lookup, so an unknown name
        // on the high-priority pass is dropped without the warning an
        // unknown name otherwise earns.
        assert.equal(win.optimizely.push([ 'nosuchcommand' ], true), false);
        assert.equal(lines.warn.length, 1, 'the refused name was warned about');
    });

    it('routes a command to the table its version names', ( ) => {
        const win = boot();
        const cases = [
            [ { type: 'activate' }, true ],
            [ { type: 'trackEvent' }, false ],
            [ { type: 'setUserId' }, false ],
            [ { type: 'rum' }, true ],
            [ { type: 'waitForOriginSync' }, true ],
            [ { type: 'setOptOut' }, false ],
            [ [ 'trackEvent', 'x' ], true ],
            [ [ 'setUserId', 'u' ], true ],
            [ [ 'bucketUser', '1', '0' ], true ],
            [ [ 'addListener' ], false ],
            [ { type: 'activate', version: 0 }, false ],
            [ { type: 'trackEvent', version: 0 }, true ],
            [ { type: 'activate', version: 2 }, false ],
            [ { type: 'activate', version: 9 }, false ],
        ];
        for ( const [ command, expected ] of cases ) {
            assert.equal(
                win.optimizely.push(command), expected,
                JSON.stringify(command)
            );
        }
    });

    it('hands back the listener token their emitter assigns', ( ) => {
        const win = boot();
        let hits = 0;
        const spec = {
            type: 'addListener',
            filter: { type: 'custom' },
            handler: ( ) => { hits += 1; },
        };
        win.optimizely.push(spec);
        assert.match(spec.token, /^[0-9a-f-]{36}$/);
        const emitter = win.optimizely.get('event_emitter');
        emitter.emit({ type: 'custom', name: 'x' });
        assert.equal(hits, 1);
        win.optimizely.push({ type: 'removeListener', token: spec.token });
        emitter.emit({ type: 'custom', name: 'x' });
        assert.equal(hits, 1);
    });

    it('serves the event_emitter module', ( ) => {
        const win = boot();
        const emitter = win.optimizely.get('event_emitter');
        assert.deepEqual(Object.keys(emitter).sort(), [ 'emit', 'off', 'on' ]);
        let hits = 0;
        const token = emitter.on({
            filter: { type: 'custom' },
            handler: ( ) => { hits += 1; },
        });
        assert.match(token, /^[0-9a-f-]{36}$/);
        emitter.emit({ type: 'custom', name: 'one' });
        emitter.emit({ type: 'other', name: 'two' });
        assert.equal(hits, 1, 'the filter is honoured');
        emitter.off(token);
        emitter.emit({ type: 'custom', name: 'three' });
        assert.equal(hits, 1);
    });

    it('serves the behavior module with no event history', ( ) => {
        const win = boot();
        const behavior = win.optimizely.get('behavior');
        assert.deepEqual(
            Object.keys(behavior).sort(),
            [ 'getByFrequency', 'getEvents', 'query' ]
        );
        const empty = (value, label) => {
            assert.ok(Array.isArray(value), `${label} is not an array`);
            assert.equal(value.length, 0, `${label} is not empty`);
        };
        empty(behavior.getEvents(), 'getEvents()');
        empty(behavior.getEvents(5), 'getEvents(5)');
        empty(behavior.getEvents({ filters: [] }), 'getEvents(descriptor)');
        empty(behavior.getByFrequency({ pick: { name: 'tag' } }), 'getByFrequency');
        empty(behavior.query({}), 'query({})');
        // Theirs takes the first element of the executed result when a reduce
        // is asked for, and against no events there is none.
        assert.equal(behavior.query({ reduce: { aggregator: 'count' } }), undefined);
    });

    it('raises the argument errors the behavior module raises', ( ) => {
        const behavior = boot().optimizely.get('behavior');
        assert.throws(( ) => behavior.getEvents(0), /Count must be a positive integer, got 0/);
        assert.throws(( ) => behavior.getEvents(-3), /positive integer/);
        assert.throws(( ) => behavior.getEvents({ count: 1 }), /Unexpected "count" clause/);
        assert.throws(
            ( ) => behavior.getEvents({ pick: { name: 'x', modifier: 'sideways' } }),
            /Invalid "pick" modifier "sideways"/
        );
        assert.throws(
            ( ) => behavior.getEvents({ filters: [ { modifier: 'odd' } ] }),
            /Unexpected "filter" modifier "odd"/
        );
        assert.throws(( ) => behavior.getEvents(null), /Descriptor not defined/);
        assert.throws(( ) => behavior.getByFrequency(), /No "pick" clause provided/);
        assert.throws(( ) => behavior.getByFrequency({ pick: {} }), /No field name provided/);
        // most_recent belongs to getEvents, not to getByFrequency.
        assert.throws(
            ( ) => behavior.getByFrequency({ pick: { name: 'x', modifier: 'most_recent' } }),
            /Invalid "pick" modifier "most_recent"/
        );
    });

    it('reports a url change and goes quiet when unsubscribed', ( ) => {
        const win = boot();
        const seen = [];
        const stop = win.optimizely.get('utils').onUrlChange(href => {
            seen.push(href);
        });
        win.history.pushState({}, '', '/one');
        win.history.replaceState({}, '', '/two');
        assert.equal(seen.length, 2);
        assert.match(seen[0], /\/one$/);
        assert.match(seen[1], /\/two$/);
        stop();
        win.history.pushState({}, '', '/three');
        assert.equal(seen.length, 2);
    });

    it('restores history only while its own wrapper is the one installed', ( ) => {
        const win = boot();
        const utils = win.optimizely.get('utils');
        const pristine = win.history.pushState;
        const pristineReplace = win.history.replaceState;
        let stop = utils.onUrlChange(( ) => {});
        assert.notEqual(win.history.pushState, pristine, 'pushState not patched');
        assert.notEqual(win.history.replaceState, pristineReplace, 'replaceState not patched');
        stop();
        assert.equal(win.history.pushState, pristine, 'pushState not put back');
        assert.equal(win.history.replaceState, pristineReplace, 'replaceState not put back');
        // Now with another script wrapping history after us: unsubscribing
        // must not unhook it.
        stop = utils.onUrlChange(( ) => {});
        const ours = win.history.pushState;
        let theirCalls = 0;
        win.history.pushState = function() {
            theirCalls += 1;
            return ours.apply(this, arguments);
        };
        const theirs = win.history.pushState;
        stop();
        assert.equal(win.history.pushState, theirs, 'their wrapper was clobbered');
        win.history.pushState({}, '', '/x');
        assert.equal(theirCalls, 1, 'their wrapper stopped being called');
    });

    it('rejects waitUntil when the condition is not callable', async ( ) => {
        const win = boot();
        let outcome = 'pending';
        win.optimizely.get('utils').waitUntil(undefined).then(
            ( ) => { outcome = 'resolved'; },
            ( ) => { outcome = 'rejected'; }
        );
        await settle(40);
        // Theirs calls the condition straight away, so this throws inside the
        // executor. Leaving it pending for ever would be the worse answer.
        assert.equal(outcome, 'rejected');
    });

    it('unsubscribes the observer handed back, not the last one added', async ( ) => {
        const win = boot();
        const utils = win.optimizely.get('utils');
        const fired = [];
        const stopFirst = utils.observeSelector('.first', el => {
            fired.push(`first:${el.id}`);
        });
        utils.observeSelector('.second', el => { fired.push(`second:${el.id}`); });
        stopFirst();
        for ( const [ cls, id ] of [ [ 'first', 'f1' ], [ 'second', 's1' ] ] ) {
            const node = win.document.createElement('div');
            node.className = cls;
            node.id = id;
            win.document.body.appendChild(node);
        }
        await settle(60);
        assert.deepEqual(fired, [ 'second:s1' ]);
    });

    it('lets an observer callback register another observer', async ( ) => {
        const win = boot();
        const utils = win.optimizely.get('utils');
        const fired = [];
        utils.observeSelector('.a', el => {
            fired.push(`a:${el.id}`);
            utils.observeSelector('.b', inner => { fired.push(`b:${inner.id}`); });
        }, { once: true });
        utils.observeSelector('.c', el => { fired.push(`c:${el.id}`); });
        for ( const [ cls, id ] of [ [ 'a', 'a1' ], [ 'b', 'b1' ], [ 'c', 'c1' ] ] ) {
            const node = win.document.createElement('div');
            node.className = cls;
            node.id = id;
            win.document.body.appendChild(node);
        }
        await settle(60);
        assert.deepEqual(fired.slice().sort(), [ 'a:a1', 'b:b1', 'c:c1' ]);
    });

    it('says nothing to the console until a page asks it to', ( ) => {
        const { win, lines } = bootLogged();
        win.optimizely.push({ type: 'notACommand' });
        win.optimizely.push(42);
        win.optimizely.get('dcp');
        // Their logger buffers and only prints once a level is set, so a
        // visitor who never asked sees a clean console.
        assert.deepEqual(lines.warn, []);
        assert.deepEqual(lines.error, []);
    });

    it('uses their wording once the level allows a warning', ( ) => {
        const { win, lines } = bootLogged();
        assert.equal(win.optimizely.push({ type: 'log', level: 'WARN' }), true);
        win.optimizely.push({ type: 'notACommand' });
        win.optimizely.push('activate');
        win.optimizely.push(42);
        win.optimizely.get('dcp');
        const first = lines.warn.map(parts => parts[0]);
        assert.deepEqual(first, [
            'API / No function found for "notACommand" (v1) with arguments:',
            'API / No function found for "activate" (v0) with arguments:',
            'API / Ignoring non-array/object/string argument:',
            'Module "dcp" not found.',
        ]);
        // The arguments ride as a second parameter, as theirs do.
        assert.deepEqual(lines.warn[2][1], 42);
    });

    it('takes the legacy log command and its off switch', ( ) => {
        const { win, lines } = bootLogged();
        win.optimizely.push([ 'log' ]);
        win.optimizely.push({ type: 'notACommand' });
        assert.equal(lines.warn.length, 1, 'legacy log did not enable');
        win.optimizely.push([ 'log', false ]);
        win.optimizely.push({ type: 'notACommand' });
        assert.equal(lines.warn.length, 1, 'legacy log false did not silence');
    });

    it('keeps quiet below warn and complains about a level it cannot read', ( ) => {
        const { win, lines } = bootLogged();
        win.optimizely.push({ type: 'log', level: 'ERROR' });
        win.optimizely.push({ type: 'notACommand' });
        assert.deepEqual(lines.warn, [], 'ERROR is below WARN');
        win.optimizely.push({ type: 'log', level: 'sideways' });
        assert.deepEqual(lines.error, [ 'Unknown log level: sideways' ]);
        // And the bad level left the previous one alone.
        win.optimizely.push({ type: 'notACommand' });
        assert.deepEqual(lines.warn, []);
    });

    it('takes the real geo4 script without keeping any of it', ( ) => {
        // Their client injects geo4 after it has installed, so the stub is
        // first; the other order is unreachable in practice but must not
        // break either, because the || [] idiom has to find the api and the
        // queue drain has to carry a command that was pushed before it ran.
        for ( const [ label, options ] of [
            [ 'stub first', { after: GEO4 } ],
            [ 'geo4 first', { before: GEO4 } ],
        ] ) {
            const win = boot(options);
            assert.equal(
                typeof win.optimizely.get, 'function',
                `${label}: the || [] idiom replaced the api`
            );
            if ( options.after !== undefined ) {
                // The stub is installed, so push is ours and answers true.
                assert.equal(win.geoAccepted, true, `${label}: push refused it`);
            } else {
                // The stub had not run, so the page's push was still
                // Array.prototype.push, which answers the new length. That
                // is the whole reason their initializeApi drains an array.
                assert.equal(typeof win.geoAccepted, 'number', label);
                assert.equal(
                    win.optimizely.push([
                        'activateGeoDelayedExperiments', { ip: '203.0.113.9' },
                    ]),
                    true,
                    `${label}: push refused it after install`
                );
            }
            const everywhere = JSON.stringify([
                win.optimizely.get('visitor'),
                win.optimizely.get('data'),
                win.optimizely.data,
                win.document.cookie,
                Object.entries(win.localStorage),
            ]);
            assert.equal(
                everywhere.includes('203.0.113.9'), false,
                `${label}: address retained`
            );
            assert.equal(
                everywhere.includes('TESTCITY'), false,
                `${label}: city retained`
            );
            // geo4 is one expression statement, so unlike the older geo.js it
            // leaves nothing of its own on the window.
            assert.deepEqual(
                Object.keys(win).filter(key => /^optimizely/i.test(key)),
                [ 'optimizely' ],
                `${label}: a global was left behind`
            );
            assert.deepEqual(
                Object.values(win.optimizely.get('visitor').location),
                [ '', '', '', '', '' ],
                `${label}: location was filled in`
            );
        }
    });

    it('borrows the page jQuery the way their env/jquery does', ( ) => {
        // No jQuery on the page at all.
        assert.equal(boot().optimizely.get('jquery'), undefined);
        // window.$ with no window.jQuery - noConflict, or another library
        // holding $. Theirs resolves $, so this must too.
        const dollar = boot({
            before: '<script>window.$ = function(){ return "dollar"; };</script>',
        });
        assert.equal(typeof dollar.optimizely.get('jquery'), 'function');
        assert.equal(dollar.optimizely.get('jquery')(), 'dollar');
        // Both present, as on an ordinary jQuery page.
        const both = boot({
            before: '<script>window.jQuery = function(){ return "jq"; };' +
                'window.$ = window.jQuery;</script>',
        });
        assert.equal(both.optimizely.get('jquery')(), 'jq');
        // jQuery present with $ removed, which is what noConflict leaves.
        // Their resolver never reads window.jQuery, so theirs answers
        // undefined and so must this.
        const noConflict = boot({
            before: '<script>window.jQuery = function(){ return "jq"; };' +
                'delete window.$;</script>',
        });
        assert.equal(noConflict.optimizely.get('jquery'), undefined);
    });

    it('leaves an api already installed alone', ( ) => {
        const win = boot();
        const installed = win.optimizely;
        new win.Function(code)();
        assert.equal(win.optimizely, installed);
    });

});
