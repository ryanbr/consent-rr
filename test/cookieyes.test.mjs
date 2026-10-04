/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    CookieYes. Measured by booting their own client_data/<id>/script.js - on
    the domain it is registered to, because it is domain-locked and throws
    anywhere else - and their banner.js.

    The fixture carries what their WordPress plugin parks in the markup, plus
    two nodes it did NOT park, because the unblock variant has to tell them
    apart.

*/

import { strict as assert } from 'node:assert';
import { TCString } from '@iabtcf/core';
import { before, describe, it } from 'node:test';
import {
    cookies, cookiesInJar, filtersText, loadResources, runDom, settle,
    versions,
} from './helpers.mjs';

const URL = 'https://www.fontsquirrel.com/article';
const ID = '4719bab573bc9d124efec572';
const SRC = 'https://cdn-cookieyes.com/client_data/' + ID + '/script.js';

const PAGE = '<!doctype html><html lang="en"><head>' +
    '<script id="cookieyes" src="' + SRC + '"></script>' +
    '</head><body>' +
    // Theirs, parked by their plugin and by their runtime blocker.
    '<script id="theirs" type="text/plain"' +
    ' data-cookieyes="cookieyes-analytics" src="https://a.example/a.js"></script>' +
    '<script id="runtime" type="javascript/blocked"' +
    ' src="https://b.example/b.js"></script>' +
    '<iframe id="embed" data-cookieyes="cookieyes-functional"' +
    ' data-cky-src="https://www.youtube.com/embed/x"></iframe>' +
    // Not theirs.
    '<script id="notheirs" type="text/plain" src="https://c.example/c.js"></script>' +
    '<script id="template" type="text/template">a template</script>' +
    '<p id="content">x</p></body></html>';

// Their own first-visit record, measured.
const FRESH = 'cookieyes-consent=consentid:c3pOWHhYcHNXT3Byb2ljcTFtazJSeUFN' +
    'ZlZVcGV3Y2c,consent:,action:,necessary:,functional:,analytics:,' +
    'performance:,advertisement:,other:';

let reject;
let unblock;

before(async ( ) => {
    const resources = await loadResources();
    reject = resources.get('cookieyes-reject.js');
    unblock = resources.get('cookieyes-reject-unblock.js');
});

const boot = (which, options = {}) => runDom(
    which, options.url || URL, options.html || PAGE,
    w => {
        w.__events = [];
        w.__beacons = [];
        for ( const name of [
            'cookieyes_consent_update', 'cookieyes_banner_load',
        ] ) {
            w.document.addEventListener(name, event => {
                w.__events.push({ name, detail: event.detail });
            });
        }
        w.navigator.sendBeacon = url => {
            w.__beacons.push(String(url));
            return true;
        };
        if ( typeof options.before === 'function' ) { options.before(w); }
    }
).window;

const record = w => cookies(w).get('cookieyes-consent');
const pairs = w => {
    const out = {};
    for ( const pair of String(record(w) || '').split(',') ) {
        const at = pair.indexOf(':');
        if ( at !== -1 ) { out[pair.slice(0, at)] = pair.slice(at + 1); }
    }
    return out;
};
const lines = w => {
    const out = [];
    w.console.info = line => { out.push(String(line)); };
    return out;
};
const tcData = w => {
    let data = null;
    w.__tcfapi('getTCData', 2, value => { data = value; });
    return data;
};

/******************************************************************************/

