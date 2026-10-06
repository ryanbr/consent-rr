/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    iubenda's Cookie Solution. Everything asserted here was read out of the
    two files this family replaces - cdn.iubenda.com/cs/iubenda_cs.js and the
    450KB cookie_solution/iubenda_cs/1.108.0/core-en.js it fetches - and the
    TC strings are decoded with the IAB's own library rather than compared
    against themselves.

*/

import { strict as assert } from 'node:assert';
import { before, describe, it } from 'node:test';
import { TCString } from '@iabtcf/core';
import {
    cookies, cookiesInJar, filtersText, loadResources, runDom, settle,
    versions,
} from './helpers.mjs';

const URL_PAGE = 'https://example.it/pagina';
const LOADER = 'https://cdn.iubenda.com/cs/iubenda_cs.js';

const PAGE = '<!doctype html><html lang="it"><head>' +
    '<script src="' + LOADER + '" charset="UTF-8" async></script>' +
    '</head><body>' +
    // Parked by their auto-blocker, with the three shapes it leaves behind.
    '<script id="ga" class="_iub_cs_activate" type="text/plain"' +
    ' data-iub-purposes="4" data-suppressedsrc="https://a.example/ga.js"' +
    ' data-keep="yes"></script>' +
    '<script id="ads" class="_iub_cs_activate" type="text/plain"' +
    ' data-iub-purposes="5" suppressedsrc="https://b.example/ads.js"></script>' +
    '<script id="inline" class="_iub_cs_activate-inline" type="text/plain"' +
    ' data-iub-purposes="2">window.inlineRan = 1;</script>' +
    '<iframe id="yt" class="_iub_cs_activate_iframe" data-iub-purposes="3"' +
    ' data-suppressedsrc="https://www.youtube.com/embed/x"></iframe>' +
    '<div id="cover" class="_iub_cs_activate-overlay">click to accept</div>' +
    // Theirs, and deliberately never freed: their own blocker decided against
    // this one.
    '<script id="notused" class="_iub_cs_activate_notused" type="text/plain"' +
    ' data-suppressedsrc="https://c.example/c.js"></script>' +
    // Not theirs.
    '<script id="notheirs" type="text/plain" src="https://d.example/d.js"></script>' +
    '<p id="content">x</p></body></html>';

const CONFIG = 'window._iub = window._iub || {};' +
    ' _iub.csConfiguration = { siteId: 1234567, cookiePolicyId: 7654321,' +
    ' lang: "it", perPurposeConsent: true, enableTcf: true, gdprApplies: true,' +
    ' purposes: "1,2,3,4,5" };';

let reject;
let unblock;
let accept;

before(async ( ) => {
    const resources = await loadResources();
    reject = resources.get('iubenda-reject.js');
    unblock = resources.get('iubenda-reject-unblock.js');
    accept = resources.get('iubenda-accept.js');
});

const boot = (which, options = {}) => runDom(
    which, options.url || URL_PAGE, options.html || PAGE,
    w => {
        w.__cb = [];
        w.dataLayer = [];
        w.eval(options.config === undefined ? CONFIG : options.config);
        if ( typeof options.before === 'function' ) { options.before(w); }
    }
);

const win = (which, options = {}) => boot(which, options).window;

const record = w => {
    const raw = cookies(w).get('_iub_cs-7654321');
    if ( raw === undefined ) { return null; }
    return JSON.parse(decodeURIComponent(raw));
};

const lines = w => {
    const out = [];
    w.console.info = line => { out.push(String(line)); };
    return out;
};

const state = (w, id) => {
    const element = w.document.getElementById(id);
    if ( element === null ) { return 'gone'; }
    return element.classList.contains('_iub_cs_activate-activated')
        ? 'freed'
        : 'parked';
};

/******************************************************************************/

