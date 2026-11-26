/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    extra/tealium.js is not a cookie-consent resource and is not built into
    dist/, so it is read from extra/ - but still through parseResources, so the
    uBO line rules that drop the header are exercised the way they ship.

    The page's own scripts run, because the contract is about ordering and
    about callbacks: the page sets utag_data before the tag, calls
    utag.link(data, cb) after it, and waits for cb before navigating. A
    fixture that evals the resource against a finished document sees none of
    that.

*/

import { strict as assert } from 'node:assert';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { before, describe, it } from 'node:test';
import { JSDOM, VirtualConsole } from 'jsdom';
import { parseResources, settle } from './helpers.mjs';

const ID = 'elsgroup.actuel-rh';
const LOADER_URL =
    'https://tags.tiqcdn.com/utag/elsgroup/actuel-rh/prod/utag.js';
// Their fifteen, in the order all four loaders declare them.
const THEIRS = [
    'id', 'o', 'sender', 'send', 'rpt', 'dbi', 'db_log', 'loader', 'DB',
    'RP', 'view', 'link', 'track', 'handler', 'ut',
];

let code;

before(async ( ) => {
    const text = await fs.readFile(
        path.join(import.meta.dirname, '..', 'extra', 'tealium.js'), 'utf8'
    );
    code = parseResources(text).get('tealium.js');
    assert.ok(typeof code === 'string' && code.length !== 0);
});

const boot = (options = {}) => {
    const lines = [];
    const vc = new VirtualConsole();
    vc.on('info', message => lines.push(String(message)));
    const dom = new JSDOM(
        '<!DOCTYPE html><html><head>' + (options.before || '') +
        '<script>' + code + '</script>' + (options.after || '') +
        '</head><body></body></html>',
        {
            runScripts: 'dangerously',
            url: options.url || 'https://example.com/page',
            virtualConsole: vc,
            beforeParse: options.beforeParse,
        }
    );
    return { w: dom.window, lines };
};

// The request was redirected, not the element, so the element still carries
// the url it was going to fetch - which is where the account and profile are.
const bootRedirected = (src = LOADER_URL, options = {}) => {
    const lines = [];
    const vc = new VirtualConsole();
    vc.on('info', message => lines.push(String(message)));
    const dom = new JSDOM(
        '<!DOCTYPE html><html><head>' + (options.before || '') +
        '<script src="' + src + '"></script></head><body></body></html>',
        {
            runScripts: 'dangerously',
            url: options.url || 'https://example.com/page',
            virtualConsole: vc,
        }
    );
    const win = dom.window;
    const el = win.document.querySelector('script[src]');
    new win.Function('el', [
        "Object.defineProperty(document, 'currentScript',",
        '{ value: el, configurable: true });',
        code,
    ].join(''))(el);
    return { w: win, lines };
};

