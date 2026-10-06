/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    Cookiez, a WordPress plugin served first-party. Measured on their build,
    and pinned against a REAL refusal record from a site running it - the
    whole record, key for key, because their own gate throws one away whose
    cookiesHash does not match and shows the banner again.

    The fixture parks scripts the way their blocker does, including one
    marked data-cc-mode="always", which is their never-free marker, and one
    that is not theirs at all.

*/

import { strict as assert } from 'node:assert';
import { before, describe, it } from 'node:test';
import {
    cookies, cookiesInJar, filtersText, loadResources, runDom, settle,
    versions,
} from './helpers.mjs';

const URL = 'https://glockenklang.de/seite';
const SRC = 'https://glockenklang.de/wp-content/plugins/cookiez/assets/' +
    'build/banner.js?ver=6b562b9aa0a8cbe0378b';
// The hash from the real record below.
const HASH = '79a37b2f51fbb37963e67d8d7061484e';

// What a real visitor's refusal looks like on that site.
const REAL = {
    data: {
        consentId: 'ab00ece8-55e2-42ad-a016-9f739d908d50',
        consent: {
            necessary: true, functional: false, analytics: false,
            advertising: false, unclassified: false,
        },
    },
    meta: { cookiesHash: HASH, timestamp: 1791239063 },
};

const SETTINGS = 'window.cookiezBannerSettings = {' +
    ' cookiesHash: "' + HASH + '",' +
    ' serviceUrl: "https://glockenklang.de/wp-json/cookiez/v1",' +
    ' settings: { consentExpiration: 180, supportGcm: true,' +
    '   gpcDntSupport: true, templateType: "opt-in" },' +
    ' integrations: { wpConsentApiActive: true,' +
    '   delegateGcmToSiteKit: false } };';

const PAGE = '<!doctype html><html lang="de"><head>' +
    '<script src="' + SRC + '"></script>' +
    '</head><body>' +
    // Theirs, by their own contract.
    '<script id="ana" type="text/plain" data-cc-category="analytics"' +
    ' data-cc-src="https://a.example/ga.js" data-keep="yes"></script>' +
    '<script id="always" type="text/plain" data-cc-category="advertising"' +
    ' data-cc-mode="always" data-cc-src="https://b.example/ad.js"></script>' +
    '<script id="inline" type="text/plain"' +
    ' data-cc-category="functional">window.fnRan = 1;</script>' +
    // Not theirs: no data-cc-category.
    '<script id="notheirs" type="text/plain"' +
    ' src="https://c.example/other.js"></script>' +
    '<p id="content">x</p></body></html>';

let reject;
let unblock;

before(async ( ) => {
    const resources = await loadResources();
    reject = resources.get('cookiez-reject.js');
    unblock = resources.get('cookiez-reject-unblock.js');
});

const boot = (which, options = {}) => runDom(
    which, options.url || URL, options.html || PAGE,
    w => {
        w.eval(options.settings === undefined ? SETTINGS : options.settings);
        w.__wp = [];
        w.__gtag = [];
        w.__net = [];
        w.wp_set_consent = (category, value) => {
            w.__wp.push(category + '=' + value);
        };
        w.gtag = (...args) => { w.__gtag.push(args); };
        w.fetch = url => {
            w.__net.push(String(url));
            return Promise.resolve({ ok: true, json: ( ) => Promise.resolve({}) });
        };
        w.navigator.sendBeacon = url => { w.__net.push(String(url)); return true; };
        if ( typeof options.before === 'function' ) { options.before(w); }
    }
).window;

const record = w => {
    const raw = cookies(w).get('cookiez-user-consent');
    if ( raw === undefined ) { return null; }
    return JSON.parse(decodeURIComponent(raw));
};
const lines = w => {
    const out = [];
    w.console.info = line => { out.push(String(line)); };
    return out;
};
const seed = value => ww => {
    ww.document.cookie = 'cookiez-user-consent=' +
        encodeURIComponent(JSON.stringify(value)) + '; path=/';
};