describe('iubenda-reject', ( ) => {
    it('writes their record, by their own shape', ( ) => {
        const w = win(reject);
        const stored = record(w);
        assert.equal(typeof stored.timestamp, 'string');
        assert.match(stored.timestamp, /^\d{4}-\d{2}-\d{2}T/);
        assert.equal(stored.version, '1.108.0');
        // Purpose 1 is true in every mode: their own storeConsent forces it.
        assert.deepEqual(
            JSON.parse(JSON.stringify(stored.purposes)),
            { 1: true, 2: false, 3: false, 4: false, 5: false }
        );
        assert.equal(stored.consent, undefined, 'per-purpose, so no consent');
    });

    // Their own converter encodes a value that looks like JSON for cookie
    // storage and leaves it decoded for localStorage. The payload here would
    // survive either way, so the encoding is pinned on the raw cookie.
    it('url-encodes it the way their converter does', ( ) => {
        const w = win(reject);
        const raw = cookies(w).get('_iub_cs-7654321');
        assert.match(raw, /^%7B/, raw.slice(0, 40));
        assert.equal(raw.includes('{'), false);
        assert.deepEqual(
            Object.keys(JSON.parse(decodeURIComponent(raw))).sort(),
            [ 'purposes', 'timestamp', 'version' ]
        );
    });

    // Their storage id: "s" + siteId only where storage.useSiteId says so.
    it('names the cookie the way their storage id does', ( ) => {
        const plain = win(reject);
        assert.ok(cookies(plain).has('_iub_cs-7654321'), 'cookiePolicyId');
        const bySite = win(reject, {
            config: CONFIG.replace(
                'perPurposeConsent: true',
                'perPurposeConsent: true, storage: { useSiteId: true }'
            ),
        });
        assert.ok(cookies(bySite).has('_iub_cs-s1234567'), 'siteId');
    });

    it('writes their simple form where there is no per-purpose consent', ( ) => {
        const w = win(reject, {
            config: 'window._iub = { csConfiguration: {' +
                ' cookiePolicyId: 7654321, gdprApplies: true } };',
        });
        const stored = record(w);
        assert.equal(stored.consent, false);
        assert.equal(stored.purposes, undefined);
    });

    it('writes it with their own expiry and path', ( ) => {
        const dom = boot(reject);
        const [ cookie ] = cookiesInJar(dom, URL_PAGE, '_iub_cs-7654321');
        assert.equal(cookie.path, '/');
        assert.ok(cookie.expires instanceof Date);
        const days = (cookie.expires.getTime() - Date.now()) / 864e5;
        assert.ok(days > 360 && days < 366, 'their 365 days, got ' + days);
    });

    it('carries an existing cons rather than minting one', ( ) => {
        const w = win(reject, {
            before: ww => {
                ww.document.cookie = '_iub_cs-7654321=' + encodeURIComponent(
                    JSON.stringify({
                        timestamp: '2026-01-01T00:00:00.000Z',
                        version: '1.100.0',
                        purposes: { 1: true, 2: true, 3: true, 4: true, 5: true },
                        cons: { rand: 'A1B2C3' },
                    })
                ) + '; path=/';
            },
        });
        const stored = record(w);
        assert.deepEqual(JSON.parse(JSON.stringify(stored.cons)), { rand: 'A1B2C3' });
        // And the acceptance it came with is gone.
        assert.equal(stored.purposes[5], false);
    });

    it('mints nothing where there was nothing', ( ) => {
        const w = win(reject);
        assert.equal(record(w).cons, undefined);
        assert.equal(w._iub.cs.api.getPreferenceId(), undefined);
    });

    it('answers their api with the refusal', ( ) => {
        const w = win(reject);
        const api = w._iub.cs.api;
        assert.equal(api.isConsentGiven(), false);
        assert.equal(api.isPreferenceExpressed(), true);
        assert.equal(api.getConsentAction(), 'reject');
        assert.deepEqual(
            JSON.parse(JSON.stringify(api.getPurposesState())),
            { 1: true, 2: false, 3: false, 4: false, 5: false }
        );
        const preferences = JSON.parse(JSON.stringify(api.getPreferences()));
        assert.equal(preferences.id, 7654321);
        assert.equal(preferences.purposes[4], false);
        assert.equal(api.gdprApplies(), true);
        assert.equal(api.ccpaApplies(), false);
        assert.equal(api.isCcpaOptedOut(), false);
        // Theirs answers this one true unconditionally.
        assert.equal(api.isGoogleNonPersonalizedAds(), true);
    });

    it('answers their arePurposesAccepted the way theirs does', async ( ) => {
        const w = win(reject);
        const api = w._iub.cs.api;
        assert.equal(await api.arePurposesAccepted([ 1 ]), true);
        assert.equal(await api.arePurposesAccepted([ 1, 4 ]), false);
        await assert.rejects(( ) => api.arePurposesAccepted([]));
    });

    // Every method their own api carries, so a page calling one gets an
    // answer rather than a TypeError.
    it('carries their whole api surface', ( ) => {
        const w = win(reject);
        const api = w._iub.cs.api;
        for ( const name of [
            'acceptAll', 'accessibilityWidget', 'arePurposesAccepted',
            'askCcpaOptOut', 'ccpaApplies', 'consentGiven',
            'emailMarketing', 'gdprApplies', 'getConsentAction',
            'getGoogleAdditionalConsent', 'getPreferenceId', 'getPreferences',
            'getPurposesState', 'getSupportedOptions', 'getUserPreferences',
            'isCcpaAcknowledged', 'isCcpaOptedOut', 'isConsentGiven',
            'isGoogleNonPersonalizedAds', 'isPreferenceExpressed',
            'lgpdApplies', 'openAdvertisingPreferences', 'openPreferences',
            'printErrors', 'rejectAll', 'resetCookies', 'resetStorage',
            'setConsentOnScrollOnElement', 'setPreferences', 'showBanner',
            'showCP', 'showTcfVendors', 'storeConsent',
        ] ) {
            assert.equal(typeof api[name], 'function', name);
        }
    });

    it('cannot be argued up by a page calling their own setters', ( ) => {
        const w = win(reject);
        const api = w._iub.cs.api;
        api.acceptAll();
        api.setPreferences({ purposes: { 5: true } });
        api.storeConsent(true);
        assert.equal(api.isConsentGiven(), false);
        assert.equal(record(w).purposes[5], false);
    });

    it('fires their callbacks, in their own order', async ( ) => {
        const seen = [];
        const w = win(reject, {
            config: CONFIG.replace('gdprApplies: true', 'gdprApplies: true,' +
                ' callback: {' +
                ' onReady: a => window.__cb.push("onReady:" + a),' +
                ' onConsentGiven: ( ) => window.__cb.push("onConsentGiven"),' +
                ' onConsentRejected: ( ) => window.__cb.push("onConsentRejected"),' +
                ' onPreferenceExpressed: ( ) => window.__cb.push("onPreferenceExpressed"),' +
                ' onPreferenceExpressedOrNotNeeded: ( ) => window.__cb.push("orNotNeeded"),' +
                ' onActivationDone: ( ) => window.__cb.push("onActivationDone") }'),
        });
        await settle(40);
        seen.push(...w.__cb);
        assert.deepEqual(seen, [
            'onReady:undefined',
            'onConsentRejected',
            'onPreferenceExpressed',
            'orNotNeeded',
            'onActivationDone',
        ]);
        assert.equal(w._iub.csReady, true);
    });

    // Their fireCallback prefers onConsentRead where a page defined one.
    it('prefers their onConsentRead over onConsentRejected', async ( ) => {
        const w = win(reject, {
            config: CONFIG.replace('gdprApplies: true', 'gdprApplies: true,' +
                ' callback: {' +
                ' onConsentRead: ( ) => window.__cb.push("onConsentRead"),' +
                ' onConsentRejected: ( ) => window.__cb.push("onConsentRejected") }'),
        });
        await settle(40);
        assert.deepEqual(w.__cb, [ 'onConsentRead' ]);
    });

    it('tells google consent mode denied, by their mapping', ( ) => {
        const w = win(reject);
        assert.equal(w.dataLayer.length, 2);
        const [ first, second ] = w.dataLayer;
        // Across realms, deepEqual on their array is never reference-equal.
        assert.deepEqual(Array.from(first).slice(0, 2), [ 'consent', 'default' ]);
        assert.deepEqual(Array.from(second).slice(0, 2), [ 'consent', 'update' ]);
        assert.deepEqual(JSON.parse(JSON.stringify(second[2])), {
            analytics_storage: 'denied',
            ad_storage: 'denied',
            functionality_storage: 'denied',
            personalization_storage: 'denied',
            security_storage: 'denied',
            ad_personalization: 'denied',
            ad_user_data: 'denied',
        });
    });

    it('prefers their gtag where the page has one', ( ) => {
        const calls = [];
        const w = win(reject, {
            before: ww => {
                ww.gtag = (...args) => { calls.push(args); };
            },
        });
        assert.equal(w.dataLayer.length, 0, 'not pushed as well');
        assert.equal(calls.length, 2);
        assert.deepEqual(Array.from(calls[1]).slice(0, 2), [ 'consent', 'update' ]);
    });

    // Their template mode pushes to two data layers of their own, and strips
    // the two newer signals out of the first.
    it('honours their template mode', ( ) => {
        const w = win(reject, {
            config: CONFIG.replace(
                'gdprApplies: true',
                'gdprApplies: true, googleConsentMode: "template"'
            ),
        });
        assert.equal(w.dataLayer.length, 0);
        assert.equal(w._iub.gtmDataLayer.length, 2);
        assert.equal(w._iub.gtmDataLayerV2.length, 2);
        const stripped = w._iub.gtmDataLayer[1][2];
        assert.equal(stripped.ad_user_data, undefined);
        assert.equal(stripped.ad_personalization, undefined);
        assert.equal(stripped.ad_storage, 'denied');
        assert.equal(w._iub.gtmDataLayerV2[1][2].ad_user_data, 'denied');
    });

    it('says nothing to google where their tenant turned it off', ( ) => {
        const w = win(reject, {
            config: CONFIG.replace(
                'gdprApplies: true', 'gdprApplies: true, googleConsentMode: false'
            ),
        });
        assert.equal(w.dataLayer.length, 0);
    });

    it('leaves their parked tags exactly where they are', ( ) => {
        const w = win(reject);
        for ( const id of [ 'ga', 'ads', 'inline', 'yt', 'notused' ] ) {
            assert.equal(state(w, id), 'parked', id);
        }
        assert.ok(w.document.getElementById('cover'), 'their cover stays');
        assert.equal(w.inlineRan, undefined);
    });

    it('installs their pubsub, with its replay', ( ) => {
        const w = win(reject);
        const pubSub = w._cmp.pubSub;
        assert.equal(typeof pubSub.subscribe, 'function');
        const seen = [];
        pubSub.publish('topic', 'publisher', { a: 1 }, true);
        pubSub.subscribe('topic', 'me', message => { seen.push(message.a); });
        assert.deepEqual(seen, [ 1 ], 'a replayed publisher reaches a late subscriber');
        pubSub.unsubscribe('me', 'topic');
        pubSub.publish('topic', 'publisher', { a: 2 });
        assert.deepEqual(seen, [ 1 ]);
    });

    it('sets what their loader sets on _iub', ( ) => {
        const w = win(reject);
        assert.equal(w._iub.csConfigLegacy, false);
        assert.equal(w._iub.GVL2, 224);
        assert.equal(w._iub.GVL3, 179);
        assert.equal(w._iub.vendorsCountGVL3, 1223);
        assert.equal(typeof w._iub.invTcfC, 'number');
    });

    it('asks for nothing and sends nothing', async ( ) => {
        const asked = [];
        const w = win(reject, {
            before: ww => {
                ww.fetch = url => { asked.push(String(url)); return Promise.reject(); };
                ww.navigator.sendBeacon = url => { asked.push(String(url)); return true; };
                ww.XMLHttpRequest = class {
                    open(method, url) { asked.push(String(url)); }
                    send( ) {}
                    setRequestHeader( ) {}
                };
            },
        });
        await settle(60);
        assert.deepEqual(asked, []);
        assert.equal(
            w.document.querySelectorAll('script[src*="iubenda"]').length, 1,
            'only the tag this stands in for'
        );
    });
});

