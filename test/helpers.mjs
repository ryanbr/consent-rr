/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    Test helpers. Resources are read back out of the dist/*.js files with the
    same line rules uBlock Origin applies, and joined the way uBO joins the
    contents of several userResourcesLocation URLs, so the tests exercise the
    artifacts that ship rather than the sources they were built from.

*/

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

const root = path.join(import.meta.dirname, '..');

// Every list, so the token guards cover each one rather than only the first.
export const filtersText = (await Promise.all(
    (await fs.readdir(path.join(root, 'filters')))
        .filter(name => name.endsWith('.txt'))
        .sort()
        .map(name => fs.readFile(path.join(root, 'filters', name), 'utf8'))
)).join('\n');

const manifest = JSON.parse(
    await fs.readFile(path.join(root, 'package.json'), 'utf8')
);

// The repo's release version, and the per-consent-manager resource versions.
export const version = manifest.version;
export const versions = manifest.resourceVersions;

export const parseResources = text => {
    const resources = new Map();
    let name;
    let lines = [];
    const finish = ( ) => {
        if ( name === undefined ) { return; }
        resources.set(name, lines.join('\n'));
        name = undefined;
        lines = [];
    };
    for ( const line of `${text}\n\n`.split('\n') ) {
        if ( line.startsWith('#') ) { continue; }
        if ( line.startsWith('// ') ) { continue; }
        if ( name === undefined ) {
            if ( line.startsWith('/// ') ) { name = line.slice(4).trim(); }
            continue;
        }
        if ( line.startsWith('/// ') ) { continue; }
        if ( /\S/.test(line) ) {
            lines.push(line);
            continue;
        }
        finish();
    }
    finish();
    return resources;
};

export const loadResources = async ( ) => {
    const dir = path.join(root, 'dist');
    const names = (await fs.readdir(dir)).filter(n => n.endsWith('.js')).sort();
    const files = await Promise.all(
        names.map(name => fs.readFile(path.join(dir, name), 'utf8'))
    );
    return parseResources(files.join('\n\n'));
};

export const fixture = `<!DOCTYPE html><html><head>
<script id="gated-inline" type="text/plain" class="optanon-category-C0002">window.inlineRan = true;</script>
<script id="gated-src" type="text/plain" class="optanon-category-C0004-BG123" src="https://tracker.example/t.js"></script>
</head><body>
<div id="onetrust-consent-sdk"><div id="onetrust-banner-sdk">banner</div></div>
<div class="onetrust-pc-dark-filter"></div>
<iframe id="gated-frame" class="optanon-category-C0003" data-src="https://player.example/embed"></iframe>
<img id="gated-img" class="ot-vscat-V2" data-src="https://pixel.example/p.gif">
<p id="content">hello</p>
</body></html>`;

// runScripts: 'outside-only' gives window.eval without running the page's own
// scripts, so a reactivated tag can be inspected instead of executed.
export const openPage = (html = fixture, before = undefined) => {
    const dom = new JSDOM(html, {
        runScripts: 'outside-only',
        url: 'https://example.com/',
        // Dropped rather than forwarded: the resources announce themselves on
        // load, and a test that wants the line stubs console.info itself.
        virtualConsole: new VirtualConsole(),
    });
    if ( typeof before === 'function' ) { before(dom.window); }
    return dom;
};

export const run = (code, html = fixture, before = undefined) => {
    const dom = openPage(html, before);
    dom.window.eval(code);
    return dom.window;
};

// The jsdom instance rather than its window, for tests that need the cookie jar
// to see a cookie's scope - document.cookie does not expose it.
export const runDom = (code, url, html = fixture, before = undefined) => {
    const dom = new JSDOM(html, {
        runScripts: 'outside-only',
        url,
        virtualConsole: new VirtualConsole(),
    });
    if ( typeof before === 'function' ) { before(dom.window); }
    dom.window.eval(code);
    return dom;
};

export const cookiesInJar = (dom, url, name) =>
    dom.cookieJar.getCookiesSync(url).filter(cookie => cookie.key === name);

export const cookies = win => {
    const out = new Map();
    for ( const cookie of String(win.document.cookie).split(';') ) {
        const pos = cookie.indexOf('=');
        if ( pos === -1 ) { continue; }
        out.set(cookie.slice(0, pos).trim(), cookie.slice(pos + 1).trim());
    }
    return out;
};

export const consentParams = win =>
    new URLSearchParams(cookies(win).get('OptanonConsent') || '');

// Counting what a resource does with the page's MutationObserver: made,
// observed and - the one that matters for a one-shot install - disconnected.
// The real one still runs underneath, so the resource behaves as it would.
export const watchObservers = win => {
    const counts = { made: 0, observed: 0, disconnected: 0 };
    const Real = win.MutationObserver;
    win.MutationObserver = class {
        constructor(callback) {
            counts.made += 1;
            this.inner = new Real(callback);
        }
        observe(...args) {
            counts.observed += 1;
            this.inner.observe(...args);
        }
        disconnect() {
            counts.disconnected += 1;
            this.inner.disconnect();
        }
        takeRecords() {
            return this.inner.takeRecords();
        }
    };
    return counts;
};

// A prior TC string on an older vendor list: patched rather than re-encoded,
// because @iabtcf refuses to encode a model without a GVL, and a string a CMP
// wrote on an older list is this one with those twelve bits changed.
export const withVendorListVersion = (tcString, value) => {
    const B64 =
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const parts = tcString.split('.');
    let bits = '';
    for ( const character of parts[0] ) {
        bits += B64.indexOf(character).toString(2).padStart(6, '0');
    }
    bits = bits.slice(0, 120) + value.toString(2).padStart(12, '0') +
        bits.slice(132);
    while ( bits.length % 6 !== 0 ) { bits += '0'; }
    let out = '';
    for ( let i = 0; i < bits.length; i += 6 ) {
        out += B64.charAt(parseInt(bits.slice(i, i + 6), 2));
    }
    parts[0] = out;
    return parts.join('.');
};

export const settle = (ms = 30) => new Promise(resolve => {
    setTimeout(resolve, ms);
});