/******************************************************************************/

describe('cookiez-reject', ( ) => {
    it('writes their record, key for key against a real one', ( ) => {
        const got = record(boot(reject));
        // The same shape as a real visitor's refusal, and the same values.
        assert.deepEqual(got.data.consent, REAL.data.consent);
        assert.deepEqual(Object.keys(got), [ 'data', 'meta' ]);
        assert.deepEqual(Object.keys(got.meta), [ 'cookiesHash', 'timestamp' ]);
        assert.equal(got.meta.cookiesHash, HASH);
        assert.equal(typeof got.meta.timestamp, 'number');
    });

    it('carries their five categories in their own order', ( ) => {
        assert.deepEqual(Object.keys(record(boot(reject)).data.consent), [
            'necessary', 'functional', 'analytics', 'advertising',
            'unclassified',
        ]);
    });

    it('allows necessary and refuses the other four', ( ) => {
        const consent = record(boot(reject)).data.consent;
        assert.equal(consent.necessary, true);
        for ( const name of [
            'functional', 'analytics', 'advertising', 'unclassified',
        ] ) {
            assert.equal(consent[name], false, name);
        }
    });

    it('timestamps in seconds, as theirs does', ( ) => {
        const got = record(boot(reject));
        const now = Math.floor(Date.now() / 1000);
        assert.ok(Math.abs(got.meta.timestamp - now) < 5,
            String(got.meta.timestamp));
    });

    it('carries the hash their own gate checks', ( ) => {
        // Their gate: !hash || record.meta.cookiesHash === hash. A record
        // with the wrong one is thrown away and the banner shows again.
        assert.equal(record(boot(reject)).meta.cookiesHash, HASH);
        const other = boot(reject, {
            settings: 'window.cookiezBannerSettings = { cookiesHash: "beef",' +
                ' settings: { consentExpiration: 180 } };',
        });
        assert.equal(record(other).meta.cookiesHash, 'beef');
    });

    // Theirs is cookiesHash ?? "", and their gate passes a record when there
    // is no current hash to compare against - so a settings object of theirs
    // that carries no hash still gets a record, with an empty one.
    it('writes an empty hash where their settings carry none', ( ) => {
        const w = boot(reject, {
            settings: 'window.cookiezBannerSettings = {' +
                ' settings: { consentExpiration: 180 } };',
        });
        assert.equal(record(w).meta.cookiesHash, '');
    });

    // No settings at all is a different thing from settings without a hash:
    // their plugin always prints them, so their absence means not yet rather
    // than never. This used to write a record with an empty hash either way,
    // and an empty hash is what their gate throws away once a real one exists.
    it('writes nothing at all where there are no settings', ( ) => {
        const w = boot(reject, { settings: 'window.cookiezBannerSettings = {};' });
        assert.equal(record(w), null);
    });

    it('survives their own gate', ( ) => {
        // The gate, as their bundle runs it.
        const w = boot(reject);
        const got = record(w);
        const expiration = 180;
        const fresh = Date.now() / 1000 - got.meta.timestamp <= 86400 * expiration;
        const hash = w.cookiezBannerSettings.cookiesHash;
        assert.equal(Boolean(got.meta), true);
        assert.equal(fresh, true);
        assert.equal(!hash || got.meta.cookiesHash === hash, true);
    });

    it('mints no consentId, and leaves the key out as theirs does', ( ) => {
        // Theirs takes the id from their own server, and when that call
        // fails their record carries no consentId at all.
        const got = record(boot(reject));
        assert.deepEqual(Object.keys(got.data), [ 'consent' ]);
        assert.equal('consentId' in got.data, false);
    });

    it('keeps a consentId a visitor already carries', ( ) => {
        const got = record(boot(reject, { before: seed(REAL) }));
        assert.equal(got.data.consentId, REAL.data.consentId);
        assert.deepEqual(Object.keys(got.data), [ 'consentId', 'consent' ]);
    });

    it('overwrites a stored acceptance', ( ) => {
        const accepted = JSON.parse(JSON.stringify(REAL));
        for ( const name of Object.keys(accepted.data.consent) ) {
            accepted.data.consent[name] = true;
        }
        const got = record(boot(reject, { before: seed(accepted) }));
        assert.equal(got.data.consent.analytics, false);
        assert.equal(got.data.consent.advertising, false);
        // And the id it carried is still there.
        assert.equal(got.data.consentId, REAL.data.consentId);
    });

    it('writes with their own cookie attributes', ( ) => {
        const dom = runDom(reject, URL, PAGE, w => { w.eval(SETTINGS); });
        const [ cookie ] = cookiesInJar(dom, URL, 'cookiez-user-consent');
        assert.notEqual(cookie, undefined);
        assert.equal(String(cookie.sameSite).toLowerCase(), 'lax');
        assert.equal(cookie.path, '/');
        // max-age 86400 * consentExpiration, their default being 180 days.
        assert.equal(cookie.maxAge, 86400 * 180);
    });

    it('takes the expiry from their settings', ( ) => {
        const dom = runDom(reject, URL, PAGE, w => {
            w.eval('window.cookiezBannerSettings = { cookiesHash: "x",' +
                ' settings: { consentExpiration: 30 } };');
        });
        const [ cookie ] = cookiesInJar(dom, URL, 'cookiez-user-consent');
        assert.equal(cookie.maxAge, 86400 * 30);
    });

    it('tells the WordPress consent api, by their own names', ( ) => {
        // Their map is three of the five, and the names are not the
        // category names: analytics becomes statistics, advertising becomes
        // marketing.
        const w = boot(reject);
        assert.deepEqual([ ...w.__wp ], [
            'functional=deny', 'statistics=deny', 'marketing=deny',
        ]);
    });

    it('updates Google consent mode through gtag, as theirs does', ( ) => {
        // Theirs calls window.gtag directly rather than pushing a data layer.
        const w = boot(reject);
        assert.equal(w.__gtag.length, 1);
        const [ command, action, payload ] = w.__gtag[0];
        assert.equal(command, 'consent');
        assert.equal(action, 'update');
        assert.deepEqual(JSON.parse(JSON.stringify(payload)), {
            analytics_storage: 'denied',
            ad_storage: 'denied',
            ad_user_data: 'denied',
            ad_personalization: 'denied',
        });
    });

    it('stays quiet where a tenant has those integrations off', ( ) => {
        // Theirs gates both bridges on supportGcm, and the consent mode one
        // on not delegating to Site Kit.
        const off = boot(reject, {
            settings: 'window.cookiezBannerSettings = { cookiesHash: "x",' +
                ' settings: { supportGcm: false },' +
                ' integrations: { wpConsentApiActive: true } };',
        });
        assert.deepEqual([ ...off.__wp ], []);
        assert.equal(off.__gtag.length, 0);
        const siteKit = boot(reject, {
            settings: 'window.cookiezBannerSettings = { cookiesHash: "x",' +
                ' settings: { supportGcm: true },' +
                ' integrations: { wpConsentApiActive: false,' +
                ' delegateGcmToSiteKit: true } };',
        });
        assert.deepEqual([ ...siteKit.__wp ], []);
        assert.equal(siteKit.__gtag.length, 0);
    });

    it('posts nothing to their REST route', ( ) => {
        const w = boot(reject);
        assert.deepEqual([ ...w.__net ], []);
    });

    it('keeps its own marker off a page s walk of window', ( ) => {
        // This family's whole point is that their bundle puts up nothing a
        // page calls, so the one property here is not enumerable either.
        const w = boot(reject);
        assert.equal(typeof w.cookiezConsentRR, 'object');
        assert.equal(Object.keys(w).includes('cookiezConsentRR'), false);
        // The page's own cookiezBannerSettings is of course still there;
        // what must not be is anything this file added.
        const named = [];
        for ( const key in w ) {
            if ( key.startsWith('cookiez') ) { named.push(key); }
        }
        assert.deepEqual(named, [ 'cookiezBannerSettings' ]);
        assert.equal(
            Object.getOwnPropertyDescriptor(w, 'cookiezConsentRR').enumerable,
            false);
    });

    it('builds no banner and puts up no internals of its own', ( ) => {
        // window.cookiezBanner is their screenManager and translations, and
        // exists only when a banner is built.
        const w = boot(reject);
        assert.equal(w.cookiezBanner, undefined);
        assert.equal(w.document.querySelector('[id^="cookiez"]'), null);
    });

    it('leaves their parked scripts parked', ( ) => {
        const w = boot(reject);
        for ( const id of [ 'ana', 'always', 'inline' ] ) {
            assert.equal(w.document.getElementById(id).getAttribute('type'),
                'text/plain', id);
        }
        assert.equal(w.fnRan, undefined);
    });

    it('stands down on a second evaluation', ( ) => {
        // Their timestamps are in SECONDS, so comparing one across a second
        // evaluation inside the same second cannot fail. What is observable
        // is the bridges: a page told twice is a page told twice.
        const w = boot(reject);
        const wp = w.__wp.length;
        const gtag = w.__gtag.length;
        assert.ok(wp > 0);
        w.eval(reject);
        assert.equal(w.__wp.length, wp);
        assert.equal(w.__gtag.length, gtag);
        assert.equal(record(w).data.consent.analytics, false);
    });

    it('installs anyway on a page that removed the console', ( ) => {
        const w = boot(reject, { before: ww => { ww.console = undefined; } });
        assert.equal(record(w).data.consent.analytics, false);
    });

    it('announces what went in', ( ) => {
        let out;
        runDom(reject, URL, PAGE, w => {
            out = lines(w);
            w.eval(SETTINGS);
        });
        assert.equal(out.length, 1);
        assert.ok(out[0].startsWith(
            '[consent-rr] cookiez-reject ' + versions.cookiez));
        assert.ok(out[0].includes(' categories=necessary cookie=written'),
            out[0]);
        assert.ok(out[0].includes(' hash=theirs consentid=none'), out[0]);
        assert.ok(out[0].endsWith(' gpc=unset banner=none log=none'));
    });

    it('says when the browser sent a GPC signal', ( ) => {
        // Their own gpcDntSupport path decides without a banner, and under
        // an opt-in template that is a refusal - which is what this writes
        // either way, so it is reported rather than acted on.
        let out;
        runDom(reject, URL, PAGE, w => {
            out = lines(w);
            w.eval(SETTINGS);
            Object.defineProperty(w.navigator, 'globalPrivacyControl',
                { value: true, configurable: true });
        });
        assert.ok(out[0].includes(' gpc=set '), out[0]);
    });
});

