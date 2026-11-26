/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    extra/perimeterx.js is not a cookie-consent resource and is not built into
    dist/, so it is read from extra/ - but still through parseResources, so the
    uBO line rules that drop the header are exercised the way they ship.

    The page's own scripts run (runScripts: 'dangerously'), because the whole
    contract is about ordering: the snippet sets window._pxAppId and the
    asyncInit callback before the tag, the client answers after it, and a
    fixture that evals the resource against a finished document cannot see
    either side of that.

*/

import { strict as assert } from 'node:assert';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { before, describe, it } from 'node:test';
import { JSDOM, VirtualConsole } from 'jsdom';
import { parseResources, settle } from './helpers.mjs';

const APP_ID = 'PXG2JgnYto';
const CLIENT_URL = 'https://client.px-cloud.net/' + APP_ID + '/main.min.js';

let code;

before(async ( ) => {
    const text = await fs.readFile(
        path.join(import.meta.dirname, '..', 'extra', 'perimeterx.js'), 'utf8'
    );
    code = parseResources(text).get('perimeterx.js');
    assert.ok(typeof code === 'string' && code.length !== 0);
});

// The resource inline in <head>, with the page's own tags around it.
const boot = (options = {}) => {
    const head = (options.before || '') +
        '<script>' + code + '</script>' + (options.after || '');
    const dom = new JSDOM(
        '<!DOCTYPE html><html><head>' + head + '</head>' +
        '<body>' + (options.body || '<p id="content">x</p>') + '</body></html>',
        {
            runScripts: 'dangerously',
            url: options.url || 'https://example.com/page',
            virtualConsole: new VirtualConsole(),
            beforeParse: options.beforeParse,
        }
    );
    return dom.window;
};

// The same resource where the request was redirected: the script element
// keeps the snippet's own src, which is where the app id survives when the
// snippet did not set window._pxAppId.
const bootRedirected = (src = CLIENT_URL, options = {}) => {
    const dom = new JSDOM(
        '<!DOCTYPE html><html><head>' + (options.before || '') +
        '<script src="' + src + '"></script></head><body></body></html>',
        {
            runScripts: 'dangerously',
            url: 'https://example.com/page',
            virtualConsole: new VirtualConsole(),
        }
    );
    const win = dom.window;
    const el = win.document.querySelector('script[src*="px-cloud"]');
    new win.Function('el', [
        "Object.defineProperty(document, 'currentScript',",
        '{ value: el, configurable: true });',
        code,
    ].join(''))(el);
    return win;
};

describe('extra/perimeterx.js, the public object', ( ) => {
    it('publishes PX and the app id as the same object', ( ) => {
        const w = boot({
            before: '<script>window._pxAppId = "' + APP_ID + '";</script>',
        });
        assert.equal(typeof w.PX, 'object');
        assert.equal(w[APP_ID], w.PX);
    });

    it('carries their three members and nothing else', ( ) => {
        const w = boot({
            before: '<script>window._pxAppId = "' + APP_ID + '";</script>',
        });
        assert.deepEqual(
            Object.keys(w.PX).sort(),
            [ 'ClientUuid', 'Events', 'setChallenge' ]
        );
    });

    it('mints no client uuid', ( ) => {
        const w = boot({
            before: '<script>window._pxAppId = "' + APP_ID + '";</script>',
        });
        assert.equal(w.PX.ClientUuid, '');
    });

    it('answers setChallenge without doing anything', ( ) => {
        const w = boot({
            before: '<script>window._pxAppId = "' + APP_ID + '";</script>',
        });
        assert.equal(typeof w.PX.setChallenge, 'function');
        assert.equal(w.PX.setChallenge({ a: 1 }), undefined);
    });

    it('carries their five emitter methods', ( ) => {
        const w = boot({
            before: '<script>window._pxAppId = "' + APP_ID + '";</script>',
        });
        assert.deepEqual(
            Object.keys(w.PX.Events).sort(),
            [ 'off', 'on', 'one', 'subscribe', 'trigger' ]
        );
    });

    it('has no channels until something subscribes, as theirs does not', ( ) => {
        const w = boot({
            before: '<script>window._pxAppId = "' + APP_ID + '";</script>',
        });
        assert.equal('channels' in w.PX.Events, false);
        w.PX.Events.on('risk', ( ) => {});
        assert.equal('channels' in w.PX.Events, true);
    });
});

