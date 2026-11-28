/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    extra/fingerprint-probe.js is a diagnostic scriptlet, not a replacement:
    it must report what a page touches and change nothing. The second of
    those is the property worth testing hardest - a probe that alters an
    answer is measuring itself.

*/

import { strict as assert } from 'node:assert';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { before, describe, it } from 'node:test';
import { JSDOM, VirtualConsole } from 'jsdom';
import { parseResources, settle } from './helpers.mjs';

const HERE = path.join(
    import.meta.dirname, '..', 'extra', 'fingerprint-probe.js'
);
let code = '';

before(async ( ) => {
    code = parseResources(await fs.readFile(HERE, 'utf8'))
        .get('fingerprint-probe.js');
    assert.ok(typeof code === 'string' && code.length !== 0);
});

const boot = (after = '', beforeParse = undefined) => {
    const dom = new JSDOM(
        `<!DOCTYPE html><html><head><script>${code}</script>${after}` +
        '</head><body><p>x</p></body></html>',
        {
            runScripts: 'dangerously',
            url: 'https://shop.example.com/page',
            virtualConsole: new VirtualConsole(),
            beforeParse,
        }
    );
    return dom.window;
};

// The post-load pass waits five seconds, which is longer than the sweep's
// per-test cap, so the test cannot simply wait for it. Nor can it just
// collapse the delay: jsdom fires load during the constructor, so the
// pass would run before the test had read its baseline. The callback is
// held instead and fired on demand, which also makes the assertion exact.
const holdLatePass = held => win => {
    const real = win.setTimeout;
    win.setTimeout = (fn, ms, ...rest) => {
        if ( ms === 5000 ) { held.fn = fn; return 0; }
        return real(fn, ms, ...rest);
    };
};

const reportOf = win => (win.__fpLog || []).join('\n');

