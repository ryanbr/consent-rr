/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    extra/adobe-launch.js is not a cookie-consent resource and is not built
    into dist/, so it is read from extra/ - but still through parseResources,
    so the uBO line rules that drop the header are exercised the way they ship.

    Every expectation about their runtime in here was read off a real one,
    assets.adobedtm.com/5d4962a43b79/96fada676f0e/launch-95431b44ee81.min.js,
    and the quoted strings are theirs. See extra/adobe-launch.md.

*/

import { strict as assert } from 'node:assert';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { before, describe, it } from 'node:test';
import { JSDOM, VirtualConsole } from 'jsdom';
import { parseResources, settle } from './helpers.mjs';

// The two shapes their embed takes: a property and environment pair with the
// build in the filename, and the flat one from before that.
const LAUNCH_URL = 'https://assets.adobedtm.com/cd392cd56789/90967d1c21d0/' +
    'launch-95431b44ee81.min.js';
const LEGACY_URL = 'https://assets.adobedtm.com/' +
    'launch-EN93497c30fdf04bd8a0f3b1b0bbfdf4ce.min.js';
// The filename a property migrated from DTM keeps. The file served there is
// a current turbine build - same version, same surface - so it is the same
// replacement, not an older one.
const SATELLITE_LIB_URL = 'https://assets.adobedtm.com/' +
    '8555ef77443acd85ab4eb6b187cf7ed7fe0f79eb/' +
    'satelliteLib-f2fc6f00da802a0747b6ffed3c12e3931bfca496.js';

let code;
let rules;

before(async ( ) => {
    const text = await fs.readFile(
        path.join(import.meta.dirname, '..', 'extra', 'adobe-launch.js'), 'utf8'
    );
    code = parseResources(text).get('adobe-launch.js');
    assert.ok(typeof code === 'string' && code.length !== 0);
    // The rules live in the header rather than in a filter list, because
    // extra/ is not built. Read them from there, so a rule that is only in
    // the notes - or missing, as the satelliteLib one was - is caught.
    rules = text.split('\n')
        .map(line => line.replace(/^\/\/\s*/, '').trim())
        .filter(line => line.startsWith('||'));
    assert.ok(rules.length !== 0, 'no rules in the header');
});

// uBO's own matching, as far as these rules use it: || anchors the scheme
// and any subdomain, and * is any run of characters, including a slash.
const matches = (rule, url) => {
    const body = rule.slice(2).split('$')[0];
    const pattern = body
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '[\\s\\S]*');
    return new RegExp('^https?://([^/]+\\.)?' + pattern).test(url);
};

// The resource inline in <head>, with the page's own tags around it.
const boot = (options = {}) => {
    const head = (options.before || '') +
        `<script>${code}</script>` + (options.after || '');
    const dom = new JSDOM(
        `<!DOCTYPE html><html><head>${head}</head>` +
        `<body>${options.body || '<p id="content">x</p>'}</body></html>`,
        {
            runScripts: 'dangerously',
            url: options.url || 'https://www.example.com/page',
            virtualConsole: new VirtualConsole(),
        }
    );
    return dom.window;
};

// The request redirected: the element keeps the embed's own src, which is the
// only place the property and environment survive.
const bootRedirected = (src = LAUNCH_URL) => {
    const dom = new JSDOM(
        `<!DOCTYPE html><html><head><script src="${src}"></script>` +
        `</head><body></body></html>`,
        {
            runScripts: 'dangerously',
            url: 'https://www.example.com/page',
            virtualConsole: new VirtualConsole(),
        }
    );
    const win = dom.window;
    // Any of the hosts, since a site can serve the runtime itself.
    const el = win.document.querySelector('head script[src]');
    new win.Function('el', [
        "Object.defineProperty(document, 'currentScript',",
        '{ value: el, configurable: true });',
        code,
    ].join(''))(el);
    return win;
};

// Console captured before any script runs. Their logger says nothing until
// debug is on, so most of these assert an empty array.
const bootLogged = ( ) => {
    const lines = { log: [], info: [], warn: [], error: [], debug: [] };
    const dom = new JSDOM(
        `<!DOCTYPE html><html><head><script>${code}</script></head>` +
        `<body></body></html>`,
        {
            runScripts: 'dangerously',
            url: 'https://www.example.com/page',
            beforeParse(win) {
                for ( const level of Object.keys(lines) ) {
                    win.console[level] = (...parts) => {
                        lines[level].push(parts.join(' '));
                    };
                }
            },
        }
    );
    return { win: dom.window, lines };
};