describe('extra/tealium.js, the object it publishes', ( ) => {
    it('carries their fifteen members', ( ) => {
        const { w } = boot({});
        for ( const name of THEIRS ) {
            assert.notEqual(w.utag[name], undefined, name);
        }
    });

    it('adds the three theirs assigns after the literal', ( ) => {
        const { w } = boot({});
        assert.equal(typeof w.utag.cfg, 'object');
        assert.equal(typeof w.utag.data, 'object');
        assert.equal(typeof w.utag.gdpr, 'object');
    });

    it('copies the page cfg override, as theirs does', ( ) => {
        const { w } = boot({
            before: '<script>window.utag_cfg_ovrd = { noview: true,' +
                ' nocookie: 1 };</script>',
        });
        assert.equal(w.utag.cfg.noview, true);
        assert.equal(w.utag.cfg.nocookie, 1);
        // By value: their object is the page's, not this one's to hold.
        assert.notEqual(w.utag.cfg, w.utag_cfg_ovrd);
    });

    it('has an empty cfg where the page set no override', ( ) => {
        const { w } = boot({});
        assert.deepEqual(Object.keys(w.utag.cfg), []);
    });

    it('names the data object their loader would merge', ( ) => {
        const { w } = boot({});
        assert.equal(w.utag.udoname, 'utag_data');
    });

    it('leaves out the identifier and the loader internals', ( ) => {
        const { w } = boot({});
        // v_id is the identifier, built from the screen in theirs.
        assert.equal(w.utag.v_id, undefined);
        for ( const name of [ 'cl', 'cond', 'pre', 'runonce', 'initcatch',
            'tagsettings' ] ) {
            assert.equal(w.utag[name], undefined, name);
        }
    });

    it('takes a pagevars the page assigns, as a plain object would', ( ) => {
        const { w } = boot({
            after: '<script>utag.pagevars = function() { return 1; };' +
                '</script>',
        });
        assert.equal(typeof w.utag.pagevars, 'function');
    });

    it('leaves out the readers that gather the data layer', ( ) => {
        const { w } = boot({});
        for ( const name of [ 'RDcp', 'RDlocalStorage', 'RDsessionStorage',
            'RDmeta', 'RDqp', 'RDdom', 'RDpv', 'RDva' ] ) {
            assert.equal(w.utag.loader[name], undefined, name);
        }
    });

    it('carries the tag config map and the extension arrays', ( ) => {
        const { w } = boot({});
        // utag.loader.cfg is read in all thirteen; empty is the truth,
        // since no tag is configured to run. The typeof matters: spreading
        // undefined also gives {}, so a deepEqual alone passes with the
        // member gone.
        assert.equal(typeof w.utag.loader.cfg, 'object');
        assert.deepEqual({ ...w.utag.loader.cfg }, {});
        // extend and cfg_extend are arrays in all thirteen, and a page or
        // an extension pushes to them.
        for ( const name of [ 'extend', 'cfg_extend' ] ) {
            assert.equal(Array.isArray(w.utag.handler[name]), true, name);
            assert.deepEqual([ ...w.utag.handler[name] ], [], name);
        }
    });

    it('takes the entry points something might reach for', ( ) => {
        // GET is in all thirty-three and is where theirs starts; the two
        // removers have nothing left to remove.
        const { w } = boot({
            after: '<script>window.went = [ utag.loader.INIT(),' +
                ' utag.loader.PINIT(), utag.loader.GET(),' +
                ' utag.loader.deleteCookie("x"),' +
                ' utag.loader.deleteIndividualCookies(),' +
                ' utag.handler.INIT() ];</script>',
        });
        assert.deepEqual([ ...w.went ], [
            undefined, undefined, undefined, undefined, undefined,
            undefined,
        ]);
        // And calling their entry point changed nothing: no tag, no
        // request, no cookie.
        assert.equal(w.document.cookie, '');
        assert.deepEqual({ ...w.utag.loader.cfg }, {});
    });

    it('has none of their hashing, which an extension installs', ( ) => {
        const { w } = boot({});
        // utag.ut.sha256 is set inside a utag.handler.extend function in
        // six of the thirteen, so it arrives with the extension pass this
        // refuses - and on the other seven it never existed at all.
        assert.equal(w.utag.ut.sha256, undefined);
        assert.equal(w.utag.ut.md5, undefined);
    });

    it('carries the queues a page or a tag pushes to', ( ) => {
        const { w } = boot({});
        for ( const name of [ 'q', 'lq', 'wq', 'bq', 'rq', 'ready_q',
            'sendq' ] ) {
            assert.equal(Array.isArray(w.utag.loader[name]), true, name);
        }
    });
});