describe('extra/perimeterx.js, the app id', ( ) => {
    it('takes the one the snippet set', ( ) => {
        const w = boot({
            before: '<script>window._pxAppId = "PXZLuyHD0K";</script>',
        });
        assert.equal(w.PXZLuyHD0K, w.PX);
        assert.equal(w._pxAppId, 'PXZLuyHD0K');
    });

    it('recovers it from the redirected script element', ( ) => {
        const w = bootRedirected();
        assert.equal(typeof w[APP_ID], 'object');
        assert.equal(w[APP_ID], w.PX);
        assert.equal(w._pxAppId, APP_ID);
    });

    it('recovers it by scanning the page tags', ( ) => {
        const w = boot({
            before: '<script src="' + CLIENT_URL + '"></script>',
        });
        assert.equal(w[APP_ID], w.PX);
    });

    it('recovers it from a captcha tag, the same tenant', ( ) => {
        const w = boot({
            before: '<script src="https://captcha.px-cloud.net/' + APP_ID +
                '/captcha.js"></script>',
        });
        assert.equal(w[APP_ID], w.PX);
    });

    it('still publishes PX with no app id anywhere', ( ) => {
        const w = boot({});
        assert.equal(typeof w.PX, 'object');
        assert.equal(w._pxAppId, undefined);
    });

    it('takes the element url over a mismatched declaration', ( ) => {
        const w = bootRedirected(CLIENT_URL, {
            before: '<script>window._pxAppId = "PXZLuyHD0K";</script>',
        });
        assert.equal(typeof w[APP_ID], 'object');
        assert.equal(w.PXZLuyHD0K, undefined);
        // Theirs never writes _pxAppId at all, so the page's own value
        // stands whether or not it is the one this script came from.
        assert.equal(w._pxAppId, 'PXZLuyHD0K');
    });

    it('refuses a value that is not their shape', ( ) => {
        const w = boot({
            before: '<script>window._pxAppId = "not-an-app-id";</script>',
        });
        assert.equal(w['not-an-app-id'], undefined);
    });
});

describe('extra/perimeterx.js, a first-party deployment', ( ) => {
    const FIRST_PARTY = 'https://example.com/pxjs/' + APP_ID + '/main.min.js';

    const bootFirstParty = ( ) => {
        const dom = new JSDOM(
            '<!DOCTYPE html><html><head>' +
            '<script src="' + FIRST_PARTY + '"></script>' +
            '</head><body></body></html>',
            {
                runScripts: 'dangerously',
                url: 'https://example.com/page',
                virtualConsole: new VirtualConsole(),
            }
        );
        const win = dom.window;
        const el = win.document.querySelector('script[src*="pxjs"]');
        new win.Function('el', [
            "Object.defineProperty(document, 'currentScript',",
            '{ value: el, configurable: true });',
            code,
        ].join(''))(el);
        return win;
    };

    it('recovers the id from a url that is not px-cloud.net', ( ) => {
        const w = bootFirstParty();
        assert.equal(typeof w[APP_ID], 'object');
        assert.equal(w[APP_ID], w.PX);
        assert.equal(w._pxAppId, APP_ID);
    });
});