// Every way out of the page, recorded before any script runs.
const bootWatched = ( ) => {
    const touched = [];
    const baseline = {};
    const dom = new JSDOM(
        `<!DOCTYPE html><html><head><script>${code}</script></head>` +
        `<body><p id="content">x</p></body></html>`,
        {
            runScripts: 'dangerously',
            url: 'https://www.example.com/page',
            virtualConsole: new VirtualConsole(),
            beforeParse(win) {
                const doc = win.document;
                const note = what => { touched.push(what); };
                const jar = Object.getOwnPropertyDescriptor(
                    win.Document.prototype, 'cookie'
                );
                Object.defineProperty(doc, 'cookie', {
                    configurable: true,
                    get() { note('cookie read'); return jar.get.call(doc); },
                    set(value) {
                        note('cookie write');
                        return jar.set.call(doc, value);
                    },
                });
                for ( const name of [
                    'getItem', 'setItem', 'removeItem', 'clear', 'key',
                ] ) {
                    const fn = win.Storage.prototype[name];
                    win.Storage.prototype[name] = function(...args) {
                        note('storage.' + name);
                        return fn.apply(this, args);
                    };
                }
                win.fetch = ( ) => {
                    note('fetch');
                    return win.Promise.resolve();
                };
                win.navigator.sendBeacon = ( ) => { note('sendBeacon'); return true; };
                const open = win.XMLHttpRequest.prototype.open;
                win.XMLHttpRequest.prototype.open = function(...args) {
                    note('xhr');
                    return open.apply(this, args);
                };
                const append = win.Node.prototype.appendChild;
                win.Node.prototype.appendChild = function(node) {
                    if ( node && node.tagName === 'SCRIPT' ) {
                        note('script appended');
                    }
                    return append.call(this, node);
                };
                for ( const target of [ win, doc ] ) {
                    const label = target === win ? 'window' : 'document';
                    const add = target.addEventListener.bind(target);
                    target.addEventListener = (type, ...rest) => {
                        note(label + ' listener ' + type);
                        return add(type, ...rest);
                    };
                }
                baseline.objectKeys =
                    Object.getOwnPropertyNames(win.Object.prototype);
                baseline.fetch = win.fetch;
            },
        }
    );
    return { win: dom.window, touched, baseline };
};

// A page that sets a monitor before the library loads, which is the one thing
// their runtime keeps off an existing object.
const MONITOR = '<script>window._satellite = { _monitors: [ { ruleTriggered:' +
    ' function() { window.heard = true; } } ] };</script>';