describe('extra/tealium.js, the tenant id', ( ) => {
    it('takes account.profile from the redirected element', ( ) => {
        const { w } = bootRedirected();
        assert.equal(w.utag.id, ID);
    });

    it('recovers it by scanning the page tags', ( ) => {
        const { w } = boot({
            before: '<script src="' + LOADER_URL + '"></script>',
        });
        assert.equal(w.utag.id, ID);
    });

    it('reads a versioned loader url as well', ( ) => {
        const { w } = bootRedirected(
            'https://tags.tiqcdn.com/utag/lbg/code/prod/utag.2.js?cb=1');
        assert.equal(w.utag.id, 'lbg.code');
    });

    // Their query strings vary: a cache buster, their own utv version, and
    // a bare key with no value at all.
    it('reads the url whatever the query carries', ( ) => {
        const base = 'https://tags.tiqcdn.com/utag/newsinternational/' +
            'thesun.irish.web.2/prod/utag.js';
        const want = 'newsinternational.thesun.irish.web.2';
        for ( const query of [ '', '?ver', '?utv=ut4.51&cb=1', '#x' ] ) {
            const { w } = bootRedirected(base + query);
            assert.equal(w.utag.id, want, query || '(none)');
        }
    });

    it('reads the sync url, if a list points it here', ( ) => {
        const { w } = bootRedirected(
            'https://tags.tiqcdn.com/utag/newbalance/nb-jnbo-new/prod/' +
            'utag.sync.js');
        assert.equal(w.utag.id, 'newbalance.nb-jnbo-new');
    });

    it('reads the version ping url from either path', ( ) => {
        // Both forms carry the tenant: one in the path, one only in the
        // query. A list blocks these rather than pointing them here, but
        // the id still has to come out if one does.
        const fromPath = bootRedirected(
            'https://tags.tiqcdn.com/utag/academysports/main/prod/' +
            'utag.v.js?a=academysports/main/202611121225&cb=1');
        assert.equal(fromPath.w.utag.id, 'academysports.main');
        const fromTiqapp = bootRedirected(
            'https://tags.tiqcdn.com/utag/tiqapp/utag.v.js' +
            '?a=hktdc/main/202611050940&cb=1');
        // tiqapp carries no account and profile of its own in the path,
        // so there is no id to take from it, and utag is still published.
        assert.equal(fromTiqapp.w.utag.id, '');
        assert.equal(typeof fromTiqapp.w.utag.track, 'function');
    });

    it('stands aside for its own earlier copy', ( ) => {
        // Both the sync url and the loader url pointed here means this
        // runs twice on one page.
        const lines = [];
        const vc = new VirtualConsole();
        vc.on('info', message => lines.push(String(message)));
        const dom = new JSDOM(
            '<!DOCTYPE html><html><head><script>' + code + '</script>' +
            '<script>' + code + '</script></head><body></body></html>',
            { runScripts: 'dangerously', url: 'https://example.com/page',
              virtualConsole: vc }
        );
        void dom.window.document.title;
        assert.equal(lines.length, 2);
        assert.match(lines[1], / took=theirs /);
    });

    // Their account and profile are not always two plain words, and each
    // of these was checked against the id:"..." the loader itself
    // declares.
    it('takes an account with hyphens and a profile with a dot', ( ) => {
        const cases = [
            [ 'random/rhcorp-prh', 'random.rhcorp-prh' ],
            [ 'jysk-fynske-medier/partners', 'jysk-fynske-medier.partners' ],
            [ 'nordea/op-web', 'nordea.op-web' ],
            [ 'newsinternational/dreamteam.2016',
                'newsinternational.dreamteam.2016' ],
            // Three dots, and the id their loader declares for it.
            [ 'newsinternational/thesun.irish.web.2',
                'newsinternational.thesun.irish.web.2' ],
        ];
        for ( const [ path, want ] of cases ) {
            const { w } = bootRedirected(
                'https://tags.tiqcdn.com/utag/' + path + '/prod/utag.js');
            assert.equal(w.utag.id, want, path);
        }
    });

    // Both of their hosts, and an environment that is not prod. The
    // resource takes the account and profile out of the path, so the host
    // is the rule's problem rather than its own - but a rule written for
    // one host is a gap, and these pin what the resource does either way.
    it('reads either host and any environment', ( ) => {
        const cases = [
            [ 'https://tags.tiqcdn.cn/utag/autodesk/global-sites/prod/' +
                'utag.js', 'autodesk.global-sites' ],
            [ 'https://tags.tiqcdn.com/utag/rasch/cash.ch/prod/utag.js',
                'rasch.cash.ch' ],
            [ 'https://tags.tiqcdn.com/utag/ods/web-ok-es/dev/utag.85.js',
                'ods.web-ok-es' ],
            [ 'https://tags.tiqcdn.com/utag/barclaysuk/barclaycard-public/' +
                'PROD-A/utag.js', 'barclaysuk.barclaycard-public' ],
        ];
        for ( const [ src, want ] of cases ) {
            const { w } = bootRedirected(src);
            assert.equal(w.utag.id, want, src);
        }
    });

    it('still publishes with no id anywhere', ( ) => {
        const { w } = boot({});
        assert.equal(w.utag.id, '');
        assert.equal(typeof w.utag.track, 'function');
    });

    it('takes no id from a url that is not theirs', ( ) => {
        const { w } = bootRedirected('https://example.com/js/utag.js');
        assert.equal(w.utag.id, '');
    });
});

describe('extra/tealium.js, the callback a page waits on', ( ) => {
    it('calls back from link, which is how a page navigates', ( ) => {
        const { w } = boot({
            after: '<script>window.went = false;' +
                'utag.link({ event_name: "x" }, function() {' +
                ' window.went = true; });</script>',
        });
        assert.equal(w.went, true);
    });

    it('calls back from view', ( ) => {
        const { w } = boot({
            after: '<script>window.seen = false;' +
                'utag.view({}, function() { window.seen = true; });</script>',
        });
        assert.equal(w.seen, true);
    });

    it('calls back from their object shape', ( ) => {
        const { w } = boot({
            after: '<script>window.ran = false;' +
                'utag.track({ event: "link", data: {},' +
                ' cfg: { cb: function() { window.ran = true; } } });</script>',
        });
        assert.equal(w.ran, true);
    });

    it('calls back from their string shape', ( ) => {
        const { w } = boot({
            after: '<script>window.ran = false;' +
                'utag.track("link", {}, function() { window.ran = true; });' +
                '</script>',
        });
        assert.equal(w.ran, true);
    });

    it('calls back before the next statement, so a gesture survives', ( ) => {
        const { w } = boot({
            after: '<script>window.order = [];' +
                'utag.link({}, function() { window.order.push("cb"); });' +
                'window.order.push("after");</script>',
        });
        assert.deepEqual([ ...w.order ], [ 'cb', 'after' ]);
    });

    // Theirs ends on return true, and view and link return whatever
    // track returned, so a page testing the return reads the same thing.
    it('takes a call with no callback, and returns what theirs does', ( ) => {
        const { w } = boot({
            after: '<script>window.fine = utag.link({ a: 1 }) === true &&' +
                ' utag.view() === true && utag.track("link") === true;' +
                '</script>',
        });
        assert.equal(w.fine, true);
    });

    it('survives a callback that throws', ( ) => {
        const { w } = boot({
            after: '<script>window.after = false;' +
                'utag.link({}, function() { throw new Error("page"); });' +
                'window.after = true;</script>',
        });
        assert.equal(w.after, true);
    });
});