describe('extra/perimeterx.js, the callback into the page', ( ) => {
    it('calls their asyncInit with the object, asynchronously', async ( ) => {
        const w = boot({
            before: '<script>window._pxAppId = "' + APP_ID + '";' +
                'window.' + APP_ID + '_asyncInit = function(px) {' +
                'window.seen = px; window.when = document.readyState; };' +
                '</script>',
        });
        assert.equal(w.seen, undefined);
        await settle();
        assert.equal(w.seen, w.PX);
    });

    it('prefers pxInit, as theirs does for its own app id', async ( ) => {
        const w = boot({
            before: '<script>window._pxAppId = "' + APP_ID + '";' +
                'window.pxInit = function(px) { window.viaInit = px; };' +
                'window.' + APP_ID + '_asyncInit = function() {' +
                'window.viaNamed = true; };</script>',
        });
        await settle();
        assert.equal(w.viaInit, w.PX);
        assert.equal(w.viaNamed, undefined);
    });

    it('reaches a callback the page defines after the tag', async ( ) => {
        const w = boot({
            before: '<script>window._pxAppId = "' + APP_ID + '";</script>',
            after: '<script>window.' + APP_ID + '_asyncInit =' +
                ' function(px) { window.late = px; };</script>',
        });
        await settle();
        assert.equal(w.late, w.PX);
    });

    it('reaches a callback defined during DOMContentLoaded', async ( ) => {
        // Registered after the resource, so the resource's own
        // DOMContentLoaded pass runs first and finds nothing. In jsdom the
        // timer pass then lands after both, which is what reaches this one -
        // jsdom runs DOMContentLoaded before a timer scheduled while the
        // head was parsing, where a browser can run the timer first.
        const w = boot({
            before: '<script>window._pxAppId = "' + APP_ID + '";</script>',
            after: '<script>' +
                'document.addEventListener("DOMContentLoaded", function() {' +
                'window.' + APP_ID + '_asyncInit = function(px) {' +
                'window.later = px; }; });</script>',
        });
        await settle(60);
        assert.equal(w.later, w.PX);
    });

    it('calls back once, not once per pass', async ( ) => {
        const w = boot({
            before: '<script>window._pxAppId = "' + APP_ID + '";' +
                'window.calls = 0;' +
                'window.' + APP_ID + '_asyncInit = function() {' +
                'window.calls += 1; };</script>',
        });
        await settle(60);
        assert.equal(w.calls, 1);
    });

    it('survives a callback that throws', async ( ) => {
        const errors = [];
        const w = boot({
            before: '<script>window._pxAppId = "' + APP_ID + '";' +
                'window.' + APP_ID + '_asyncInit = function() {' +
                'throw new Error("page"); };</script>',
            beforeParse(win) {
                win.addEventListener('error', ev => {
                    errors.push(String(ev.message || ev.error));
                });
            },
        });
        await settle();
        assert.equal(typeof w.PX, 'object');
        assert.deepEqual([ ...errors ], []);
    });
});

describe('extra/perimeterx.js, the emitter', ( ) => {
    const withEvents = ( ) => boot({
        before: '<script>window._pxAppId = "' + APP_ID + '";</script>',
    });

    it('passes the trigger arguments and the context', ( ) => {
        const w = withEvents();
        const ctx = { tag: 'ctx' };
        const seen = [];
        w.PX.Events.on('risk', function(a, b) {
            seen.push([ this, a, b ]);
        }, ctx);
        w.PX.Events.trigger('risk', 1, 'two');
        assert.equal(seen.length, 1);
        assert.equal(seen[0][0], ctx);
        assert.deepEqual([ seen[0][1], seen[0][2] ], [ 1, 'two' ]);
    });

    it('keeps an on handler for the next trigger', ( ) => {
        const w = withEvents();
        let count = 0;
        w.PX.Events.on('risk', ( ) => { count += 1; });
        w.PX.Events.trigger('risk');
        w.PX.Events.trigger('risk');
        assert.equal(count, 2);
    });

    it('drops a one handler after it has run', ( ) => {
        const w = withEvents();
        let count = 0;
        w.PX.Events.one('risk', ( ) => { count += 1; });
        w.PX.Events.trigger('risk');
        w.PX.Events.trigger('risk');
        assert.equal(count, 1);
    });

    it('keeps the order a trigger drains and refills', ( ) => {
        const w = withEvents();
        const order = [];
        w.PX.Events.on('risk', ( ) => { order.push('first'); });
        w.PX.Events.one('risk', ( ) => { order.push('once'); });
        w.PX.Events.on('risk', ( ) => { order.push('last'); });
        w.PX.Events.trigger('risk');
        w.PX.Events.trigger('risk');
        assert.deepEqual([ ...order ],
            [ 'first', 'once', 'last', 'first', 'last' ]);
    });

    it('drains the channel when a handler throws', ( ) => {
        const w = withEvents();
        const order = [];
        w.PX.Events.on('risk', ( ) => {
            order.push('first');
            throw new Error('handler');
        });
        w.PX.Events.on('risk', ( ) => { order.push('second'); });
        w.PX.Events.trigger('risk');
        w.PX.Events.trigger('risk');
        assert.deepEqual([ ...order ],
            [ 'first', 'second', 'first', 'second' ]);
    });

    it('removes the handler off is given', ( ) => {
        const w = withEvents();
        let count = 0;
        const fn = ( ) => { count += 1; };
        w.PX.Events.on('risk', fn);
        w.PX.Events.off('risk', fn);
        w.PX.Events.trigger('risk');
        assert.equal(count, 0);
    });

    it('is a no-op on off before any on, where theirs throws', ( ) => {
        const w = withEvents();
        assert.equal(w.PX.Events.off('risk', ( ) => {}), undefined);
    });

    // Their client raises risk once it has an answer and xhrResponse on
    // a collector reply. This one asks nothing, so it has nothing to say,
    // and a score it made up would be a fabrication the page would act on.
    it('never raises risk or xhrResponse of its own', async ( ) => {
        const w = withEvents();
        const heard = [];
        for ( const name of [ 'risk', 'xhrResponse' ] ) {
            w.PX.Events.on(name, (...args) => {
                heard.push([ name, ...args ]);
            });
        }
        await settle(60);
        assert.deepEqual([ ...heard ], []);
    });

    it('triggers a channel nothing subscribed to without throwing', ( ) => {
        const w = withEvents();
        // A channel has to exist for this to reach the guard: with none at
        // all the emitter returns on the missing channels object instead.
        w.PX.Events.on('other', ( ) => {});
        assert.equal(w.PX.Events.trigger('risk', 1), undefined);
    });
});