describe('extra/adobe-launch.js, the object it publishes', ( ) => {

    it('installs the api at document_start', ( ) => {
        const win = boot({
            before: '<script>window.readyAt = document.readyState;</script>',
        });
        assert.equal(win.readyAt, 'loading');
        assert.equal(typeof win._satellite, 'object');
        assert.equal(typeof win._satellite.getVar, 'function');
    });

    it('publishes every member their runtime does', ( ) => {
        // Read off their library: the custom-script surface plus the window
        // members. Nothing here is invented, and nothing of theirs is left
        // out - a page that reaches for one of these finds it.
        const win = boot();
        assert.deepEqual(Object.keys(win._satellite).sort(), [
            '_container', '_monitors', '_onCustomCodeFailure',
            '_onCustomCodeSuccess', '__registerScript', 'buildInfo', 'company',
            'container', 'cookie', 'environment', 'getVar', 'getVisitorId',
            'logger', 'notify', 'pageBottom', 'property', 'readCookie',
            'removeCookie', 'setCookie', 'setDebug', 'setVar', 'track',
        ].sort());
    });

    it('leaves a real runtime alone', ( ) => {
        const win = boot({
            before: '<script>window._satellite = { getVar: function() {' +
                " return 'theirs'; } };</script>",
        });
        assert.equal(win._satellite.getVar(), 'theirs');
        assert.equal(win._satellite.track, undefined);
    });

    it('keeps the monitors a page installed before it', ( ) => {
        const win = boot({ before: MONITOR });
        assert.equal(win._satellite._monitors.length, 1);
        assert.equal(typeof win._satellite._monitors[0].ruleTriggered,
            'function');
        // And the rest of the api is there beside them.
        assert.equal(typeof win._satellite.getVar, 'function');
    });

    it('answers getVar with a string for a name it does not hold', ( ) => {
        // Their container code calls string methods straight on the answer -
        // _satellite.getVar("OptanonConsent").toLowerCase() is in a real one -
        // so undefined for an unknown name is a TypeError on the page. A
        // value the page stored itself comes back as it went in, below.
        const win = boot();
        assert.equal(win._satellite.getVar('OptanonConsent'), '');
        assert.equal(win._satellite.getVar('anything at all'), '');
        assert.equal(win._satellite.getVar('x').toLowerCase(), '');
        assert.equal(win._satellite.getVar(), '');
        assert.equal(win._satellite.getVar(null), '');
    });

    it('reads back what setVar wrote, both forms', ( ) => {
        const win = boot();
        win._satellite.setVar('pageName', 'AOS:dashboard:Dashboard');
        assert.equal(win._satellite.getVar('pageName'),
            'AOS:dashboard:Dashboard');
        win._satellite.setVar({ guid: 'g1', cif: 'c1' });
        assert.equal(win._satellite.getVar('guid'), 'g1');
        assert.equal(win._satellite.getVar('cif'), 'c1');
        // A value that is not a string comes back as it went in, including
        // undefined: theirs stores and returns whatever it was handed, so
        // the empty string is for names nothing has set, not a coercion.
        win._satellite.setVar('count', 3);
        assert.equal(win._satellite.getVar('count'), 3);
        win._satellite.setVar('nothing', undefined);
        assert.equal(win._satellite.getVar('nothing'), undefined);
        win._satellite.setVar('nul', null);
        assert.equal(win._satellite.getVar('nul'), null);
    });

    it('stands aside from a second copy of itself', ( ) => {
        // uBO injects per matching request, and a page can carry two embeds
        // this rule covers. The second run must find the first object and
        // leave it, rather than publishing a fresh one over it.
        const win = boot();
        const first = win._satellite;
        first.setVar('kept', 'yes');
        new win.Function(code)();
        assert.equal(win._satellite, first);
        assert.equal(win._satellite.getVar('kept'), 'yes');
        assert.equal(win.__satelliteLoaded, true);
    });

    it('takes the property and environment from the redirected src', ( ) => {
        const win = bootRedirected();
        assert.equal(win._satellite.environment.id, '90967d1c21d0');
        assert.equal(win._satellite.environment.stage, 'production');
    });

    it('takes the environment from a first-party path too', ( ) => {
        // The self-hosted layout puts /launch/ in front of the two hashes,
        // which the pattern has to step over rather than capture.
        const win = bootRedirected(
            'https://lightning.cnn.com/launch/7be62238e4c3/97fa00444124/' +
            'launch-2878c87af5e3.min.js'
        );
        assert.equal(win._satellite.environment.id, '97fa00444124');
        assert.equal(typeof win._satellite.getVar, 'function');
    });

    it('says nothing it cannot know about the property', ( ) => {
        // Their property name and org id are in the container, which is not
        // in the url. Empty strings rather than undefined, because page code
        // reaches through these.
        const win = bootRedirected();
        // Through JSON, because an object from the page's realm is never
        // reference-equal to one of ours - see AGENTS.md.
        const seen = JSON.parse(JSON.stringify({
            property: win._satellite.property,
            company: win._satellite.company,
        }));
        assert.deepEqual(seen.property, { name: '', id: '' });
        assert.deepEqual(seen.company, { orgId: '' });
        assert.equal(win._satellite.property.name.length, 0);
    });

    it('takes the legacy flat embed too', ( ) => {
        const win = bootRedirected(LEGACY_URL);
        assert.equal(typeof win._satellite.getVar, 'function');
        assert.equal(win._satellite.environment.id, '');
    });

    it('serves the satelliteLib filename a migrated property keeps', ( ) => {
        const win = bootRedirected(SATELLITE_LIB_URL);
        assert.equal(typeof win._satellite.getVar, 'function');
        assert.equal(typeof win._satellite.track, 'function');
        // That url carries one hash and no environment, and the real
        // environment id is inside the container rather than the path, so
        // there is nothing to report and nothing to invent.
        assert.equal(win._satellite.environment.id, '');
        assert.equal(win._satellite.environment.stage, 'production');
    });

    it('carries no identity when it was not redirected', ( ) => {
        const win = boot();
        assert.equal(win._satellite.environment.id, '');
    });

    it('reports a build their turbine version matches', ( ) => {
        const win = boot();
        assert.deepEqual(Object.keys(win._satellite.buildInfo).sort(), [
            'buildDate', 'minified', 'turbineBuildDate', 'turbineVersion',
        ]);
        assert.match(win._satellite.buildInfo.turbineVersion, /^\d+\.\d+\.\d+$/);
        assert.equal(win._satellite.buildInfo.minified, true);
    });

});