describe('extra/fingerprint-probe.js', ( ) => {

    it('changes no answer it watches', async ( ) => {
        // The whole point: every wrapper returns what the real one
        // returned. A probe that alters an answer measures itself, and
        // worse, can break the page it is diagnosing.
        const win = boot();
        await settle();
        const nav = win.navigator;
        assert.equal(win.eval('navigator.userAgent'), nav.userAgent);
        assert.equal(typeof win.eval('new Date().getTimezoneOffset()'),
            'number');
        assert.equal(win.eval('typeof navigator.languages'), 'object');
        assert.equal(win.eval('screen.width'), win.screen.width);
        // And a listener it counted still fires.
        win.eval('window.heard = 0;' +
            'document.addEventListener("mousemove", function() {' +
            'window.heard += 1; });' +
            'document.dispatchEvent(new window.MouseEvent("mousemove"));');
        assert.equal(win.heard, 1, 'the listener it counted never ran');
    });

    it('counts what was read, with the caller', async ( ) => {
        const win = boot(
            '<script>void navigator.userAgent; void navigator.userAgent;' +
            'void navigator.platform;</script>'
        );
        await settle();
        const report = reportOf(win);
        assert.match(report, /2\s+navigator\.userAgent/);
        assert.match(report, /1\s+navigator\.platform/);
        assert.match(report, /first from https:\/\/shop\.example\.com/);
    });

    it('does not announce itself to the thing it is watching', async ( ) => {
        // A sensor that spots a wrapper may stop collecting, and then the
        // report says less than the page really does. These are the two
        // one-line checks that flipped before the masking went in.
        const win = boot();
        await settle();
        assert.equal(
            win.eval('String(Date.prototype.getTimezoneOffset)' +
                '.includes("[native code]")'),
            true, 'a wrapper answers its own source'
        );
        assert.equal(
            win.eval('window.addEventListener === ' +
                'EventTarget.prototype.addEventListener'),
            true, 'the listener wrap moved off the prototype'
        );
        assert.equal(
            win.eval('Date.prototype.getTimezoneOffset.name'),
            'getTimezoneOffset', 'the function name was lost'
        );
    });

    it('counts listeners on the window and document, not on elements',
    async ( ) => {
        // The wrap is on EventTarget.prototype now, so every element goes
        // through it - the filter is what keeps the signal the same.
        const win = boot(
            '<script>document.addEventListener("mousemove", function(){});' +
            'document.createElement("div")' +
            '.addEventListener("mousemove", function(){});</script>'
        );
        await settle();
        const report = reportOf(win);
        assert.match(report, /1\s+listens for mousemove/,
            'an element listener was counted, or the document one was not');
    });

    it('counts the behaviour it listens for, and nothing else',
    async ( ) => {
        const win = boot(
            '<script>document.addEventListener("mousemove", function(){});' +
            'window.addEventListener("devicemotion", function(){});' +
            'document.addEventListener("somethingelse", function(){});' +
            '</script>'
        );
        await settle();
        const report = reportOf(win);
        assert.match(report, /listens for mousemove/);
        assert.match(report, /listens for devicemotion/);
        assert.equal(/somethingelse/.test(report), false,
            'it counted an event that is not behaviour');
    });

    it('blames the caller and never itself', async ( ) => {
        const win = boot('<script>void navigator.userAgent;</script>');
        await settle();
        // The attributions only: the report's own header line says
        // fingerprint-probe, which the first version of this test
        // matched and failed on.
        const blamed = (win.__fpLog || [])
            .filter(line => line.includes('first from'))
            .map(line => line.slice(line.indexOf('first from')));
        assert.ok(blamed.length !== 0, 'nothing was attributed at all');
        for ( const line of blamed ) {
            assert.equal(/fingerprint-probe/.test(line), false,
                'it reported itself as the caller: ' + line);
        }
    });

    it('says when a sensor ran but touched nothing it watches', async ( ) => {
        // The reading that masking cannot give: their cookie is set by
        // the edge in response to a payload, so a cookie with an empty
        // table means the sensor probably noticed this and stopped - not
        // that the page collects nothing.
        const withTheirCookie = win => {
            win.document.cookie = '_abck=x';
            win.document.cookie = 'bm_sz=y';
        };
        const win = boot('', withTheirCookie);
        await settle();
        const report = reportOf(win);
        assert.match(report, /their cookies: _abck,bm_sz/);
        assert.match(report, /possibly detected, not as clean/);
    });

    it('does not cry detection when their cookie answers too', async ( ) => {
        const win = boot('<script>void navigator.userAgent;</script>',
            win2 => { win2.document.cookie = '_abck=x'; });
        await settle();
        const report = reportOf(win);
        assert.match(report, /their cookies: _abck/);
        assert.equal(/possibly detected/.test(report), false,
            'it cried detection while it was plainly collecting');
    });

    it('says nothing was touched when nothing was', async ( ) => {
        const win = boot();
        await settle();
        assert.match(reportOf(win), /0 surfaces touched/);
        assert.match(reportOf(win), /their cookies: none/);
        assert.equal(/possibly detected/.test(reportOf(win)), false,
            'no sensor is not the same as a detected one');
    });

    it('survives a page where the apis are missing', async ( ) => {
        // jsdom has no AudioContext, no WebGL and no mediaDevices, which
        // is the same shape as an older browser - nothing may throw.
        const win = boot();
        await settle();
        assert.equal(win.AudioContext, undefined);
        assert.ok(Array.isArray(win.__fpLog));
        assert.match(reportOf(win), /fingerprint-probe/);
    });

    it('reports again after load, for a sensor that waits', async ( ) => {
        // Their sensors often wait for an idle moment, which is why the
        // second pass exists. Waiting the real five seconds made this
        // test longer than the sweep's per-test cap, so it failed there
        // unmutated and the mutation that removes the second report was
        // never given a fair run. The delay is collapsed instead.
        const held = {};
        const win = boot('', holdLatePass(held));
        await settle();
        const first = (win.__fpLog || []).length;
        assert.equal(typeof held.fn, 'function',
            'it never scheduled a pass after load');
        // A read that happens after the first report, which only the
        // second pass can carry.
        win.eval('void navigator.userAgent;');
        held.fn();
        assert.ok((win.__fpLog || []).length > first,
            'it never reported a second time');
        assert.match(reportOf(win), /1\s+navigator\.userAgent/);
    });

    // jsdom has neither matchMedia nor userAgentData, so a page that uses
    // them has to be given them first - which is also the only way to
    // check the probe wraps what a real browser carries.
    const withModern = win => {
        win.matchMedia = query => ({ matches: false, media: String(query) });
        // One object, as a browser hands back: a getter that builds a new
        // one each time means the probe wraps a throwaway, which is the
        // fixture lying rather than the probe failing.
        const uaData = { getHighEntropyValues: async ( ) => ({}) };
        Object.defineProperty(win.navigator, 'userAgentData', {
            configurable: true,
            get: ( ) => uaData,
        });
    };

    it('names the media feature, not just the query', async ( ) => {
        // Eight of the catalogue's signals are media queries - colour
        // gamut, contrast, forced colours, hdr, inverted colours,
        // monochrome, reduced motion, reduced transparency - so the
        // report has to say which was asked for.
        const win = boot(
            '<script>window.m = matchMedia("(prefers-color-scheme: dark)").matches;' +
            'matchMedia("(color-gamut: p3)");' +
            'matchMedia("(inverted-colors: inverted)");' +
            'matchMedia("(min-width: 600px)");</script>',
            withModern
        );
        await settle();
        const report = reportOf(win);
        // The fixture echoes the query back, so this catches a wrapper
        // that answers for itself instead of passing the call through -
        // checking only that .matches is a boolean does not.
        assert.equal(typeof win.m, 'boolean', 'it changed what matchMedia said');
        assert.equal(
            win.eval('matchMedia("(color-gamut: p3)").media'),
            '(color-gamut: p3)',
            'the wrapper answered instead of passing the call through'
        );
        assert.match(report, /matchMedia prefers-color-scheme/);
        assert.match(report, /matchMedia color-gamut/);
        assert.match(report, /matchMedia inverted-colors/);
        assert.match(report, /matchMedia other/);
    });

    it('counts the modern high-entropy call, and only the page', async ( ) => {
        const win = boot(
            // Through the saved reference, so the property is read once
            // and the count is unambiguous - reading it again to make the
            // call is what made the first version of this expect 1 and
            // see 2, which was the page's doing and not the probe's.
            '<script>window.uad = navigator.userAgentData;' +
            'window.uad.getHighEntropyValues(["model"]);</script>',
            withModern
        );
        await settle();
        const report = reportOf(win);
        // One read, not two: wrapping getHighEntropyValues has to happen
        // before the watcher on userAgentData exists, or the probe counts
        // its own reach-through as a page's read.
        assert.match(report, /1\s+navigator\.userAgentData/);
        assert.match(report, /userAgentData\.getHighEntropyValues/);
        assert.equal(typeof win.uad, 'object');
    });

    it('survives a bare call into a native that checks its this',
    async ( ) => {
        // matchMedia(q) is the usual form, and a bare call lands
        // undefined as this inside a strict wrapper - which a native
        // method rejects with Illegal invocation in Chrome. jsdom does
        // not, so the stand-in here checks the way a browser would.
        const strictNative = win => {
            win.matchMedia = function(query) {
                if ( this === undefined ) {
                    throw new TypeError('Illegal invocation');
                }
                return { matches: false, media: String(query) };
            };
        };
        const win = boot(
            '<script>try { window.mm = matchMedia("(min-width: 1px)").media; }' +
            'catch ( e ) { window.mm = "threw: " + e.message; }</script>',
            strictNative
        );
        await settle();
        assert.equal(win.mm, '(min-width: 1px)',
            'a bare call through the wrapper broke');
        assert.match(reportOf(win), /matchMedia other/);
    });

    it('keeps a bare window method working, and its listener too',
    async ( ) => {
        // openDatabase(...) and addEventListener(...) are called bare as
        // a matter of course, and a bare call lands undefined as this
        // inside a strict wrapper. Chrome's natives reject that; these
        // stand-ins reject it the same way, because jsdom will not.
        const strictNatives = win => {
            win.openDatabase = function(name) {
                if ( this === undefined ) {
                    throw new TypeError('Illegal invocation');
                }
                return { name: String(name) };
            };
            // On the prototype, where the probe now wraps: an own
            // property on window would shadow that wrap and the call
            // would never reach it.
            const proto = win.EventTarget.prototype;
            const add = proto.addEventListener;
            proto.addEventListener = function(type, ...rest) {
                if ( this === undefined ) {
                    throw new TypeError('Illegal invocation');
                }
                return add.call(this, type, ...rest);
            };
        };
        const win = boot(
            '<script>try { window.db = openDatabase("d").name; }' +
            'catch ( e ) { window.db = "threw: " + e.message; }' +
            'try { addEventListener("mousemove", function(){});' +
            'window.ev = "ok"; }' +
            'catch ( e ) { window.ev = "threw: " + e.message; }</script>',
            strictNatives
        );
        await settle();
        assert.equal(win.db, 'd', 'a bare window method broke');
        assert.equal(win.ev, 'ok', 'a bare addEventListener broke');
        assert.match(reportOf(win), /openDatabase/);
        assert.match(reportOf(win), /listens for mousemove/);
    });

    it('leaves a property as enumerable as it found it', async ( ) => {
        // The value path redefines with a getter, and a definition that
        // drops enumerable hides the property from for-in and
        // Object.keys - a change to the page rather than a measurement.
        const withOwn = win => {
            Object.defineProperty(win.navigator, 'cpuClass', {
                configurable: true,
                enumerable: true,
                writable: true,
                value: 'x86',
            });
        };
        const win = boot('<script>void navigator.cpuClass;</script>', withOwn);
        await settle();
        assert.equal(win.eval('Object.keys(navigator).includes("cpuClass")'),
            true, 'it stopped being enumerable');
        assert.equal(win.navigator.cpuClass, 'x86', 'it changed the value');
        assert.match(reportOf(win), /1\s+navigator\.cpuClass/);
    });

    it('watches a property carried by the instance, not the prototype',
    async ( ) => {
        // localStorage and userAgentData are the instance's own in some
        // engines. Redefining on the prototype then leaves that own
        // property shadowing the watcher, which is silence rather than an
        // error - four surfaces went unseen that way.
        const win = boot('<script>void window.localStorage;</script>');
        await settle();
        assert.match(reportOf(win), /1\s+localStorage/);
    });

    it('counts the canvas and the clock', async ( ) => {
        const win = boot(
            '<script>var c = document.createElement("canvas");' +
            'c.getContext("2d"); c.toDataURL();' +
            'new Date().getTimezoneOffset();</script>'
        );
        await settle();
        const report = reportOf(win);
        assert.match(report, /1\s+canvas\.getContext/);
        assert.match(report, /1\s+canvas\.toDataURL/);
        assert.match(report, /1\s+Date\.getTimezoneOffset/);
    });

});
