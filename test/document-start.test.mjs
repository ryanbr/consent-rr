/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    The one test here that no fixture can stand in for: a resource runs where
    the CMP's own script tag is, which is in <head>, and uBlock Origin runs it
    at document_start. Everything a page parks for the CMP to free is below
    that point and has not been parsed yet.

    Every other test in this repo hands the resource a document that is already
    built, so a resource that frees parked tags in one synchronous pass passes
    them all and frees nothing on a real page. That is exactly what shipped, in
    five resources at once, until this file was written.

    So these run the built resource the way the browser does: as an inline
    script in <head>, parsed by jsdom with the parked tag below it, and nothing
    is asserted until load. runScripts is 'dangerously' here for that reason -
    the parser has to execute the resource at the point it reaches it, which is
    the whole subject of the test.

*/

import { strict as assert } from 'node:assert';
import { before, describe, it } from 'node:test';
import { JSDOM, VirtualConsole } from 'jsdom';
import { loadResources, settle } from './helpers.mjs';

let resources;

before(async ( ) => {
    resources = await loadResources();
});

// The resource inline in <head>, the parked tag in the body, and the page's
// own settings ahead of both - which is where a WordPress plugin puts them.
const parse = (name, url, parked, settings = '') => {
    const virtualConsole = new VirtualConsole();
    const lines = [];
    virtualConsole.on('info', message => { lines.push(String(message)); });
    const html = '<!doctype html><html lang="en"><head>' +
        (settings !== '' ? '<script>' + settings + '</script>' : '') +
        '<script>' + resources.get(name) + '</script>' +
        '</head><body>' + parked + '<p id="content">x</p></body></html>';
    const dom = new JSDOM(html, { url, runScripts: 'dangerously', virtualConsole });
    return { dom, doc: dom.window.document, lines };
};

const loaded = dom => new Promise(resolve => {
    if ( dom.window.document.readyState === 'complete' ) { return resolve(); }
    dom.window.addEventListener('load', resolve);
});

const CASES = [
    {
        name: 'cookiez-reject-unblock.js',
        url: 'https://glockenklang.de/page',
        settings: 'window.cookiezBannerSettings = { cookiesHash: "h",' +
            ' settings: { consentExpiration: 180 } };',
        parked: '<script id="p" type="text/plain" data-cc-category="analytics"' +
            ' data-cc-src="https://a.example/a.js"></script>',
        // The copy drops the type and takes its src from data-cc-src.
        freed: doc => doc.querySelectorAll('script[src="https://a.example/a.js"]').length,
    },
    {
        name: 'cookieyes-reject-unblock.js',
        url: 'https://www.fontsquirrel.com/page',
        parked: '<script id="p" type="text/plain"' +
            ' data-cookieyes="cookieyes-analytics" src="https://a.example/a.js"></script>',
        freed: doc => doc.querySelectorAll('script[type="text/javascript"]').length,
    },
    {
        name: 'consentmanager-reject-unblock.js',
        url: 'https://www.fasthosts.co.uk/page',
        parked: '<script id="p" class="cmplazyload" type="text/plain"' +
            ' data-cmp-src="https://a.example/a.js"></script>',
        // Theirs leaves the parked node and marks the copy.
        freed: doc => doc.querySelectorAll('script[data-cmp-ab="1"]').length,
    },
    {
        name: 'complianz-accept.js',
        url: 'https://example.org/page',
        parked: '<script id="p" type="text/plain" data-category="statistics"' +
            ' data-src="https://a.example/a.js"></script>',
        freed: doc => doc.querySelectorAll('script[src="https://a.example/a.js"]').length,
    },
    {
        name: 'termly-reject.js',
        url: 'https://example.org/page',
        parked: '<script id="p" type="text/plain" data-categories="essential"' +
            ' data-src="https://a.example/a.js" data-autoblocked="1"></script>',
        freed: doc => doc.querySelectorAll('script[src="https://a.example/a.js"]').length,
    },
];

describe('at document_start, with the page below still unparsed', ( ) => {
    for ( const testCase of CASES ) {
        it(testCase.name + ' frees what the parser delivers after it', async ( ) => {
            const { dom, doc } = parse(
                testCase.name, testCase.url, testCase.parked,
                testCase.settings || ''
            );
            // Nothing is there to free at the point the resource runs.
            await loaded(dom);
            await settle(200);
            assert.equal(testCase.freed(doc), 1);
        });

        it(testCase.name + ' does not then free it again, over and over', async ( ) => {
            const { dom, doc } = parse(
                testCase.name, testCase.url, testCase.parked,
                testCase.settings || ''
            );
            await loaded(dom);
            await settle(200);
            const settled = doc.querySelectorAll('script').length;
            await settle(300);
            assert.equal(doc.querySelectorAll('script').length, settled);
        });
    }

    // The DOMContentLoaded pass is the one that is not debounced, and nothing
    // above can tell it apart from the observer's: by the time load fires, a
    // 100ms debounce has had its chance too. So this looks at the one moment
    // where they differ - the microtask right after DOMContentLoaded has been
    // dispatched, which is after the resource's own handler for it and well
    // before any timer. A resource that waits for the debounce fails here.
    it('frees at DOMContentLoaded, not a debounce later', async ( ) => {
        const parked = '<script id="p" type="text/plain"' +
            ' data-cc-category="analytics"' +
            ' data-cc-src="https://a.example/a.js"></script>';
        const html = '<!doctype html><html lang="en"><head>' +
            '<script>window.cookiezBannerSettings = { cookiesHash: "h" };</script>' +
            '<script>' + resources.get('cookiez-reject-unblock.js') + '</script>' +
            '</head><body>' + parked + '<p id="content">x</p></body></html>';
        let atReady;
        const dom = new JSDOM(html, {
            url: 'https://glockenklang.de/page',
            runScripts: 'dangerously',
            virtualConsole: new VirtualConsole(),
            // Registered before the resource's own listener, so the check it
            // queues runs after every synchronous DOMContentLoaded handler.
            beforeParse(window) {
                window.document.addEventListener('DOMContentLoaded', ( ) => {
                    Promise.resolve().then(( ) => {
                        atReady = window.document.querySelectorAll(
                            'script[src="https://a.example/a.js"]'
                        ).length;
                    });
                }, { once: true });
            },
        });
        await loaded(dom);
        assert.equal(atReady, 1);
    });

    it('reports a deferred free on its own line', async ( ) => {
        const { dom, lines } = parse(
            'cookiez-reject-unblock.js', 'https://glockenklang.de/page',
            '<script id="p" type="text/plain" data-cc-category="analytics"' +
            ' data-cc-src="https://a.example/a.js"></script>',
            'window.cookiezBannerSettings = { cookiesHash: "h" };'
        );
        await loaded(dom);
        await settle(200);
        assert.equal(
            lines.filter(line => / freed=1 deferred$/.test(line)).length, 1,
            lines.join('\n')
        );
    });
});