describe('cookieyes-reject', ( ) => {
    it('writes their reject-all in their own pair format', ( ) => {
        const got = pairs(boot(reject));
        assert.equal(got.necessary, 'yes');
        assert.equal(got.functional, 'no');
        assert.equal(got.analytics, 'no');
        assert.equal(got.performance, 'no');
        assert.equal(got.advertisement, 'no');
        assert.equal(got.other, 'no');
        assert.equal(got.consent, 'no');
        // action yes: the visitor has answered, so nothing re-prompts.
        assert.equal(got.action, 'yes');
    });

    it('carries their six categories and no others', ( ) => {
        const got = Object.keys(pairs(boot(reject)));
        assert.deepEqual(got, [
            'consentid', 'consent', 'action', 'necessary', 'functional',
            'analytics', 'performance', 'advertisement', 'other',
        ]);
    });

    it('mints no consentid', ( ) => {
        const w = boot(reject);
        assert.equal(pairs(w).consentid, '');
        assert.equal(w.getCkyConsent().consentID, '');
    });

    it('keeps a consentid a visitor already carries', ( ) => {
        const w = boot(reject, {
            before: ww => {
                ww.document.cookie = FRESH + '; path=/';
            },
        });
        assert.equal(pairs(w).consentid,
            'c3pOWHhYcHNXT3Byb2ljcTFtazJSeUFNZlZVcGV3Y2c');
        assert.equal(w.getCkyConsent().consentID,
            'c3pOWHhYcHNXT3Byb2ljcTFtazJSeUFNZlZVcGV3Y2c');
    });

    it('overwrites a stored yes, which is what a refusal is for', ( ) => {
        const w = boot(reject, {
            before: ww => {
                // Host-only, which is what a tenant whose configured domain
                // did not take would have.
                ww.document.cookie = 'cookieyes-consent=consentid:abc,' +
                    'consent:yes,action:yes,necessary:yes,functional:yes,' +
                    'analytics:yes,performance:yes,advertisement:yes,' +
                    'other:yes; path=/';
            },
        });
        assert.equal(pairs(w).consentid, 'abc');
        // EVERY occurrence, not the first: reading one of several duplicates
        // is how this test used to pass while a stale yes sat behind it, and
        // their own reader takes the last where this one takes the first.
        const all = String(w.document.cookie).split(';')
            .map(pair => pair.trim())
            .filter(pair => pair.startsWith('cookieyes-consent='));
        assert.ok(all.length >= 1);
        for ( const pair of all ) {
            assert.ok(pair.includes('consent:no'), pair);
            assert.ok(pair.includes('analytics:no'), pair);
            assert.equal(pair.includes('analytics:yes'), false, pair);
        }
    });

    it('answers getCkyConsent in their own shape', ( ) => {
        const got = boot(reject).getCkyConsent();
        assert.deepEqual(Object.keys(got).sort(), [
            'activeLaw', 'categories', 'consentID', 'isUserActionCompleted',
            'languageCode',
        ]);
        assert.equal(got.isUserActionCompleted, true);
        assert.equal(got.categories.necessary, true);
        assert.equal(got.categories.advertisement, false);
    });

    it('fires both of their events, at the document', ( ) => {
        const w = boot(reject);
        const names = w.__events.map(entry => entry.name);
        assert.deepEqual(names.sort(), [
            'cookieyes_banner_load', 'cookieyes_consent_update',
        ]);
        const update = w.__events.find(
            entry => entry.name === 'cookieyes_consent_update');
        assert.deepEqual([ ...update.detail.accepted ], [ 'necessary' ]);
        assert.deepEqual([ ...update.detail.rejected ], [
            'functional', 'analytics', 'performance', 'advertisement', 'other',
        ]);
    });

    it('carries the consent state on their banner_load event', ( ) => {
        const w = boot(reject);
        const load = w.__events.find(
            entry => entry.name === 'cookieyes_banner_load');
        assert.equal(load.detail.isUserActionCompleted, true);
        assert.equal(load.detail.categories.analytics, false);
    });

    it('sends no page view log', ( ) => {
        // Theirs beacons log.cookieyes.com/api/v1/log on load, before any
        // decision at all.
        const w = boot(reject);
        assert.deepEqual([ ...w.__beacons ], []);
        assert.equal(typeof w._ckySendPageViewLog, 'function');
        w._ckySendPageViewLog();
        assert.deepEqual([ ...w.__beacons ], []);
    });

    it('builds no banner', ( ) => {
        const w = boot(reject);
        assert.equal(w.document.querySelector('.cky-consent-container'), null);
        assert.equal(w.document.querySelector('[class^="cky-"]'), null);
    });

    it('leaves their parked tags parked', ( ) => {
        const w = boot(reject);
        assert.equal(w.document.getElementById('theirs').getAttribute('type'),
            'text/plain');
        assert.equal(w.document.getElementById('runtime').getAttribute('type'),
            'javascript/blocked');
    });

    it('writes the record in every scope a stored yes could be in', ( ) => {
        // Theirs is written with domain=_ckyStore._rootDomain, which is
        // per-tenant configuration inside the replaced file, and their own
        // reader takes the LAST duplicate where a first-match read takes the
        // first. A refusal in one scope only could be shadowed by an
        // acceptance in another.
        const w = boot(reject);
        const all = String(w.document.cookie).split(';')
            .map(pair => pair.trim())
            .filter(pair => pair.startsWith('cookieyes-consent='));
        assert.ok(all.length > 1, String(all.length));
        for ( const pair of all ) {
            assert.ok(pair.includes('consent:no'), pair);
            assert.ok(pair.includes('analytics:no'), pair);
        }
    });

    it('writes one with no domain at all, for a host-only yes', ( ) => {
        // A browser keys a cookie on its host-only flag too, so a host-only
        // yes and a domain refusal can sit side by side - and jsdom's jar
        // collapses the two, so this watches the write instead of the jar.
        const writes = [];
        boot(reject, {
            before: ww => {
                const own = Object.getOwnPropertyDescriptor(
                    ww.Document.prototype, 'cookie');
                Object.defineProperty(ww.document, 'cookie', {
                    configurable: true,
                    get: ( ) => own.get.call(ww.document),
                    set: value => {
                        writes.push(String(value));
                        own.set.call(ww.document, value);
                    },
                });
            },
        });
        const ours = writes.filter(
            value => value.startsWith('cookieyes-consent='));
        assert.ok(ours.length > 1, String(ours.length));
        assert.equal(ours.filter(
            value => value.includes('; domain=') === false).length, 1);
        assert.ok(ours.some(value => value.includes('; domain=')));
    });

    it('overwrites one stored on the registrable domain', ( ) => {
        const w = boot(reject, {
            url: 'https://www.fontsquirrel.com/a',
            before: ww => {
                ww.document.cookie = 'cookieyes-consent=consentid:abc,' +
                    'consent:yes,action:yes,necessary:yes,functional:yes,' +
                    'analytics:yes,performance:yes,advertisement:yes,' +
                    'other:yes; path=/; domain=fontsquirrel.com';
            },
        });
        // Whichever duplicate a reader picks, first or last, it says no.
        for ( const pair of String(w.document.cookie).split(';') ) {
            if ( pair.includes('cookieyes-consent=') === false ) { continue; }
            assert.ok(pair.includes('analytics:no'), pair);
        }
    });

    it('carries their own cookie attributes', ( ) => {
        // From their _ckySetCookie: their expiry in days, SameSite Strict
        // unless a tenant turned iframe support on, and secure - which
        // theirs adds even on http, where the browser then drops the cookie
        // and no decision is recorded at all.
        const dom = runDom(reject, 'https://www.fontsquirrel.com/a', PAGE);
        const [ cookie ] = cookiesInJar(
            dom, 'https://www.fontsquirrel.com/a', 'cookieyes-consent');
        assert.notEqual(cookie, undefined);
        assert.equal(cookie.secure, true);
        assert.equal(String(cookie.sameSite).toLowerCase(), 'strict');
        const days = (cookie.expires.getTime() - Date.now()) / 86400000;
        assert.ok(Math.abs(days - 365) < 2, String(days));
    });

    it('takes SameSite None where a tenant turned iframe support on', ( ) => {
        const dom = runDom(reject, 'https://www.fontsquirrel.com/a', PAGE,
            w => { w.ckySettings = { iframeSupport: true }; });
        const [ cookie ] = cookiesInJar(
            dom, 'https://www.fontsquirrel.com/a', 'cookieyes-consent');
        assert.equal(String(cookie.sameSite).toLowerCase(), 'none');
    });

    it('records a decision on http too, where secure would lose it', ( ) => {
        const w = boot(reject, { url: 'http://www.fontsquirrel.com/a' });
        assert.equal(pairs(w).consent, 'no');
    });

    it('answers the helpers their own markup reaches for', ( ) => {
        const w = boot(reject);
        for ( const name of [
            '_ckyStore', '_ckyGetFromStore', '_ckySetInStore',
            '_ckyGetCookieMap', '_ckyIsCategoryToBeBlocked',
            '_ckyShouldBlockProvider', '_ckyEscapeRegex', '_ckyReplaceAll',
            '_ckyStartsWith', '_ckySetPlaceHolder', '_ckySendPageViewLog',
        ] ) {
            assert.notEqual(w[name], undefined, name);
        }
        assert.equal(w._ckyGetFromStore('analytics'), 'no');
        assert.equal(w._ckyGetFromStore('necessary'), 'yes');
        assert.equal(w._ckyIsCategoryToBeBlocked('analytics'), true);
        assert.equal(w._ckyIsCategoryToBeBlocked('necessary'), false);
    });

    it('carries the vocabulary both tenants sampled agree on', ( ) => {
        const categories = boot(reject)._ckyStore._categories;
        assert.deepEqual([ ...categories.map(entry => entry.slug) ], [
            'necessary', 'functional', 'analytics', 'performance',
            'advertisement', 'other',
        ]);
        assert.equal(categories[0].isNecessary, true);
        assert.equal(categories[1].isNecessary, false);
        assert.equal(categories[0].defaultConsent.gdpr, true);
        assert.equal(categories[2].defaultConsent.gdpr, false);
    });

    it('will not let a page argue a category into a yes', ( ) => {
        const w = boot(reject);
        w._ckySetInStore('analytics', 'yes');
        assert.equal(w._ckyGetFromStore('analytics'), 'no');
        assert.equal(w.getCkyConsent().categories.analytics, false);
    });

    it('answers performBannerAction without granting anything', ( ) => {
        const w = boot(reject);
        w.performBannerAction('accept_all');
        assert.equal(pairs(w).analytics, 'no');
        assert.equal(w.getCkyConsent().categories.analytics, false);
    });

    it('asks their CDN for nothing at all', async ( ) => {
        // script.js requests banner.js, and banner.js is what fetches the
        // banner targeting json and the audit-table json on a newer
        // deployment. Replacing the loader takes all four.
        const net = [];
        const w = boot(reject, {
            before: ww => {
                ww.fetch = url => {
                    net.push(String(url));
                    return Promise.resolve({ ok: true });
                };
                const XHR = ww.XMLHttpRequest;
                ww.XMLHttpRequest = function() {
                    const request = new XHR();
                    const open = request.open.bind(request);
                    request.open = (method, url, ...rest) => {
                        net.push(String(url));
                        return open(method, url, ...rest);
                    };
                    return request;
                };
            },
        });
        await settle(40);
        for ( const node of w.document.querySelectorAll('script[src]') ) {
            net.push(node.src);
        }
        for ( const url of net ) {
            // The page's own tag is the one in the fixture; nothing else.
            if ( url.includes('client_data/' + ID + '/script.js') ) { continue; }
            assert.equal(url.includes('cookieyes.com'), false, url);
        }
        assert.deepEqual([ ...w.__beacons ], []);
    });

    it('checks no domain, unlike the file it replaces', ( ) => {
        // Theirs inlines a registered domain and throws on a mismatch.
        const w = boot(reject, { url: 'https://unrelated.example/page' });
        assert.equal(pairs(w).consent, 'no');
        assert.equal(w.getCkyConsent().isUserActionCompleted, true);
    });

    it('stands down on a second evaluation', ( ) => {
        const w = boot(reject);
        const events = w.__events.length;
        w.eval(reject);
        assert.equal(w.__events.length, events);
    });

    it('installs anyway on a page that removed the console', ( ) => {
        const w = boot(reject, { before: ww => { ww.console = undefined; } });
        assert.equal(pairs(w).consent, 'no');
    });

    it('announces what went in', ( ) => {
        let out;
        runDom(reject, URL, PAGE, w => { out = lines(w); });
        assert.equal(out.length, 1);
        assert.ok(out[0].startsWith(
            '[consent-rr] cookieyes-reject ' + versions.cookieyes));
        assert.ok(out[0].includes(' categories=necessary '), out[0]);
        assert.ok(out[0].includes(' consentid=none '), out[0]);
        assert.ok(out[0].endsWith(' tcf=refused banner=none log=none'));
    });
});