describe('extra/tealium.js, the data layer', ( ) => {
    it('hands back the page object, by reference', ( ) => {
        const { w } = boot({
            before: '<script>window.utag_data = { page_name: "home" };' +
                '</script>',
        });
        assert.equal(w.utag.data, w.utag_data);
        assert.equal(w.utag.data.page_name, 'home');
    });

    it('is an empty object where the page set none', ( ) => {
        const { w } = boot({});
        assert.deepEqual(Object.keys(w.utag.data), []);
    });

    it('refuses a utag_data that is not an object', ( ) => {
        const { w } = boot({
            before: '<script>window.utag_data = "nonsense";</script>',
        });
        assert.deepEqual(Object.keys(w.utag.data), []);
    });
});

describe('extra/tealium.js, their utilities', ( ) => {
    it('mints no visitor id', ( ) => {
        const { w } = boot({});
        assert.equal(w.utag.ut.vi(), '');
    });

    // pad is hex in theirs: a = "" + ((a-0).toString(16)), zero-filled.
    // 007 reads the same either way, which is why it caught nothing.
    it('pads in hex, as theirs does', ( ) => {
        const { w } = boot({});
        assert.equal(w.utag.ut.pad(7, 3), '007');
        assert.equal(w.utag.ut.pad(255, 4), '00ff');
        assert.equal(w.utag.ut.pad(16, 1), '10');
    });

    // merge(a, b, c): c truthy overwrites, falsy fills only what is
    // undefined - and the falsy call is the one their own loader makes.
    it('merges by their third argument', ( ) => {
        const { w } = boot({});
        assert.deepEqual({ ...w.utag.ut.merge({ a: 1 }, { a: 2, b: 3 }, 0) },
            { a: 1, b: 3 });
        assert.deepEqual({ ...w.utag.ut.merge({ a: 1 }, { a: 2, b: 3 }, 1) },
            { a: 2, b: 3 });
        assert.deepEqual({ ...w.utag.ut.merge({ a: 1 }, { b: 2 }) },
            { a: 1, b: 2 });
    });

    it('names a type the way their line does', ( ) => {
        const { w } = boot({});
        assert.equal(w.utag.ut.typeOf([]), 'array');
        assert.equal(w.utag.ut.typeOf(null), 'null');
        assert.equal(w.utag.ut.typeOf({}), 'object');
        assert.equal(w.utag.ut.typeOf('x'), 'string');
        assert.equal(w.utag.ut.typeOf(1), 'number');
        // Where a typeof would answer object, theirs answers these.
        assert.equal(w.utag.ut.typeOf(new w.Date()), 'date');
        assert.equal(w.utag.ut.typeOf(/x/), 'regexp');
    });

    it('answers the emptiness questions by type, as theirs does', ( ) => {
        const { w } = boot({});
        assert.equal(w.utag.ut.isEmptyObject({}), true);
        assert.equal(w.utag.ut.isEmptyObject({ a: 1 }), false);
        assert.equal(w.utag.ut.isEmpty(''), true);
        assert.equal(w.utag.ut.isEmpty('x'), false);
        // A number is empty only when it is NaN, and a boolean never is.
        assert.equal(w.utag.ut.isEmpty(0), false);
        assert.equal(w.utag.ut.isEmpty(NaN), true);
        assert.equal(w.utag.ut.isEmpty(false), false);
        assert.equal(w.utag.ut.hasOwn({ a: 1 }, 'a'), true);
        assert.equal(w.utag.ut.hasOwn({ a: 1 }, 'b'), false);
        assert.equal(w.utag.ut.hasOwn(null, 'a'), false);
    });

    it('flattens to dotted keys, dropping an empty object', ( ) => {
        const { w } = boot({});
        const flat = w.utag.ut.flatten({
            a: { b: 1 }, c: [ 1, 2 ], d: {}, e: 'x',
        });
        assert.deepEqual(Object.keys(flat).sort(), [ 'a.b', 'c', 'e' ]);
        assert.equal(flat['a.b'], 1);
        assert.equal(flat.e, 'x');
        assert.deepEqual([ ...flat.c ], [ 1, 2 ]);
    });
});