/******************************************************************************/

describe('cookiez-reject-unblock', ( ) => {
    it('stores the same refusal', ( ) => {
        const got = record(boot(unblock));
        assert.deepEqual(got.data.consent, REAL.data.consent);
        assert.equal(got.meta.cookiesHash, HASH);
    });

    it('frees a parked script by their own selector', async ( ) => {
        const w = boot(unblock);
        await settle(40);
        const freed = [ ...w.document.querySelectorAll(
            'script[src="https://a.example/ga.js"]') ];
        assert.equal(freed.length, 1);
        // Their copy drops the type and every data-cc- attribute, and keeps
        // the rest.
        assert.equal(freed[0].getAttribute('type'), null);
        assert.equal(freed[0].getAttribute('data-cc-src'), null);
        assert.equal(freed[0].getAttribute('data-cc-category'), null);
        assert.equal(freed[0].getAttribute('data-keep'), 'yes');
        assert.equal(freed[0].id, 'ana');
    });

    it('keeps an inline parked script inline', ( ) => {
        const w = boot(unblock);
        const node = w.document.getElementById('inline');
        assert.equal(node.getAttribute('type'), null);
        assert.match(node.textContent, /window\.fnRan/);
    });

    it('puts the copy back where the original was', ( ) => {
        const w = boot(unblock);
        const ids = [ ...w.document.querySelectorAll('script[id]') ]
            .map(node => node.id);
        assert.deepEqual(ids, [ 'ana', 'always', 'inline', 'notheirs' ]);
    });

    it('leaves a node marked always parked, which is their marker', ( ) => {
        // Their own un-parking excludes data-cc-mode="always" with a :not().
        const w = boot(unblock);
        const node = w.document.getElementById('always');
        assert.equal(node.getAttribute('type'), 'text/plain');
        assert.equal(node.getAttribute('data-cc-src'),
            'https://b.example/ad.js');
        assert.equal(
            w.document.querySelectorAll('[src="https://b.example/ad.js"]')
                .length, 0);
    });

    it('frees nothing that is not theirs', ( ) => {
        const w = boot(unblock);
        const node = w.document.getElementById('notheirs');
        assert.equal(node.getAttribute('type'), 'text/plain');
        assert.equal(node.getAttribute('src'), 'https://c.example/other.js');
    });

    it('still refuses in the record and to both bridges', ( ) => {
        const w = boot(unblock);
        assert.equal(record(w).data.consent.analytics, false);
        assert.deepEqual([ ...w.__wp ], [
            'functional=deny', 'statistics=deny', 'marketing=deny',
        ]);
    });

    it('counts what it freed, and says so', ( ) => {
        let out;
        runDom(unblock, URL, PAGE, w => {
            out = lines(w);
            w.eval(SETTINGS);
        });
        assert.ok(out[0].includes(' freed=2 '), out[0]);
    });
});

