/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

*/

import { strict as assert } from 'node:assert';
import { before, describe, it } from 'node:test';
import {
    cookies, cookiesInJar, filtersText, loadResources, runDom, versions,
} from './helpers.mjs';

const URL = 'https://www.example.com/shop';

// Their own installation: the tag the loader finds by [data-domain-uuid].
const PAGE = '<html lang="en"><head>' +
    '<script id="securiti" data-tenant-uuid="t-123" data-domain-uuid="d-456"' +
    ' src="https://cdn-prod.securiti.ai/consent/cookie-consent-sdk-loader.js">' +
    '</' + 'script></head><body><p id="content">x</p></body></html>';

let reject;

before(async ( ) => {
    reject = (await loadResources()).get('securiti-reject.js');
});

const plain = value => JSON.parse(JSON.stringify(value));

const open = (options = {}) => runDom(
    reject, options.url || URL, options.html || PAGE, w => {
        if ( typeof options.before === 'function' ) { options.before(w); }
    }
);

const record = w => JSON.parse(
    decodeURIComponent(cookies(w).get('__privaci_cookie_consents'))
);

const lines = w => {
    const out = [];
    w.console.info = line => { out.push(line); };
    return out;
};

const GCM = {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    functionality_storage: 'denied',
    personalization_storage: 'denied',
    security_storage: 'granted',
};

/******************************************************************************/