/******************************************************************************/

describe('iubenda, the IAB layer', ( ) => {
    const decode = w => {
        const raw = cookies(w).get('euconsent-v2');
        assert.ok(raw, 'their tcfV2Name cookie');
        return TCString.decode(raw);
    };

    it('refuses as cmp 123, and writes the cookie their config names', ( ) => {
        const w = win(reject);
        const tc = decode(w);
        assert.equal(tc.cmpId, 123);
        assert.equal(tc.policyVersion, 5);
        assert.equal(tc.vendorListVersion, 179);
        assert.equal(tc.isServiceSpecific, true);
        assert.equal(tc.publisherCountryCode, 'AA');
        assert.equal(tc.consentLanguage, 'IT', 'the document language');
        for ( let id = 1; id <= 11; id += 1 ) {
            assert.equal(tc.purposeConsents.has(id), false, 'purpose ' + id);
            assert.equal(
                tc.purposeLegitimateInterests.has(id), false, 'li ' + id
            );
        }
        assert.equal(tc.vendorConsents.has(1), false);
        assert.equal(tc.vendorLegitimateInterests.has(1), false);
        assert.equal(tc.specialFeatureOptins.has(1), false);
    });

    it('answers their own stub shape, which hands back its queue', ( ) => {
        const answers = [];
        const w = win(reject, {
            before: ww => {
                // Their cs/tcf/stub-v2.js: no arguments returns the array.
                const parked = [ [ 'getTCData', 2, (data, ok) => {
                    answers.push([ ok, data && data.cmpId ]);
                } ] ];
                ww.__tcfapi = function() {
                    if ( arguments.length === 0 ) { return parked; }
                };
            },
        });
        assert.deepEqual(answers, [ [ true, 123 ] ]);
        assert.equal(typeof w.__tcfapi, 'function');
    });

    it('answers ping, getTCData and the listeners', ( ) => {
        const w = win(reject);
        const seen = {};
        w.__tcfapi('ping', 2, data => { seen.ping = data; });
        assert.equal(seen.ping.cmpId, 123);
        assert.equal(seen.ping.gdprApplies, true);
        assert.equal(seen.ping.cmpStatus, 'loaded');
        assert.equal(seen.ping.gvlVersion, 179);
        w.__tcfapi('getTCData', 2, data => { seen.data = data; });
        assert.equal(seen.data.addtlConsent, '2~~dv');
        assert.equal(seen.data.eventStatus, 'tcloaded');
        let listenerId;
        w.__tcfapi('addEventListener', 2, data => { listenerId = data.listenerId; });
        assert.equal(typeof listenerId, 'number');
        let removed;
        w.__tcfapi('removeEventListener', 2, ok => { removed = ok; }, listenerId);
        assert.equal(removed, true);
        let answered = 'untouched';
        w.__tcfapi('getTCData', 1, (data, ok) => { answered = ok; });
        assert.equal(answered, false, 'any version but 2 is refused');
    });

    it('puts their locator frame where vendors look for it', ( ) => {
        const w = win(reject);
        assert.equal(
            w.document.querySelectorAll('iframe[name="__tcfapiLocator"]').length,
            1
        );
    });

    it('stays out where their tenant has it off', ( ) => {
        const w = win(reject, {
            config: CONFIG.replace('enableTcf: true', 'enableTcf: false'),
        });
        assert.equal(cookies(w).get('euconsent-v2'), undefined);
        assert.equal(w.__tcfapi, undefined);
    });

    it('writes it under the name their config gives it', ( ) => {
        const w = win(reject, {
            config: CONFIG.replace(
                'enableTcf: true',
                'enableTcf: true, preferenceCookie: { tcfV2Name: "iub-tc" }'
            ),
        });
        assert.ok(cookies(w).get('iub-tc'), 'their own name');
        assert.equal(cookies(w).get('euconsent-v2'), undefined);
    });
});