/******************************************************************************/

describe('cookieyes-reject-unblock', ( ) => {
    it('stores the same refusal as reject', ( ) => {
        const got = pairs(boot(unblock));
        assert.equal(got.consent, 'no');
        assert.equal(got.analytics, 'no');
        assert.equal(got.advertisement, 'no');
        assert.equal(got.necessary, 'yes');
    });

    it('tells the page every category is on', ( ) => {
        const categories = boot(unblock).getCkyConsent().categories;
        for ( const slug of [
            'necessary', 'functional', 'analytics', 'performance',
            'advertisement', 'other',
        ] ) {
            assert.equal(categories[slug], true, slug);
        }
    });

    it('frees what their plugin parked', ( ) => {
        const w = boot(unblock);
        const freed = [ ...w.document.querySelectorAll('script') ]
            .filter(node => node.src.includes('a.example'));
        assert.equal(freed.length, 1);
        assert.equal(freed[0].type, 'text/javascript');
        assert.equal(freed[0].getAttribute('data-cookieyes'),
            'cookieyes-analytics');
    });

    it('frees what their runtime blocker parked', ( ) => {
        const w = boot(unblock);
        const freed = [ ...w.document.querySelectorAll('script') ]
            .filter(node => node.src.includes('b.example'));
        assert.equal(freed.length, 1);
        assert.equal(freed[0].type, 'text/javascript');
    });

    it('leaves an iframe alone, because none was ever parked', ( ) => {
        // Their blocker handles an iframe at runtime, by inserting a sized
        // video-placeholder after it, and leaves its own src in place -
        // neither data-src nor data-cky-src appears anywhere in their files.
        // With their script replaced there is nothing moved aside to put
        // back, and inventing an attribute to read would be inventing the
        // behaviour too.
        for ( const which of [ reject, unblock ] ) {
            const w = boot(which);
            const embed = w.document.getElementById('embed');
            assert.equal(embed.getAttribute('src'), null);
            assert.equal(embed.getAttribute('data-cookieyes'),
                'cookieyes-functional');
        }
    });

    it('replaces the node rather than retyping it', async ( ) => {
        // A type alone does not run a script already in the document, which
        // is why their own un-parking inserts a copy - and why asserting the
        // type is text/javascript cannot tell the two apart. The node has to
        // be seen going out and a new one coming in.
        const moves = { added: [], removed: [] };
        const w = boot(unblock, {
            before: ww => {
                const observer = new ww.MutationObserver(records => {
                    for ( const record of records ) {
                        for ( const node of record.addedNodes ) {
                            if ( node.nodeName === 'SCRIPT' ) {
                                moves.added.push(node.getAttribute('src'));
                            }
                        }
                        for ( const node of record.removedNodes ) {
                            if ( node.nodeName === 'SCRIPT' ) {
                                moves.removed.push(node.getAttribute('src'));
                            }
                        }
                    }
                });
                observer.observe(ww.document, {
                    childList: true, subtree: true,
                });
            },
        });
        await settle(40);
        assert.ok(moves.removed.includes('https://a.example/a.js'),
            JSON.stringify(moves));
        assert.ok(moves.added.includes('https://a.example/a.js'),
            JSON.stringify(moves));
        // And exactly one is left, with the attributes their own un-parking
        // keeps.
        const left = [ ...w.document.querySelectorAll(
            '[src="https://a.example/a.js"]') ];
        assert.equal(left.length, 1);
        assert.equal(left[0].getAttribute('type'), 'text/javascript');
        assert.equal(left[0].getAttribute('data-cookieyes'),
            'cookieyes-analytics');
    });

    it('frees nothing that is not theirs', ( ) => {
        const w = boot(unblock);
        assert.equal(w.document.getElementById('notheirs').getAttribute('type'),
            'text/plain');
        assert.equal(w.document.getElementById('template').getAttribute('type'),
            'text/template');
    });

    it('still refuses the IAB layer', ( ) => {
        const data = tcData(boot(unblock));
        assert.equal(data.gdprApplies, true);
        assert.equal(TCString.decode(data.tcString).purposeConsents.size, 0);
    });

    it('counts what it freed, and says so', ( ) => {
        let out;
        runDom(unblock, URL, PAGE, w => { out = lines(w); });
        assert.ok(out[0].includes(' freed=2 '), out[0]);
        assert.ok(out[0].includes(
            ' categories=necessary+functional+analytics+performance' +
            '+advertisement+other '), out[0]);
    });
});