/******************************************************************************/

describe('filters, cookiez', ( ) => {
    it('matches the file under any cookiez plugin directory', ( ) => {
        assert.match(
            filtersText,
            /^\/plugins\/cookiez\*\/assets\/build\/banner\.js\$script,redirect=cookiez-reject\.js$/m
        );
    });

    it('sends their language chunk to noopjs', ( ) => {
        assert.match(
            filtersText,
            /^\/plugins\/cookiez\*\/assets\/build\/lang-\*\.js\$script,redirect=noopjs$/m
        );
    });

    it('says in the list that the hash decides', ( ) => {
        assert.match(filtersText, /THE HASH DECIDES WHETHER THE RECORD COUNTS/);
        assert.match(filtersText, /THE consentId IS NOT MINTED/);
    });
});

/******************************************************************************/

// Their plugin prints window.cookiezBannerSettings before their bundle, so a
// redirect finds it. A scriptlet runs before any of that.
describe('cookiez, before their settings exist', ( ) => {
    const SETTINGS_LATE = 'window.cookiezBannerSettings = {' +
        ' cookiesHash: "79a37b2f51fbb37963e67d8d7061484e",' +
        ' settings: { consentExpiration: 180, supportGcm: true },' +
        ' integrations: { wpConsentApiActive: true } };';

    it('writes nothing until they are there', ( ) => {
        const w = runDom(reject, URL, PAGE).window;
        assert.equal(cookies(w).get('cookiez-user-consent'), undefined);
    });

    // Their hash is the one thing their own gate checks before deciding a
    // record counts, and an empty one is what this used to write.
    it('writes their hash once they arrive, not an empty one', async ( ) => {
        const w = runDom(reject, URL, PAGE).window;
        w.eval(SETTINGS_LATE);
        await settle(25);
        const raw = cookies(w).get('cookiez-user-consent');
        assert.ok(raw, 'a record at all');
        const stored = JSON.parse(decodeURIComponent(raw));
        assert.equal(
            stored.meta.cookiesHash, '79a37b2f51fbb37963e67d8d7061484e'
        );
        assert.equal(stored.data.consent.analytics, false);
    });

    // Counted rather than compared: their record carries a timestamp in
    // seconds, so two writes in the same second are the same string - which
    // is how a second evaluation hid in this family once before.
    it('installs once, not once per pass', async ( ) => {
        const told = [];
        const w = runDom(reject, URL, PAGE, ww => {
            ww.wp_set_consent = (category, value) => {
                told.push(category + '=' + value);
            };
        }).window;
        w.eval(SETTINGS_LATE);
        await settle(60);
        const first = told.length;
        assert.ok(first > 0, 'their bridge was told once');
        w.document.body.append(w.document.createElement('div'));
        await settle(250);
        assert.equal(told.length, first, told.join(','));
    });

    // Their settings printed by a script further down the document are past
    // the first look and past the tick after it.
    it('installs when they arrive a tick later', async ( ) => {
        const w = runDom(reject, URL, PAGE).window;
        await settle(40);
        assert.equal(cookies(w).get('cookiez-user-consent'), undefined);
        w.eval(SETTINGS_LATE);
        w.document.body.append(w.document.createElement('div'));
        await settle(250);
        const raw = cookies(w).get('cookiez-user-consent');
        assert.ok(raw, 'the pass that runs as the document arrives catches it');
        assert.equal(
            JSON.parse(decodeURIComponent(raw)).meta.cookiesHash,
            '79a37b2f51fbb37963e67d8d7061484e'
        );
    });

    it('is not fooled by an empty settings object', async ( ) => {
        const w = runDom(reject, URL, PAGE).window;
        w.eval('window.cookiezBannerSettings = {};');
        await settle(60);
        assert.equal(cookies(w).get('cookiez-user-consent'), undefined);
    });
});