describe('extra/tealium.js, the consent api where a tenant has one', ( ) => {
    it('answers a number, and not the one that means consented', ( ) => {
        const { w } = boot({});
        const state = w.utag.gdpr.getConsentState();
        assert.equal(typeof state, 'number');
        assert.notEqual(state, 1);
        assert.equal(state, 0);
    });

    it('answers an empty array of categories', ( ) => {
        const { w } = boot({});
        const picked = w.utag.gdpr.getSelectedCategories();
        assert.equal(Array.isArray(picked), true);
        assert.deepEqual([ ...picked ], []);
    });

    // hsbc and tsb carry the whole manager, setters and prompts included,
    // and those are the half a page calls itself.
    it('takes the setters a tenant banner calls, and stores nothing',
        async ( ) => {
            const { w } = boot({
                before: '<script>document.cookie = "utag_main=v_id:a;' +
                    ' path=/";</script>',
                after: '<script>window.ok = [' +
                    'utag.gdpr.setConsentValue(1),' +
                    'utag.gdpr.setAllCategories(true),' +
                    'utag.gdpr.setPreferencesValues({ "1": "1" }, false),' +
                    'utag.gdpr.setPreferencesFromList([ { id: 1 } ]),' +
                    'utag.gdpr.setCookieValue("x"),' +
                    'utag.gdpr.setCookie(),' +
                    'utag.gdpr.refreshCookie() ];</script>',
            });
            await settle();
            // Every one of them undefined, and nothing granted: the state
            // still reads as a refusal and no cookie of theirs came back.
            assert.deepEqual([ ...w.ok ],
                [ undefined, undefined, undefined, undefined, undefined,
                    undefined, undefined ]);
            assert.equal(w.utag.gdpr.getConsentState(), 0);
            assert.deepEqual([ ...w.utag.gdpr.getSelectedCategories() ], []);
            assert.equal(w.document.cookie.includes('utag_main'), false);
        });

    it('takes a preferences link without throwing', ( ) => {
        const { w } = boot({
            after: '<script>window.shown = [' +
                'utag.gdpr.showConsentPreferences("en"),' +
                'utag.gdpr.showExplicitConsent("en") ];</script>',
        });
        assert.deepEqual([ ...w.shown ], [ undefined, undefined ]);
    });

    it('answers their categories and their tag filter', ( ) => {
        const { w } = boot({});
        const cats = w.utag.gdpr.getCategories();
        assert.equal(Array.isArray(cats), true);
        assert.deepEqual([ ...cats ], []);
        // true is the refusal: theirs keeps a uid only when this is false.
        assert.equal(w.utag.gdpr.shouldBlockTag('123'), true);
        assert.equal(w.utag.gdpr.getLanguage({}), '');
        assert.equal(Array.isArray(w.utag.gdpr.queue), true);
    });

    // ut4.46 asks the tag question the other way round and adds a do not
    // sell surface. barclaysuk/barclaycard-public is the build read for it.
    it('gives a prompt an empty category list to iterate', ( ) => {
        const { w } = boot({});
        for ( const prompt of [ 'consent_prompt', 'preferences_prompt' ] ) {
            assert.equal(Array.isArray(w.utag.gdpr[prompt].categories), true,
                prompt);
            assert.deepEqual([ ...w.utag.gdpr[prompt].categories ], [],
                prompt);
        }
    });

    it('answers both polarities of the tag question', ( ) => {
        const { w } = boot({});
        // shouldBlockTag true and shouldTagFire false say the same thing.
        assert.equal(w.utag.gdpr.shouldBlockTag('29'), true);
        assert.equal(w.utag.gdpr.shouldTagFire('29'), false);
    });

    it('says the visitor is already opted out of a sale', ( ) => {
        const { w } = boot({});
        assert.equal(w.utag.gdpr.dns.getDnsState(), true);
        assert.deepEqual({ ...w.utag.gdpr.dns.getBlockedDnsTagLookup() }, {});
        assert.equal(w.utag.gdpr.showDoNotSellBanner(), undefined);
    });

    it('takes the cookie writers ut4.46 exposes, and writes none',
        async ( ) => {
            const { w } = boot({
                after: '<script>window.wrote = [' +
                    'utag.gdpr.updateConsentCookie([ "analytics" ]),' +
                    'utag.gdpr.setCCPCookie(),' +
                    'utag.gdpr.setEventCookie(),' +
                    'utag.gdpr.setConsentValueOld(1),' +
                    'utag.gdpr.setPreferencesValuesOld({}) ];</script>',
            });
            await settle();
            assert.deepEqual([ ...w.wrote ],
                [ undefined, undefined, undefined, undefined, undefined ]);
            assert.equal(w.document.cookie, '');
        });

    it('refuses their consent event through track as well', ( ) => {
        // update_consent_cookie is reachable without touching gdpr: their
        // track reads the event and the payload.
        const { w } = boot({
            after: '<script>window.ran = false;' +
                'window.out = utag.track({ event: "update_consent_cookie",' +
                ' data: { consent_categories: [ "analytics" ] },' +
                ' cfg: { cb: function() { window.ran = true; } } });' +
                '</script>',
        });
        assert.equal(w.ran, true);
        assert.equal(w.out, true);
        assert.equal(w.utag.gdpr.getConsentState(), 0);
        assert.equal(w.document.cookie, '');
    });

    // williamhillgroup/es-web carries the largest consent manager read,
    // 260 references, and reaches for these two.
    it('drops a visitor id handed to it, and traces nothing', async ( ) => {
        const { w } = boot({
            before: '<script>document.cookie = "utag_main=v_id:a; path=/";' +
                '</script>',
            after: '<script>window.set = utag.gdpr.setVisitorId("abc123");' +
                'window.trace = utag.gdpr.getTraceId();</script>',
        });
        await settle();
        assert.equal(w.set, undefined);
        assert.equal(w.trace, '');
        // Nothing stored it, and their cookie did not come back.
        assert.equal(w.utag.v_id, undefined);
        assert.equal(w.document.cookie.includes('utag_main'), false);
    });

    it('shares its helpers with ut rather than keeping a second set', ( ) => {
        const { w } = boot({});
        assert.equal(w.utag.gdpr.typeOf(new w.Date()), 'date');
        assert.equal(w.utag.gdpr.isEmpty(0), false);
        assert.deepEqual({ ...w.utag.gdpr.merge({ a: 1 }, { a: 2 }, 0) },
            { a: 1 });
        // A clone, so a new object with the same contents - returning
        // the same one deep-equals and would pass without cloning.
        const source = { a: 1 };
        const cloned = w.utag.gdpr.clone(source);
        assert.deepEqual({ ...cloned }, { a: 1 });
        assert.notEqual(cloned, source);
        assert.deepEqual([ ...w.utag.gdpr.keys({ a: 1, b: 2 }) ],
            [ 'a', 'b' ]);
        assert.deepEqual([ ...w.utag.gdpr.values({ a: 1, b: 2 }) ], [ 1, 2 ]);
    });

    it('answers the rest in the shapes their enforcement reads', ( ) => {
        const { w } = boot({});
        assert.equal(typeof w.utag.gdpr.getCookieValues(), 'object');
        // none and not opt-in: opt-in with nothing consented is what
        // keeps an embed hidden and a page's own banner coming back.
        assert.equal(w.utag.gdpr.getEnforcementMode(), 'none');
        // And none still does not claim a consent, which is the half that
        // would have the page load a tracker itself.
        assert.equal(w.utag.gdpr.getConsentState(), 0);
        assert.deepEqual([ ...w.utag.gdpr.getSelectedCategories() ], []);
        assert.equal(w.utag.gdpr.shouldTagFire(), false);
        assert.equal(w.utag.gdpr.shouldBlockTag(), true);
        assert.equal(w.utag.gdpr.consent_prompt.isEnabled, false);
        assert.equal(w.utag.gdpr.preferences_prompt.isEnabled, false);
        assert.equal(w.utag.gdpr.applyConsentState(), undefined);
    });
});