/******************************************************************************/

describe('cookieyes, the IAB layer', ( ) => {
    it('is CookieYes Limited, cmpId 401, from the IAB s own list', ( ) => {
        const data = tcData(boot(reject));
        assert.equal(data.cmpId, 401);
        assert.equal(TCString.decode(data.tcString).cmpId, 401);
    });

    it('reports the vendor list version their own file ships', ( ) => {
        // cdn-cookieyes.com/common/iab-gvl-v3.json declares
        // vendorListVersion 179 and tcfPolicyVersion 5.
        const decoded = TCString.decode(tcData(boot(reject)).tcString);
        assert.equal(decoded.vendorListVersion, 179);
        assert.equal(decoded.policyVersion, 5);
    });

    it('says the regime applies and grants nothing', ( ) => {
        const data = tcData(boot(reject));
        assert.equal(data.gdprApplies, true);
        const decoded = TCString.decode(data.tcString);
        assert.equal(decoded.purposeConsents.size, 0);
        assert.equal(decoded.purposeLegitimateInterests.size, 0);
        assert.equal(decoded.vendorConsents.size, 0);
        assert.equal(decoded.specialFeatureOptins.size, 0);
        assert.equal(decoded.publisherConsents.size, 0);
    });

    it('answers a ping, and refuses an unknown command', ( ) => {
        const w = boot(reject);
        let ping = null;
        w.__tcfapi('ping', 2, value => { ping = value; });
        assert.equal(ping.cmpLoaded, true);
        assert.equal(ping.cmpId, 401);
        assert.equal(ping.gdprApplies, true);
        let unknown = [ 'NOT CALLED' ];
        w.__tcfapi('nonsense', 2, (value, ok) => { unknown = [ value, ok ]; });
        assert.deepEqual(unknown, [ null, false ]);
    });

    it('adds the locator frame their own stub adds', ( ) => {
        assert.notEqual(boot(reject).frames.__tcfapiLocator, undefined);
    });

    it('stores nothing for it', ( ) => {
        // Theirs keeps the TC string and the Google additional-consent
        // string inside their own record, which is the one being refused.
        const w = boot(reject);
        assert.equal(cookies(w).get('euconsent-v2'), undefined);
        assert.deepEqual(
            Object.keys(w.localStorage).filter(key => key.startsWith('IABTCF')),
            []);
    });
});

/******************************************************************************/

describe('filters, cookieyes', ( ) => {
    it('matches their loader under any client id', ( ) => {
        assert.match(
            filtersText,
            /\|\|cdn-cookieyes\.com\/client_data\/\*\/script\.js\$script,redirect=cookieyes-reject\.js/
        );
        assert.match(
            filtersText,
            /\|\|cdn-cookieyes\.com\/client_data\/\*\/banner\.js\$script,redirect=cookieyes-reject\.js/
        );
    });

    it('never matches the vendor list they ship', ( ) => {
        const rules = filtersText.split('\n')
            .filter(line => line.startsWith('!') === false && line !== '')
            .filter(line => line.includes('cookieyes'));
        for ( const rule of rules ) {
            assert.equal(rule.includes('iab-gvl'), false, rule);
        }
    });

    it('says in the list what the record is and what is not minted', ( ) => {
        assert.match(filtersText, /THEIR RECORD is one cookie/);
        assert.match(filtersText, /THE consentid IS NOT MINTED/);
        assert.match(filtersText, /IT IS DOMAIN-LOCKED/);
    });
});
