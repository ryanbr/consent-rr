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

const URL = 'https://www.realtruck.com/';

const PAGE = '<!doctype html><html lang="en"><head>' +
    '<script src="https://global.ketchcdn.com/web/v3/config/realtruck/' +
    'realtruck_com/boot.js"></script>' +
    '</head><body><p id="content">x</p></body></html>';

// What their boot script leaves on the page before the SDK arrives.
const BOOT = 'window.semaphore = window.semaphore || [];' +
    'window.ketch = function() { window.semaphore.push(arguments); };' +
    'window.semaphore.unshift([ "init", { organization: { code: "x" } } ]);';

let reject;

before(async ( ) => {
    reject = (await loadResources()).get('ketch-reject.js');
});

const plain = value => JSON.parse(JSON.stringify(value));

const encode = value => Buffer.from(JSON.stringify(value)).toString('base64');
const decode = value => JSON.parse(
    Buffer.from(value, 'base64').toString('utf8')
);

const boot = (options = {}) => runDom(
    reject, options.url || URL, options.html || PAGE,
    w => {
        if ( typeof options.before === 'function' ) { options.before(w); }
        if ( options.boot !== false ) { w.eval(BOOT); }
    }
);

const lines = w => {
    const out = [];
    w.console.info = line => { out.push(line); };
    return out;
};

const GRANTED = {
    analytics: { status: 'granted', canonicalPurposes: [ 'analytics' ] },
    behavioral_advertising: {
        status: 'granted',
        canonicalPurposes: [ 'behavioral_advertising' ],
    },
    essential_services: { status: 'granted' },
};

/******************************************************************************/