describe('extra/perimeterx.js, what it refuses', ( ) => {
    it('writes no cookie', async ( ) => {
        const w = boot({
            before: '<script>window._pxAppId = "' + APP_ID + '";</script>',
        });
        await settle();
        assert.equal(w.document.cookie, '');
    });

    it('mints no visitor or session id on the window', async ( ) => {
        const w = boot({
            before: '<script>window._pxAppId = "' + APP_ID + '";</script>',
        });
        await settle();
        assert.equal(w._pxVid, undefined);
        assert.equal(w._pxUuid, undefined);
        assert.equal(w._pxmvid, undefined);
    });

    it('makes no request and adds no tag', async ( ) => {
        const counts = { xhr: 0, fetch: 0, beacon: 0, img: 0, made: 0 };
        const w = boot({
            before: '<script>window._pxAppId = "' + APP_ID + '";</script>',
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
                const realCreate = win.document.createElement.bind(
                    win.document);
                win.document.createElement = name => {
                    if ( String(name).toLowerCase() === 'script' ) {
                        counts.made += 1;
                    }
                    return realCreate(name);
                };
            },
        });
        await settle();
        assert.equal(typeof w.PX, 'object');
        assert.deepEqual({ ...counts },
            { xhr: 0, fetch: 0, beacon: 0, img: 0, made: 0 });
    });

    it('leaves fetch and XMLHttpRequest unwrapped', async ( ) => {
        // jsdom has no fetch of its own, so one is put there to be wrapped:
        // without it the assertion below is undefined against undefined.
        const realFetch = function fetch() { };
        let realOpen;
        const w = boot({
            before: '<script>window._pxAppId = "' + APP_ID + '";</script>',
            beforeParse(win) {
                win.fetch = realFetch;
                realOpen = win.XMLHttpRequest.prototype.open;
            },
        });
        await settle();
        assert.equal(typeof w.fetch, 'function');
        assert.equal(w.fetch, realFetch);
        assert.equal(w.XMLHttpRequest.prototype.open, realOpen);
        assert.equal(w._pxFetch, undefined);
    });

    it('adds no event listener of its own to the document', async ( ) => {
        const seen = [];
        const w = boot({
            before: '<script>window._pxAppId = "' + APP_ID + '";</script>',
            beforeParse(win) {
                const real = win.document.addEventListener.bind(win.document);
                win.document.addEventListener = (name, ...rest) => {
                    seen.push(name);
                    return real(name, ...rest);
                };
            },
        });
        await settle();
        assert.equal(typeof w.PX, 'object');
        // The one pass that waits for the document, and nothing sensory.
        assert.deepEqual([ ...seen ], [ 'DOMContentLoaded' ]);
    });
});