describe('extra/tealium.js, what it refuses', ( ) => {
    it('asks for nothing and adds no tag', async ( ) => {
        const counts = { xhr: 0, fetch: 0, beacon: 0, img: 0, made: 0 };
        const { w } = boot({
            beforeParse(win) {
                win.XMLHttpRequest = class {
                    open() { counts.xhr += 1; }
                    setRequestHeader() {}
                    send() {}
                };
                win.fetch = ( ) => {
                    counts.fetch += 1;
                    return Promise.resolve();
                };
                win.navigator.sendBeacon = ( ) => {
                    counts.beacon += 1;
                    return true;
                };
                win.Image = class { set src(v) { counts.img += 1; } };
                const real = win.document.createElement.bind(win.document);
                win.document.createElement = name => {
                    if ( String(name).toLowerCase() === 'script' ) {
                        counts.made += 1;
                    }
                    return real(name);
                };
            },
        });
        await settle();
        assert.equal(typeof w.utag, 'object');
        assert.deepEqual({ ...counts },
            { xhr: 0, fetch: 0, beacon: 0, img: 0, made: 0 });
    });

    it('reads no storage, which is what theirs walks into the data layer',
        async ( ) => {
            const touched = [];
            const { w } = boot({
                beforeParse(win) {
                    // Seeded here, before the counters go on, so that
                    // everything counted afterwards is the resource's.
                    win.localStorage.setItem('mine', 'kept');
                    win.sessionStorage.setItem('also', 'kept');
                    for ( const name of [ 'getItem', 'setItem', 'key',
                        'removeItem' ] ) {
                        const real = win.Storage.prototype[name];
                        win.Storage.prototype[name] = function(...args) {
                            touched.push(name);
                            return real.apply(this, args);
                        };
                    }
                },
            });
            await settle();
            assert.equal(typeof w.utag, 'object');
            // Removing their visitor attributes is the only thing it does
            // to a store. It reads nothing out of one, which is the whole
            // point: RDlocalStorage walks every key into the data layer.
            assert.deepEqual([ ...new Set(touched) ], [ 'removeItem' ]);
            assert.equal(touched.includes('getItem'), false);
            assert.equal(touched.includes('setItem'), false);
            assert.equal(touched.includes('key'), false);
            assert.equal(w.localStorage.getItem('mine'), 'kept');
            assert.equal(w.sessionStorage.getItem('also'), 'kept');
        });

    it('touches an empty store not at all', async ( ) => {
        const calls = [];
        boot({
            beforeParse(win) {
                for ( const name of [ 'getItem', 'setItem', 'removeItem',
                    'key' ] ) {
                    const real = win.Storage.prototype[name];
                    win.Storage.prototype[name] = function(...args) {
                        calls.push(name);
                        return real.apply(this, args);
                    };
                }
            },
        });
        await settle();
        assert.deepEqual([ ...calls ], []);
    });

    it('removes their visitor attributes, by both names', async ( ) => {
        const { w, lines } = bootRedirected(LOADER_URL, {});
        void lines;
        assert.equal(w.utag.id, ID);
        const seeded = boot({
            before: '<script src="' + LOADER_URL + '"></script>' +
                '<script>localStorage.setItem("tealium_va", "{}");' +
                'localStorage.setItem("tealium_va_elsgroup_actuel-rh", "x");' +
                'localStorage.setItem("mine", "kept");</script>',
        });
        await settle();
        assert.equal(seeded.w.localStorage.getItem('tealium_va'), null);
        assert.equal(
            seeded.w.localStorage.getItem('tealium_va_elsgroup_actuel-rh'),
            null);
        assert.equal(seeded.w.localStorage.getItem('mine'), 'kept');
        assert.match(seeded.lines[0], / storage=2 /);
        // One of the two, so the count cannot be the number of names it
        // asked about: that would say two here as well.
        const one = boot({
            before: '<script src="' + LOADER_URL + '"></script>' +
                '<script>localStorage.setItem("tealium_va", "{}");' +
                'localStorage.setItem("mine", "kept");</script>',
        });
        await settle();
        assert.equal(one.w.localStorage.getItem('tealium_va'), null);
        assert.match(one.lines[0], / storage=1 /);
    });

    it('adds no listener of its own', async ( ) => {
        const seen = [];
        const { w } = boot({
            beforeParse(win) {
                const real = win.document.addEventListener.bind(win.document);
                win.document.addEventListener = (name, ...rest) => {
                    seen.push(String(name));
                    return real(name, ...rest);
                };
            },
        });
        await settle();
        assert.equal(typeof w.utag, 'object');
        assert.deepEqual([ ...seen ], []);
    });
});

