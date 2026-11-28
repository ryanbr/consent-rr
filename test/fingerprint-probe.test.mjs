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

    it('says nothing was touched when nothing was', async ( ) => {
        const win = boot();
        await settle();
        assert.match(reportOf(win), /0 surfaces touched/);
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