// Their enforcement is server side, and the challenge it serves has to
// keep working: a block page is their own html, the captcha script is
// fetched from their own host, and a genuine client may still arrive after
// this resource has published. Each of these pins a way a later edit could
// quietly stand in the way of that.
describe('extra/perimeterx.js, the challenge path', ( ) => {
    const CAPTCHA = 'https://captcha.px-cloud.net/' + APP_ID + '/captcha.js';
    const ALT_CAPTCHA = 'https://captcha.px-cdn.net/' + APP_ID +
        '/captcha.js';

    it('leaves a captcha tag on the page untouched', async ( ) => {
        // Both tags before the resource, so they are there to be touched
        // at the moment it runs.
        const w = boot({
            before: '<script src="' + CAPTCHA + '"></script>' +
                '<script src="' + ALT_CAPTCHA + '"></script>' +
                '<script>window._pxAppId = "' + APP_ID + '";</script>',
        });
        await settle();
        const tags = [ ...w.document.querySelectorAll('script[src]') ]
            .map(tag => tag.getAttribute('src'))
            .filter(src => src.includes('captcha'));
        assert.deepEqual(tags, [ CAPTCHA, ALT_CAPTCHA ]);
    });

    // The shape their client writes into a block page, which is also the
    // shape a block script reads back out of one.
    const BLOCK = {
        _pxModal: true,
        _pxBlockedUrl: 'https://example.com/page',
        _pxVid: '12345678-1234-1234-1234-123456789012',
        _pxUuid: '87654321-4321-4321-4321-210987654321',
        _pxAppId: APP_ID,
        _pxHostUrl: 'https://collector-' + APP_ID + '.px-cloud.net',
        _pxJsClientSrc: 'https://client.px-cloud.net/' + APP_ID +
            '/main.min.js',
        _pxFirstPartyEnabled: false,
    };

    const bootBlockPage = ( ) => {
        const lines = Object.keys(BLOCK).map(
            key => 'window.' + key + ' = ' + JSON.stringify(BLOCK[key]) + ';'
        ).join('');
        return boot({ before: '<script>' + lines + '</script>' });
    };

    it('leaves every global a block page set exactly as it was', async ( ) => {
        const w = bootBlockPage();
        await settle();
        const seen = {};
        for ( const key of Object.keys(BLOCK) ) { seen[key] = w[key]; }
        assert.deepEqual(seen, BLOCK);
    });

    it('adds no message listener, so their postMessage is its own',
        async ( ) => {
            const seen = [];
            const w = boot({
                before: '<script>window._pxAppId = "' + APP_ID +
                    '";</script>',
                beforeParse(win) {
                    const real = win.addEventListener.bind(win);
                    win.addEventListener = (name, ...rest) => {
                        seen.push(String(name));
                        return real(name, ...rest);
                    };
                },
            });
            await settle();
            assert.equal(typeof w.PX, 'object');
            assert.equal(seen.includes('message'), false);
        });

    it('leaves sendBeacon as the browser left it', async ( ) => {
        // jsdom has none, so the one being left alone is put there first.
        const real = function sendBeacon() { return true; };
        const w = boot({
            before: '<script>window._pxAppId = "' + APP_ID + '";</script>',
            beforeParse(win) { win.navigator.sendBeacon = real; },
        });
        await settle();
        assert.equal(typeof w.navigator.sendBeacon, 'function');
        assert.equal(w.navigator.sendBeacon, real);
    });

    // Theirs publishes with a plain assignment and overwrites whatever is
    // on the name. A client that arrives later - from a first-party path no
    // rule covers, or a block script loading it - has to be able to do the
    // same over this one.
    it('lets a client that arrives later take the names', ( ) => {
        const w = boot({
            before: '<script>window._pxAppId = "' + APP_ID + '";</script>',
        });
        for ( const name of [ 'PX', APP_ID ] ) {
            const held = Object.getOwnPropertyDescriptor(w, name);
            assert.equal(held.writable, true, name + ' writable');
            assert.equal(held.configurable, true, name + ' configurable');
        }
        const real = { Events: { on: ( ) => {} }, ClientUuid: 'real' };
        w.PX = real;
        w[APP_ID] = real;
        assert.equal(w.PX, real);
        assert.equal(w[APP_ID], real);
    });

    it('takes a challenge solution at any time without throwing',
        async ( ) => {
            const w = bootBlockPage();
            assert.equal(w.PX.setChallenge('before'), undefined);
            await settle();
            assert.equal(w.PX.setChallenge({ token: 'solved' }), undefined);
            assert.equal(w.PX.setChallenge(), undefined);
            assert.equal(typeof w.PX.Events.on, 'function');
            assert.equal(w.PX.ClientUuid, '');
        });
});