describe('ketch-reject', ( ) => {
    it('ships as one resource, in the format uBO parses', async ( ) => {
        const names = Array.from((await loadResources()).keys())
            .filter(name => name.startsWith('ketch-'));
        assert.deepEqual(names, [ 'ketch-reject.js' ]);
        assert.equal(/^[ \t]*$/m.test(reject), false);
        assert.equal(/[^\x20-\x7e\t\n]/.test(reject), false);
        assert.ok(reject.includes("const VERSION = '" + versions.ketch + "'"));
    });

    it('takes over their queue the way their SDK does', ( ) => {
        let out;
        const w = boot({ before: w_ => { out = lines(w_); } }).window;
        // Their own init replaces push, sets semaphore.ketch and marks it
        // loaded. Page code waits on exactly that.
        assert.equal(w.semaphore.loaded, true);
        assert.equal(typeof w.semaphore.push, 'function');
        assert.equal(typeof w.semaphore.ketch, 'object');
        assert.equal(typeof w.ketch, 'function');
        assert.ok(out[0].includes(' queue=ready'), out[0]);
    });

    it('answers what the page asked before it arrived', async ( ) => {
        const w = boot({
            before: w_ => {
                w_.eval(BOOT);
                w_.eval('window.__got = [];' +
                    'window.ketch("getConsent", function(c) {' +
                    ' window.__got.push(Object.keys(c.purposes).length); });' +
                    'window.ketch("on", "consent", function(c) {' +
                    ' window.__got.push("event:" + c.vendors.length); });');
            },
            boot: false,
        }).window;
        await settle(10);
        // Their init drains the queue; so does this, rather than leaving the
        // page waiting on an SDK that will not arrive.
        assert.deepEqual(plain(w.__got), [ 'event:0', 0 ]);
    });

    it('answers their consent shape, with nothing in it', async ( ) => {
        const w = boot().window;
        const consent = await w.semaphore.ketch.getConsent();
        // Their own retrieveConsent() answers exactly this when nothing is
        // recorded.
        assert.deepEqual(plain(consent), {
            purposes: {},
            vendors: [],
            googleVendors: [],
            vendorConsents: { tcf: {}, google: {} },
        });
        assert.equal(await w.semaphore.ketch.getIsDisplayed(), false);
    });

    it('writes no record where it knows no purpose codes', ( ) => {
        let out;
        const w = boot({ before: w_ => { out = lines(w_); } }).window;
        // The codes live in the config.json their SDK fetches, and their own
        // setPublicConsent returns without writing when the map is empty.
        assert.equal(w.localStorage.getItem('_ketch_consent_v1_'), null);
        assert.equal(cookies(w).has('_ketch_consent_v1_'), false);
        assert.ok(out[0].includes(' purposes=none known'), out[0]);
        assert.ok(out[0].includes(' record=nocodes'), out[0]);
    });

    it('revokes every code a returning visitor already carries', ( ) => {
        let out;
        const w = boot({
            before: w_ => {
                out = lines(w_);
                w_.localStorage.setItem('_ketch_consent_v1_', encode(GRANTED));
            },
        }).window;
        const stored = decode(w.localStorage.getItem('_ketch_consent_v1_'));
        assert.deepEqual(plain(stored), {
            analytics: { status: 'denied', canonicalPurposes: [ 'analytics' ] },
            behavioral_advertising: {
                status: 'denied',
                canonicalPurposes: [ 'behavioral_advertising' ],
            },
            essential_services: { status: 'denied' },
        });
        // Their canonical purposes come from the config, so a record carrying
        // them is the only place to learn them - they are kept, not dropped.
        assert.ok(out[0].includes(' purposes=3 denied'), out[0]);
        assert.ok(out[0].includes(' record=revoked'), out[0]);
    });

    it('writes that record where they write it, both places', ( ) => {
        const w = boot({
            before: w_ => {
                w_.localStorage.setItem('_ketch_consent_v1_', encode(GRANTED));
            },
        }).window;
        const fromCookie = decode(
            decodeURIComponent(cookies(w).get('_ketch_consent_v1_'))
        );
        assert.equal(fromCookie.analytics.status, 'denied');
        assert.equal(
            w.localStorage.getItem('_ketch_consent_v1_'),
            cookies(w).get('_ketch_consent_v1_')
        );
    });

    it('reads their record out of the cookie when that is all there is', ( ) => {
        const w = boot({
            before: w_ => {
                w_.document.cookie = '_ketch_consent_v1_=' + encode(GRANTED);
            },
        }).window;
        const stored = decode(w.localStorage.getItem('_ketch_consent_v1_'));
        assert.equal(stored.behavioral_advertising.status, 'denied');
    });

    it('reports those codes as refused through their API', async ( ) => {
        const w = boot({
            before: w_ => {
                w_.localStorage.setItem('_ketch_consent_v1_', encode(GRANTED));
            },
        }).window;
        const consent = await w.semaphore.ketch.getConsent();
        assert.deepEqual(plain(consent.purposes), {
            analytics: false,
            behavioral_advertising: false,
            essential_services: false,
        });
    });

    it('denies their Google consent mode and pushes their two events', ( ) => {
        const w = boot({
            before: w_ => {
                w_.localStorage.setItem('_ketch_consent_v1_', encode(GRANTED));
            },
        }).window;
        const calls = Array.from(w.dataLayer);
        assert.deepEqual(plain(Array.from(calls[0])), [
            'consent', 'update', {
                ad_storage: 'denied',
                ad_personalization: 'denied',
                ad_user_data: 'denied',
                analytics_storage: 'denied',
                personalization_storage: 'denied',
                functionality_storage: 'denied',
                security_storage: 'granted',
            },
        ]);
        assert.deepEqual(plain(Array.from(calls[1])),
            [ 'set', 'ads_data_redaction', true ]);
        // Their googletag plugin pushes both of these, with a key per purpose.
        assert.deepEqual(plain(calls[2]), {
            event: 'ketchPermitChanged',
            analytics: false,
            behavioral_advertising: false,
            essential_services: false,
        });
        assert.equal(plain(calls[3]).event, 'switchbitPermitChanged');
    });

    it('keeps a gtag the page already has', ( ) => {
        const w = boot({
            before: w_ => {
                w_.eval('window.dataLayer = [];' +
                    'window.__gtagCalls = [];' +
                    'window.gtag = function() {' +
                    ' window.__gtagCalls.push(Array.from(arguments)); };');
            },
        }).window;
        // Theirs calls window.gtag, so a page that defined one sees the calls.
        assert.equal(w.__gtagCalls.length, 2);
        assert.equal(w.__gtagCalls[0][0], 'consent');
        assert.equal(w.__gtagCalls[1][1], 'ads_data_redaction');
    });

    it('answers a consent listener registered after the fact', ( ) => {
        const w = boot().window;
        w.eval('window.__late = [];' +
            'window.ketch("on", "consent", function(c) {' +
            ' window.__late.push(c.vendors.length); });');
        // The event has been and gone by then, so it is answered at once.
        assert.deepEqual(plain(w.__late), [ 0 ]);
    });

    it('grants nothing when the page asks it to show or save', async ( ) => {
        const w = boot({
            before: w_ => {
                w_.localStorage.setItem('_ketch_consent_v1_', encode(GRANTED));
            },
        }).window;
        await w.semaphore.ketch.showConsentExperience();
        await w.semaphore.ketch.setConsent({ purposes: { analytics: true } });
        const stored = decode(w.localStorage.getItem('_ketch_consent_v1_'));
        assert.equal(stored.analytics.status, 'denied');
        const consent = await w.semaphore.ketch.getConsent();
        assert.equal(consent.purposes.analytics, false);
    });

    it('does nothing the second time it is injected', ( ) => {
        const w = boot().window;
        const pushes = w.dataLayer.length;
        w.eval(reject);
        assert.equal(w.dataLayer.length, pushes);
    });

    it('says on the console what it did', ( ) => {
        let out;
        boot({ before: w_ => { out = lines(w_); } });
        assert.equal(out.length, 1);
        assert.equal(
            out[0],
            '[consent-rr] ketch-reject ' + versions.ketch +
            ' purposes=none known record=nocodes gcm=denied queue=ready' +
            ' drained=0'
        );
    });

    it('refuses the same with GPC on, which changes only their side', ( ) => {
        const w = boot({
            before: w_ => {
                Object.defineProperty(w_.navigator, 'globalPrivacyControl', {
                    value: true, configurable: true,
                });
                w_.localStorage.setItem('_ketch_consent_v1_', encode(GRANTED));
            },
        }).window;
        // They read it, and strictly: navigator.globalPrivacyControl true AND
        // a gpcsignal cookie, then only in a jurisdiction their gpc plugin
        // lists. This refuses with or without any of that.
        const stored = decode(w.localStorage.getItem('_ketch_consent_v1_'));
        assert.equal(stored.analytics.status, 'denied');
    });
});