/******************************************************************************/

describe('iubenda-reject-unblock', ( ) => {
    it('frees what their blocker parked, by their own markers', async ( ) => {
        const w = win(unblock);
        await settle(60);
        // The copy carries their attributes over, id included, so what the
        // id now finds is the freed one.
        const freedGa = w.document.querySelector(
            'script[src="https://a.example/ga.js"]'
        );
        assert.ok(freedGa, 'the copy carries the suppressed src');
        assert.equal(freedGa.id, 'ga');
        assert.equal(state(w, 'ga'), 'freed');
        assert.equal(freedGa.getAttribute('data-keep'), 'yes', 'and the rest');
        assert.equal(freedGa.getAttribute('type'), null, 'their type goes');
        assert.equal(freedGa.getAttribute('data-suppressedsrc'), null);
        assert.ok(freedGa.classList.contains('_iub_cs_activate-activated'));
        assert.ok(
            w.document.querySelector('script[src="https://b.example/ads.js"]'),
            'their undashed suppressedsrc too'
        );
        const yt = w.document.getElementById('yt');
        assert.equal(yt.getAttribute('src'), 'https://www.youtube.com/embed/x');
        assert.equal(state(w, 'yt'), 'freed');
        assert.equal(w.document.getElementById('cover'), null, 'their cover goes');
    });

    it('leaves alone what their blocker marked as not used', async ( ) => {
        const w = win(unblock);
        await settle(60);
        assert.equal(state(w, 'notused'), 'parked');
        assert.equal(
            w.document.getElementById('notheirs').getAttribute('type'),
            'text/plain',
            'and a tag that is not theirs'
        );
    });

    // Their data-iub-purposes names what a tag waits for, and a purpose the
    // tenant never defined is not one this can report as on.
    it('leaves a tag waiting on a purpose their tenant never defined', async ( ) => {
        const html = PAGE.replace(
            'data-iub-purposes="4" data-suppressedsrc="https://a.example/ga.js"',
            'data-iub-purposes="5" data-suppressedsrc="https://a.example/ga.js"'
        );
        const w = win(unblock, {
            html,
            config: CONFIG.replace('purposes: "1,2,3,4,5"', 'purposes: "1,2,3"'),
        });
        await settle(80);
        assert.equal(
            w.document.querySelector('script[src="https://a.example/ga.js"]'),
            null,
            'purpose 5 is not theirs to consent to'
        );
        assert.equal(state(w, 'ga'), 'parked');
        // One the tenant does define still goes.
        assert.ok(w.document.getElementById('inline'));
    });

    it('frees a tag the parser delivers after it ran', async ( ) => {
        const w = win(unblock);
        await settle(40);
        const late = w.document.createElement('script');
        late.id = 'late';
        late.className = '_iub_cs_activate';
        late.type = 'text/plain';
        late.setAttribute('data-iub-purposes', '4');
        late.setAttribute('data-suppressedsrc', 'https://l.example/l.js');
        w.document.body.append(late);
        await settle(200);
        assert.ok(
            w.document.querySelector('script[src="https://l.example/l.js"]'),
            'the pass runs again as the document arrives'
        );
    });

    it('does not free its own work over and over', async ( ) => {
        const w = win(unblock);
        await settle(200);
        const settled = w.document.querySelectorAll('script').length;
        await settle(250);
        assert.equal(w.document.querySelectorAll('script').length, settled);
    });

    it('stores and sends the same refusal', ( ) => {
        const w = win(unblock);
        assert.deepEqual(
            JSON.parse(JSON.stringify(record(w).purposes)),
            { 1: true, 2: false, 3: false, 4: false, 5: false }
        );
        assert.equal(w.dataLayer[1][2].ad_storage, 'denied');
        const tc = TCString.decode(cookies(w).get('euconsent-v2'));
        assert.equal(tc.purposeConsents.has(4), false);
        assert.equal(tc.vendorConsents.has(1), false);
    });

    it('and tells the page every purpose is on', ( ) => {
        const w = win(unblock);
        const api = w._iub.cs.api;
        assert.equal(api.isConsentGiven(), true);
        assert.deepEqual(
            JSON.parse(JSON.stringify(api.getPurposesState())),
            { 1: true, 2: true, 3: true, 4: true, 5: true }
        );
    });
});

