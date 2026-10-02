/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

*/

import { strict as assert } from 'node:assert';
import { before, describe, it } from 'node:test';
import {
    cookies, filtersText, loadResources, runDom, settle, versions,
} from './helpers.mjs';

const URL = 'https://www.example.com/';

// Their entry, and the tags their auto-blocker parks: the url in data-src,
// scripts typed text/plain, the category on data-cookiecategory.
const PAGE = '<!doctype html><html lang="en"><head>' +
    '<script src="https://cdn.cookie-script.com/s/' +
    'e879476f7846d0f3101e83b498791e52.js"></script>' +
    '</head><body>' +
    '<script id="strict" type="text/plain" data-cookiescript="accepted"' +
    ' data-cookiecategory="strict" data-src="https://n.test/n.js"></script>' +
    '<script id="ads" type="text/plain" data-cookiescript="accepted"' +
    ' data-cookiecategory="targeting" data-src="https://t.test/t.js"></script>' +
    '<script id="both" type="text/plain" data-cookiescript="accepted"' +
    ' data-cookiecategory="strict targeting" data-src="https://m.test/m.js"></script>' +
    '<img id="pixel" data-cookiescript="accepted" data-cookiecategory="strict"' +
    ' data-src="https://p.test/p.gif">' +
    '<iframe id="embed" data-cookiescript="accepted"' +
    ' data-cookiecategory="performance" data-src="https://e.test/e"></iframe>' +
    '<p id="content">x</p></body></html>';

let reject;

before(async ( ) => {
    reject = (await loadResources()).get('cookiescript-reject.js');
});

const plain = value => JSON.parse(JSON.stringify(value));

const boot = (options = {}) => runDom(
    reject, options.url || URL, options.html || PAGE,
    w => {
        if ( typeof options.before === 'function' ) { options.before(w); }
    }
);

const lines = w => {
    const out = [];
    w.console.info = line => { out.push(line); };
    return out;
};

const record = w => JSON.parse(
    decodeURIComponent(cookies(w).get('CookieScriptConsent'))
);

const node = (w, id) => w.document.getElementById(id);

/******************************************************************************/