describe('extra/tealium.js, the cookie it clears', ( ) => {
    it('expires utag_main where there is one', async ( ) => {
        const { w } = boot({
            before: '<script>document.cookie = "utag_main=v_id:abc; path=/";' +
                '</script>',
        });
        await settle();
        assert.equal(w.document.cookie.includes('utag_main'), false);
    });

    // Fourteen of the twenty-two carry their split-cookie machinery,
    // where v_id, ses_id, _sn and _se are a cookie each rather than
    // sub-values of one. Their own test for it is
    // document.cookie.includes("utag_main_").
    it('expires the split form as well as the packed one', async ( ) => {
        const { w, lines } = boot({
            before: '<script>' +
                'document.cookie = "utag_main_v_id=abc; path=/";' +
                'document.cookie = "utag_main_ses_id=def; path=/";' +
                'document.cookie = "utag_main__sn=2; path=/";' +
                'document.cookie = "session=mine; path=/";</script>',
        });
        await settle();
        assert.equal(w.document.cookie.includes('utag_main'), false);
        assert.equal(w.document.cookie.includes('session=mine'), true);
        assert.match(lines[0], / cleared=3 /);
    });

    it('expires both shapes when a visitor has both', async ( ) => {
        const { w, lines } = boot({
            before: '<script>document.cookie = "utag_main=v_id:a; path=/";' +
                'document.cookie = "utag_main_v_id=b; path=/";</script>',
        });
        await settle();
        assert.equal(w.document.cookie.includes('utag_main'), false);
        assert.match(lines[0], / cleared=2 /);
    });

    // The underscore is the boundary: a page cookie that merely starts the
    // same way is not theirs.
    it('leaves a page cookie that only looks like theirs', async ( ) => {
        const { w, lines } = boot({
            before: '<script>document.cookie = "utag_mainly=mine; path=/";' +
                'document.cookie = "utag_maintenance=mine; path=/";</script>',
        });
        await settle();
        assert.equal(w.document.cookie.includes('utag_mainly=mine'), true);
        assert.equal(w.document.cookie.includes('utag_maintenance=mine'),
            true);
        assert.match(lines[0], / cleared=0 /);
    });

    it('leaves the page its own cookies', async ( ) => {
        const { w } = boot({
            before: '<script>document.cookie = "session=mine; path=/";' +
                'document.cookie = "utag_main=v_id:abc; path=/";</script>',
        });
        await settle();
        assert.equal(w.document.cookie.includes('session=mine'), true);
        assert.equal(w.document.cookie.includes('utag_main'), false);
    });

    it('writes nothing where there is no cookie of theirs', async ( ) => {
        const written = [];
        boot({
            beforeParse(win) {
                const held = Object.getOwnPropertyDescriptor(
                    Object.getPrototypeOf(win.document), 'cookie');
                Object.defineProperty(win.document, 'cookie', {
                    configurable: true,
                    get() { return held.get.call(this); },
                    set(v) { written.push(v); held.set.call(this, v); },
                });
            },
        });
        await settle();
        assert.deepEqual([ ...written ], []);
    });

    it('expires on every parent suffix and with no domain', async ( ) => {
        const written = [];
        boot({
            url: 'https://shop.a.example.co.uk/page',
            before: '<script>document.cookie = "utag_main=v_id:abc; path=/";' +
                '</script>',
            beforeParse(win) {
                const held = Object.getOwnPropertyDescriptor(
                    Object.getPrototypeOf(win.document), 'cookie');
                Object.defineProperty(win.document, 'cookie', {
                    configurable: true,
                    get() { return held.get.call(this); },
                    set(v) { written.push(v); held.set.call(this, v); },
                });
            },
        });
        await settle();
        const domains = written
            .filter(line => line.startsWith('utag_main=;'))
            .map(line => {
                const found = /domain=([^;]+)/.exec(line);
                return found !== null ? found[1] : '(none)';
            });
        assert.deepEqual(domains, [
            '(none)', 'shop.a.example.co.uk', 'a.example.co.uk',
            'example.co.uk', 'co.uk',
        ]);
    });

    // An opaque origin - a sandboxed frame, a data: document - throws on
    // the jar and on both stores. Clearing is a bonus there, not a
    // precondition: the object still has to be published, or this is
    // worse than the block it replaces.
    it('publishes even where the jar and the stores refuse', async ( ) => {
        const { w } = boot({
            beforeParse(win) {
                Object.defineProperty(win.document, 'cookie', {
                    configurable: true,
                    get() { throw new Error('SecurityError'); },
                    set() { throw new Error('SecurityError'); },
                });
                for ( const store of [ 'localStorage', 'sessionStorage' ] ) {
                    Object.defineProperty(win, store, {
                        configurable: true,
                        get() { throw new Error('SecurityError'); },
                    });
                }
            },
        });
        await settle();
        assert.equal(typeof w.utag, 'object');
        assert.equal(typeof w.utag.track, 'function');
        assert.equal(w.utag.ut.vi(), '');
    });
});