/******************************************************************************/

// A resource replacement runs where their script tag is, in <head>, at
// document_start - so nothing a page parks for them exists yet. Freeing
// parked tags therefore has to be a pass that runs again as the document
// arrives, and these pin both halves of that: the late tag is freed, and the
// pass does not answer its own work for ever.
describe('cookiez, as the document arrives', ( ) => {
    const late = w => {
        const node = w.document.createElement('script');
        node.id = 'late';
        node.type = 'text/plain';
        node.setAttribute('data-cc-category', 'analytics');
        node.setAttribute('data-cc-src', 'https://l.example/l.js');
        w.document.body.append(node);
        return node;
    };

    it('frees a tag added after it ran', async ( ) => {
        const w = boot(unblock);
        await settle(40);
        late(w);
        await settle(200);
        const node = w.document.getElementById('late');
        assert.equal(node.getAttribute('type'), null);
        assert.equal(node.getAttribute('src'), 'https://l.example/l.js');
    });

    it('does not free its own work over and over', async ( ) => {
        const w = boot(unblock);
        const count = ( ) => w.document.querySelectorAll('script').length;
        late(w);
        await settle(200);
        const settled = count();
        await settle(250);
        assert.equal(count(), settled);
    });

    // The boot line already carries a count, so a pass that frees at boot -
    // which is what a fixture with the tags already in it is - must not also
    // report itself as deferred. Only a later pass does.
    it('does not report the first pass as deferred', async ( ) => {
        let out;
        const w = boot(unblock, { before: ww => { out = lines(ww); } });
        await settle(200);
        assert.equal(
            out.filter(line => / deferred$/.test(line)).length, 0,
            out.join('\n')
        );
        assert.equal(
            out.filter(line => /^\[consent-rr\] cookiez-reject-unblock /.test(line))
                .length, 1
        );
    });

    it('the plain refusal leaves a late tag parked too', async ( ) => {
        const w = boot(reject);
        late(w);
        await settle(200);
        assert.equal(
            w.document.getElementById('late').getAttribute('type'),
            'text/plain'
        );
    });
});
