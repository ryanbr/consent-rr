/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    Test helpers. Resources are read back out of dist/consent-rr.txt with the
    same line rules uBlock Origin applies, so the tests exercise the artifact
    that ships rather than the sources it was built from.

*/

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { JSDOM } from 'jsdom';

const root = path.join(import.meta.dirname, '..');

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

export const loadResources = async ( ) => parseResources(
    await fs.readFile(path.join(root, 'dist', 'consent-rr.txt'), 'utf8')
);

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
    });
    if ( typeof before === 'function' ) { before(dom.window); }
    return dom;
};

export const run = (code, html = fixture, before = undefined) => {
    const dom = openPage(html, before);
    dom.window.eval(code);
    return dom.window;
};

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
