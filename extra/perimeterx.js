/// perimeterx.js
// Resource replacement for the PerimeterX (HUMAN Security) client served
// from client.px-cloud.net/<appId>/main.min.js
// Not a cookie-consent resource: it lives outside src/ and is not built
// into dist/ by tools/build.mjs. Hand-maintained, ship as-is.
// The rule it answers:
//   ||client.px-cloud.net/*/main.min.js$script,redirect=perimeterx.js
// Their collector and challenge hosts are separate requests and are not
// this resource's job - with the client replaced nothing on the page calls
// them, and a list may block them outright:
//   ||collector-*.px-cloud.net^
//   ||captcha.px-cloud.net^
// A first-party deployment serves the same client off the site's own host,
// where no generic rule can find it; the app id is still recovered from
// the script element, so a per-site rule works.
// Read off four tenant builds - PXG2JgnYto, PXGWPp4wUS, PXNsLC0Hv5 and
// PXZLuyHD0K, 237kB to 571kB each, served with max-age=600. Every build
// carries 18 to 24 base91 string tables behind a per-table alphabet, so
// the names below come from decoding those tables rather than from
// documentation.
// What the page keeps, from mb = { Events, ClientUuid, setChallenge } and
// the two lines that publish it - window[appId] = mb, and window.PX = mb
// where the app id is the one the script was built for:
//   window.PX and window.<appId>   the same object, so a page that reads
//                                  either one finds it
//   Events                         their emitter, with on, one, off,
//                                  subscribe and trigger, and their own
//                                  semantics: subscribe pushes
//                                  { fn, ctx, once }, and trigger drains a
//                                  channel with shift() and keeps what is
//                                  not once, so handler order survives
//   ClientUuid                     the empty string. This is the one place
//                                  theirs mints an identifier, so the
//                                  property answers and the id is not
//                                  created
//   setChallenge                   a no-op
//   window.pxInit(px), or window.<appId>_asyncInit(px)   their callback
//                                  into the page once init is done,
//                                  called asynchronously as theirs is
// What it refuses, all of it named in their own tables: the canvas and
// toDataURL read, WebGL including WEBGL_debug_renderer_info and the
// unmasked vendor and renderer, OfflineAudioContext with getChannelData,
// navigator plugins, mimeTypes, languages, platform, hardwareConcurrency,
// deviceMemory, maxTouchPoints, userAgentData, getBattery, permissions and
// mediaDevices, screen availWidth, availHeight, colorDepth and pixelDepth,
// getTimezoneOffset, speechSynthesis, RTCPeerConnection, the behavioural
// listeners - mousemove, mousedown, mouseup, keydown, keyup, touchstart,
// touchmove, scroll, wheel, pointerdown, pointermove, drag, paste,
// devicemotion and deviceorientation - the automation probes webdriver,
// callPhantom, _phantom, __nightmare, domAutomationController and the
// chrome-extension:// scan, the XMLHttpRequest and fetch wrappers, the
// Worker and Blob it builds, every cookie it writes - _px2, _px3, pxvid,
// _pxmvid, pxjsc, px_hvd, _pxac, _px_acp, _px_pcdt, px_c_p_, _pxfc_ and
// pxfc - and the POST to collector-a.px-cloud.net/api/v2/collector.
// What it will not do: no token is forged, no vid or uuid is minted, and
// no sensor data is synthesised. PerimeterX enforces server side, and a
// site whose enforcer wants a fresh client token will still challenge or
// block - that is not something this resource tries to defeat. It also
// leaves existing cookies alone: _px3 is the server's own token, and
// deleting it would invite a fresh challenge rather than prevent one.
// One deliberate divergence: their off() reads this.channels[name] with no
// guard, so an off() before any on() throws there. Here it is a no-op.
// The "///" line above is the resource header uBO reads, and a comment to
// JavaScript. uBO drops these "//" lines when it parses.
(function() {
    'use strict';
    const w = window;
    const doc = w.document;
    // Their own shape for an app id, from the block-page parser that reads
    // one back out of a document: PX[A-Za-z0-9]{4,8}
    const SHAPE = /^PX[A-Za-z0-9]{4,8}$/;
    const IN_URL = /\/(PX[A-Za-z0-9]{4,8})\/[^/]*$/;
    const inUrl = text => {
        if ( typeof text !== 'string' ) { return ''; }
        const match = IN_URL.exec(text);
        return match !== null ? match[1] : '';
    };
    // The snippet sets window._pxAppId before the tag, so that is first.
    // Where it does not, the request was redirected and not the element, so
    // the script still carries the url it was going to fetch.
    const identify = ( ) => {
        try {
            if ( typeof w._pxAppId === 'string' && SHAPE.test(w._pxAppId) ) {
                return w._pxAppId;
            }
        } catch ( ex ) {
        }
        try {
            const mine = doc.currentScript;
            const found = inUrl(mine !== null ? mine.src : '');
            if ( found !== '' ) { return found; }
        } catch ( ex ) {
        }
        try {
            const tags = doc.querySelectorAll('script[src*="px-cloud.net"]');
            for ( const tag of tags ) {
                const found = inUrl(tag.src);
                if ( found !== '' ) { return found; }
            }
        } catch ( ex ) {
        }
        try {
            return inUrl(w._pxJsClientSrc);
        } catch ( ex ) {
        }
        return '';
    };
    const id = identify();
    const noopfn = ( ) => { };
    // Their emitter, from jH. channels is not a property until the first
    // subscribe, which is theirs as well.
    const events = {
        on: function(name, fn, ctx) {
            this.subscribe(name, fn, ctx, false);
        },
        one: function(name, fn, ctx) {
            this.subscribe(name, fn, ctx, true);
        },
        off: function(name, fn) {
            if ( this.channels === undefined ) { return; }
            const channel = this.channels[name];
            if ( channel === undefined ) { return; }
            for ( let i = 0; i < channel.length; i++ ) {
                if ( channel[i].fn !== fn ) { continue; }
                channel.splice(i, 1);
                break;
            }
        },
        subscribe: function(name, fn, ctx, once) {
            if ( this.channels === undefined ) { this.channels = {}; }
            this.channels[name] = this.channels[name] || [];
            this.channels[name].push({
                fn: fn,
                ctx: ctx,
                once: once || false,
            });
        },
        trigger: function(name) {
            if ( this.channels === undefined ) { return; }
            const held = Object.prototype.hasOwnProperty;
            if ( held.call(this.channels, name) === false ) { return; }
            const args = Array.prototype.slice.call(arguments, 1);
            const channel = this.channels[name];
            const kept = [];
            while ( channel.length > 0 ) {
                const entry = channel.shift();
                if ( typeof entry.fn === 'function' ) {
                    try {
                        entry.fn.apply(entry.ctx, args);
                    } catch ( ex ) {
                    }
                }
                if ( entry.once !== true ) { kept.push(entry); }
            }
            this.channels[name] = kept;
        },
    };
    const px = {
        Events: events,
        ClientUuid: '',
        setChallenge: noopfn,
    };
    // A page element with id="PX..." is a named property of the window, so
    // what is standing there may be a script tag rather than a client. Only
    // a real one - an object carrying their Events - is left alone.
    const standing = id !== '' ? w[id] : undefined;
    const running = standing !== null && typeof standing === 'object' &&
        standing !== undefined && standing.Events !== undefined &&
        typeof standing.Events.on === 'function';
    if ( running ) { return; }
    try {
        if ( id !== '' ) { w[id] = px; }
    } catch ( ex ) {
    }
    try {
        if ( w.PX === undefined || w.PX === null ) { w.PX = px; }
    } catch ( ex ) {
    }
    try {
        if ( id !== '' && typeof w._pxAppId !== 'string' ) {
            w._pxAppId = id;
        }
    } catch ( ex ) {
    }
    // Theirs calls back into the page once init is done - window.pxInit
    // where the app id is its own, window.<appId>_asyncInit otherwise - and
    // init is a collector round trip, so the call is always asynchronous.
    // The snippet defines the callback before the tag, since the tag is
    // async, but a page that defines it later gets the two later passes.
    let called = false;
    const fire = ( ) => {
        if ( called ) { return; }
        let fn;
        try {
            if ( typeof w.pxInit === 'function' ) {
                fn = w.pxInit;
            } else if ( id !== '' ) {
                const named = w[id + '_asyncInit'];
                if ( typeof named === 'function' ) { fn = named; }
            }
        } catch ( ex ) {
            return;
        }
        if ( fn === undefined ) { return; }
        called = true;
        try {
            fn(px);
        } catch ( ex ) {
        }
    };
    w.setTimeout(fire, 0);
    doc.addEventListener('DOMContentLoaded', fire, { once: true });
    w.addEventListener('load', fire, { once: true });
})();
