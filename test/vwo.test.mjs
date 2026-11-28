/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    extra/vwo.js is not a cookie-consent resource and is not built into dist/,
    so it is read from extra/ - but still through parseResources, so the uBO
    line rules that drop the header are exercised the way they ship.

    Every expectation about their library in here was read off a real payload,
    dev.visualwebsiteoptimizer.com/j.php?a=1072524&u=...&vn=2.1, 157063 bytes,
    and the quoted names are theirs. See extra/vwo.md.

*/

import { strict as assert } from 'node:assert';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { before, describe, it } from 'node:test';
import { JSDOM, VirtualConsole } from 'jsdom';
import { parseResources, settle, watchObservers } from './helpers.mjs';

const HERE = path.join(import.meta.dirname, '..', 'extra', 'vwo.js');
let code = '';

before(async ( ) => {
    code = parseResources(await fs.readFile(HERE, 'utf8')).get('vwo.js');
    assert.ok(typeof code === 'string' && code.length !== 0);
});

// Their snippet, reduced to the parts a replacement has to cooperate with:
// it writes the hiding style, arms the timer, and keeps a finished flag.
const SNIPPET = `<script id="vwoCode">
window._vwo_code = (function() {
    var f = false;
    var code = {
        hide_element_style: 'opacity:0 !important',
        finish: function() {
            if ( f ) { return; }
            f = true;
            window.finishCalls = (window.finishCalls || 0) + 1;
            var e = document.getElementById('_vis_opt_path_hides');
            if ( e ) { e.parentNode.removeChild(e); }
        },
        finished: function() { return f; },
        removeLoaderAndOverlay: function() {
            window.overlayCalls = (window.overlayCalls || 0) + 1;
        },
    };
    var style = document.createElement('style');
    style.setAttribute('id', '_vis_opt_path_hides');
    style.appendChild(document.createTextNode('body{opacity:0 !important}'));
    document.getElementsByTagName('head')[0].appendChild(style);
    window._vwo_settings_timer = setTimeout(function() {
        window.timerFired = true;
        code.finish();
    }, 2000);
    return code;
}());
</script>`;

// The observer this file makes, and what it asked to watch: a subtree watch
// on the document builds a record for every node a page parses.
const bootWatched = (options = {}) => {
    let counts = null;
    const scope = [];
    const dom = new JSDOM(
        `<!DOCTYPE html><html><head><script>${code}</script>` +
        `${options.after || ''}</head><body><p>x</p></body></html>`,
        {
            runScripts: 'dangerously',
            url: 'https://www.example.com/page',
            virtualConsole: new VirtualConsole(),
            beforeParse(win) {
                counts = watchObservers(win);
                const made = win.MutationObserver;
                win.MutationObserver = class extends made {
                    observe(target, init) {
                        scope.push({
                            head: target === win.document.head,
                            subtree: init && init.subtree === true,
                        });
                        super.observe(target, init);
                    }
                };
            },
        }
    );
    return { win: dom.window, counts, scope };
};