/******************************************************************************/

describe('filters, ketch', ( ) => {
    it('replaces the loader and noops the sdk it would fetch', ( ) => {
        const active = filtersText.split('\n')
            .filter(line => line !== '' && line.startsWith('!') === false)
            .filter(line => line.includes('ketch'));
        assert.deepEqual(active, [
            '||global.ketchcdn.com/web/v3/config/*/boot.js' +
                '$script,redirect=ketch-reject.js',
            '||cdn.ketchjs.com/ketchtag/*/ketch-sdk.js$script,redirect=noopjs',
        ]);
    });

    it('matches the urls their properties serve', ( ) => {
        const matches = (pattern, url) => {
            const body = pattern.slice(2, pattern.indexOf('$'));
            const re = new RegExp(
                '^https?://([^/]*\\.)?' +
                body.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
            );
            return re.test(url);
        };
        const rules = filtersText.split('\n')
            .filter(line => line.startsWith('||') && line.includes('ketch'));
        const loader = rules.filter(line => line.includes('ketch-reject'));
        for ( const url of [
            'https://global.ketchcdn.com/web/v3/config/realtruck/realtruck_com/boot.js',
            'https://global.ketchcdn.com/web/v3/config/other/other_com/boot.js',
        ] ) {
            assert.ok(loader.some(r => matches(r, url)), 'no rule matches ' + url);
        }
        const noops = rules.filter(line => line.includes('noopjs'));
        assert.ok(noops.some(r => matches(r,
            'https://cdn.ketchjs.com/ketchtag/stable/v2.12/ketch-sdk.js')));
        // The config and the geo lookup are fetched by the SDK this keeps out,
        // and a rule for them would break a property whose SDK still runs.
        for ( const url of [
            'https://global.ketchcdn.com/web/v3/config/realtruck/realtruck_com/production/default/en/config.json?hash=3763001968271299280',
            'https://global.ketchcdn.com/web/v3/ip',
        ] ) {
            for ( const rule of rules ) {
                assert.equal(matches(rule, url), false, rule + ' matches ' + url);
            }
        }
    });
});