// Every sensor their client reads, named from their own string tables,
// wired to a counter. jsdom has few of them, so the ones it lacks are put
// there first - without that the probe is undefined against undefined and
// would pass against a resource that read them all.
describe('extra/perimeterx.js, the sensors it never reads', ( ) => {
    const sensorProbe = win => {
        const touched = [];
        const note = name => { touched.push(name); };
        const getter = (host, label, names, value) => {
            for ( const name of names ) {
                try {
                    Object.defineProperty(host, name, {
                        configurable: true,
                        get() { note(label + '.' + name); return value; },
                    });
                } catch ( ex ) {
                }
            }
        };
        getter(win.navigator, 'navigator', [
            'userAgent', 'platform', 'language', 'languages', 'plugins',
            'mimeTypes', 'hardwareConcurrency', 'deviceMemory',
            'maxTouchPoints', 'userAgentData', 'doNotTrack', 'webdriver',
            'vendor', 'appVersion', 'cookieEnabled',
        ], 1);
        getter(win.screen, 'screen', [
            'width', 'height', 'availWidth', 'availHeight', 'colorDepth',
            'pixelDepth',
        ], 1);
        for ( const name of [ 'getBattery', 'getGamepads', 'sendBeacon' ] ) {
            win.navigator[name] = ( ) => {
                note('navigator.' + name);
                return { then: ( ) => {} };
            };
        }
        // These two are objects with methods, not methods: a function here
        // means a mutation that calls permissions.query throws before the
        // counter is reached and the probe sees nothing.
        win.navigator.permissions = {
            query: ( ) => {
                note('navigator.permissions.query');
                return { then: ( ) => {} };
            },
        };
        win.navigator.mediaDevices = {
            enumerateDevices: ( ) => {
                note('navigator.mediaDevices.enumerateDevices');
                return { then: ( ) => {} };
            },
        };
        for ( const name of [ 'AudioContext', 'OfflineAudioContext',
            'RTCPeerConnection', 'webkitRTCPeerConnection', 'Worker' ] ) {
            win[name] = function() { note(name); };
        }
        win.speechSynthesis = {
            getVoices: ( ) => { note('speechSynthesis.getVoices'); return []; },
        };
        const canvas = win.HTMLCanvasElement.prototype;
        canvas.getContext = ( ) => { note('canvas.getContext'); return null; };
        canvas.toDataURL = ( ) => { note('canvas.toDataURL'); return ''; };
        const offset = win.Date.prototype.getTimezoneOffset;
        win.Date.prototype.getTimezoneOffset = function() {
            note('Date.getTimezoneOffset');
            return offset.call(this);
        };
        // window.localStorage is getter-only in jsdom, so the methods are
        // wrapped on the prototype both storages share instead.
        const storage = win.Storage.prototype;
        for ( const name of [ 'getItem', 'setItem', 'removeItem', 'key' ] ) {
            const real = storage[name];
            storage[name] = function(...args) {
                note('Storage.' + name);
                return real.apply(this, args);
            };
        }
        const cookie = Object.getOwnPropertyDescriptor(
            Object.getPrototypeOf(win.document), 'cookie');
        Object.defineProperty(win.document, 'cookie', {
            configurable: true,
            get() { note('document.cookie get'); return cookie.get.call(this); },
            set(v) { note('document.cookie set'); cookie.set.call(this, v); },
        });
        return touched;
    };

    it('touches not one of them', async ( ) => {
        let touched;
        const w = boot({
            before: '<script>window._pxAppId = "' + APP_ID + '";</script>',
            beforeParse(win) { touched = sensorProbe(win); },
        });
        await settle(60);
        // The resource ran: the probe is measuring a live boot, not a
        // document that never reached it.
        assert.equal(typeof w.PX, 'object');
        assert.deepEqual([ ...touched ], []);
    });

    it('touches none of them on a block page either', async ( ) => {
        let touched;
        const w = boot({
            before: '<script>window._pxModal = true; window._pxAppId = "' +
                APP_ID + '";</script>',
            beforeParse(win) { touched = sensorProbe(win); },
        });
        await settle(60);
        assert.equal(typeof w.PX, 'object');
        assert.deepEqual([ ...touched ], []);
    });
});

