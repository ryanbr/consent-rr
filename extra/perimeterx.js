/// perimeterx.js
// Resource replacement for the PerimeterX, now HUMAN Security, client:
// client.px-cloud.net/<appId>/main.min.js, their other hosts, and the
// first-party path a tenant serves it from. Hand-maintained, outside src/,
// not built into dist/ by tools/build.mjs. Ship as-is.
// THE NOTES ARE IN extra/perimeterx.md - the builds read, how the app id
// is found, every member of their object, and what each decision traded.
// What follows is only what is needed to change this file safely.
//
// THE RULES
//   ||client.px-cloud.net/*/main.min.js$script,redirect=perimeterx.js
//   ||client.px-cloud.net/*/main.js$script,redirect=perimeterx.js
//   ||client.px-cloud.net/*/init.js$script,redirect=perimeterx.js
//   ||ic.px-cloud.net/bd/auditor.js$script
//   ||crcldu.com/bd/auditor.js$script
//   ||ri.px-cloud.net/index.js$script
// and a first-party path, which is their app id minus the PX, so it has to
// be read off the page:
//   ||www.dormtherapy.com/jAYekY18/init.js$script,redirect=perimeterx.js
//
// NEVER BLOCK THE CHALLENGE. captcha.px-cloud.net and captcha.px-cdn.net
// serve the page a visitor needs to get past a block, and blocking either
// turns a solvable challenge into a dead end. The same goes for a served
// block page's own html.
//
// THE DECISIONS, every one load-bearing. Reversing one needs the .md and
// field evidence, not a tidy-up.
//   No sensor is faked and no token is forged. This answers their api and
//   collects nothing; it does not try to look like a passing client.
//   Their visitor ids go - _pxvid, pxvid, _pxmvid, pxsid, px-ff, and the
//   app-id-prefixed copies - and their token does not. A _px3, _px2 or
//   _px cookie is left exactly as found, because it is what a challenge
//   result lives in and clearing it loses a visitor their pass.
//   Storage keys carry the app id as a prefix, so clearing has to know the
//   id or sweep by it; an id that could not be found means nothing is
//   guessed.
//   The emitter answers on, one, off, subscribe and trigger, because
//   theirs does and a page holds a reference to it.
//   The console line stays.
(function() {
    'use strict';
    const w = window;
    const doc = w.document;
    // Their own shape for an app id, from the block-page parser that reads
    // one back out of a document: PX[A-Za-z0-9]{4,8}
    const NAME = 'perimeterx';
    const VERSION = '1.0.0';
    const SHAPE = /^PX[A-Za-z0-9]{4,8}$/;
    const IN_URL = /\/(PX[A-Za-z0-9]{4,8})\/[^/]*$/;
    const FIRST_PARTY =
        /\/([A-Za-z0-9]{4,10})\/(?:init|main|main\.min)\.js(?:[?#]|$)/;
    const valid = found => SHAPE.test(found) ? found : '';
    const inUrl = text => {
        if ( typeof text !== 'string' ) { return ''; }
        const first = FIRST_PARTY.exec(text);
        if ( first !== null ) {
            // Their own form has the PX taken off, so it goes back on -
            // unless a deployment left it, which already reads as an id.
            const held = first[1];
            return valid(SHAPE.test(held) ? held : 'PX' + held);
        }
        const match = IN_URL.exec(text);
        return match !== null ? valid(match[1]) : '';
    };
    let from = 'none';
    const identify = ( ) => {
        try {
            const mine = doc.currentScript;
            const found = inUrl(mine !== null ? mine.src : '');
            if ( found !== '' ) { from = 'element'; return found; }
        } catch ( ex ) {
        }
        try {
            if ( typeof w._pxAppId === 'string' && SHAPE.test(w._pxAppId) ) {
                from = 'snippet';
                return w._pxAppId;
            }
        } catch ( ex ) {
        }
        try {
            const tags = doc.querySelectorAll(
                'script[src*="px-cloud.net"],script[src*="/init.js"]');
            for ( const tag of tags ) {
                const found = inUrl(tag.src);
                if ( found !== '' ) { from = 'scan'; return found; }
            }
        } catch ( ex ) {
        }
        try {
            const found = inUrl(w._pxJsClientSrc);
            if ( found !== '' ) { from = 'clientsrc'; return found; }
        } catch ( ex ) {
        }
        return '';
    };
    const id = identify();
    const noopfn = ( ) => { };
    const IDS = [ '_pxvid', 'pxvid', '_pxmvid' ];
    const SESSION_IDS = [ 'pxsid' ];
    const STORED = IDS.concat(SESSION_IDS, [ 'px-ff' ]);
    // Their token names, which are the server's own and are never
    // cleared - and which also say whether a session is live.
    const TOKENS = [ '_px3', '_px2', '_px' ];
    const suffixes = ( ) => {
        const out = [ '' ];
        let host = '';
        try { host = String(w.location.hostname || ''); } catch ( ex ) { }
        if ( host === '' ) { return out; }
        const parts = host.split('.');
        while ( parts.length >= 2 ) {
            out.push(parts.join('.'));
            parts.shift();
        }
        return out;
    };
    const inJar = ( ) => {
        let held = '';
        try { held = String(doc.cookie || ''); } catch ( ex ) { return []; }
        if ( held === '' ) { return []; }
        const out = [];
        for ( const part of held.split(';') ) {
            const at = part.indexOf('=');
            out.push((at === -1 ? part : part.slice(0, at)).trim());
        }
        return out;
    };
    const forget = ( ) => {
        const done = { cleared: 0, storage: 0, token: 'none' };
        const there = inJar();
        for ( const name of TOKENS ) {
            if ( there.indexOf(name) !== -1 ) {
                done.token = 'live';
                return done;
            }
        }
        const mine = IDS.filter(name => there.indexOf(name) !== -1);
        const where = mine.length !== 0 ? suffixes() : [];
        for ( const name of mine ) {
            done.cleared += 1;
            for ( const domain of where ) {
                const parts = [ name + '=', 'path=/',
                    'expires=Thu, 01 Jan 1970 00:00:01 GMT' ];
                if ( domain !== '' ) { parts.push('domain=' + domain); }
                try { doc.cookie = parts.join('; '); } catch ( ex ) { }
            }
        }
        for ( const store of [ 'localStorage', 'sessionStorage' ] ) {
            let held;
            try { held = w[store]; } catch ( ex ) { continue; }
            if ( held === null || held === undefined ) { continue; }
            let was = 0;
            try { was = held.length; } catch ( ex ) { }
            for ( const name of STORED ) {
                try { held.removeItem(name); } catch ( ex ) { }
                if ( id === '' ) { continue; }
                try { held.removeItem(id + '_' + name); } catch ( ex ) { }
            }
            try { done.storage += Math.max(0, was - held.length); }
            catch ( ex ) { }
        }
        return done;
    };
    const taken = forget();
    const report = took => {
        let where = '';
        try { where = String(w.location.href || ''); } catch ( ex ) { }
        try {
            if ( typeof console !== 'object' ) { return; }
            if ( typeof console.info !== 'function' ) { return; }
            console.info(
                '[consent-rr] ' + NAME + ' ' + VERSION +
                ' id=' + (id !== '' ? id : 'none') +
                ' from=' + from +
                ' took=' + took +
                ' cleared=' + taken.cleared +
                ' storage=' + taken.storage +
                ' token=' + taken.token +
                (where !== '' ? ' on ' + where : '')
            );
        } catch ( ex ) {
        }
    };
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
    const claimed = value => {
        if ( value === null || value === undefined ) { return false; }
        if ( typeof value !== 'object' ) { return false; }
        try {
            return value.Events !== undefined &&
                typeof value.Events.on === 'function';
        } catch ( ex ) {
        }
        return false;
    };
    if ( ( id !== '' && claimed(w[id]) ) || claimed(w.PX) ) {
        report('theirs');
        return;
    }
    try {
        if ( id !== '' ) { w[id] = px; }
    } catch ( ex ) {
    }
    try {
        if ( claimed(w.PX) === false ) { w.PX = px; }
    } catch ( ex ) {
    }
    try {
        if ( id !== '' && typeof w._pxAppId !== 'string' ) {
            w._pxAppId = id;
        }
    } catch ( ex ) {
    }
    report(id !== '' ? 'alias+px' : 'px');
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