describe('securiti-reject', ( ) => {
    it('ships as one resource, in the format uBO parses', async ( ) => {
        const names = Array.from((await loadResources()).keys())
            .filter(name => name.startsWith('securiti-'));
        assert.deepEqual(names, [ 'securiti-reject.js' ]);
        assert.equal(/^[ \t]*$/m.test(reject), false);
        assert.equal(/[^\x20-\x7e\t\n]/.test(reject), false);
        assert.ok(reject.includes("const VERSION = '" + versions.securiti + "'"));
    });

    it('records a refusal without naming categories it cannot know', ( ) => {
        const saved = record(open().window);
        // The categories live in the tenant's configuration, fetched by id, so
        // no page can supply them. Every reader in their SDK asks whether a
        // category's id is set here, and none is.
        assert.deepEqual(saved.consents, {});
        assert.deepEqual(saved.st, {});
        assert.deepEqual(saved.gcm, GCM);
        assert.ok(Number.isInteger(saved.ts));
        // Their timestamp is in seconds, not milliseconds.
        assert.ok(saved.ts < 1e11 && saved.ts > 1e9);
    });

    it('writes the visitor id beside it, and keeps one already there', ( ) => {
        const fresh = open().window;
        assert.ok(/^[0-9a-f-]{36}$/.test(cookies(fresh).get('__privaci_cookie_consent_uuid')));
        const kept = open({
            before: w => {
                w.document.cookie =
                    '__privaci_cookie_consent_uuid=kept-across-visits; path=/';
                w.document.cookie = '__privaci_cookie_consents=' +
                    encodeURIComponent(JSON.stringify({ consents: {}, ts: 1700000000 })) +
                    '; path=/';
            },
        }).window;
        assert.equal(
            cookies(kept).get('__privaci_cookie_consent_uuid'),
            'kept-across-visits'
        );
        // And their timestamp, so a site does not see a decision made afresh.
        assert.equal(record(kept).ts, 1700000000);
    });

    it('clears the marker that says nobody has answered', ( ) => {
        const w = open({
            before: w_ => {
                w_.document.cookie = '__privaci_cookie_no_action=1; path=/';
            },
        }).window;
        assert.equal(cookies(w).has('__privaci_cookie_no_action'), false);
    });

    it('scopes the record to the registered domain', ( ) => {
        const dom = open();
        const found = cookiesInJar(dom, URL, '__privaci_cookie_consents');
        assert.equal(found.length, 1);
        assert.equal(found[0].domain, 'example.com');
        assert.equal(Boolean(found[0].hostOnly), false);
        assert.equal(found[0].path, '/');
    });

    it('answers the API their loader parks for the SDK', ( ) => {
        const w = open().window;
        for ( const name of [
            'initCmp', 'setConsentBannerParams', 'showConsentPreferencesPopup',
            'overrideThemeMatching', 'registerSrtiCookieSDKEvents',
            'loadConfigFile',
        ] ) {
            assert.equal(typeof w[name], 'function', name);
        }
        // Calling them is what a page does; none of it throws and none of it
        // opens anything, because there is nothing to open.
        w.initCmp({});
        w.setConsentBannerParams({ uuid: 'x' });
        w.showConsentPreferencesPopup();
        w.overrideThemeMatching();
        assert.equal(typeof w.SecuritiSDK, 'object');
        assert.equal(typeof w.__ScrtSdkApiOps, 'object');
        assert.equal(w.__ScrtSdkApiOps.ns.banner, null);
        // What their loader sets from the location call this never makes.
        assert.equal(w.__isTcfEnabledForLocation, false);
        assert.equal(w.loadConfigFile('x'), 'x');
    });

    it('answers the events that describe a decision already made', ( ) => {
        const w = open().window;
        const seen = [];
        w.SecuritiSDK.registerEvent('onLoad', ( ) => { seen.push('onLoad'); });
        w.SecuritiSDK.registerEvent('onReady', ( ) => { seen.push('onReady'); });
        let detail;
        w.SecuritiSDK.registerEvent('onConsentGiven', (sdk, value) => {
            seen.push('onConsentGiven');
            detail = value;
        });
        // One a refusal never earns.
        w.SecuritiSDK.registerEvent('onCategoryConsented', ( ) => {
            seen.push('onCategoryConsented');
        });
        w.SecuritiSDK.onReady(( ) => { seen.push('viaOnReady'); });
        // And the same registration through the name their loader parks.
        w.registerSrtiCookieSDKEvents('onLoad', ( ) => { seen.push('viaLoader'); });
        assert.deepEqual(plain(seen), [
            'onLoad', 'onReady', 'onConsentGiven', 'viaOnReady', 'viaLoader',
        ]);
        assert.deepEqual(plain(detail), { category: {}, gcm: GCM });
    });

    it('pushes their Google consent mode, denied', ( ) => {
        const w = open().window;
        assert.equal(w.dataLayer.length, 1);
        const entry = w.dataLayer[0];
        // Pushed the way gtag pushes and theirs pushes: the arguments object,
        // not an array of it. Consent mode reads the first kind; an array is
        // their gtm-custom path and is not what a gtag site is listening for.
        assert.equal(Array.isArray(entry), false);
        assert.equal(typeof entry.length, 'number');
        // Their consentTypeIdMap, in their order.
        assert.deepEqual(
            plain(Array.prototype.slice.call(entry)),
            [ 'consent', 'update', GCM ]
        );
    });

    it('answers the getters a page may read instead of the cookie', async ( ) => {
        const w = open().window;
        assert.deepEqual(plain(await w.getterUtils.getConsentCookies()),
            { category: {}, gcm: GCM });
        assert.deepEqual(plain(await w.getterUtils.getCookieConsentStatus()),
            { consents: {} });
        // Theirs comes back with the location call this never makes.
        assert.equal(w.getterUtils.getUserLocationAndLanguage(), null);
    });

    it('says on the console what went in', ( ) => {
        let out;
        const w = open({ before: w_ => { out = lines(w_); } }).window;
        assert.equal(out.length, 1);
        assert.equal(out[0],
            '[consent-rr] securiti-reject ' + versions.securiti +
            ' consents=none tenant=read gcm=denied cookie=written'
        );
        assert.equal(w.SecuritiSDK.consentRR.mode, 'reject');
        assert.equal(w.SecuritiSDK.consentRR.version, versions.securiti);
        // And it says so where their tag is not in the page at all.
        let bare;
        open({
            html: '<html><body><p>x</p></body></html>',
            before: w_ => { bare = lines(w_); },
        });
        assert.ok(bare[0].includes(' tenant=unknown '), bare[0]);
    });

    it('does nothing the second time it is injected', ( ) => {
        const dom = open();
        const w = dom.window;
        const before_ = cookies(w).get('__privaci_cookie_consents');
        const out = lines(w);
        w.eval(reject);
        assert.deepEqual(out, []);
        assert.equal(cookies(w).get('__privaci_cookie_consents'), before_);
    });
});

/******************************************************************************/

describe('filters, securiti', ( ) => {
    const active = filtersText.split('\n')
        .filter(line => line.startsWith('!') === false)
        .join('\n');

    it('replaces the loader and noops what the loader would fetch', ( ) => {
        const ours = active.split('\n')
            .filter(line => line.includes('securiti-reject'));
        assert.equal(ours.length, 1);
        assert.ok(active.includes(
            '||cdn-prod.securiti.ai/consent/cookie-consent-sdk-loader.js' +
            '$script,redirect=securiti-reject.js'
        ));
        // The SDK itself, which only the loader asks for.
        assert.ok(active.includes('cookie-consent-sdk-*.js$script,redirect=noopjs'));
    });
});