describe('cookiescript-reject', ( ) => {
    it('ships as one resource, in the format uBO parses', async ( ) => {
        const names = Array.from((await loadResources()).keys())
            .filter(name => name.startsWith('cookiescript-'));
        assert.deepEqual(names, [ 'cookiescript-reject.js' ]);
        assert.equal(/^[ \t]*$/m.test(reject), false);
        assert.equal(/[^\x20-\x7e\t\n]/.test(reject), false);
        assert.ok(reject.includes("const VERSION = '" + versions.cookiescript + "'"));
    });

    it('writes the record their own reject-all writes', ( ) => {
        const w = boot().window;
        // Their a() builds it field by field, and categories is a JSON string
        // inside the record rather than an array.
        assert.deepEqual(plain(record(w)), {
            action: 'reject',
            categories: '[]',
        });
    });

    it('keeps the fields of theirs it cannot know', ( ) => {
        const w = boot({
            before: w_ => {
                w_.document.cookie = 'CookieScriptConsent=' +
                    encodeURIComponent(JSON.stringify({
                        action: 'accept',
                        categories: '["strict","targeting"]',
                        key: 'abc123',
                        consenttime: 1770372134,
                    }));
            },
        }).window;
        const stored = record(w);
        // Their key comes back from their collector, which nothing here talks
        // to, and their consenttime is configuration. Both are left as they
        // were; the decision is the part that changes.
        assert.equal(stored.key, 'abc123');
        assert.equal(stored.consenttime, 1770372134);
        assert.equal(stored.action, 'reject');
        assert.equal(stored.categories, '[]');
    });

    it('frees what they never block, by their own every-category rule', ( ) => {
        const w = boot().window;
        // Freed: a fresh element with the url back and the marker gone.
        assert.equal(node(w, 'strict').getAttribute('type'), 'text/javascript');
        assert.equal(node(w, 'strict').getAttribute('src'), 'https://n.test/n.js');
        assert.equal(node(w, 'strict').hasAttribute('data-cookiescript'), false);
        assert.equal(node(w, 'pixel').getAttribute('src'), 'https://p.test/p.gif');
        // Parked, and still holding its url out of reach.
        assert.equal(node(w, 'ads').getAttribute('type'), 'text/plain');
        assert.equal(node(w, 'ads').hasAttribute('src'), false);
        assert.equal(node(w, 'embed').hasAttribute('src'), false);
        // And the one that matters: theirs frees an element only when EVERY
        // category on it is allowed - they strip the allowed names and skip
        // whatever is left - so "strict targeting" stays parked.
        assert.equal(node(w, 'both').getAttribute('type'), 'text/plain');
        assert.equal(node(w, 'both').hasAttribute('src'), false);
    });

    it('pushes their events and denies their consent mode', ( ) => {
        const w = boot({
            before: w_ => {
                w_.eval('window.dataLayer = []; window.__gtag = [];' +
                    'window.gtag = function() {' +
                    ' window.__gtag.push(Array.from(arguments)); };');
            },
        }).window;
        assert.deepEqual(plain(w.dataLayer), [
            { event: 'CookieScriptConsentUpdated[strict]' },
            { event: 'CookieScriptGoogleConsentUpdated' },
        ]);
        assert.deepEqual(plain(w.__gtag), [ [
            'consent', 'update', {
                ad_storage: 'denied',
                ad_user_data: 'denied',
                ad_personalization: 'denied',
                analytics_storage: 'denied',
                functionality_storage: 'denied',
                personalization_storage: 'denied',
                // Their default map puts this one on a category they never
                // block. A tenant that maps it elsewhere is the test below.
                security_storage: 'granted',
            },
        ] ]);
    });

    // A real record, from saving their banner without accepting. Their map is
    // the tenant's, and on this one nothing lands on strict - not even
    // security_storage, which goes to functionality.
    const THEIR_RECORD = {
        googleconsentmap: {
            ad_storage: 'targeting',
            analytics_storage: 'performance',
            ad_personalization: 'targeting',
            ad_user_data: 'targeting',
            functionality_storage: 'functionality',
            personalization_storage: 'functionality',
            security_storage: 'functionality',
        },
        bannershown: 1,
        action: 'reject',
        consenttime: 1770372134,
        categories: [],
        key: '2e22a4ca-0d64-448d-87aa-481848181e20',
    };

    const withRecord = (map, extra = {}) => ({
        before: w_ => {
            const value = JSON.stringify(
                Object.assign({}, THEIR_RECORD, { googleconsentmap: map }, extra)
            );
            w_.document.cookie = 'CookieScriptConsent=' +
                encodeURIComponent(value);
            w_.eval('window.dataLayer = []; window.__gtag = [];' +
                'window.gtag = function() {' +
                ' window.__gtag.push(Array.from(arguments)); };');
        },
    });

    it('takes the consent-mode keys from the tenant\'s own map', ( ) => {
        let out;
        const options = withRecord(THEIR_RECORD.googleconsentmap);
        const before_ = options.before;
        options.before = w_ => { out = lines(w_); before_(w_); };
        const w = boot(options).window;
        // Every key denied, security_storage included: their map sends it to
        // functionality, and a refusal refuses functionality. Hardcoding it
        // granted would have granted more than their own refusal does.
        assert.deepEqual(plain(w.__gtag), [ [
            'consent', 'update', {
                ad_storage: 'denied',
                analytics_storage: 'denied',
                ad_personalization: 'denied',
                ad_user_data: 'denied',
                functionality_storage: 'denied',
                personalization_storage: 'denied',
                security_storage: 'denied',
            },
        ] ]);
        assert.ok(out[0].includes(' gcm=denied/theirs'), out[0]);
        // Their fields are carried, the map among them.
        const kept = record(w);
        assert.deepEqual(kept.googleconsentmap, THEIR_RECORD.googleconsentmap);
        assert.equal(kept.key, THEIR_RECORD.key);
        assert.equal(kept.bannershown, 1);
        assert.equal(kept.action, 'reject');
        assert.equal(kept.categories, '[]');
    });

    it('grants a key their map puts on the category they never block', ( ) => {
        const map = Object.assign({}, THEIR_RECORD.googleconsentmap, {
            security_storage: 'strict',
        });
        const w = boot(withRecord(map)).window;
        const pushed = plain(w.__gtag)[0][2];
        assert.equal(pushed.security_storage, 'granted');
        assert.equal(pushed.functionality_storage, 'denied');
        assert.equal(pushed.ad_storage, 'denied');
    });

    it('falls back to its own keys where their map is unusable', ( ) => {
        for ( const map of [ {}, null, 'strict', 7 ] ) {
            let out;
            const options = withRecord(map);
            const before_ = options.before;
            options.before = w_ => { out = lines(w_); before_(w_); };
            const w = boot(options).window;
            const pushed = plain(w.__gtag)[0][2];
            assert.equal(pushed.security_storage, 'granted', String(map));
            assert.equal(pushed.ad_storage, 'denied', String(map));
            assert.ok(out[0].includes(' gcm=denied/default'), out[0]);
        }
    });

    it('says so on the data layer even where the page has no gtag', ( ) => {
        let out;
        const w = boot({ before: w_ => { out = lines(w_); } }).window;
        assert.deepEqual(plain(w.dataLayer),
            [ { event: 'CookieScriptConsentUpdated[strict]' } ]);
        assert.ok(out[0].includes(' gcm=nogtag'), out[0]);
    });

    it('answers their instance, under their own method names', ( ) => {
        const w = boot().window;
        const instance = w.CookieScript.instance;
        for ( const name of [
            'currentState', 'expireDays', 'hash', 'categories', 'show', 'hide',
            'showDetails', 'showIABSpecificTab', 'acceptAllAction',
            'acceptAction', 'rejectAllAction', 'getCMPId', 'getIABSdkUrl',
            'getIABVendorsIds', 'getGoogleVendorsIds', 'getIABLegIntPurposes',
            'getLanguagesKeys', 'getCMPCookie', 'setCMPCookie',
            'getGoogleACStringCookie', 'setGoogleACStringCookie',
            'getCookieValueForQueryArg', 'getGeoTargeting', 'isCdn',
            'applyTranslation', 'applyCurrentCookiesState',
            'forceDispatchCSLoadEvent',
        ] ) {
            assert.equal(typeof instance[name], 'function', name);
        }
        assert.deepEqual(plain(instance.currentState()),
            { action: 'reject', categories: [] });
        // Theirs, from getCMPId().
        assert.equal(instance.getCMPId(), 374);
        assert.equal(instance.expireDays(), 90);
        assert.deepEqual(plain(instance.categories()), [
            'functionality', 'targeting', 'strict', 'performance',
            'unclassified',
        ]);
    });

    it('grants nothing when the page calls their accept', ( ) => {
        const w = boot().window;
        w.CookieScript.instance.acceptAllAction();
        w.CookieScript.instance.acceptAction([ 'targeting' ]);
        assert.equal(record(w).action, 'reject');
        assert.equal(node(w, 'ads').getAttribute('type'), 'text/plain');
        assert.deepEqual(plain(w.CookieScript.instance.currentState().categories),
            []);
    });

    it('fires their reject path, and not their accept one', async ( ) => {
        const seen = [];
        const w = boot({
            before: w_ => {
                w_.__seen = seen;
                for ( const name of [
                    'CookieScriptLoaded', 'CookieScriptReject',
                    'CookieScriptCurrentState', 'CookieScriptAcceptAll',
                    'CookieScriptAccept',
                ] ) {
                    w_.addEventListener(name, ev => {
                        w_.__seen.push([ name, ev.detail && ev.detail.action ]);
                    });
                }
            },
        }).window;
        // Their load event goes out at once; the rest is their Kt(), the
        // reject-all path, which waits a tick so a page assigning its
        // callback in the script after theirs is still heard.
        // detail is null rather than undefined on a CustomEvent with none.
        assert.deepEqual(plain(seen), [ [ 'CookieScriptLoaded', null ] ]);
        w.eval('window.__calls = [];' +
            'window.CookieScript.instance.onReject = function() {' +
            ' window.__calls.push("onReject"); };');
        await settle(10);
        assert.deepEqual(plain(seen), [
            [ 'CookieScriptLoaded', null ],
            [ 'CookieScriptReject', null ],
            [ 'CookieScriptCurrentState', 'reject' ],
        ]);
        // Their own order: the page's callback, then the events.
        assert.deepEqual(plain(w.__calls), [ 'onReject' ]);
        // CookieScriptAcceptAll is their accept-all event. An earlier pass
        // fired it on a refusal, which is page code being told the opposite
        // of what was recorded.
        assert.equal(seen.some(entry => entry[0].indexOf('Accept') !== -1), false);
    });

    it('carries their own instance fields', ( ) => {
        const w = boot().window;
        const instance = w.CookieScript.instance;
        assert.deepEqual(plain(instance.dispatchEventNames), []);
        assert.equal(instance.currentLang, null);
        assert.equal(instance.iabCMP, null);
        assert.equal(instance.tcString, undefined);
        assert.equal(instance.googleAcString, undefined);
    });

    it('does nothing the second time it is injected', ( ) => {
        const w = boot().window;
        const before_ = w.document.cookie;
        const pushes = w.dataLayer.length;
        w.eval(reject);
        assert.equal(w.document.cookie, before_);
        assert.equal(w.dataLayer.length, pushes);
    });

    it('says on the console what it did', ( ) => {
        let out;
        boot({ before: w_ => { out = lines(w_); } });
        assert.equal(out.length, 1);
        assert.equal(
            out[0],
            '[consent-rr] cookiescript-reject ' + versions.cookiescript +
            ' action=reject categories=none cookie=written freed=2' +
            ' gcm=nogtag api=ready'
        );
    });

    it('refuses the same with DNT on, which they only report', ( ) => {
        const w = boot({
            before: w_ => {
                Object.defineProperty(w_.navigator, 'doNotTrack', {
                    value: '1', configurable: true,
                });
            },
        }).window;
        // Their bundle reads it, but only to put &dnt= on a request to their
        // collector - never to decide anything. Nothing is reported here.
        assert.equal(record(w).action, 'reject');
        assert.equal(record(w).categories, '[]');
    });
});