describe('extra/tealium.js, what is already there', ( ) => {
    it('leaves a loader that is already running alone', ( ) => {
        const { w } = boot({
            before: '<script>window.utag = { track: function() {},' +
                ' mine: true };</script>',
        });
        assert.equal(w.utag.mine, true);
        assert.equal(w.utag.ut, undefined);
    });

    it('replaces a page element that took the name', ( ) => {
        const { w } = boot({
            before: '<script>var el = document.createElement("div");' +
                'el.id = "utag"; document.documentElement.appendChild(el);' +
                '</script>',
        });
        assert.equal(typeof w.utag.track, 'function');
    });
});

describe('extra/tealium.js, what it says', ( ) => {
    it('says one line, once', ( ) => {
        const { lines } = boot({});
        assert.equal(lines.length, 1);
        assert.match(lines[0], /^\[consent-rr\] tealium \d+\.\d+\.\d+ /);
    });

    it('names the id, the source and what it took', ( ) => {
        const fromEl = bootRedirected();
        assert.match(fromEl.lines[0],
            new RegExp(' id=' + ID.replace('.', '\\.') +
                ' from=element took=utag cleared=0 '));
        const scanned = boot({
            before: '<script src="' + LOADER_URL + '"></script>',
        });
        assert.match(scanned.lines[0], / from=scan /);
        const bare = boot({});
        assert.match(bare.lines[0], / id=none from=none /);
    });

    it('counts the cookie it cleared', ( ) => {
        const { lines } = boot({
            before: '<script>document.cookie = "utag_main=v_id:abc; path=/";' +
                '</script>',
        });
        assert.match(lines[0], / cleared=1 /);
    });

    it('says it stood aside for a loader already there', ( ) => {
        const { lines } = boot({
            before: '<script>window.utag = { track: function() {} };</script>',
        });
        assert.match(lines[0], / took=theirs /);
    });
});
