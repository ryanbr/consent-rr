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

    it('leaves out the readers that gather the data layer', ( ) => {
        const { w } = boot({});
        for ( const name of [ 'RDcp', 'RDlocalStorage', 'RDsessionStorage',
            'RDmeta', 'RDqp', 'RDdom', 'RDpv', 'RDva' ] ) {
            assert.equal(w.utag.loader[name], undefined, name);
        }
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

    it('takes a call with no callback at all', ( ) => {
        const { w } = boot({
            after: '<script>window.fine = utag.link({ a: 1 }) === false &&' +
                ' utag.view() === false && utag.track("link") === false;' +
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

    it('merges, pads, and names a type', ( ) => {
        const { w } = boot({});
        const merged = w.utag.ut.merge({ a: 1 }, { b: 2 });
        assert.deepEqual({ ...merged }, { a: 1, b: 2 });
        assert.equal(w.utag.ut.pad(7, 3), '007');
        assert.equal(w.utag.ut.typeOf([]), 'array');
        assert.equal(w.utag.ut.typeOf(null), 'null');
        assert.equal(w.utag.ut.typeOf({}), 'object');
    });

    it('answers the emptiness questions', ( ) => {
        const { w } = boot({});
        assert.equal(w.utag.ut.isEmptyObject({}), true);
        assert.equal(w.utag.ut.isEmptyObject({ a: 1 }), false);
        assert.equal(w.utag.ut.isEmpty(''), true);
        assert.equal(w.utag.ut.hasOwn({ a: 1 }, 'a'), true);
        assert.equal(w.utag.ut.hasOwn({ a: 1 }, 'b'), false);
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

    it('answers the rest in the shapes their enforcement reads', ( ) => {
        const { w } = boot({});
        assert.equal(typeof w.utag.gdpr.getCookieValues(), 'object');
        assert.equal(typeof w.utag.gdpr.getEnforcementMode(), 'string');
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
            assert.deepEqual([ ...touched ], []);
            assert.equal(w.localStorage.getItem('mine'), 'kept');
            assert.equal(w.sessionStorage.getItem('also'), 'kept');
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

    it('publishes even where the jar refuses', async ( ) => {
        const { w } = boot({
            beforeParse(win) {
                Object.defineProperty(win.document, 'cookie', {
                    configurable: true,
                    get() { throw new Error('SecurityError'); },
                    set() { throw new Error('SecurityError'); },
                });
            },
        });
        await settle();
        assert.equal(typeof w.utag, 'object');
        assert.equal(typeof w.utag.track, 'function');
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
