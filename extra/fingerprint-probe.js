/// fingerprint-probe.js
// A diagnostic scriptlet: it reports which fingerprinting surfaces a page
// touches, how often, and which script did it. It changes no answer and
// blocks nothing - every wrapper calls the real thing and returns what it
// returned, so a page behaves exactly as it would without this.
// NOT FOR A FILTER LIST. Put it on one site while you are deciding what a
// vendor is doing, read the console, then take it off.
// Everything is also on window.__fpLog, so
//   copy(__fpLog.join(String.fromCharCode(10)))
// survives a page that navigates or floods the console.
// Written for the Akamai Bot Manager sensors on bestbuy.ca, whose strings
// are built by a runtime decoder - a static read of the 639KB file finds
// userAgent, platform, maxTouchPoints and mediaDevices and nothing else,
// so what it actually collects can only be answered on a page.
// THE NOTES ARE IN extra/fingerprint-probe.md.
// --
// HOW TO USE IT
//   www.example.com##+js(fingerprint-probe)
// A scriptlet, not a redirect: it has to be in place before the thing it
// is watching, and the script it is watching is often on a randomised
// first-party path that no rule can name.
// --
// HOW IT KEEPS OUT OF THE WAY
// Every wrapper calls the real thing and returns what it returned. Three
// details make that true rather than nearly true:
//   this || host - these wrappers are strict, so a BARE call, which is
//     how pages write matchMedia(q), openDatabase(d) and
//     addEventListener(t, fn), lands undefined as this. A native method
//     handed undefined is Illegal invocation in Chrome. jsdom does not
//     mind, so this was found by reading rather than by testing.
//   a property is rewrapped on whichever object carries its descriptor.
//     Defining on the prototype when the descriptor is the instance's own
//     leaves that own property shadowing the watcher - silence, not an
//     error, which is how localStorage, indexedDB, cpuClass and
//     userAgentData went unseen.
//   getHighEntropyValues is wrapped BEFORE the watcher on userAgentData
//     exists, or reaching through it counts the probe's own read as a
//     page's.
// The enumerable carried on each definition is belt and braces: redefining
// an existing property keeps the attributes a descriptor leaves out.
// --
// WHAT IT WATCHES
// navigator (21 properties), screen, devicePixelRatio, canvas, webgl on
// both context types, audio, mediaDevices, battery, gamepads, permissions,
// voices, Intl, timezone, webrtc, storage, ApplePay, fonts.check, and
// matchMedia - which is eight of FingerprintJS's catalogue by itself, so
// the report names the feature rather than the query. The behavioural side
// counts listener registrations, not events.
// --
// Only lines starting with // at column zero are dropped by uBO, so an
// indented comment ships, and a blank line ends the resource.
(function() {
    'use strict';
    const w = window;
    const doc = document;
    const log = w.__fpLog = w.__fpLog || [];
    const seen = new Map();
    // A wrapper that answers its own source is a tamper signal, and a
    // sensor that spots one may stop collecting - which makes the report
    // say less than the page really does. This does not hide anything
    // from a determined check, see the .md.
    const mask = (made, real) => {
        try {
            Object.defineProperty(made, 'name', {
                configurable: true, value: real.name,
            });
            Object.defineProperty(made, 'length', {
                configurable: true, value: real.length,
            });
            Object.defineProperty(made, 'toString', {
                // Whatever was there answers for itself: for a native
                // that is the [native code] string, and for a function
                // something else had already wrapped it is their source,
                // which is truer than claiming native. The sweep found
                // this: the mutation was better than what was written.
                configurable: true, writable: true,
                value: ( ) => String(real),
            });
        } catch ( ex ) {
        }
        return made;
    };
    // The first frame below this file: that url is the attribution.
    const blame = ( ) => {
        try {
            const frames = String(new Error().stack || '').split('\n');
            for ( const frame of frames ) {
                const at = frame.match(/https?:\/\/[^\s)]+/);
                if ( at === null ) { continue; }
                const url = at[0];
                if ( url.indexOf('fingerprint-probe') !== -1 ) { continue; }
                return url.slice(0, 90);
            }
        } catch ( ex ) {
        }
        return '(inline or unknown)';
    };
    const note = what => {
        const entry = seen.get(what) || { n: 0, who: '' };
        entry.n += 1;
        if ( entry.who === '' ) { entry.who = blame(); }
        seen.set(what, entry);
    };
    // The wrapper answers exactly what the real one would.
    const watchProp = (host, name, label) => {
        try {
            if ( host === null || host === undefined ) { return; }
            // Whichever object carries it - see the header.
            const proto = Object.getPrototypeOf(host) || host;
            const onProto = Object.getOwnPropertyDescriptor(proto, name);
            const target = onProto !== undefined ? proto : host;
            const own = onProto || Object.getOwnPropertyDescriptor(host, name);
            if ( own === undefined || own.get === undefined ) {
                // A value rather than an accessor: still worth counting.
                if ( own === undefined ) { return; }
                let held = own.value;
                Object.defineProperty(host, name, {
                    configurable: true,
                    // Belt and braces; a redefine keeps it anyway.
                    enumerable: own.enumerable,
                    get: ( ) => { note(label); return held; },
                    set: value => { held = value; },
                });
                return;
            }
            const real = own.get;
            Object.defineProperty(target, name, {
                configurable: true,
                enumerable: own.enumerable,
                get: function() { note(label); return real.call(this); },
                set: own.set,
            });
        } catch ( ex ) {
        }
    };
    const watchCall = (host, name, label) => {
        try {
            if ( host === null || host === undefined ) { return; }
            const real = host[name];
            if ( typeof real !== 'function' ) { return; }
            host[name] = mask(function(...args) {
                note(label);
                // this || host: a bare call lands undefined here.
                return real.apply(this || host, args);
            }, real);
        } catch ( ex ) {
        }
    };
    const nav = w.navigator;
    const scr = w.screen;
    // Before the watchers below, or this read counts as a page's.
    try {
        watchCall(nav && nav.userAgentData, 'getHighEntropyValues',
            'userAgentData.getHighEntropyValues');
    } catch ( ex ) {
    }
    for ( const name of [
        'userAgent', 'platform', 'language', 'languages', 'hardwareConcurrency',
        'deviceMemory', 'maxTouchPoints', 'vendor', 'webdriver', 'plugins',
        'mimeTypes', 'doNotTrack', 'cookieEnabled', 'appVersion', 'product',
        'productSub', 'oscpu', 'pdfViewerEnabled', 'cpuClass',
        'userAgentData', 'connection',
    ] ) {
        watchProp(nav, name, 'navigator.' + name);
    }
    // getHighEntropyValues is wrapped above, before its watcher.
    for ( const name of [
        'width', 'height', 'availWidth', 'availHeight', 'colorDepth',
        'pixelDepth',
    ] ) {
        watchProp(scr, name, 'screen.' + name);
    }
    watchProp(w, 'devicePixelRatio', 'devicePixelRatio');
    // The three that identify a device rather than describe it.
    watchCall(w.HTMLCanvasElement && w.HTMLCanvasElement.prototype,
        'toDataURL', 'canvas.toDataURL');
    watchCall(w.HTMLCanvasElement && w.HTMLCanvasElement.prototype,
        'toBlob', 'canvas.toBlob');
    watchCall(w.HTMLCanvasElement && w.HTMLCanvasElement.prototype,
        'getContext', 'canvas.getContext');
    watchCall(w.CanvasRenderingContext2D && w.CanvasRenderingContext2D.prototype,
        'getImageData', 'canvas.getImageData');
    watchCall(w.CanvasRenderingContext2D && w.CanvasRenderingContext2D.prototype,
        'measureText', 'canvas.measureText');
    for ( const ctx of [ w.WebGLRenderingContext, w.WebGL2RenderingContext ] ) {
        watchCall(ctx && ctx.prototype, 'getParameter', 'webgl.getParameter');
        watchCall(ctx && ctx.prototype, 'getExtension', 'webgl.getExtension');
        watchCall(ctx && ctx.prototype, 'getSupportedExtensions',
            'webgl.getSupportedExtensions');
    }
    for ( const name of [ 'AudioContext', 'OfflineAudioContext',
        'webkitAudioContext', 'webkitOfflineAudioContext',
    ] ) {
        watchCall(w[name] && w[name].prototype, 'createOscillator',
            'audio.createOscillator');
        watchCall(w[name] && w[name].prototype, 'createAnalyser',
            'audio.createAnalyser');
        watchCall(w[name] && w[name].prototype, 'createDynamicsCompressor',
            'audio.createDynamicsCompressor');
    }
    // Each a handful of bits that rarely change.
    watchCall(nav && nav.mediaDevices, 'enumerateDevices',
        'mediaDevices.enumerateDevices');
    watchCall(nav, 'getBattery', 'navigator.getBattery');
    watchCall(nav, 'getGamepads', 'navigator.getGamepads');
    watchCall(nav && nav.permissions, 'query', 'permissions.query');
    watchCall(w.speechSynthesis, 'getVoices', 'speechSynthesis.getVoices');
    watchCall(w.Intl && w.Intl.DateTimeFormat && w.Intl.DateTimeFormat.prototype,
        'resolvedOptions', 'Intl.resolvedOptions');
    watchCall(w.Date && w.Date.prototype, 'getTimezoneOffset',
        'Date.getTimezoneOffset');
    watchCall(w.RTCPeerConnection && w.RTCPeerConnection.prototype,
        'createDataChannel', 'rtc.createDataChannel');
    // Eight of the catalogue's signals are media queries, so the
    // feature is recorded rather than the whole query.
    try {
        const match = w.matchMedia;
        if ( typeof match === 'function' ) {
            w.matchMedia = mask(function(query) {
                const text = String(query);
                const feature = text.match(/[a-z-]*(?:gamut|contrast|colors|dynamic-range|monochrome|motion|transparency|scheme|pointer|hover|resolution)[a-z-]*/);
                note('matchMedia ' + (feature === null ? 'other' : feature[0]));
                // Bare calls land undefined here - see watchCall.
                return match.call(this || w, query);
            }, match);
        }
    } catch ( ex ) {
    }
    // Four of the catalogue's sources are just whether these exist.
    watchProp(w, 'localStorage', 'localStorage');
    watchProp(w, 'sessionStorage', 'sessionStorage');
    watchProp(w, 'indexedDB', 'indexedDB');
    watchCall(w, 'openDatabase', 'openDatabase');
    watchProp(w, 'ApplePaySession', 'ApplePaySession');
    watchCall(doc.fonts, 'check', 'fonts.check');
    for ( const name of [ 'AudioContext', 'webkitAudioContext' ] ) {
        watchProp(w[name] && w[name].prototype, 'baseLatency',
            'audio.baseLatency');
    }
    // What it listens for says as much as what it reads.
    const BEHAVIOUR = [
        'mousemove', 'mousedown', 'mouseup', 'click', 'keydown', 'keyup',
        'keypress', 'touchstart', 'touchmove', 'touchend', 'pointermove',
        'pointerdown', 'scroll', 'wheel', 'deviceorientation', 'devicemotion',
        'focus', 'blur', 'visibilitychange',
    ];
    // On the prototype, not on window and document: replacing it there
    // leaves window.addEventListener !== EventTarget.prototype.addEventListener,
    // which is a one-line check. Only the two targets that matter are
    // counted, so the signal is the same.
    try {
        const proto = w.EventTarget && w.EventTarget.prototype;
        const add = proto && proto.addEventListener;
        if ( typeof add === 'function' ) {
            proto.addEventListener = mask(function(type, ...rest) {
                // Once, and used for both: a bare call lands undefined
                // here, and testing that against the window misses the
                // listener a page registered by writing
                // addEventListener(...) rather than window.addEventListener.
                const on = this || w;
                if (
                    BEHAVIOUR.indexOf(type) !== -1 &&
                    (on === w || on === doc)
                ) {
                    note('listens for ' + type);
                }
                return add.call(on, type, ...rest);
            }, add);
        }
    } catch ( ex ) {
    }
    // Did their sensor actually run? Their cookies are set by the edge in
    // response to a payload, so if none is here AND nothing was touched,
    // the likeliest reading is that the sensor noticed this and stopped -
    // not that the page collects nothing. Masking cannot make that
    // question go away, so the report answers it instead of hiding it.
    const VENDOR = [
        '_abck', 'bm_sz', 'bm_s', 'bm_so', 'ak_bmsc', 'KP_UIDz', 'KP_UIDz-ssn',
        'datadome', 'px-cookie', '_px3', 'reese84', 'incap_ses',
    ];
    const vendorCookies = ( ) => {
        try {
            const names = String(doc.cookie).split(';')
                .map(one => one.split('=')[0].trim());
            return VENDOR.filter(name => names.indexOf(name) !== -1);
        } catch ( ex ) {
            return [];
        }
    };
    const say = ( ) => {
        const rows = [ ...seen.entries() ].sort((a, b) => b[1].n - a[1].n);
        const theirs = vendorCookies();
        const lines = [ '[fingerprint-probe] ' + rows.length +
            ' surfaces touched on ' + doc.location.host +
            ' | their cookies: ' + (theirs.length === 0
                ? 'none'
                : theirs.join(',')) ];
        if ( rows.length === 0 && theirs.length !== 0 ) {
            lines.push('  a sensor has set its cookie and touched nothing' +
                ' here - read that as possibly detected, not as clean');
        }
        for ( const [ what, entry ] of rows ) {
            lines.push('  ' + String(entry.n).padStart(5) + '  ' +
                what.padEnd(32) + '  first from ' + entry.who);
        }
        lines.push('  copy(__fpLog.join(String.fromCharCode(10)))');
        for ( const line of lines ) {
            log.push(line);
            try { w.console.log(line); } catch ( ex ) { }
        }
    };
    // Twice: a sensor that waits for an idle moment is the point.
    if ( doc.readyState === 'loading' ) {
        doc.addEventListener('DOMContentLoaded', say, { once: true });
    } else {
        say();
    }
    w.addEventListener('load', ( ) => { w.setTimeout(say, 5000); },
        { once: true });
})();