describe('extra/adobe-launch.js, what it says', ( ) => {

    it('says nothing until a page turns debug on', ( ) => {
        const { win, lines } = bootLogged();
        win._satellite.track('add-to-cart');
        win._satellite.logger.log('quiet');
        win._satellite.logger.warn('quiet');
        win._satellite.notify('quiet');
        assert.deepEqual(lines, {
            log: [], info: [], warn: [], error: [], debug: [],
        });
    });

    it('answers track with their own words for no rules', ( ) => {
        // With no rules of any kind, theirs logs exactly this for every
        // identifier, so the stub is not inventing a message.
        const { win, lines } = bootLogged();
        win._satellite.setDebug(true);
        win._satellite.track('  add-to-cart  ');
        assert.deepEqual(lines.log, [
            '"add-to-cart" does not match any direct call identifiers.',
        ]);
    });

    it('takes a track call a page gets wrong without throwing', ( ) => {
        const { win, lines } = bootLogged();
        win._satellite.setDebug(true);
        win._satellite.track();
        win._satellite.track(42);
        win._satellite.track(null, { a: 1 });
        assert.equal(lines.log.length, 3);
        assert.equal(lines.error.length, 0);
    });

    it('maps notify levels the way theirs does', ( ) => {
        const { win, lines } = bootLogged();
        win._satellite.setDebug(true);
        win._satellite.notify('three', 3);
        win._satellite.notify('four', 4);
        win._satellite.notify('five', 5);
        win._satellite.notify('none');
        assert.deepEqual(lines.info, [ 'three' ]);
        assert.deepEqual(lines.warn.filter(l => l === 'four'), [ 'four' ]);
        assert.deepEqual(lines.error, [ 'five' ]);
        assert.deepEqual(lines.log, [ 'none' ]);
        // Every one of them carries their deprecation notice as well.
        assert.equal(lines.warn.filter(l => l.includes('is deprecated')).length,
            4);
    });

    it('warns once that the container is not an api', ( ) => {
        const { win, lines } = bootLogged();
        win._satellite.setDebug(true);
        void win._satellite._container;
        void win._satellite._container;
        void win._satellite._container;
        const warnings = lines.warn.filter(l => l.includes('_container'));
        assert.equal(warnings.length, 1);
        assert.match(warnings[0], /may change at any time/);
    });

    it('serves a container shaped like theirs', ( ) => {
        const win = boot();
        const container = win._satellite._container;
        assert.deepEqual(Object.keys(container).sort(), [
            'buildInfo', 'company', 'dataElements', 'environment',
            'extensions', 'property', 'rules',
        ]);
        const seen = JSON.parse(JSON.stringify(container));
        assert.deepEqual(seen.rules, []);
        assert.deepEqual(seen.dataElements, {});
        assert.deepEqual(seen.extensions, {});
    });

    it('turns debug back off', ( ) => {
        const { win, lines } = bootLogged();
        win._satellite.setDebug(true);
        win._satellite.logger.log('heard');
        win._satellite.setDebug(false);
        win._satellite.logger.log('not heard');
        assert.deepEqual(lines.log, [ 'heard' ]);
    });

});

