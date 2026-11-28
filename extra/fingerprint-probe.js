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
// Only lines starting with // at column zero are dropped by uBO, so an
// indented comment ships, and a blank line ends the resource.
(function() {
    'use strict';
    const w = window;
    const doc = document;
    const log = w.__fpLog = w.__fpLog || [];
    const seen = new Map();
    // Where the call came from. The first frame below this file is the
    // caller, and its url is what attributes a read to a vendor.
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
    // Reading a property: the wrapper answers exactly what the real one
    // would, so nothing a page does changes.
    const watchProp = (host, name, label) => {
        try {
            if ( host === null || host === undefined ) { return; }
            const proto = Object.getPrototypeOf(host) || host;
            const own = Object.getOwnPropertyDescriptor(proto, name) ||
                Object.getOwnPropertyDescriptor(host, name);
            if ( own === undefined || own.get === undefined ) {
                // A value rather than an accessor: still worth counting.
                if ( own === undefined ) { return; }
                let held = own.value;
                Object.defineProperty(host, name, {
                    configurable: true,
                    get: ( ) => { note(label); return held; },
                    set: value => { held = value; },
                });
                return;
            }
            const real = own.get;
            Object.defineProperty(proto, name, {
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
            host[name] = function(...args) {
                note(label);
                return real.apply(this, args);
            };
        } catch ( ex ) {
        }
    };
    const nav = w.navigator;
    const scr = w.screen;
    for ( const name of [
        'userAgent', 'platform', 'language', 'languages', 'hardwareConcurrency',
        'deviceMemory', 'maxTouchPoints', 'vendor', 'webdriver', 'plugins',
        'mimeTypes', 'doNotTrack', 'cookieEnabled', 'appVersion', 'product',
        'productSub', 'oscpu', 'pdfViewerEnabled',
    ] ) {
        watchProp(nav, name, 'navigator.' + name);
    }
    for ( const name of [
        'width', 'height', 'availWidth', 'availHeight', 'colorDepth',
        'pixelDepth',
    ] ) {
        watchProp(scr, name, 'screen.' + name);
    }
    watchProp(w, 'devicePixelRatio', 'devicePixelRatio');
    // Canvas, WebGL and audio: the three that identify a device rather
    // than describe it.
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
    // The device list, the battery, the voices and the permission state
    // are each a handful of bits that rarely change.
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
    // Behaviour: what it listens for says as much as what it reads, so
    // the listener registrations are counted rather than the events.
    const BEHAVIOUR = [
        'mousemove', 'mousedown', 'mouseup', 'click', 'keydown', 'keyup',
        'keypress', 'touchstart', 'touchmove', 'touchend', 'pointermove',
        'pointerdown', 'scroll', 'wheel', 'deviceorientation', 'devicemotion',
        'focus', 'blur', 'visibilitychange',
    ];
    for ( const target of [ w, doc ] ) {
        try {
            const add = target.addEventListener;
            target.addEventListener = function(type, ...rest) {
                if ( BEHAVIOUR.indexOf(type) !== -1 ) {
                    note('listens for ' + type);
                }
                return add.call(this, type, ...rest);
            };
        } catch ( ex ) {
        }
    }
    const say = ( ) => {
        const rows = [ ...seen.entries() ].sort((a, b) => b[1].n - a[1].n);
        const lines = [ '[fingerprint-probe] ' + rows.length +
            ' surfaces touched on ' + doc.location.host ];
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
    // Twice, because a sensor that waits for an idle moment is the point:
    // once when the document is there and once a few seconds later.
    if ( doc.readyState === 'loading' ) {
        doc.addEventListener('DOMContentLoaded', say, { once: true });
    } else {
        say();
    }
    w.addEventListener('load', ( ) => { w.setTimeout(say, 5000); },
        { once: true });
})();
