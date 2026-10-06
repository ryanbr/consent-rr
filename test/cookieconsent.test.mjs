/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    CookieConsent v3 by Orest Bida - the MIT-licensed one, not Osano's old
    library of the same common name.

    This family had an oracle the others did not: the bundle it stands in for
    is open source, so every expectation below was taken from running the real
    cookieconsent.umd.js 3.1.0 beside this resource in the same page, with the
    same config, and comparing - the record field for field, their
    getUserPreferences, which cookies their auto-clear deleted, which parked
    tags were freed, and which callbacks fired in which order. The two agreed
    on all of it. That comparison is in the commit; the pins here are what it
    established.

*/

import { strict as assert } from 'node:assert';
import { before, describe, it } from 'node:test';
import {
    cookies, cookiesInJar, filtersText, loadResources, runDom, settle,
    versions,
} from './helpers.mjs';

const URL_PAGE = 'https://example.org/page';
const SRC = 'https://cdn.jsdelivr.net/gh/orestbida/cookieconsent@3.1.0/' +
    'dist/cookieconsent.umd.js';

const PAGE = '<!doctype html><html lang="en"><head>' +
    '<script src="' + SRC + '"></script>' +
    '</head><body>' +
    // Parked by their own manager, in the three shapes it takes.
    '<script id="ga" type="text/plain" data-category="analytics"' +
    ' data-src="https://a.example/ga.js" data-keep="yes"></script>' +
    '<script id="ads" type="text/plain" data-category="marketing"' +
    ' data-type="text/javascript" data-src="https://b.example/ads.js"></script>' +
    '<script id="inline" type="text/plain" data-category="analytics">' +
    'window.inlineRan = 1;</script>' +
    // Their inverted form, which runs when a category is NOT accepted.
    '<script id="inv" type="text/plain" data-category="!analytics">' +
    'window.invRan = 1;</script>' +
    // Not theirs: no data-category.
    '<script id="notheirs" type="text/plain" src="https://c.example/c.js"></script>' +
    '<p id="content">x</p></body></html>';

const CONFIG = {
    revision: 2,
    categories: {
        necessary: { enabled: true, readOnly: true },
        analytics: {
            autoClear: { cookies: [ { name: '_ga' }, { name: '/^_gid/' } ] },
            services: { ga4: { label: 'GA4' } },
        },
        marketing: {},
    },
    language: { default: 'en' },
};

let reject;
let unblock;
let accept;

before(async ( ) => {
    const resources = await loadResources();
    reject = resources.get('cookieconsent-reject.js');
    unblock = resources.get('cookieconsent-reject-unblock.js');
    accept = resources.get('cookieconsent-accept.js');
});

// Their crypto, made predictable: their own id is built with
// crypto.getRandomValues, so the shape can be pinned without the value.
const boot = (which, options = {}) => {
    const dom = runDom(which, options.url || URL_PAGE, options.html || PAGE, w => {
        w.__order = [];
        w.__events = [];
        for ( const name of [
            'cc:onFirstConsent', 'cc:onConsent', 'cc:onChange',
        ] ) {
            w.addEventListener(name, event => {
                w.__events.push({ name, detail: event.detail });
            });
        }
        if ( typeof options.before === 'function' ) { options.before(w); }
    });
    const w = dom.window;
    if ( options.run !== false ) {
        const config = Object.assign({}, CONFIG, options.config || {});
        config.onFirstConsent = ( ) => { w.__order.push('onFirstConsent'); };
        config.onConsent = detail => {
            w.__order.push('onConsent');
            w.__consent = detail;
        };
        config.onChange = detail => {
            w.__order.push('onChange');
            w.__change = detail;
        };
        // Their regexp autoClear entry cannot cross the realm as a literal.
        const categories = config.categories;
        if ( categories && categories.analytics && categories.analytics.autoClear ) {
            categories.analytics.autoClear = {
                cookies: [ { name: '_ga' }, { name: new w.RegExp('^_gid') } ],
            };
        }
        w.CookieConsent.run(config);
    }
    dom.w = w;
    return dom;
};

const win = (which, options = {}) => boot(which, options).window;