describe('extra/adobe-launch.js, cookies and callbacks', ( ) => {

    it('reads a cookie the page already has', ( ) => {
        const win = boot({
            before: "<script>document.cookie = 'CPRA=N; path=/';</script>",
        });
        assert.equal(win._satellite.cookie.get('CPRA'), 'N');
        assert.equal(win._satellite.cookie.get('nothing'), undefined);
        assert.equal(win._satellite.cookie.get(''), undefined);
        assert.equal(win._satellite.cookie.get(), undefined);
    });

    it('matches a cookie name exactly, not as a prefix', ( ) => {
        // A real property writes both CPRA and CPRAGUID, so a prefix match
        // answers the wrong one - and the shorter name is the one asked for.
        const win = boot({
            before: "<script>document.cookie = 'CPRAGUID=guid-value; path=/';" +
                "document.cookie = 'CPRA=N; path=/';</script>",
        });
        assert.equal(win._satellite.cookie.get('CPRA'), 'N');
        assert.equal(win._satellite.cookie.get('CPRAGUID'), 'guid-value');
        assert.equal(win._satellite.cookie.get('CPR'), undefined);
        assert.equal(win._satellite.cookie.get('RAGUID'), undefined);
    });

    it('decodes a cookie value the way their library does', ( ) => {
        const win = boot({
            before: "<script>document.cookie = 'pn=AOS%3Adashboard; path=/';" +
                '</script>',
        });
        assert.equal(win._satellite.cookie.get('pn'), 'AOS:dashboard');
    });

    it('writes no cookie, whichever way it is asked', ( ) => {
        const win = boot();
        win._satellite.cookie.set('_dtm_cid_guid', 'g1', { expires: 365 });
        win._satellite.setCookie('AllyLoginLOB', 'aob', 365);
        assert.equal(win.document.cookie, '');
    });

    it('takes a deletion through set, in each shape a container asks', ( ) => {
        // Measured on real containers: an empty value, expires 0, and a bare
        // negative day count - the DTM-era third argument, which their own
        // js-cookie would not honour either. A deletion can only take data
        // away, so each one is carried out.
        const win = boot({
            before: "<script>document.cookie = 'a=1; path=/';" +
                "document.cookie = 'b=2; path=/';" +
                "document.cookie = 'c=3; path=/';" +
                "document.cookie = 'd=4; path=/';</script>",
        });
        const cookie = win._satellite.cookie;
        cookie.set('a', '', { path: '/' });
        cookie.set('b', 'anything', { expires: 0, path: '/' });
        cookie.set('c', '-', -1000);
        cookie.set('d', 'x', { expires: new Date(Date.now() - 86400000),
            path: '/' });
        for ( const name of [ 'a', 'b', 'c', 'd' ] ) {
            assert.equal(cookie.get(name), undefined, name);
        }
        assert.equal(win.document.cookie, '');
    });

    it('writes nothing, and removes nothing, when a value is kept', ( ) => {
        // Seeded first: a set that is not deletion-shaped must leave the
        // cookie exactly as it was. Asserting only that nothing was written
        // cannot tell that apart from a set that deletes everything.
        const win = boot({
            before: "<script>document.cookie = 'keep=old; path=/';" +
                "document.cookie = 'keep2=old; path=/';" +
                "document.cookie = 'keep3=old; path=/';" +
                "document.cookie = 'keep4=old; path=/';</script>",
        });
        const cookie = win._satellite.cookie;
        cookie.set('keep', 'value');
        cookie.set('keep2', 'value', { expires: 365 });
        cookie.set('keep3', 'value', 30);
        cookie.set('keep4', 'value',
            { expires: new win.Date(Date.now() + 8640000) });
        for ( const name of [ 'keep', 'keep2', 'keep3', 'keep4' ] ) {
            assert.equal(cookie.get(name), 'old', name);
        }
        // And nothing new of its own.
        assert.equal(win.document.cookie.includes('value'), false);
    });

    it('reads a cookie a malformed escape would otherwise throw on', ( ) => {
        // decodeURIComponent throws on a stray percent, and a jar is full of
        // whatever anything on the page put there. The raw text comes back
        // instead, for the name as well as the value.
        const win = boot({
            before: '<script>document.cookie = "bad=100%; path=/";' +
                'document.cookie = "ok=fine; path=/";</script>',
        });
        const cookie = win._satellite.cookie;
        assert.equal(cookie.get('bad'), '100%');
        assert.equal(cookie.get('ok'), 'fine');
        // And a name that cannot be decoded is still matched raw.
        win.document.cookie = '%E0%A4%A=named; path=/';
        assert.equal(cookie.get('%E0%A4%A'), 'named');
    });

    it('reads and removes a cookie name in either spelling', ( ) => {
        // Theirs encodes the name it writes and decodes the name it reads,
        // so a jar can hold either spelling: one the page wrote raw, one
        // their own library wrote encoded. A removal that expires only the
        // encoded form leaves the raw one behind - which it did.
        const win = boot({
            before: '<script>document.cookie = "a b=1; path=/";' +
                'document.cookie = "c%20d=2; path=/";</script>',
        });
        const cookie = win._satellite.cookie;
        assert.equal(cookie.get('a b'), '1');
        assert.equal(cookie.get('c d'), '2');
        cookie.remove('a b');
        cookie.remove('c d');
        assert.equal(win.document.cookie, '');
    });

    it('takes a deletion through the deprecated alias too', ( ) => {
        const win = boot({
            before: "<script>document.cookie = 'legacy=1; path=/';</script>",
        });
        win._satellite.setCookie('legacy', '', 0);
        assert.equal(win._satellite.cookie.get('legacy'), undefined);
    });

    it('removes a cookie, because that only takes something away', ( ) => {
        const win = boot({
            before: "<script>document.cookie = 'gone=yes; path=/';</script>",
        });
        assert.equal(win._satellite.cookie.get('gone'), 'yes');
        win._satellite.cookie.remove('gone');
        assert.equal(win._satellite.cookie.get('gone'), undefined);
        assert.equal(win.document.cookie, '');
    });

    it('serves the deprecated cookie aliases through the same jar', ( ) => {
        const { win, lines } = bootLogged();
        win._satellite.setDebug(true);
        win.document.cookie = 'legacy=1; path=/';
        assert.equal(win._satellite.readCookie('legacy'), '1');
        win._satellite.removeCookie('legacy');
        assert.equal(win._satellite.readCookie('legacy'), undefined);
        const notices = lines.warn.filter(l => l.includes('is deprecated'));
        assert.equal(notices.length, 3);
        assert.match(notices[0], /_satellite\.cookie\.get\("legacy"\)/);
    });

    it('sets the loaded flag their own library sets', ( ) => {
        // Every runtime read does
        //   if (container && !window.__satelliteLoaded) {
        //       window.__satelliteLoaded = true; ...
        // at the point it hydrates the satellite object, and a second copy
        // of the real library reads it and stands down. A page polling it
        // for readiness gets the same answer it would from theirs.
        const win = boot();
        assert.equal(win.__satelliteLoaded, true);
    });

    it('does not set the loaded flag when it stands aside', ( ) => {
        const win = boot({
            before: '<script>window._satellite = { getVar: function() {' +
                " return 'theirs'; } };</script>",
        });
        assert.equal(win.__satelliteLoaded, undefined);
    });

    it('calls the loaded callback a page defined for their embed', ( ) => {
        const win = boot({
            before: '<script>window.__satelliteLoadedCallback = ' +
                'function(s) { window.calledWith = typeof s.getVar; };</script>',
        });
        assert.equal(win.calledWith, 'function');
    });

    it('survives a loaded callback that throws', ( ) => {
        // Installed before any script, so an error that escapes the call is
        // reported here. The published object is in place either way, which
        // is why the listener is the thing that can tell.
        const errors = [];
        const dom = new JSDOM(
            '<!DOCTYPE html><html><head><script>' +
            'window.__satelliteLoadedCallback = function() {' +
            " throw new Error('from a page callback'); };</script>" +
            `<script>${code}</script></head><body></body></html>`,
            {
                runScripts: 'dangerously',
                url: 'https://www.example.com/page',
                virtualConsole: new VirtualConsole(),
                beforeParse(win) {
                    win.addEventListener('error', ev => {
                        errors.push(ev.message || 'error');
                    });
                },
            }
        );
        assert.equal(typeof dom.window._satellite.getVar, 'function');
        assert.deepEqual(errors, []);
    });

    it('lets a real runtime replace it afterwards', ( ) => {
        // Theirs assigns window._satellite itself. A stub that locked the
        // global would keep the real library from ever taking over - on a
        // page where the rule stops matching, or where a copy is served
        // from somewhere this does not cover.
        const win = boot();
        const theirs = new win.Object();
        theirs.getVar = ( ) => 'theirs';
        win._satellite = theirs;
        assert.equal(win._satellite.getVar(), 'theirs');
    });

    it('lets the page replace getVar, as a real container does', ( ) => {
        // Measured, not imagined: one container's custom code flattens its
        // data layer into setVar calls and then wraps _satellite.getVar with
        // its own function. A member published read-only would throw there.
        const win = boot();
        const original = win._satellite.getVar;
        win._satellite.getVar = name => 'wrapped:' + original(name);
        assert.equal(win._satellite.getVar('x'), 'wrapped:');
        win._satellite.setVar('y', 'z');
        assert.equal(win._satellite.getVar('y'), 'wrapped:z');
        // And the same for the rest of the surface a container reaches for.
        for ( const name of [ 'track', 'setVar', 'cookie', 'logger' ] ) {
            const descriptor = Object.getOwnPropertyDescriptor(
                win._satellite, name
            );
            assert.equal(descriptor.writable, true, name);
        }
    });

    it('lets a page hang its own members on the object', ( ) => {
        // Measured: one container reads a data element at the path
        // "_satellite.db.currentOPrAURL", so something outside the runtime
        // writes `db` onto the object - and another reads `_satellite._db`
        // defensively. A sealed or frozen object would break that silently
        // in strict mode and loudly outside it.
        const win = boot();
        assert.equal(Object.isExtensible(win._satellite), true);
        win._satellite.db = { currentOPrAURL: 'https://example.com/apply' };
        assert.equal(win._satellite.db.currentOPrAURL,
            'https://example.com/apply');
        win._satellite._db = { actionLabel: 'continue' };
        assert.equal(win._satellite._db.actionLabel, 'continue');
        // And the api it was published with is still there beside them.
        assert.equal(typeof win._satellite.getVar, 'function');
    });

    it('answers getVisitorId with null, as their own stub does', ( ) => {
        const win = boot();
        assert.equal(win._satellite.getVisitorId(), null);
    });

    it('takes a rule component that registers itself', async ( ) => {
        // A page with the RC file already inline: it calls __registerScript,
        // which must not throw, and nothing ever asks for the code again.
        const win = boot({
            after: '<script>_satellite.__registerScript(' +
                "'https://assets.adobedtm.com/a/b/c/RC1-source.min.js'," +
                " 'window.ranIt = true;');</script>",
        });
        await settle(40);
        assert.equal(win.ranIt, undefined);
        assert.equal(typeof win._satellite.getVar, 'function');
    });

});