/******************************************************************************/

describe('iubenda-accept', ( ) => {
    it('grants in their record', ( ) => {
        const w = win(accept);
        assert.deepEqual(
            JSON.parse(JSON.stringify(record(w).purposes)),
            { 1: true, 2: true, 3: true, 4: true, 5: true }
        );
    });

    it('grants their simple form too', ( ) => {
        const w = win(accept, {
            config: 'window._iub = { csConfiguration: {' +
                ' cookiePolicyId: 7654321, gdprApplies: true } };',
        });
        assert.equal(record(w).consent, true);
    });

    it('tells google consent mode granted', ( ) => {
        const w = win(accept);
        assert.deepEqual(JSON.parse(JSON.stringify(w.dataLayer[1][2])), {
            analytics_storage: 'granted',
            ad_storage: 'granted',
            functionality_storage: 'granted',
            personalization_storage: 'granted',
            security_storage: 'granted',
            ad_personalization: 'granted',
            ad_user_data: 'granted',
        });
    });

    it('grants in the IAB string, to their own vendor count', ( ) => {
        const w = win(accept);
        const tc = TCString.decode(cookies(w).get('euconsent-v2'));
        assert.equal(tc.cmpId, 123);
        for ( const id of [ 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11 ] ) {
            assert.equal(tc.purposeConsents.has(id), true, 'purpose ' + id);
        }
        for ( const id of [ 2, 7, 8, 9, 10, 11 ] ) {
            assert.equal(
                tc.purposeLegitimateInterests.has(id), true, 'li ' + id
            );
        }
        assert.equal(tc.specialFeatureOptins.has(1), true);
        // Their loader's own _iub.vendorsCountGVL3.
        assert.equal(tc.vendorConsents.has(1223), true);
        assert.equal(tc.vendorConsents.has(1224), false);
        // A granting additional-consent string is not invented.
        let data;
        w.__tcfapi('getTCData', 2, value => { data = value; });
        assert.equal(data.addtlConsent, undefined);
    });

    it('frees what their blocker parked, as their accept does', async ( ) => {
        const w = win(accept);
        await settle(60);
        assert.ok(w.document.querySelector('script[src="https://a.example/ga.js"]'));
        assert.equal(state(w, 'yt'), 'freed');
    });

    it('fires their onConsentGiven through onConsentRead, as theirs does', async ( ) => {
        const w = win(accept, {
            config: CONFIG.replace('gdprApplies: true', 'gdprApplies: true,' +
                ' callback: {' +
                ' onConsentGiven: ( ) => window.__cb.push("onConsentGiven"),' +
                ' onConsentRejected: ( ) => window.__cb.push("onConsentRejected"),' +
                ' onPreferenceExpressed: ( ) => window.__cb.push("onPreferenceExpressed") }'),
        });
        await settle(40);
        assert.deepEqual(w.__cb, [
            'onPreferenceExpressed', 'onConsentGiven',
        ]);
    });

    it('answers their api as consented', ( ) => {
        const w = win(accept);
        const api = w._iub.cs.api;
        assert.equal(api.isConsentGiven(), true);
        assert.equal(api.getConsentAction(), 'accept');
    });
});