// Their library's own init, read off vanj.js and kept in its shape:
//   init: i || (i = window.VWO = window.VWO || []); process(c,e,i);
//         addPushListener(c,e,i)
//   process: for ( e.sort(...); d < e.length; ) processEvent(e[d],...)
//   addPushListener: var d = e.push; e.push = function(a) {
//         d.apply(e, ...); e[e.length-1] === a && processEvent(...) }
const THEIR_LIB = `<script>
var handled = window.handled = [];
var processEvent = function(entry) { handled.push(entry && entry[0]); return 1; };
var e = window.VWO = window.VWO || [];
try {
    e.sort(function(a) { return 'config' === a[0] ? -1 : 0; });
    window.sortOk = true;
} catch ( ex ) {
    window.sortThrew = ex.constructor.name + ': ' + ex.message;
}
for ( var d = 0; d < e.length; ) { processEvent(e[d]); d += 1; }
var native = e.push;
e.push = function(a) {
    native.apply(e, [].slice.call(arguments));
    if ( e[e.length - 1] === a ) { processEvent(a); }
};
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

describe('extra/vwo.js', ( ) => {

    it('publishes the queue api a page can reach for', async ( ) => {
        const win = boot();
        await settle();
        const vwo = win.VWO;
        assert.equal(typeof vwo.push, 'function');
        assert.equal(typeof vwo.collect, 'function');
        assert.equal(typeof vwo.load_co, 'function');
        assert.equal(vwo.nonce, '');
        assert.equal(vwo.visUuid, '');
        assert.deepEqual(Object.keys(vwo.data), []);
        assert.equal(vwo.appliedCampaigns.length, 0);
        assert.equal(typeof vwo._.sE, 'function');
        assert.equal(typeof vwo._.sD, 'function');
        assert.equal(typeof vwo.get, 'function');
        assert.equal(typeof vwo.init, 'function');
        assert.equal(typeof vwo.event, 'function');
        assert.deepEqual(Object.keys(vwo.consentMode), []);
        assert.equal(vwo.ssMeta.enabled, 0);
        assert.equal(vwo.ssMeta.noSS, 0);
    });

    it('answers get the way their own guarded caller expects', async ( ) => {
        const win = boot();
        await settle();
        // The only key asked for across four payloads, 15 times.
        assert.equal(win.VWO.get('visitor.id'), '');
        assert.equal(win.VWO.get('anything.else'), '');
    });

    it('keeps the unguarded get caller from throwing', async ( ) => {
        // Their shape: window.VWO && window.VWO.get("visitor.id") tests
        // that VWO is there and never that get is. Publishing the object
        // without the member turns a safe short-circuit into a TypeError,
        // so a partial stub would be worse than none.
        const win = boot({
            after: '<script>try {' +
                'window.got = window.VWO && window.VWO.get("visitor.id");' +
                'window.threw = false;' +
                '} catch ( ex ) { window.threw = true; }</script>',
        });
        await settle();
        assert.equal(win.threw, false, 'their unguarded caller threw');
        assert.equal(win.got, '');
    });

    it('takes their consent init without throwing', async ( ) => {
        // Called unguarded from a OneTrustGroupsUpdated listener in three
        // of the four payloads, with a number for the state.
        const win = boot({
            after: '<script>try {' +
                'window.VWO.init(1);' +
                'window.VWO.event("track", { a: 1 });' +
                'window.ready = window.VWO.consentMode.cReady;' +
                'window.threw = false;' +
                '} catch ( ex ) { window.threw = true; }</script>',
        });
        await settle();
        assert.equal(win.threw, false);
        assert.equal(win.ready, undefined);
    });

    it('absorbs everything a page queues, and sends nothing', async ( ) => {
        const win = boot({
            after: '<script>window.VWO.push(["activate", 1]);' +
                'window.VWO.push(["track.revenueConversion", 9.99]);' +
                'window.VWO.collect("s.gif?x=1", { path: 1 });' +
                'window.VWO.load_co("vanj.js", { path: 1 });</script>',
        });
        await settle();
        // Nothing fetched, nothing injected: load_co builds a script element.
        assert.equal(win.document.querySelectorAll('script[src]').length, 0);
    });

    it('wraps a callback through safeExecute, keeping this and swallowing a throw',
    async ( ) => {
        const win = boot();
        await settle();
        const holder = { name: 'theirs' };
        holder.go = win.VWO._.sE(function() { return this.name; });
        assert.equal(holder.go(), 'theirs', 'the caller lost its this');
        const bad = win.VWO._.sE(( ) => { throw new Error('from them'); });
        assert.equal(bad(), undefined, 'the throw escaped safeExecute');
    });

    it('carries their dcdn settings file, which guards nothing', async ( ) => {
        // dev.visualwebsiteoptimizer.com/dcdn/settings.js opens on a bare,
        // unguarded VWO._ - dtc = VWO._.dtc = VWO._.dtc || {...} - so the
        // member has to be an object and not merely present. Its own
        // catch then reports through VWO.collect, which is a no-op here,
        // so a throw of theirs sends no pixel either.
        const win = boot({
            after: '<script>try { (function() {' +
                'var ctId = +new Date();' +
                'var dtc = VWO._.dtc = VWO._.dtc || ' +
                '{ ctId: ctId, js: {}, tag: [] };' +
                'dtc.js[ctId] = function() { window.libCalled = true; };' +
                'dtc.sC = function() { return VWO.get("visitor.id"); };' +
                'window.dcdnRan = true;' +
                '}()); } catch ( ex ) { window.dcdnThrew = String(ex); }' +
                '</script>',
        });
        await settle();
        assert.equal(win.dcdnThrew, undefined, 'their settings file threw');
        assert.equal(win.dcdnRan, true);
        assert.equal(typeof win.VWO._.dtc, 'object');
        // Nothing of theirs runs it, so the tag loop never looks for the
        // coreLib this file does not publish.
        assert.equal(win.libCalled, undefined);
    });

    it('does NOT set their dup-code flag', async ( ) => {
        // window._VWO.sCL is what a real payload checks before applying
        // anything: set, it logs dupCode and returns. A stub that sets it
        // stands the real library down - see extra/adobe-launch.md.
        const win = boot();
        await settle();
        assert.equal(win._VWO, undefined, '_VWO was created');
        assert.equal(win._vwo_mt, undefined, 'their mode was written');
    });

    it('stands aside for their real library, whatever shape it is in',
    async ( ) => {
        // load_co is the test: their settings payload assigns it, and a
        // bare queue from the snippet has it on neither shape. Not
        // Array.isArray, because theirs stays an array once it is up -
        // which is also what this file now is.
        for ( const shape of [
            '{ load_co: function() {}, mine: true }',
            'Object.assign([], { load_co: function() {}, mine: true })',
        ] ) {
            const win = boot({
                before: `<script>window.VWO = ${shape};</script>`,
            });
            await settle();
            assert.equal(win.VWO.mine, true,
                'the real library was replaced: ' + shape);
            assert.equal(win.VWO.get, undefined, shape);
        }
    });

    it('is the array shape their snippet makes', async ( ) => {
        const win = boot();
        await settle();
        assert.equal(Array.isArray(win.VWO), true,
            'a plain object breaks their library - see the test below');
        assert.equal(win.VWO.length, 0);
        // push is theirs, not ours: Array.prototype.push is what their
        // own listener captures and wraps.
        assert.equal(win.VWO.push, win.Array.prototype.push);
    });

    it('adopts the queue their snippet already filled', async ( ) => {
        // The snippet does window.VWO = window.VWO || [], so under the
        // redirect delivery there is an array here already, with whatever
        // the page queued before it.
        const win = boot({
            before: '<script>window.VWO = []; VWO.push(["early", 1]);</script>',
        });
        await settle();
        assert.equal(Array.isArray(win.VWO), true);
        assert.equal(win.VWO.length, 1, 'what the page queued was thrown away');
        assert.equal(win.VWO[0][0], 'early');
        assert.equal(typeof win.VWO.get, 'function');
    });

    it('does not break their library when nothing blocked it', async ( ) => {
        // The case this file has to survive: the scriptlet runs, nothing
        // is blocked, and their real library loads straight after. It
        // takes window.VWO as a queue, sorts it, drains it, then wraps
        // push. A plain object here threw TypeError: e.sort is not a
        // function, and its wrapper then dropped every page push because
        // e[e.length-1] was never what was pushed.
        const win = boot({ after: THEIR_LIB });
        await settle();
        assert.equal(win.sortThrew, undefined, 'their library threw');
        assert.equal(win.sortOk, true);
        win.VWO.push([ 'activate', 2 ]);
        assert.deepEqual([ ...win.handled ], [ 'activate' ],
            'their push listener never saw what a page queued');
    });

    it('hands their library a queue the page filled first', async ( ) => {
        const win = boot({
            before: '<script>window.VWO = []; VWO.push(["config", 1]);' +
                'VWO.push(["track", 2]);</script>',
            after: THEIR_LIB,
        });
        await settle();
        // Theirs sorts config first, then drains: both entries reach it.
        assert.deepEqual([ ...win.handled ], [ 'config', 'track' ],
            'the queue did not survive to their library'
        );
    });

});

describe('filters, vwo', ( ) => {

    let rules = [];

    before(async ( ) => {
        const text = await fs.readFile(HERE, 'utf8');
        rules = text.split('\n')
            .map(line => line.replace(/^\/\/\s*/, '').trim())
            .filter(line => line.startsWith('||'));
    });

    it('names the resource uBO will look for, with the .js', ( ) => {
        assert.equal(rules.length, 1, 'the header rules moved');
        for ( const rule of rules ) {
            assert.ok(rule.endsWith('$script,redirect=vwo.js'), rule);
        }
    });

    it('covers the endpoint a payload has been seen served from', ( ) => {
        const served = 'https://dev.visualwebsiteoptimizer.com/j.php?a=' +
            '1072524&u=https%3A%2F%2Fwww.example.com%2Fa.html&vn=2.1&x=true';
        const pattern = rules[0].slice(2).split('$')[0];
        const host = pattern.split('/')[0];
        const rest = pattern.slice(host.length);
        assert.ok(served.includes('//' + host + rest), served);
    });

    it('does not cover their collection endpoints, which are plain blocks',
    ( ) => {
        // s.gif, e.gif, c.gif, h.gif, l.gif and ee.gif go to collect, and
        // the worker and tag files are never asked for once this stands in.
        for ( const url of [
            'https://dev.visualwebsiteoptimizer.com/s.gif?a=1',
            'https://edge.wingify.net/vanj.js',
            'https://collect.wingify.net/ee.gif?a=1',
        ] ) {
            for ( const rule of rules ) {
                const pattern = rule.slice(2).split('$')[0];
                assert.equal(url.includes(pattern), false, rule + ' | ' + url);
            }
        }
    });

});

describe('extra/vwo.js, taking the page back', ( ) => {

    it('calls their finish and their overlay, and the style goes', async ( ) => {
        const win = boot({ before: SNIPPET });
        await settle();
        assert.equal(win.finishCalls, 1, 'finish was not called exactly once');
        assert.equal(win.overlayCalls, 1, 'the overlay was left up');
        assert.equal(
            win.document.getElementById('_vis_opt_path_hides'), null,
            'the hiding style is still there'
        );
        assert.equal(win._vwo_code.finished(), true,
            'a page asking finished() is told the wrong thing'
        );
    });

    it('reveals a style written after it, as the document arrives',
    async ( ) => {
        // The scriptlet runs at document_start: the snippet below has not
        // run, so the style does not exist yet and a single pass sees
        // nothing. This is the delivery every Chromium user gets.
        const win = boot({ after: SNIPPET });
        assert.equal(win.finishCalls, undefined, 'called before it could be');
        await settle();
        assert.equal(win.finishCalls, 1, 'the page was left hidden');
        assert.equal(
            win.document.getElementById('_vis_opt_path_hides'), null
        );
    });

    it('takes away both of the styles a page can carry', async ( ) => {
        // Their own cleanup indexes querySelectorAll because a page can
        // have two: getElementById only ever finds the first.
        const win = boot({
            after: '<script>for ( var i = 0; i < 2; i += 1 ) {' +
                'var s = document.createElement("style");' +
                's.setAttribute("id", "_vis_opt_path_hides");' +
                'document.head.appendChild(s);' +
                '}</script>',
        });
        await settle();
        assert.equal(
            win.document.querySelectorAll('#_vis_opt_path_hides').length, 0,
            'a hiding style survived'
        );
    });

    it('disarms the timer that would have revealed it late', async ( ) => {
        // A real one is armed for settings_tolerance, 2000ms by default.
        // The test has to outlive it to mean anything: at 2000ms the suite
        // finished first and the assertion passed whether or not the timer
        // had been cleared, which the sweep caught.
        const win = boot({
            before: '<script>window._vwo_code = { finish: function() {} };' +
                'window._vwo_settings_timer = setTimeout(function() {' +
                'window.timerFired = true;' +
                '}, 10);</script>',
        });
        await settle(80);
        assert.equal(win.timerFired, undefined, 'the timer was left armed');
    });

    it('takes both styles away in the one pass, not over several',
    async ( ) => {
        // Asserted before any deferred pass runs: with getElementById one
        // of the two survives this pass, and on a page whose readyState is
        // already past loading there is no second pass to catch it.
        const win = boot({
            before: '<script>for ( var i = 0; i < 2; i += 1 ) {' +
                'var s = document.createElement("style");' +
                's.setAttribute("id", "_vis_opt_path_hides");' +
                'document.head.appendChild(s);' +
                '}</script>',
        });
        assert.equal(
            win.document.querySelectorAll('#_vis_opt_path_hides').length, 0,
            'a hiding style survived the pass that should have taken it'
        );
    });

    it('leaves no observer behind, and watches only the head', async ( ) => {
        const { counts, scope } = bootWatched();
        await settle();
        assert.equal(counts.made, 1);
        assert.equal(counts.disconnected, 1, 'the watch was left running');
        assert.deepEqual(scope, [ { head: true, subtree: false } ],
            'it watched more than their style can appear in'
        );
    });

    it('survives a finish that throws, and still takes the style away',
    async ( ) => {
        const win = boot({
            before: '<script>window._vwo_code = {' +
                'finish: function() { throw new Error("theirs"); }' +
                '};</script>' +
                '<script>var s = document.createElement("style");' +
                's.setAttribute("id", "_vis_opt_path_hides");' +
                'document.head.appendChild(s);</script>',
        });
        await settle();
        assert.equal(
            win.document.getElementById('_vis_opt_path_hides'), null,
            'a throwing finish left the page hidden'
        );
    });

    it('leaves a page that was never hidden alone', async ( ) => {
        const win = boot({ body: '<p id="content">x</p>' });
        await settle();
        assert.equal(win.document.getElementById('content').textContent, 'x');
        assert.equal(win.finishCalls, undefined);
    });

});