describe('extra/perimeterx.js, what a page cannot make it do', ( ) => {
    it('pollutes no prototype through a channel name', ( ) => {
        const w = boot({
            before: '<script>window._pxAppId = "' + APP_ID + '";</script>',
        });
        const before = Object.getOwnPropertyNames(w.Object.prototype).sort();
        // Their subscribe reads channels[name] before assigning, so a
        // prototype name throws there as it does here. What matters is that
        // nothing reaches Object.prototype on the way.
        for ( const name of [ '__proto__', 'constructor', 'toString' ] ) {
            try { w.PX.Events.on(name, ( ) => {}); } catch ( ex ) { }
            try { w.PX.Events.trigger(name); } catch ( ex ) { }
            try { w.PX.Events.off(name, ( ) => {}); } catch ( ex ) { }
        }
        assert.deepEqual(
            Object.getOwnPropertyNames(w.Object.prototype).sort(), before);
        assert.equal(typeof w.Object.prototype.push, 'undefined');
        assert.equal(w.Object.prototype.polluted, undefined);
    });

    it('publishes no name a url segment is not their shape for', ( ) => {
        const w = bootRedirected(
            'https://client.px-cloud.net/PXnot_valid__/main.min.js');
        assert.equal(w.PXnot_valid__, undefined);
        assert.equal(w._pxAppId, undefined);
        // The name is refused, not the object: a page reading PX still
        // finds one.
        assert.equal(typeof w.PX, 'object');
    });

    it('writes nothing but PX and the app id onto the window', async ( ) => {
        const before = [];
        const w = boot({
            before: '<script>window._pxAppId = "' + APP_ID + '";' +
                'window.__names = Object.getOwnPropertyNames(window);' +
                '</script>',
        });
        await settle(60);
        for ( const name of w.__names ) { before.push(name); }
        const added = Object.getOwnPropertyNames(w)
            .filter(name => before.includes(name) === false)
            .filter(name => name !== '__names');
        assert.deepEqual(added.sort(), [ 'PX', APP_ID ]);
    });
});

describe('extra/perimeterx.js, what is already there', ( ) => {
    it('leaves a running client alone', ( ) => {
        const w = boot({
            before: '<script>window._pxAppId = "' + APP_ID + '";' +
                'window.' + APP_ID + ' = { Events: { on: function() {} },' +
                ' ClientUuid: "theirs" };</script>',
        });
        assert.equal(w[APP_ID].ClientUuid, 'theirs');
        assert.equal(w.PX, undefined);
    });

    // The element has to exist before the resource runs, or the name is
    // free when the resource looks and the guard is never reached.
    const withElement = id => '<script>var el =' +
        ' document.createElement("div"); el.id = "' + id + '";' +
        ' document.documentElement.appendChild(el);</script>';

    it('replaces a page element that took the app id', ( ) => {
        const w = boot({
            before: withElement(APP_ID) +
                '<script>window._pxAppId = "' + APP_ID + '";</script>',
        });
        assert.equal(typeof w[APP_ID].Events, 'object');
        assert.equal(w[APP_ID], w.PX);
    });

    it('replaces a page element that took the PX name', ( ) => {
        const w = boot({
            before: withElement('PX') +
                '<script>window._pxAppId = "' + APP_ID + '";</script>',
        });
        assert.equal(typeof w.PX.Events, 'object');
        assert.equal(w.PX, w[APP_ID]);
    });

    it('replaces a PX that is not a client, as theirs does', ( ) => {
        const w = boot({
            before: '<script>window._pxAppId = "' + APP_ID + '";' +
                'window.PX = { mine: true };</script>',
        });
        assert.equal(w.PX.mine, undefined);
        assert.equal(typeof w.PX.Events, 'object');
    });

    it('leaves a client standing on PX alone', ( ) => {
        const w = boot({
            before: '<script>window._pxAppId = "' + APP_ID + '";' +
                'window.PX = { Events: { on: function() {} },' +
                ' ClientUuid: "theirs" };</script>',
        });
        assert.equal(w.PX.ClientUuid, 'theirs');
        assert.equal(w[APP_ID], undefined);
    });
});