/******************************************************************************/

describe('iubenda, their storage types', ( ) => {
    it('writes localStorage where their config says so', ( ) => {
        const w = win(reject, {
            config: CONFIG.replace(
                'perPurposeConsent: true',
                'perPurposeConsent: true, storage: { type: "localStorage" }'
            ),
        });
        const raw = w.localStorage.getItem('_iub_cs-7654321');
        assert.ok(raw, 'their decoded json');
        assert.equal(JSON.parse(raw).purposes[5], false);
        assert.equal(cookies(w).get('_iub_cs-7654321'), undefined);
    });

    it('takes their per-item type over the group one', ( ) => {
        const w = win(reject, {
            config: CONFIG.replace(
                'perPurposeConsent: true',
                'perPurposeConsent: true, storage: { type: "cookie",' +
                ' items: { core: { type: "localStorage" } } }'
            ),
        });
        assert.ok(w.localStorage.getItem('_iub_cs-7654321'));
    });

    // With their autoSync on, a record left in the other store is read back
    // over this one.
    it('overwrites a record in the store it is not writing', ( ) => {
        const yes = JSON.stringify({
            timestamp: '2026-01-01T00:00:00.000Z',
            version: '1.100.0',
            purposes: { 1: true, 2: true, 3: true, 4: true, 5: true },
        });
        const w = win(reject, {
            before: ww => {
                ww.localStorage.setItem('_iub_cs-7654321', yes);
            },
        });
        assert.equal(
            JSON.parse(w.localStorage.getItem('_iub_cs-7654321')).purposes[5],
            false
        );
        assert.equal(record(w).purposes[5], false);
    });
});