/******************************************************************************/

describe('filters, cookiescript', ( ) => {
    it('replaces the bundle and noops the IAB sdk', ( ) => {
        const active = filtersText.split('\n')
            .filter(line => line !== '' && line.startsWith('!') === false)
            .filter(line => line.includes('cookie-script'));
        assert.deepEqual(active, [
            '||cdn.cookie-script.com/s/*.js' +
                '$script,redirect=cookiescript-reject.js',
            '||cdn.cookie-script.com/iabtcf/*/sdk_cmp.js$script,redirect=noopjs',
        ]);
    });

    it('matches the urls they serve, and not their vendor lists', ( ) => {
        const matches = (pattern, url) => {
            const body = pattern.slice(2, pattern.indexOf('$'));
            const re = new RegExp(
                '^https?://([^/]*\\.)?' +
                body.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
            );
            return re.test(url);
        };
        const rules = filtersText.split('\n')
            .filter(line => line.startsWith('||') && line.includes('cookie-script'));
        const ours = rules.filter(line => line.includes('cookiescript-reject'));
        assert.ok(ours.some(r => matches(r,
            'https://cdn.cookie-script.com/s/e879476f7846d0f3101e83b498791e52.js')));
        const noops = rules.filter(line => line.includes('noopjs'));
        assert.ok(noops.some(r => matches(r,
            'https://cdn.cookie-script.com/iabtcf/2.3/sdk_cmp.js')));
        // The vendor lists are fetched by the SDK this keeps out, and a rule
        // for them would only break a site whose CMP still runs.
        for ( const url of [
            'https://cdn.cookie-script.com/iabtcf/2.3/vendor-list.json',
            'https://cdn.cookie-script.com/iabtcf/2.3/google-vendors.json',
        ] ) {
            for ( const rule of rules ) {
                assert.equal(matches(rule, url), false, rule + ' matches ' + url);
            }
        }
    });
});
