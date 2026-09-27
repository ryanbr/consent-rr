/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

*/

import { strict as assert } from 'node:assert';
import { before, describe, it } from 'node:test';
import { cookies, cookiesInJar, loadResources, runDom, settle } from './helpers.mjs';

const URL = 'https://www.almbrand.dk/';

// Parked the way Cookie Information parks: no src at all, the real url in
// data-consent-src, the category in data-category-consent.
const PAGE = '<html lang="da"><head>' +
    '<script id="nec" data-category-consent="cookie_cat_necessary" ' +
    'data-consent-src="https://n.example/n.js"></' + 'script>' +
    '<script id="stat" data-category-consent="cookie_cat_statistic" ' +
    'data-consent-src="https://s.example/s.js"></' + 'script>' +
    '</head><body>' +
    '<iframe id="yt" data-category-consent="cookie_cat_marketing" ' +
    'data-consent-src="https://www.youtube.com/embed/x"></iframe>' +
    '<img id="px" data-category-consent="cookie_cat_unclassified" ' +
    'data-consent-src="https://p.example/p.gif">' +
    '<p id="content">x</p></body></html>';

let reject;

before(async ( ) => {
    reject = (await loadResources()).get('cookieinformation-reject.js');
});

const open = (html = PAGE, before_ = undefined) => {
    const dom = runDom(reject, URL, html, before_);
    return dom;
};
const state = (dom, id) => {
    const el = dom.window.document.getElementById(id);
    if ( el === null ) { return 'gone'; }
    const src = el.getAttribute('src');
    if ( src !== null && src !== '' ) { return src; }
    return el.style.display === 'none' ? 'hidden' : 'parked';
};
const record = dom => JSON.parse(
    cookies(dom.window).get('CookieInformationConsent')
        .split('%').length > 1
        ? decodeURIComponent(cookies(dom.window).get('CookieInformationConsent'))
        : cookies(dom.window).get('CookieInformationConsent')
);

/******************************************************************************/