const record = w => {
    const raw = cookies(w).get('cc_cookie');
    return raw === undefined
        ? null
        : JSON.parse(decodeURIComponent(raw));
};

const state = (w, id) => {
    const element = w.document.getElementById(id);
    if ( element === null ) { return 'gone'; }
    return element.getAttribute('type') === 'text/plain' ? 'parked' : 'freed';
};

const lines = w => {
    const out = [];
    w.console.info = line => { out.push(String(line)); };
    return out;
};

/******************************************************************************/

describe('cookieconsent-reject', ( ) => {
    it('waits for their run, as their own bundle does', ( ) => {
        const w = win(reject, { run: false });
        assert.equal(typeof w.CookieConsent, 'object');
        assert.equal(typeof w.CookieConsent.run, 'function');
        assert.equal(record(w), null, 'nothing written until run');
        assert.equal(w.cookieConsentRR.state().started, false);
    });

    it('writes their record, field for field', ( ) => {
        const w = win(reject);
        const stored = record(w);
        assert.deepEqual(
            Object.keys(stored).sort(),
            [
                'categories', 'consentId', 'consentTimestamp', 'data',
                'expirationTime', 'languageCode', 'lastConsentTimestamp',
                'revision', 'services',
            ]
        );
        assert.deepEqual(Array.from(stored.categories), [ 'necessary' ]);
        assert.equal(stored.revision, 2, 'the page revision, not a default');
        assert.equal(stored.data, null);
        assert.equal(stored.languageCode, 'en');
        assert.match(stored.consentTimestamp, /^\d{4}-\d{2}-\d{2}T/);
        assert.match(stored.lastConsentTimestamp, /^\d{4}-\d{2}-\d{2}T/);
        assert.equal(typeof stored.expirationTime, 'number');
        assert.deepEqual(
            JSON.parse(JSON.stringify(stored.services)),
            { necessary: [], analytics: [], marketing: [] }
        );
    });

    // Their gate wants a string id, and theirs is minted in the browser
    // rather than handed down by a server - so this mints one too.
    it('mints their uuid, and carries an existing one over', ( ) => {
        const fresh = record(win(reject));
        assert.match(
            fresh.consentId,
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/
        );
        const held = win(reject, {
            before: ww => {
                ww.document.cookie = 'cc_cookie=' + encodeURIComponent(
                    JSON.stringify({
                        categories: [ 'necessary', 'analytics' ],
                        revision: 2,
                        consentId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
                        consentTimestamp: '2026-01-01T00:00:00.000Z',
                        lastConsentTimestamp: '2026-01-02T00:00:00.000Z',
                        services: { necessary: [], analytics: [ 'ga4' ] },
                        languageCode: 'en',
                        data: null,
                    })
                ) + '; path=/';
            },
        });
        const stored = record(held);
        assert.equal(stored.consentId, 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
        assert.equal(
            stored.consentTimestamp, '2026-01-01T00:00:00.000Z',
            'theirs keeps the first one'
        );
        assert.notEqual(stored.lastConsentTimestamp, '2026-01-02T00:00:00.000Z');
        assert.deepEqual(Array.from(stored.categories), [ 'necessary' ]);
    });

    it('writes it with their own cookie attributes', ( ) => {
        const dom = boot(reject);
        const [ cookie ] = cookiesInJar(dom, URL_PAGE, 'cc_cookie');
        assert.equal(cookie.path, '/');
        assert.equal(cookie.sameSite, 'lax');
        const days = (cookie.expires.getTime() - Date.now()) / 864e5;
        assert.ok(days > 180 && days < 183, 'their 182 days, got ' + days);
    });

    it('takes their cookie name and their localStorage option', ( ) => {
        const named = win(reject, {
            config: { cookie: { name: 'my_consent' } },
        });
        assert.ok(cookies(named).has('my_consent'));
        const local = win(reject, {
            config: { cookie: { useLocalStorage: true } },
        });
        assert.equal(cookies(local).get('cc_cookie'), undefined);
        const raw = local.localStorage.getItem('cc_cookie');
        assert.ok(raw, 'their decoded json');
        assert.deepEqual(Array.from(JSON.parse(raw).categories), [ 'necessary' ]);
    });

    it('answers their whole api', ( ) => {
        const w = win(reject);
        for ( const name of [
            'acceptCategory', 'acceptService', 'acceptedCategory',
            'acceptedService', 'eraseCookies', 'getConfig', 'getCookie',
            'getUserPreferences', 'hide', 'hidePreferences', 'loadScript',
            'reset', 'run', 'setCookieData', 'setLanguage', 'show',
            'showPreferences', 'validConsent', 'validCookie',
        ] ) {
            assert.equal(typeof w.CookieConsent[name], 'function', name);
        }
    });

    it('answers their reads as a refusal', ( ) => {
        const w = win(reject);
        const api = w.CookieConsent;
        assert.equal(api.acceptedCategory('necessary'), true);
        assert.equal(api.acceptedCategory('analytics'), false);
        assert.equal(api.acceptedService('ga4', 'analytics'), false);
        assert.equal(api.validConsent(), true, 'a record exists');
        assert.deepEqual(
            JSON.parse(JSON.stringify(api.getUserPreferences())),
            {
                acceptType: 'necessary',
                acceptedCategories: [ 'necessary' ],
                rejectedCategories: [ 'analytics', 'marketing' ],
                acceptedServices: { necessary: [], analytics: [], marketing: [] },
                rejectedServices: {
                    necessary: [], analytics: [ 'ga4' ], marketing: [],
                },
            }
        );
        assert.equal(api.getCookie('revision'), 2);
        assert.equal(api.getConfig('revision'), 2);
    });

    it('cannot be argued up by their own setters', ( ) => {
        const w = win(reject);
        const api = w.CookieConsent;
        api.acceptCategory('all');
        api.acceptService('ga4', 'analytics');
        assert.equal(api.acceptedCategory('analytics'), false);
        assert.deepEqual(Array.from(record(w).categories), [ 'necessary' ]);
    });

    // Their own guard: a second run does nothing at all. Counted on the
    // marker rather than on the callbacks, because a second run carrying no
    // callbacks could not move those either way.
    it('runs once, by their own flag', ( ) => {
        const w = win(reject);
        assert.equal(w._ccRun, true);
        const before = w.cookieConsentRR.state();
        w.CookieConsent.run({
            revision: 9,
            categories: { necessary: { readOnly: true }, extra: {} },
            onConsent: ( ) => { w.__order.push('second'); },
        });
        const after = w.cookieConsentRR.state();
        assert.equal(after.told, before.told, 'nothing said again');
        assert.deepEqual(after.accepted, before.accepted);
        assert.equal(record(w).revision, 2, 'and the record is untouched');
        assert.equal(w.__order.includes('second'), false);
    });

    it('does their auto-clear, names and patterns both', ( ) => {
        const w = win(reject, {
            before: ww => {
                ww.document.cookie = '_ga=GA1.1.x; path=/';
                ww.document.cookie = '_gid_extra=1; path=/';
                ww.document.cookie = 'keep_me=1; path=/';
            },
        });
        const held = cookies(w);
        assert.equal(held.get('_ga'), undefined, 'their named entry');
        assert.equal(held.get('_gid_extra'), undefined, 'their regexp entry');
        assert.equal(held.get('keep_me'), '1', 'and nothing else');
    });

    it('does not reload, whatever their autoClear asks', async ( ) => {
        let reloads = 0;
        const w = win(reject, {
            config: {
                categories: {
                    necessary: { enabled: true, readOnly: true },
                    analytics: {
                        autoClear: { cookies: [ { name: '_ga' } ], reloadPage: true },
                    },
                },
            },
            before: ww => {
                ww.document.cookie = '_ga=1; path=/';
                try {
                    Object.defineProperty(ww.location, 'reload', {
                        value: ( ) => { reloads += 1; },
                        configurable: true,
                    });
                } catch ( ex ) {
                }
            },
        });
        await settle(40);
        assert.equal(reloads, 0);
        assert.equal(cookies(w).get('_ga'), undefined, 'but the cookie goes');
    });

    it('leaves their parked tags parked', ( ) => {
        const w = win(reject);
        for ( const id of [ 'ga', 'ads', 'inline', 'inv' ] ) {
            assert.equal(state(w, id), 'parked', id);
        }
        assert.equal(w.inlineRan, undefined);
        assert.equal(w.invRan, undefined);
        assert.equal(w.cookieConsentRR.state().parked, 4, 'theirs, counted');
    });

    // Theirs returns before doing anything where it thinks it is a crawler.
    it('leaves a bot alone, as theirs does', ( ) => {
        for ( const agent of [
            'Mozilla/5.0 (compatible; Googlebot/2.1)',
            'Mozilla/5.0 Yahoo! Slurp',
            'something spider something',
        ] ) {
            const w = win(reject, {
                before: ww => {
                    Object.defineProperty(ww.navigator, 'userAgent', {
                        value: agent, configurable: true,
                    });
                },
            });
            assert.equal(record(w), null, agent);
        }
        const driver = win(reject, {
            before: ww => {
                Object.defineProperty(ww.navigator, 'webdriver', {
                    value: true, configurable: true,
                });
            },
        });
        assert.equal(record(driver), null, 'navigator.webdriver');
    });

    it('still answers where their tenant turned that off', ( ) => {
        const w = win(reject, {
            config: { hideFromBots: false },
            before: ww => {
                Object.defineProperty(ww.navigator, 'userAgent', {
                    value: 'Googlebot/2.1', configurable: true,
                });
            },
        });
        assert.ok(record(w));
    });
});

/******************************************************************************/

// Three things the open-source oracle caught on a second pass, each measured
// by running their own 3.1.0 bundle beside this one.
describe('cookieconsent, what their config can be', ( ) => {
    // Theirs takes a function here and calls it with the acceptType:
    //   $ = () => { const e = cookie.expiresAfterDays;
    //               return w(e) ? e(m.o.F) : e }
    it('calls their expiresAfterDays where it is a function', ( ) => {
        const seen = [];
        const rejecting = boot(reject, {
            config: {
                cookie: {
                    expiresAfterDays: type => {
                        seen.push(type);
                        return type === 'all' ? 365 : 30;
                    },
                },
            },
        });
        const [ held ] = cookiesInJar(rejecting, URL_PAGE, 'cc_cookie');
        const days = Math.round((held.expires.getTime() - Date.now()) / 864e5);
        assert.equal(days, 30, 'their own answer, not the 182 default');
        assert.deepEqual(seen, [ 'necessary' ], 'called with the acceptType');

        const accepting = boot(accept, {
            config: {
                cookie: { expiresAfterDays: type => type === 'all' ? 365 : 30 },
            },
        });
        const [ granted ] = cookiesInJar(accepting, URL_PAGE, 'cc_cookie');
        assert.equal(
            Math.round((granted.expires.getTime() - Date.now()) / 864e5), 365
        );
    });

    it('keeps their number form working', ( ) => {
        const dom = boot(reject, {
            config: { cookie: { expiresAfterDays: 7 } },
        });
        const [ held ] = cookiesInJar(dom, URL_PAGE, 'cc_cookie');
        assert.equal(
            Math.round((held.expires.getTime() - Date.now()) / 864e5), 7
        );
    });

    // Their own per-service callbacks, from the pass that runs their script
    // tags. Their Se starts false, so an accepted service gets onAccept and
    // one that was never accepted gets nothing.
    it('calls their service onAccept where the surface accepts it', ( ) => {
        const withService = extra => Object.assign({}, CONFIG, {
            categories: {
                necessary: { enabled: true, readOnly: true },
                analytics: {
                    services: {
                        ga4: {
                            label: 'GA4',
                            onAccept: ( ) => { extra.push('accept'); },
                            onReject: ( ) => { extra.push('reject'); },
                        },
                    },
                },
            },
        });
        const refused = [];
        win(reject, { config: withService(refused) });
        assert.deepEqual(refused, [], 'neither, on a refusal');

        const granted = [];
        win(accept, { config: withService(granted) });
        assert.deepEqual(granted, [ 'accept' ]);

        const unblocked = [];
        win(unblock, { config: withService(unblocked) });
        assert.deepEqual(
            unblocked, [ 'accept' ],
            'the unblock surface accepts it, so theirs would call it'
        );
    });

    // Theirs validates against their own translations and refuses a language
    // that is already current unless force is passed.
    it('answers their setLanguage the way theirs does', async ( ) => {
        const w = win(reject, {
            config: {
                language: {
                    default: 'en',
                    translations: { en: {}, fr: {} },
                },
            },
        });
        const api = w.CookieConsent;
        assert.equal(await api.setLanguage('xx'), false, 'not in translations');
        assert.equal(await api.setLanguage('en'), false, 'already current');
        assert.equal(record(w).languageCode, 'en');
        assert.equal(await api.setLanguage('fr'), true);
        assert.equal(record(w).languageCode, 'fr', 'and the record follows');
        assert.equal(await api.setLanguage('fr'), false, 'current again');
        assert.equal(await api.setLanguage('fr', true), true, 'unless forced');
    });
});

/******************************************************************************/

describe('cookieconsent, their callbacks and events', ( ) => {
    it('fires their first-consent pair, to both places', ( ) => {
        const w = win(reject);
        assert.deepEqual(w.__order, [ 'onFirstConsent', 'onConsent' ]);
        assert.deepEqual(
            w.__events.map(entry => entry.name),
            [ 'cc:onFirstConsent', 'cc:onConsent' ],
            'and the same names at the window, which is where theirs go'
        );
        // Their payload is the record under a cookie key.
        assert.deepEqual(
            Object.keys(w.__consent).sort(), [ 'cookie' ]
        );
        assert.deepEqual(
            Array.from(w.__consent.cookie.categories), [ 'necessary' ]
        );
    });

    // Measured against their own bundle: a visitor who had already answered
    // gets onChange rather than onFirstConsent, carrying what moved.
    it('fires their change pair where a stored acceptance is undone', ( ) => {
        const w = win(reject, {
            before: ww => {
                ww.document.cookie = 'cc_cookie=' + encodeURIComponent(
                    JSON.stringify({
                        categories: [ 'necessary', 'analytics' ],
                        revision: 2,
                        consentId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
                        consentTimestamp: '2026-01-01T00:00:00.000Z',
                        lastConsentTimestamp: '2026-01-02T00:00:00.000Z',
                        services: { necessary: [], analytics: [ 'ga4' ], marketing: [] },
                        languageCode: 'en',
                        data: null,
                    })
                ) + '; path=/';
            },
        });
        assert.deepEqual(w.__order, [ 'onConsent', 'onChange' ]);
        assert.equal(w.__order.includes('onFirstConsent'), false);
        assert.deepEqual(
            Array.from(w.__change.changedCategories), [ 'analytics' ]
        );
        assert.deepEqual(
            JSON.parse(JSON.stringify(w.__change.changedServices)),
            { necessary: [], analytics: [ 'ga4' ], marketing: [] }
        );
    });

    // A record whose revision is not the page's is not a record at all, by
    // their own gate - so this is a first consent again.
    it('treats a stale revision as no record at all', ( ) => {
        const w = win(reject, {
            before: ww => {
                ww.document.cookie = 'cc_cookie=' + encodeURIComponent(
                    JSON.stringify({
                        categories: [ 'necessary', 'analytics' ],
                        revision: 1,
                        consentId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
                        consentTimestamp: '2026-01-01T00:00:00.000Z',
                        lastConsentTimestamp: '2026-01-02T00:00:00.000Z',
                        services: {},
                        languageCode: 'en',
                    })
                ) + '; path=/';
            },
        });
        assert.deepEqual(w.__order, [ 'onFirstConsent', 'onConsent' ]);
    });

    it('says nothing twice where nothing moved', ( ) => {
        const w = win(reject, {
            before: ww => {
                ww.document.cookie = 'cc_cookie=' + encodeURIComponent(
                    JSON.stringify({
                        categories: [ 'necessary' ],
                        revision: 2,
                        consentId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
                        consentTimestamp: '2026-01-01T00:00:00.000Z',
                        lastConsentTimestamp: '2026-01-02T00:00:00.000Z',
                        services: { necessary: [], analytics: [], marketing: [] },
                        languageCode: 'en',
                        data: null,
                    })
                ) + '; path=/';
            },
        });
        assert.deepEqual(w.__order, [ 'onConsent' ]);
    });

    // Their opt-out mode fires onChange after the first consent as well.
    it('adds their change call in their opt-out mode', ( ) => {
        const w = win(reject, { config: { mode: 'opt-out' } });
        assert.deepEqual(
            w.__order, [ 'onFirstConsent', 'onConsent', 'onChange' ]
        );
    });
});

/******************************************************************************/

describe('cookieconsent-reject-unblock', ( ) => {
    it('frees what their manager parked, their own way', async ( ) => {
        const w = win(unblock);
        await settle(60);
        const ga = w.document.getElementById('ga');
        assert.equal(ga.getAttribute('src'), 'https://a.example/ga.js');
        assert.equal(ga.getAttribute('data-src'), null, 'their marker goes');
        assert.equal(ga.getAttribute('data-category'), null);
        assert.equal(ga.getAttribute('type'), null, 'text/plain goes');
        assert.equal(ga.getAttribute('data-keep'), 'yes', 'the rest is carried');
    });

    it('takes the real type out of their data-type', async ( ) => {
        const html = PAGE.replace(
            '<script id="ga" type="text/plain" data-category="analytics"' +
            ' data-src="https://a.example/ga.js" data-keep="yes"></script>', ''
        );
        const w = win(unblock, { html });
        await settle(60);
        const ads = w.document.getElementById('ads');
        assert.equal(ads.type, 'text/javascript');
        assert.equal(ads.getAttribute('data-type'), null);
        assert.equal(ads.getAttribute('src'), 'https://b.example/ads.js');
    });

    // An inline parked tag is replaced with a copy carrying its text. It has
    // to come before any tag with a src: theirs chains on load, so a src'd
    // tag that never loads stops the chain - which is their behaviour, and
    // the same thing happens with their own bundle in a page with no network.
    it('replaces their inline parked tag with a copy of its text', async ( ) => {
        const html = '<!doctype html><html lang="en"><head>' +
            '<script src="' + SRC + '"></script></head><body>' +
            '<script id="first" type="text/plain" data-category="analytics">' +
            'window.inlineRan = 1;</script>' +
            '<p id="content">x</p></body></html>';
        const w = win(unblock, { html });
        await settle(60);
        const first = w.document.getElementById('first');
        assert.equal(first.getAttribute('type'), null);
        assert.equal(first.getAttribute('data-category'), null);
        assert.equal(first.textContent, 'window.inlineRan = 1;');
    });

    // Their chain: a freed tag with a src holds the rest until it loads.
    it('chains on their src, as theirs does', async ( ) => {
        const w = win(unblock);
        await settle(60);
        assert.equal(
            w.document.getElementById('ga').getAttribute('src'),
            'https://a.example/ga.js'
        );
        assert.equal(
            state(w, 'ads'), 'parked',
            'their chain waits on the one before it'
        );
    });

    // Their inverted form runs when a category is NOT accepted, so a surface
    // that says everything is accepted leaves it alone - which is what theirs
    // does under an accept-all too. It has to be the first parked tag on the
    // page, or their chain stalls on a src'd one before reaching it, and the
    // test passes without having looked.
    it('leaves their inverted tag parked', async ( ) => {
        const html = '<!doctype html><html lang="en"><head>' +
            '<script src="' + SRC + '"></script></head><body>' +
            '<script id="inv" type="text/plain" data-category="!analytics">' +
            'window.invRan = 1;</script>' +
            '<script id="plain" type="text/plain" data-category="analytics">' +
            'window.plainRan = 1;</script>' +
            '<p id="content">x</p></body></html>';
        const w = win(unblock, { html });
        await settle(60);
        assert.equal(state(w, 'inv'), 'parked', 'the inverted one stays');
        assert.equal(
            state(w, 'plain'), 'freed',
            'and the plain one behind it is reached'
        );
    });

    // Their inverted service form, which is the same rule one level down.
    it('leaves their inverted service tag parked', async ( ) => {
        const html = '<!doctype html><html lang="en"><head>' +
            '<script src="' + SRC + '"></script></head><body>' +
            '<script id="invsvc" type="text/plain" data-category="analytics"' +
            ' data-service="!ga4">window.x = 1;</script>' +
            '<p id="content">x</p></body></html>';
        const w = win(unblock, { html });
        await settle(60);
        assert.equal(state(w, 'invsvc'), 'parked');
    });

    it('leaves a tag that is not theirs alone', async ( ) => {
        const w = win(unblock);
        await settle(60);
        assert.equal(state(w, 'notheirs'), 'parked');
    });

    it('stores the same refusal', ( ) => {
        const w = win(unblock);
        assert.deepEqual(Array.from(record(w).categories), [ 'necessary' ]);
        assert.deepEqual(
            JSON.parse(JSON.stringify(record(w).services)),
            { necessary: [], analytics: [], marketing: [] }
        );
    });

    it('and tells the page everything is accepted', ( ) => {
        const w = win(unblock);
        const api = w.CookieConsent;
        assert.equal(api.acceptedCategory('analytics'), true);
        assert.equal(api.acceptedService('ga4', 'analytics'), true);
        assert.equal(api.getUserPreferences().acceptType, 'all');
    });
});

/******************************************************************************/

describe('cookieconsent-accept', ( ) => {
    it('grants every category their config names', ( ) => {
        const w = win(accept);
        const stored = record(w);
        assert.deepEqual(
            Array.from(stored.categories),
            [ 'necessary', 'analytics', 'marketing' ]
        );
        assert.deepEqual(
            JSON.parse(JSON.stringify(stored.services)),
            { necessary: [], analytics: [ 'ga4' ], marketing: [] }
        );
        assert.equal(w.CookieConsent.getUserPreferences().acceptType, 'all');
    });

    it('leaves their auto-clear cookies alone', ( ) => {
        const w = win(accept, {
            before: ww => { ww.document.cookie = '_ga=GA1.1.x; path=/'; },
        });
        assert.equal(cookies(w).get('_ga'), 'GA1.1.x');
    });

    it('frees their parked tags', async ( ) => {
        const w = win(accept);
        await settle(60);
        assert.equal(
            w.document.getElementById('ga').getAttribute('src'),
            'https://a.example/ga.js'
        );
    });
});

/******************************************************************************/

describe('cookieconsent, the console line and the lists', ( ) => {
    it('says what it did', ( ) => {
        let out;
        const w = win(reject, { before: ww => { out = lines(ww); } });
        void w;
        const line = out.find(text => text.includes('cookieconsent-reject'));
        assert.ok(line, out.join('\n'));
        assert.match(line, /store=cookie name=cc_cookie/);
        assert.match(line, /accepted=necessary type=necessary surface=necessary/);
        assert.match(line, /parked=4 freed=0/);
        assert.match(line, /banner=none/);
    });

    it('is pinned at the version the package names', ( ) => {
        assert.equal(versions.cookieconsent, '1.0.1');
    });

    // One rule, because the filename is the same wherever it is served from -
    // and the self-hosted copy measured was byte-identical to jsDelivr's.
    it('names the file by path, so a self-hosted copy lands too', ( ) => {
        assert.ok(filtersText.includes(
            '/cookieconsent.umd.js$script,redirect=cookieconsent-reject.js'
        ));
    });

    it('leaves their module build and their stylesheet alone', ( ) => {
        for ( const line of filtersText.split('\n') ) {
            if ( line.startsWith('!') ) { continue; }
            assert.equal(/cookieconsent\.esm\.js/.test(line), false, line);
            assert.equal(/cookieconsent\.css/.test(line), false, line);
        }
        assert.match(filtersText, /THEIR MODULE BUILD IS LEFT ALONE/);
    });

    it('says in the list what their gate wants', ( ) => {
        assert.match(filtersText, /THE consentId IS MINTED HERE/);
        assert.match(filtersText, /THEIR reloadPage IS NOT/);
        assert.match(filtersText, /BOTS ARE LEFT ALONE/);
    });

    it('the three built files differ by one line each', ( ) => {
        const a = reject.split('\n');
        const b = unblock.split('\n');
        const c = accept.split('\n');
        assert.equal(a.length, b.length);
        assert.equal(a.length, c.length);
        assert.deepEqual(
            a.filter((line, i) => line !== b[i]),
            [ "    consentRRCookieConsent('reject');" ]
        );
        assert.deepEqual(
            c.filter((line, i) => line !== a[i]),
            [ "    consentRRCookieConsent('accept');" ]
        );
    });
});
