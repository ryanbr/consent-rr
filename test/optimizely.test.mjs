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

    it('carries it over from the preview client path too', ( ) => {
        // ||cdn.optimizely.com/js/ catches /js/preview2/<id>.js as well, and
        // the id sits one directory deeper there.
        const data = bootRedirected(PREVIEW_URL).optimizely.get('data');
        assert.equal(data.projectId, PROJECT_ID);
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
        assert.equal(win.optimizely.get('behavior'), undefined);
        assert.equal(win.optimizely.get(), undefined);
    });

    it('accepts every command form and refuses what it does not know', ( ) => {
        const win = boot();
        assert.equal(win.optimizely.push({ type: 'activate' }), true);
        assert.equal(win.optimizely.push([ 'trackEvent', { eventName: 'x' } ]), true);
        assert.equal(win.optimizely.push('activate'), true);
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

    it('leaves an api already installed alone', ( ) => {
        const win = boot();
        const installed = win.optimizely;
        new win.Function(code)();
        assert.equal(win.optimizely, installed);
    });

});
