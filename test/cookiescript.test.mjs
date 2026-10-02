/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

*/

import { strict as assert } from 'node:assert';
import { JSDOM, VirtualConsole } from 'jsdom';
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

    it('writes the record their own refusal writes', ( ) => {
        const w = boot().window;
        // Their save-with-nothing-ticked path, yt(), writes
        // a('categories', []) - the bare array, which is what refusal records
        // off real sites carry - and their a() puts bannershown alongside it.
        // consenttime and key are absent: a first refusal has no key from
        // their collector, and consenttime is a tenant constant.
        assert.deepEqual(plain(record(w)), {
            action: 'reject',
            categories: [],
            bannershown: 1,
        });
    });

    it('lands on the record a real refusal leaves', ( ) => {
        // Captured from a site running their own script, refusing through
        // their banner. Everything in it that a refusal decides is written
        // here; everything in it that comes from their tenant config or their
        // collector is carried, not invented.
        const REAL = {
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
            key: '8d649403-0c2b-4948-af88-b9842cb7a1df',
        };
        // The same visitor, with that record already on them, accepting
        // nothing: what this writes has to be that record again.
        const w = boot({
            before: w_ => {
                w_.document.cookie = 'CookieScriptConsent=' +
                    encodeURIComponent(JSON.stringify(
                        Object.assign({}, REAL, {
                            action: 'accept',
                            categories: '["strict","targeting","performance"]',
                        })
                    ));
            },
        }).window;
        assert.deepEqual(plain(record(w)), REAL);
        // And their state off it, which is their U() plus their key.
        assert.deepEqual(plain(w.CookieScript.instance.currentState()), {
            action: 'reject',
            key: REAL.key,
            categories: [ 'strict' ],
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
        assert.deepEqual(plain(stored.categories), []);
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
        assert.deepEqual(plain(kept.categories), []);
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
        // Theirs: action off the record, and categories from their U(),
        // which parses the stored string and then adds strict - so a refusal
        // leaves strict allowed, and saying [] here would tell a page that
        // nothing at all is.
        assert.deepEqual(plain(instance.currentState()),
            { action: 'reject', categories: [ 'strict' ] });
        // Theirs, from getCMPId().
        assert.equal(instance.getCMPId(), 374);
        // Theirs is a build number page code compares against, never zero.
        assert.ok(instance.version >= 20260210, String(instance.version));
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
            [ 'strict' ]);
    });

    it('fires their events where a page listens for them', async ( ) => {
        // Their s() dispatches on the document. A page hooks them with
        // document.addEventListener, which an event dispatched at the window
        // never reaches - so this listens exactly where a page does, and the
        // window listener below it only hears them because theirs bubble.
        const onDocument = [];
        const onWindow = [];
        const w = boot({
            before: w_ => {
                w_.__d = onDocument;
                w_.__w = onWindow;
                for ( const name of [
                    'CookieScriptLoaded', 'CookieScriptReject',
                    'CookieScriptCurrentState', 'CookieScriptCategory-strict',
                ] ) {
                    w_.document.addEventListener(name, ev => {
                        w_.__d.push([ name, ev.target === w_.document, ev.bubbles ]);
                    });
                    w_.addEventListener(name, ( ) => { w_.__w.push(name); });
                }
            },
        }).window;
        await settle(10);
        assert.deepEqual(plain(onDocument), [
            [ 'CookieScriptLoaded', true, true ],
            [ 'CookieScriptReject', true, true ],
            [ 'CookieScriptCurrentState', true, true ],
            [ 'CookieScriptCategory-strict', true, true ],
        ]);
        // Their p() also puts the category name on the instance and the data
        // layer, which is what a tag manager reads.
        assert.deepEqual(plain(w.CookieScript.instance.dispatchEventNames),
            [ 'CookieScriptCategory-strict' ]);
        assert.ok(
            w.dataLayer.some(entry => entry.event === 'CookieScriptCategory-strict'),
            JSON.stringify(plain(w.dataLayer))
        );
        assert.deepEqual(plain(onWindow), [
            'CookieScriptLoaded', 'CookieScriptReject',
            'CookieScriptCurrentState', 'CookieScriptCategory-strict',
        ]);
    });

    it('creates their data global the way their bundle does', ( ) => {
        const w = boot().window;
        // Theirs: if(!window.CookieScriptData){window.CookieScriptData={...}}
        assert.deepEqual(plain(w.CookieScriptData), {
            enabledConsentMode: false,
            useGoogleTemplate: false,
            correctGoogleTemplateTrigger: false,
            gtagRequiredCategory: null,
            gtagCorrectOrder: null,
            gtagDefaultConsent: null,
            isVerifyGoogleConsentMode: false,
        });
        // And a page that set its own keeps it.
        const mine = boot({
            before: w_ => { w_.eval('window.CookieScriptData = { mine: 1 };'); },
        }).window;
        assert.deepEqual(plain(mine.CookieScriptData), { mine: 1 });
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

    it('sweeps again later, for what had not parsed yet', async ( ) => {
        // At the point their script tag is reached the rest of the page is
        // not there, so the first sweep sees nothing. Theirs runs at load and
        // again half a second later; this is that second pass.
        let out;
        const dom = boot({
            html: '<!doctype html><html><head></head><body></body></html>',
            before: w_ => { out = lines(w_); },
        });
        const w = dom.window;
        assert.ok(out[0].includes(' freed=0'), out[0]);
        w.document.body.insertAdjacentHTML('beforeend',
            '<script id="late" type="text/plain" data-cookiescript="accepted"' +
            ' data-cookiecategory="strict" data-src="https://n.test/n.js">' +
            '</scr' + 'ipt>' +
            '<iframe id="lateframe" data-cookiescript="accepted"' +
            ' data-cookiecategory="targeting" data-src="https://e.test/e">' +
            '</iframe>');
        await settle(700);
        assert.equal(node(w, 'late').getAttribute('src'), 'https://n.test/n.js');
        assert.equal(node(w, 'late').getAttribute('type'), 'text/javascript');
        // And the refused one is still parked.
        assert.equal(node(w, 'lateframe').hasAttribute('src'), false);
        // The watch takes it as it arrives rather than at the next sweep.
        assert.ok(out[0].includes(' watch=watching'), out[0]);
    });

    it('dispatches their ready event again for a data-reload script',
    async ( ) => {
        let out;
        const dom = boot({
            html: '<!doctype html><html><head></head><body></body></html>',
            before: w_ => { out = lines(w_); },
        });
        const w = dom.window;
        // Wait for the real event to be gone, then listen like a script that
        // was freed too late to hear it.
        await settle(50);
        const heard = [];
        w.document.addEventListener('DOMContentLoaded', ev => {
            heard.push(ev.bubbles);
        });
        w.document.body.insertAdjacentHTML('beforeend',
            '<script id="late" type="text/plain" data-cookiescript="accepted"' +
            ' data-cookiecategory="strict" data-reload="true"' +
            ' data-src="https://n.test/n.js"></scr' + 'ipt>');
        await settle(700);
        // Freed, and the ready event dispatched again for it.
        assert.equal(node(w, 'late').getAttribute('type'), 'text/javascript');
        assert.deepEqual(heard, [ true ]);
    });

    it('leaves the ready event alone without their flag', async ( ) => {
        let out;
        const dom = boot({
            html: '<!doctype html><html><head></head><body></body></html>',
            before: w_ => { out = lines(w_); },
        });
        const w = dom.window;
        await settle(50);
        const heard = [];
        w.document.addEventListener('DOMContentLoaded', ( ) => {
            heard.push(1);
        });
        w.document.body.insertAdjacentHTML('beforeend',
            '<script id="late" type="text/plain" data-cookiescript="accepted"' +
            ' data-cookiecategory="strict" data-src="https://n.test/n.js">' +
            '</scr' + 'ipt>');
        await settle(700);
        // Freed just the same, and the ready event left alone.
        assert.equal(node(w, 'late').getAttribute('type'), 'text/javascript');
        assert.deepEqual(heard, []);
    });

    it('frees the tags theirs frees, by the attribute theirs uses', ( ) => {
        const html = '<!doctype html><html><head>' +
            '<link id="css" data-cookiescript="accepted"' +
            ' data-cookiecategory="strict" rel="stylesheet"' +
            ' data-href="https://s.test/s.css">' +
            '</head><body>' +
            '<object id="obj" data-cookiescript="accepted"' +
            ' data-cookiecategory="strict" data-data="https://o.test/o.swf">' +
            '</object>' +
            '<embed id="emb" data-cookiescript="accepted"' +
            ' data-cookiecategory="strict" data-src="https://m.test/m.swf">' +
            '<object id="objad" data-cookiescript="accepted"' +
            ' data-cookiecategory="targeting" data-data="https://o.test/a.swf">' +
            '</object>' +
            '<div id="notice" data-cookienotice="strict">no cookies</div>' +
            '<div id="adnotice" data-cookienotice="targeting">no ads</div>' +
            '</body></html>';
        const w = boot({ html }).window;
        // link is href, object is data - not src, which is what theirs uses
        // for img, iframe and embed.
        assert.equal(node(w, 'css').getAttribute('href'), 'https://s.test/s.css');
        assert.equal(node(w, 'obj').getAttribute('data'), 'https://o.test/o.swf');
        assert.equal(node(w, 'emb').getAttribute('src'), 'https://m.test/m.swf');
        assert.equal(node(w, 'objad').hasAttribute('data'), false);
        // Their notice handler, with their category rule on it.
        assert.equal(node(w, 'notice').style.display, 'none');
        assert.equal(node(w, 'adnotice').style.display, '');
    });

    it('puts back the two tags theirs reinserts', ( ) => {
        const html = '<!doctype html><html><head></head><body>' +
            '<object id="obj" data-cookiescript="accepted"' +
            ' data-cookiecategory="strict" data-data="https://o.test/o.swf">' +
            '</object>' +
            '<embed id="emb" data-cookiescript="accepted"' +
            ' data-cookiecategory="strict" data-src="https://m.test/m.swf">' +
            '<iframe id="frame" data-cookiescript="accepted"' +
            ' data-cookiecategory="strict" data-src="https://e.test/e">' +
            '</iframe></body></html>';
        const dom = new JSDOM(html, { runScripts: 'outside-only', url: URL });
        const w = dom.window;
        const was = {
            obj: node(w, 'obj'),
            emb: node(w, 'emb'),
            frame: node(w, 'frame'),
        };
        w.eval(reject);
        // A url written onto an embed or object in place does not take, so
        // theirs puts the markup back - the node in the document is a new
        // one. An iframe takes it, and theirs leaves the node alone.
        assert.equal(w.document.contains(was.obj), false);
        assert.equal(w.document.contains(was.emb), false);
        assert.equal(w.document.contains(was.frame), true);
        assert.equal(node(w, 'obj').getAttribute('data'), 'https://o.test/o.swf');
        assert.equal(node(w, 'emb').getAttribute('src'), 'https://m.test/m.swf');
    });

    it('waits for the real ready event before dispatching one', async ( ) => {
        // Injected while the document is still parsing, with their flag
        // already on the page: the page's own listener must not be called
        // before the event it was waiting for.
        const html = '<!doctype html><html><head></head><body>' +
            '<script id="late" type="text/plain" data-cookiescript="accepted"' +
            ' data-cookiecategory="strict" data-reload="true"' +
            ' data-src="https://n.test/n.js"></scr' + 'ipt></body></html>';
        const dom = new JSDOM(html, { runScripts: 'outside-only', url: URL });
        const w = dom.window;
        const order = [];
        assert.equal(w.document.readyState, 'loading');
        w.document.addEventListener('DOMContentLoaded', ( ) => {
            order.push(w.document.readyState);
        });
        w.eval(reject);
        await settle(700);
        // Two calls, and neither while the document was still parsing: the
        // real event comes first and ours goes on its back, as a later
        // listener on it. Dispatching at injection time instead would have
        // called the page with readyState 'loading'.
        assert.deepEqual(order, [ 'interactive', 'interactive' ]);
    });

    it('takes out the banner markup a page already carries', ( ) => {
        // Their own Mt() does this on every load before injecting a fresh
        // banner. A page that ships their markup itself - server-rendered or
        // from a cache - is left with a position:fixed full-screen overlay
        // over everything if it is not removed, and the page cannot scroll.
        let out;
        const html = '<!doctype html><html class="cookiescript_overlay"><head>' +
            '<style data-type="cookiescriptstyles">' +
            '.cookiescript_overlay{overflow:hidden;height:100vh}</style>' +
            '</head><body>' +
            '<div data-cs-id="cookiescript_injected" id="cookiescript_injected">' +
            'banner</div>' +
            '<div id="cookiescript_injected_fsd">dialog</div>' +
            '<div id="cookiescript_badge">badge</div>' +
            '<p id="content">x</p></body></html>';
        const w = boot({ html, before: w_ => { out = lines(w_); } }).window;
        assert.equal(w.document.querySelector('style[data-type="cookiescriptstyles"]'), null);
        assert.equal(w.document.querySelector('[data-cs-id="cookiescript_injected"]'), null);
        assert.equal(node(w, 'cookiescript_injected_fsd'), null);
        assert.equal(node(w, 'cookiescript_badge'), null);
        // Their overlay class, which is what carries the overflow rule.
        assert.equal(
            w.document.documentElement.classList.contains('cookiescript_overlay'),
            false
        );
        // The page itself is untouched.
        assert.equal(node(w, 'content').textContent, 'x');
        assert.ok(out[0].includes(' removed=5'), out[0]);
    });

    it('takes out banner markup that arrives later too', async ( ) => {
        let out;
        const dom = boot({
            html: '<!doctype html><html><head></head><body></body></html>',
            before: w_ => { out = lines(w_); },
        });
        const w = dom.window;
        assert.ok(out[0].includes(' removed=0'), out[0]);
        w.document.body.insertAdjacentHTML('beforeend',
            '<div id="cookiescript_injected_fsd">dialog</div>');
        await settle(700);
        assert.equal(node(w, 'cookiescript_injected_fsd'), null);
        assert.ok(out.some(l => l.includes(' removed=+1')), out.join(' | '));
    });

    it('carries their key into the state where the record has one', ( ) => {
        const w = boot({
            before: w_ => {
                w_.document.cookie = 'CookieScriptConsent=' +
                    encodeURIComponent(JSON.stringify({
                        action: 'reject',
                        categories: '[]',
                        key: '2e22a4ca-0d64-448d-87aa-481848181e20',
                        consenttime: 1770372134,
                    }));
            },
        }).window;
        // Theirs puts key on the state only when the record carries one - it
        // comes back from their collector, so a first refusal has none.
        assert.deepEqual(plain(w.CookieScript.instance.currentState()), {
            action: 'reject',
            key: '2e22a4ca-0d64-448d-87aa-481848181e20',
            categories: [ 'strict' ],
        });
        assert.equal(
            Object.keys(plain(boot().window.CookieScript.instance.currentState()))
                .indexOf('key'),
            -1
        );
    });

    // A reload is a navigation, which jsdom reports rather than performs, so
    // that report is the evidence it was asked for.
    const bootWatchingNavigation = (html, before) => {
        const navigations = [];
        const virtualConsole = new VirtualConsole();
        virtualConsole.on('jsdomError', ex => { navigations.push(ex.message); });
        const dom = new JSDOM(html || PAGE, {
            runScripts: 'outside-only', url: URL, virtualConsole,
        });
        const out = lines(dom.window);
        if ( typeof before === 'function' ) { before(dom.window); }
        dom.window.eval(reject);
        return { w: dom.window, navigations, out };
    };

    it('writes the record under the cookie name the tenant configured', ( ) => {
        // Their j(): the name comes off a script tag where one is set. The
        // default name on such a tenant is a record nothing reads.
        const html = '<!doctype html><html><head>' +
            '<script data-cs-cookiename="MyConsent" src="https://cdn.cookie-script.com' +
            '/s/e879476f7846d0f3101e83b498791e52.js"></scr' + 'ipt>' +
            '</head><body><p id="content">x</p></body></html>';
        const w = boot({ html }).window;
        const named = cookies(w).get('MyConsent');
        assert.equal(cookies(w).get('CookieScriptConsent'), undefined);
        assert.equal(JSON.parse(decodeURIComponent(named)).action, 'reject');
        // Their getCookieValueForQueryArg, which carries the record to
        // another domain, uses the same name.
        assert.equal(
            w.CookieScript.instance.getCookieValueForQueryArg(),
            'MyConsent=' + encodeURIComponent(named)
        );
        // And their hash(), off the src a redirected script still carries.
        assert.equal(w.CookieScript.instance.hash(),
            'e879476f7846d0f3101e83b498791e52');
    });

    it('frees what the page parked without a category', ( ) => {
        // Their refusal reaches the unblocker as k(['strict']), and with a
        // non-empty list their selector requires data-cookiecategory to be
        // there at all, their script selector requiring type="text/plain"
        // besides. Matching that exactly stopped a working page from
        // scrolling, because the element it needs carries no category. The
        // category rule alone is what decides here.
        const html = '<!doctype html><html><head></head><body>' +
            '<iframe id="nocat" data-cookiescript="accepted"' +
            ' data-src="https://e.test/e"></iframe>' +
            '<script id="typed" type="text/javascript"' +
            ' data-cookiescript="accepted" data-cookiecategory="strict"' +
            ' data-src="https://n.test/n.js"></scr' + 'ipt>' +
            '<div id="div" data-cookiescript="accepted"' +
            ' data-cookiecategory="strict" data-src="https://d.test/d"></div>' +
            // Their own bucket for a tracker they could not identify, which
            // a refusal refuses like any other.
            '<iframe id="unclassified" data-cookiescript="accepted"' +
            ' data-cookiecategory="unclassified" data-src="https://u.test/u">' +
            '</iframe>' +
            '<p id="content">x</p></body></html>';
        const w = boot({ html }).window;
        assert.equal(node(w, 'nocat').getAttribute('src'), 'https://e.test/e');
        assert.equal(node(w, 'typed').getAttribute('src'), 'https://n.test/n.js');
        assert.equal(node(w, 'div').getAttribute('src'), 'https://d.test/d');
        // And nothing refused came out with them.
        assert.equal(node(w, 'unclassified').hasAttribute('src'), false);
        assert.equal(
            node(w, 'unclassified').getAttribute('data-cookiescript'),
            'accepted'
        );
    });
    it('frees a parked tag the moment it appears', async ( ) => {
        // The point of watching: a tag freed while the document is still
        // being built has a chance of running before the ready event, which
        // is what a page's own setup waits for. One freed at a later sweep
        // has none.
        //
        // Injected into a document that has already loaded, so neither the
        // ready-event sweep nor the load one is even registered and their
        // 500ms pass is far away: nothing but the watch can free anything
        // here. jsdom delivers its ready event in the same turn as an
        // insertion, so a test that injects while loading passes whether the
        // watch works or not - this one does not.
        const dom = new JSDOM(
            '<!doctype html><html><head></head><body></body></html>',
            { runScripts: 'outside-only', url: URL }
        );
        const w = dom.window;
        await settle(50);
        assert.equal(w.document.readyState, 'complete');
        lines(w);
        w.eval(reject);
        w.document.body.insertAdjacentHTML('beforeend',
            '<script id="a" type="text/plain" data-cookiescript="accepted"' +
            ' data-cookiecategory="strict" data-src="https://n.test/a.js">' +
            '</scr' + 'ipt>' +
            '<div id="wrap"><script id="b" type="text/plain"' +
            ' data-cookiescript="accepted" data-cookiecategory="strict"' +
            ' data-src="https://n.test/b.js"></scr' + 'ipt></div>' +
            '<iframe id="ads" data-cookiescript="accepted"' +
            ' data-cookiecategory="targeting" data-src="https://t.test/t">' +
            '</iframe>');
        // A mutation record is delivered in a microtask, so this is the same
        // turn the markup appeared in.
        await Promise.resolve();
        assert.equal(node(w, 'a').getAttribute('src'), 'https://n.test/a.js');
        // And one nested inside an element that was added, which arrives as
        // the subtree of a single record.
        assert.equal(node(w, 'b').getAttribute('src'), 'https://n.test/b.js');
        // Refused all the same: the watch applies the same category rule.
        assert.equal(node(w, 'ads').hasAttribute('src'), false);
        // Two freed scripts that depend on each other would otherwise race:
        // a script node inserted by script is async unless told otherwise.
        assert.equal(node(w, 'a').async, false);
        assert.equal(node(w, 'b').async, false);
    });
    it('stops watching once their last sweep has gone by', async ( ) => {
        const dom = boot({
            html: '<!doctype html><html><head></head><body></body></html>',
        });
        const w = dom.window;
        await settle(1400);
        w.document.body.insertAdjacentHTML('beforeend',
            '<iframe id="verylate" data-cookiescript="accepted"' +
            ' data-cookiecategory="strict" data-src="https://e.test/e">' +
            '</iframe>');
        await Promise.resolve();
        // Their own last chance is 500ms after load; nothing of theirs frees
        // a tag that turns up after that, and neither does this.
        assert.equal(node(w, 'verylate').hasAttribute('src'), false);
    });

    it('schedules their extra pass off load, not just off injection',
    async ( ) => {
        // Theirs runs the sweep and then once more 500ms later, and the one
        // that matters is the pair at load: on a real page load is long past
        // the 500ms after injection, so a single early timer leaves the gap
        // their second pass exists to cover. jsdom reaches load in a few
        // milliseconds, which no amount of waiting can separate - so this
        // pins the schedule instead of the timing.
        const timers = [];
        const dom = boot({
            html: '<!doctype html><html><head></head><body></body></html>',
            before: w_ => {
                const real = w_.setTimeout;
                w_.setTimeout = (fn, delay) => {
                    timers.push([ delay, w_.document.readyState ]);
                    return real.call(w_, fn, delay);
                };
            },
        });
        await settle(900);
        const halves = timers.filter(entry => entry[0] === 500);
        assert.equal(halves.length, 2, JSON.stringify(timers));
        // The first goes on while the document is still parsing, the second
        // once it is loaded.
        assert.equal(halves[0][1], 'loading');
        assert.equal(halves[1][1], 'complete');
        dom.window.setTimeout = undefined;
    });

    it('sweeps once more after load, as their Ve() does', async ( ) => {
        const dom = boot({
            html: '<!doctype html><html><head></head><body></body></html>',
        });
        const w = dom.window;
        // A tag that appears at load, which is what their extra pass 500ms
        // after it is there for. Their own last chance is load+500 too, so
        // this is their window and not a longer one.
        w.addEventListener('load', ( ) => {
            w.document.body.insertAdjacentHTML('beforeend',
                '<iframe id="afterload" data-cookiescript="accepted"' +
                ' data-cookiecategory="strict" data-src="https://e.test/e">' +
                '</iframe>');
        });
        await settle(900);
        assert.equal(node(w, 'afterload').getAttribute('src'), 'https://e.test/e');
    });

    it('reloads the page once, as their own refusal does', ( ) => {
        // Their qt() and yt() both end in oe(), which reloads. The watch
        // above is the quieter path to the same place; this is theirs.
        const first = bootWatchingNavigation();
        assert.deepEqual(first.navigations,
            [ 'Not implemented: navigation to another Document' ]);
        assert.ok(first.out[0].includes(' reload=reloading'), first.out[0]);
    });

    it('never paints the document it is about to replace', ( ) => {
        // Asked for while the document is still parsing, the navigation
        // cancels the stylesheet fetch and the first document paints unstyled
        // until the new one commits - the page visibly breaking first.
        const first = bootWatchingNavigation();
        assert.equal(first.w.document.documentElement.style.visibility,
            'hidden');
    });

    it('shows the page again if the reload never happens', async ( ) => {
        const first = bootWatchingNavigation();
        assert.equal(first.w.document.documentElement.style.visibility,
            'hidden');
        // jsdom reports the navigation rather than performing it, which is
        // the case the backstop is for: the document is still here.
        await settle(2200);
        assert.equal(first.w.document.documentElement.style.visibility, '');
    });

    it('reloads for a visitor who had accepted', ( ) => {
        const accepted = bootWatchingNavigation(PAGE, w_ => {
            w_.document.cookie = 'CookieScriptConsent=' +
                encodeURIComponent(JSON.stringify({
                    action: 'accept',
                    categories: '["strict","targeting"]',
                    bannershown: 1,
                }));
        });
        assert.deepEqual(accepted.navigations,
            [ 'Not implemented: navigation to another Document' ]);
        assert.ok(accepted.out[0].includes(' reload=reloading'), accepted.out[0]);
    });

    it('does not reload a visitor who had already refused', ( ) => {
        const again = bootWatchingNavigation(PAGE, w_ => {
            w_.document.cookie = 'CookieScriptConsent=' +
                encodeURIComponent(JSON.stringify({
                    action: 'reject', categories: [], bannershown: 1,
                }));
        });
        assert.deepEqual(again.navigations, []);
        assert.ok(again.out[0].includes(' reload=had'), again.out[0]);
        // And the document was never hidden for a reload that is not coming.
        assert.equal(again.w.document.documentElement.style.visibility, '');
    });

    it('does not reload twice in a session on a record that will not stick',
    ( ) => {
        const second = bootWatchingNavigation(PAGE, w_ => {
            w_.sessionStorage.setItem('consent-rr-cookiescript', '1');
        });
        assert.deepEqual(second.navigations, []);
        assert.ok(second.out[0].includes(' reload=done'), second.out[0]);
    });

    it('does not reload where the record did not land', ( ) => {
        // A reload with nothing recorded comes back to the same page in the
        // same state, and asks again.
        const blocked = bootWatchingNavigation(PAGE, w_ => {
            Object.defineProperty(w_.document, 'cookie', {
                get: ( ) => '',
                set: ( ) => {},
                configurable: true,
            });
        });
        assert.deepEqual(blocked.navigations, []);
        assert.ok(blocked.out[0].includes(' reload=nocookie'), blocked.out[0]);
    });

    it('does not reload a page from inside one of its frames', ( ) => {
        const dom = new JSDOM(
            '<!doctype html><html><body><iframe id="f"></iframe></body></html>',
            { runScripts: 'outside-only', url: URL }
        );
        const frame = dom.window.document.getElementById('f').contentWindow;
        const out = lines(frame);
        frame.eval(reject);
        assert.ok(out[0].includes(' reload=framed'), out[0]);
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
            ' action=reject categories=strict cookie=written freed=2' +
            ' removed=0 gcm=nogtag api=ready watch=watching reload=reloading'
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
        assert.deepEqual(plain(record(w).categories), []);
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
