/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    WHAT A RESOURCE DOES ON A PAGE THAT IS NOT ITS CMP'S.

    A $redirect= rule naming a user resource cannot work on Chromium. uBO
    gives one of its own resources a warURL and serves it from the extension,
    while one of yours has only its bytes, so toURL() can only return a data:
    URI - and Chromium refuses to redirect a request to data:. Reported from
    the field as

        GET https://transcend-cdn.com/cm/<id>/airgap.js net::ERR_UNSAFE_REDIRECT

    with neither the CMP's script nor the replacement loaded. What works there
    is scriptlet injection, and a filter list wants that global - one line for
    every site rather than a line per site - which means the resource lands on
    pages that have never heard of its CMP.

    So every resource here has to be inert on such a page: no global carrying
    a value, no cookie, no storage, no change to the document, not a word on
    the console. Measured when this file was written: 2 of 46 were.

    The list below is the ones still to do, and it is meant to shrink. A
    resource gated with src/shared/lib/present.js comes off it.

*/

import { strict as assert } from 'node:assert';
import { before, describe, it } from 'node:test';
import { JSDOM, VirtualConsole } from 'jsdom';
import { loadResources, settle } from './helpers.mjs';

// Not yet gated: injected globally, each of these does something on a page
// that is not its CMP's. Ordered as the directory is.
const UNGATED = new Set([
    'ampconsent-reject-unblock.js', 'ampconsent-reject.js',
    'appconsent-accept.js', 'appconsent-reject.js',
    'chcookieconsent-reject.js',
    'civic-reject-unblock.js', 'civic-reject.js',
    'complianz-accept.js', 'complianz-reject.js',
    'consentmanager-reject-unblock.js', 'consentmanager-reject.js',
    'cookiebot-reject.js',
    'cookieconsent-accept.js', 'cookieconsent-reject-unblock.js',
    'cookieconsent-reject.js',
    'cookieinformation-reject.js',
    'cookielawinfo-reject.js',
    'cookiescript-reject.js',
    'cookieyes-reject-unblock.js', 'cookieyes-reject.js',
    'cookiez-reject-unblock.js', 'cookiez-reject.js',
    'didomi-accept.js', 'didomi-reject.js',
    'fundingchoices-reject.js',
    'inmobi-reject.js',
    'iubenda-accept.js', 'iubenda-reject-unblock.js', 'iubenda-reject.js',
    'ketch-reject-unblock.js', 'ketch-reject.js',
    'onetrust-accept.js', 'onetrust-reject-unblock.js', 'onetrust-reject.js',
    'osano-reject.js',
    'pubtech-reject.js',
    'securiti-reject.js',
    'tarteaucitron-reject-unblock.js', 'tarteaucitron-reject.js',
    'termly-reject.js',
    'usercentrics-reject.js',
    'webtoffee-reject-unblock.js', 'webtoffee-reject.js',
    'zdconsent-accept.js', 'zdconsent-reject.js',
]);

const PAGE_BODY = '<p id="content">an ordinary page</p>';

let resources;

before(async ( ) => {
    resources = await loadResources();
});

// The resource injected into a page with no CMP of any kind, the way a global
// scriptlet rule puts it there.
const onAnyPage = async name => {
    const virtualConsole = new VirtualConsole();
    const said = [];
    for ( const kind of [ 'info', 'log', 'warn', 'error' ] ) {
        virtualConsole.on(kind, m => said.push(kind + ': ' + String(m)));
    }
    virtualConsole.on('jsdomError', e => {
        said.push('threw: ' + String(e.message).split('\n')[0]);
    });
    const dom = new JSDOM(
        '<!doctype html><html lang="en"><head><title>t</title></head>' +
        '<body>' + PAGE_BODY + '</body></html>',
        {
            url: 'https://unrelated.example/page', runScripts: 'dangerously',
            virtualConsole, pretendToBeVisual: true,
        }
    );
    const w = dom.window;
    const before_ = new Set(Object.getOwnPropertyNames(w));
    // Injected the way uBO injects a scriptlet: an inline script element,
    // which leaves document.currentScript carrying an empty src. Through
    // eval it would be null instead, and a resource that acts on being
    // served in place of a file could not be told apart from one that does
    // not look at all.
    const tag = w.document.createElement('script');
    tag.textContent = resources.get(name);
    w.document.head.append(tag);
    tag.remove();
    await settle(1300);
    // A name defined as an accessor still reading undefined is how the gate
    // waits for a CMP to define its own global; a name carrying a value is a
    // global this put on somebody else's page.
    const valued = Object.getOwnPropertyNames(w)
        .filter(key => key !== '__consentRRTag')
        .filter(key => before_.has(key) === false)
        .filter(key => {
            try {
                return w[key] !== undefined;
            } catch ( ex ) {
                return true;
            }
        });
    let storage = [];
    try {
        storage = Object.keys(w.localStorage).concat(
            Object.keys(w.sessionStorage)
        );
    } catch ( ex ) {
    }
    const out = {
        globals: valued,
        cookie: w.document.cookie,
        storage: storage,
        dom: w.document.body.innerHTML,
        said: said,
    };
    dom.window.close();
    return out;
};

/******************************************************************************/

describe('every resource, injected on a page that has no CMP', ( ) => {
    it('has a list of the ones still to gate, and no stale names', async ( ) => {
        const names = Array.from(resources.keys());
        for ( const name of UNGATED ) {
            assert.ok(names.includes(name), name + ' is not a resource');
        }
    });

    it('is inert where it has been gated', async ( ) => {
        const names = Array.from(resources.keys())
            .filter(name => UNGATED.has(name) === false);
        assert.ok(names.length !== 0);
        for ( const name of names ) {
            const out = await onAnyPage(name);
            assert.deepEqual(out.globals, [], name + ' put a global there');
            assert.equal(out.cookie, '', name + ' wrote a cookie');
            assert.deepEqual(out.storage, [], name + ' wrote storage');
            assert.equal(out.dom, PAGE_BODY, name + ' changed the document');
            assert.deepEqual(out.said, [], name + ' said something');
        }
    });

    // The gate is what makes that true, so a resource coming off the list
    // without one would be a resource that merely happens to be quiet.
    it('names the gate in every resource that is off the list', ( ) => {
        for ( const [ name, code ] of resources ) {
            if ( UNGATED.has(name) ) { continue; }
            if ( name.startsWith('ampconsent') ) { continue; }
            assert.ok(
                code.includes('consentRRWhenPresent'),
                name + ' is off the list without the gate'
            );
        }
    });
});
