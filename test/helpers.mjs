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

export const filtersText = await fs.readFile(
    path.join(root, 'filters', 'onetrust.txt'), 'utf8'
);

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

export const settle = (ms = 30) => new Promise(resolve => {
    setTimeout(resolve, ms);
});