describe('extra/adobe-launch.js, what it does not do', ( ) => {

    it('touches nothing of the page it was not asked to', async ( ) => {
        const { win, touched, baseline } = bootWatched();
        await settle(80);
        assert.deepEqual(touched, []);
        assert.equal(win.fetch, baseline.fetch, 'fetch was wrapped');
        assert.deepEqual(
            Object.getOwnPropertyNames(win.Object.prototype),
            baseline.objectKeys, 'Object.prototype was written to'
        );
        assert.equal(win.document.querySelectorAll('script').length, 1);
    });

    it('asks for no rule component of its own', async ( ) => {
        // The whole point of replacing the runtime rather than its parts:
        // every RC<uuid>-source.min.js is requested by the runtime, so a
        // stub asks for none of them.
        const { win, touched } = bootWatched();
        win._satellite.track('whatever');
        win._satellite.pageBottom();
        await settle(60);
        assert.equal(
            touched.filter(what => what !== 'cookie read').length, 0,
            touched.join(', ')
        );
        assert.equal(win.document.querySelectorAll('script[src]').length, 0);
    });

    it('keeps no identifier of its own anywhere', ( ) => {
        const win = bootRedirected();
        assert.equal(win.document.cookie, '');
        assert.deepEqual(Object.keys(win.localStorage), []);
        assert.deepEqual(Object.keys(win.sessionStorage), []);
    });

    it('leaves no timer and no listener behind', async ( ) => {
        const timers = [];
        const listeners = [];
        const dom = new JSDOM(
            `<!DOCTYPE html><html><head><script>${code}</script></head>` +
            '<body></body></html>',
            {
                runScripts: 'dangerously',
                url: 'https://www.example.com/page',
                virtualConsole: new VirtualConsole(),
                beforeParse(win) {
                    const realInterval = win.setInterval;
                    win.setInterval = (...args) => {
                        timers.push('interval');
                        return realInterval(...args);
                    };
                    const realTimeout = win.setTimeout;
                    win.setTimeout = (...args) => {
                        timers.push('timeout');
                        return realTimeout(...args);
                    };
                    const add = win.addEventListener.bind(win);
                    win.addEventListener = (type, ...rest) => {
                        listeners.push(type);
                        return add(type, ...rest);
                    };
                },
            }
        );
        await settle(80);
        assert.deepEqual(timers, []);
        assert.deepEqual(listeners, []);
        assert.equal(typeof dom.window._satellite.getVar, 'function');
    });

});