describe('cookieinformation-reject', ( ) => {
    it('ships as one resource, in the format uBO parses', async ( ) => {
        const names = Array.from((await loadResources()).keys())
            .filter(name => name.startsWith('cookieinformation-'));
        // One resource for this consent manager: necessary only, no variants.
        assert.deepEqual(names, [ 'cookieinformation-reject.js' ]);
        assert.equal(/^[ \t]*$/m.test(reject), false);
        assert.equal(/[^\x20-\x7e\t\n]/.test(reject), false);
    });

    it('publishes the consent map the page reads', ( ) => {
        const w = open().window;
        assert.deepEqual(JSON.parse(JSON.stringify(w.cicc)), {
            cookie_cat_necessary: true,
            cookie_cat_functional: false,
            cookie_cat_statistic: false,
            cookie_cat_marketing: false,
            cookie_cat_unclassified: false,
        });
        assert.equal(w.isCookieInformationAPIReady, true);
        assert.ok(Array.from(w.cicl).includes('cookie_cat_marketing'));
    });

    it('answers getConsentGivenFor, which is all that reads cicc', ( ) => {
        const w = open().window;
        assert.equal(w.CookieInformation.getConsentGivenFor('cookie_cat_necessary'), true);
        assert.equal(w.CookieInformation.getConsentGivenFor('cookie_cat_marketing'), false);
        assert.equal(w.CookieInformation.getConsentGivenFor('nonsense'), false);
        const status = w.CookieInformation.getStatusOfUsedConsentTypes();
        assert.equal(status.cookie_cat_statistic, false);
        assert.equal(w.CookieInformation.wasBannerConfirmed(), true);
        assert.equal(w.CookieInformation.wasBannerShown(), false);
    });

    it('records the refusal in their own cookie shape', ( ) => {
        const dom = open();
        const consent = record(dom);
        assert.deepEqual(consent.consents_approved, [ 'cookie_cat_necessary' ]);
        assert.deepEqual(consent.consents_denied, [
            'cookie_cat_functional', 'cookie_cat_statistic',
            'cookie_cat_marketing', 'cookie_cat_unclassified',
        ]);
        assert.equal(consent.consent_domain, 'www.almbrand.dk');
        assert.equal(consent.consent_url, URL);
        assert.ok(consent.timestamp.endsWith('Z'));
        assert.ok(consent.user_uid.length >= 32);
        // In their format, and it stays in the browser.
        assert.equal(typeof consent.user_agent, 'string');
    });

    it('keeps the tenant fields it cannot know, rather than inventing them', ( ) => {
        const dom = open(PAGE, w => {
            w.document.cookie = 'CookieInformationConsent=' + encodeURIComponent(
                JSON.stringify({
                    website_uuid: '3939fe6a-87d9-4644-9314-dde0f11842bc',
                    consent_website: 'Almbrand Sites',
                    user_uid: 'kept-across-visits',
                })
            ) + '; path=/';
        });
        const consent = record(dom);
        assert.equal(consent.website_uuid, '3939fe6a-87d9-4644-9314-dde0f11842bc');
        assert.equal(consent.consent_website, 'Almbrand Sites');
        assert.equal(consent.user_uid, 'kept-across-visits');
    });

    it('scopes the cookie the way their own code does', ( ) => {
        const dom = open();
        const found = cookiesInJar(dom, URL, 'CookieInformationConsent');
        assert.equal(found.length, 1);
        assert.equal(found[0].domain, 'almbrand.dk');
        assert.equal(Boolean(found[0].hostOnly), false);
    });

    it('frees a necessary tag and hides the rest', ( ) => {
        const dom = open();
        assert.equal(state(dom, 'nec'), 'https://n.example/n.js');
        assert.equal(state(dom, 'stat'), 'hidden');
        assert.equal(state(dom, 'yt'), 'hidden');
        assert.equal(state(dom, 'px'), 'hidden');
        assert.equal(dom.window.document.getElementById('content').textContent, 'x');
    });

    // The freed copy keeps data-category-consent, so without a guard the
    // observer sees its own work and frees it again, for ever.
    it('does not free its own work over and over', async ( ) => {
        const dom = open();
        const count = ( ) => dom.window.document
            .querySelectorAll('[data-category-consent]').length;
        const first = count();
        await settle(250);
        assert.equal(count(), first);
    });

    it('frees a tag added after it ran', async ( ) => {
        const dom = open();
        await settle(60);
        const doc = dom.window.document;
        const late = doc.createElement('script');
        late.id = 'late';
        late.setAttribute('data-category-consent', 'cookie_cat_necessary');
        late.setAttribute('data-consent-src', 'https://l.example/l.js');
        doc.body.append(late);
        await settle(200);
        assert.equal(state(dom, 'late'), 'https://l.example/l.js');
    });

    it('fires what their init fires, and seeds the data layer', async ( ) => {
        const dom = open();
        const seen = [];
        let consents;
        for ( const name of [
            'CookieInformationAPIReady', 'CookieInformationConsentGiven',
            'CookieInformationConsentSubmitted',
            'CookieInformationConsentForGCMTemplate',
        ] ) {
            dom.window.addEventListener(name, ev => {
                seen.push(name);
                if ( name === 'CookieInformationConsentGiven' ) {
                    consents = ev.detail.consents;
                }
            });
        }
        await settle(80);
        assert.deepEqual(seen, [
            'CookieInformationAPIReady', 'CookieInformationConsentGiven',
            'CookieInformationConsentSubmitted',
            'CookieInformationConsentForGCMTemplate',
        ]);
        assert.equal(consents.cookie_cat_marketing, false);
        assert.deepEqual(
            JSON.parse(JSON.stringify(dom.window.dataLayer)),
            [ { event: 'cookie_cat_necessary' } ]
        );
    });

    // "no cookie" and "never ran" looked identical from the console, which cost
    // a round of guessing on a live site.
    it('says on the console whether the cookie stuck', ( ) => {
        const logs = [];
        runDom(reject, URL, PAGE, w => {
            w.console.info = (...args) => { logs.push(args.join(' ')); };
        });
        assert.ok(logs[0].endsWith('cookie=written'), logs[0]);

        const refused = [];
        runDom(reject, URL, PAGE, w => {
            w.console.info = (...args) => { refused.push(args.join(' ')); };
            Object.defineProperty(w.document, 'cookie', {
                configurable: true,
                get( ) { return ''; },
                set( ) {},
            });
        });
        assert.ok(refused[0].endsWith('cookie=refused'), refused[0]);
    });

    it('does nothing the second time it is injected', async ( ) => {
        const dom = open();
        dom.window.eval(reject);
        assert.equal(dom.window.CookieInformation.consentRR.mode, 'reject');
        await settle(80);
        // One push, not two: the second injection returned at the guard.
        assert.equal(dom.window.dataLayer.length, 1);
    });
});