/******************************************************************************/

describe('iubenda, the console line and the lists', ( ) => {
    it('says what it did', ( ) => {
        let out;
        const w = win(reject, { before: ww => { out = lines(ww); } });
        void w;
        const line = out.find(text => text.includes('iubenda-reject'));
        assert.ok(line, out.join('\n'));
        assert.match(line, /cookie=_iub_cs-7654321 stored=cookie/);
        assert.match(line, /mode=per-purpose accepted=necessary/);
        assert.match(line, /surface=denied tcf=refused told=2/);
        assert.match(line, /banner=none sent=none/);
    });

    it('says what accept did', ( ) => {
        let out;
        win(accept, { before: ww => { out = lines(ww); } });
        const line = out.find(text => text.includes('iubenda-accept'));
        assert.match(
            line,
            /accepted=necessary,functionality,experience,measurement,marketing/
        );
        assert.match(line, /surface=granted tcf=granted/);
    });

    it('is pinned at the version the package names', ( ) => {
        assert.equal(versions.iubenda, '1.0.0');
    });

    it('names their loader and both of their cores', ( ) => {
        for ( const rule of [
            '||cdn.iubenda.com/cs/iubenda_cs.js$script,redirect=iubenda-reject.js',
            '||cdn.iubenda.com/cookie_solution/safemode/iubenda_cs.js$script,redirect=iubenda-reject.js',
            '||cdn.iubenda.com/cookie_solution/iubenda_cs/*/core-*.js$script,redirect=noopjs',
            '||cdn.iubenda.com/cs/tcf/stub-v2.js$script,redirect=noopjs',
            '||cdn.iubenda.com/cs/gpp/stub.js$script,redirect=noopjs',
        ] ) {
            assert.ok(filtersText.includes(rule), rule);
        }
    });

    // Their auto-blocker is the thing stopping the trackers.
    it('never touches their auto-blocker or their per-site config', ( ) => {
        for ( const line of filtersText.split('\n') ) {
            if ( line.startsWith('!') ) { continue; }
            assert.equal(/autoblocking/.test(line), false, line);
            assert.equal(/cookie-solution\/confs/.test(line), false, line);
        }
        assert.match(filtersText, /DO NOT BLOCK THEIR AUTO-BLOCKER/);
    });

    it('says in the list what is not answered yet', ( ) => {
        assert.match(filtersText, /WHAT THIS DOES NOT ANSWER YET/);
        assert.match(filtersText, /THE PREFERENCE ID IS NOT MINTED/);
        assert.match(filtersText, /THEIR IAB STUBS GO/);
    });

    it('the three built files differ by one line each', ( ) => {
        const a = reject.split('\n');
        const b = unblock.split('\n');
        const c = accept.split('\n');
        assert.equal(a.length, b.length);
        assert.equal(a.length, c.length);
        assert.deepEqual(
            a.filter((line, i) => line !== b[i]),
            [ "    consentRRIubenda('reject', consentRRIubendaTcf);" ]
        );
        assert.deepEqual(
            c.filter((line, i) => line !== a[i]),
            [ "    consentRRIubenda('accept', consentRRIubendaTcf);" ]
        );
    });
});