describe('filters, adobe-launch', ( ) => {

    it('covers every embed shape that has been seen served', ( ) => {
        // Each of these was fetched and read: turbine 29.1.0, the same
        // _satellite surface, the same wording. A shape that is served and
        // not covered is a page that gets the block instead of the stub.
        const served = [
            // a site serving the runtime from its own host, same layout
            'https://lightning.cnn.com/launch/7be62238e4c3/97fa00444124/' +
                'launch-2878c87af5e3.min.js',
            // the current nested shape, property and environment
            'https://assets.adobedtm.com/cd392cd56789/90967d1c21d0/' +
                'launch-95431b44ee81.min.js',
            'https://assets.adobedtm.com/5d4962a43b79/96fada676f0e/' +
                'launch-95431b44ee81.min.js',
            'https://assets.adobedtm.com/6f7fd03e16fd/8fd32c880a35/' +
                'launch-ba52266751b7.min.js',
            // the flat one, still served
            'https://assets.adobedtm.com/' +
                'launch-EN03682f66064449c8b87d78eae3e2fc57.min.js',
            'https://assets.adobedtm.com/' +
                'launch-EN93497c30fdf04bd8a0f3b1b0bbfdf4ce.min.js',
            // the filename a property migrated from DTM keeps
            SATELLITE_LIB_URL,
        ];
        for ( const url of served ) {
            assert.ok(
                rules.some(rule => matches(rule, url)),
                'no rule covers ' + url
            );
        }
    });

    it('covers a staging and development build of the same property', ( ) => {
        for ( const name of [ 'launch-ba52266751b7-staging.min.js',
            'launch-ba52266751b7-development.min.js' ] ) {
            const url = 'https://assets.adobedtm.com/6f7fd03e16fd/' +
                '8fd32c880a35/' + name;
            assert.ok(rules.some(rule => matches(rule, url)), url);
        }
    });

    it('does not cover a rule component, which is deliberate', ( ) => {
        // Their loader resolves a failed one to undefined and the rule
        // carries on, so there is nothing to repair. The header says so;
        // this is the assertion that keeps a rule from drifting in.
        const components = [
            // and the same shapes when a site serves them itself: the
            // runtime rule for that host must not take its components or
            // its copy of the Analytics library either.
            'https://lightning.cnn.com/launch/7be62238e4c3/97fa00444124/' +
                'c27ef2133b49/RC1234-source.min.js',
            'https://lightning.cnn.com/launch/7be62238e4c3/97fa00444124/' +
                'c27ef2133b49/hostedLibFiles/EP31dbb9c60e404ba1aa6e746d49be6f29/' +
                'AppMeasurement.min.js',
            'https://assets.adobedtm.com/cd392cd56789/90967d1c21d0/' +
                'f20f930aa04b/RCb2ca4786fca947278f4aca5265ba7fc6-source.min.js',
            'https://assets.adobedtm.com/cd392cd56789/90967d1c21d0/' +
                'f20f930aa04b/RC2eb8c70fd06c4a2d91f6fec6aa0a8dcf-source.js',
        ];
        for ( const url of components ) {
            assert.equal(
                rules.some(rule => matches(rule, url)), false,
                'a rule covers a rule component: ' + url
            );
        }
    });

    it('redirects every rule to this resource, and nothing else', ( ) => {
        // Every || line in the header is a rule, and each one has to carry
        // the same option string: a line that blocked instead of redirecting
        // would leave _satellite undefined, which is the case this exists to
        // avoid.
        for ( const rule of rules ) {
            assert.ok(
                rule.endsWith('$script,redirect=adobe-launch.js'),
                rule + ' does not redirect to this resource'
            );
        }
    });

    it('names only hosts a url has been seen on', ( ) => {
        // One line per host, and no wildcard host: the path shape is
        // Adobe's but the host is anybody's, so a pattern over hosts would
        // match whatever happened to use the same layout.
        for ( const rule of rules ) {
            assert.match(
                rule,
                /^\|\|(assets\.adobedtm\.com|lightning\.cnn\.com)\//,
                rule
            );
            // No wildcard in the host itself, which is the part that
            // decides whose script this replaces.
            const host = rule.slice(2, rule.indexOf('/', 2));
            assert.ok(host.length !== 0, rule);
            assert.equal(host.includes('*'), false, rule);
        }
    });

});
