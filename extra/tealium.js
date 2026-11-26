/// tealium.js
// Resource replacement for the Tealium universal tag loader, served from
// tags.tiqcdn.com/utag/<account>/<profile>/<env>/utag.js and from a
// tenant's own host. Hand-maintained, outside src/, not built into dist/
// by tools/build.mjs. Ship as-is.
// THE NOTES ARE IN extra/tealium.md - which builds were read, what every
// member of their object does, what each decision traded, and the field
// reports behind it. What follows is only what is needed to change this
// file safely.
// Forty-nine of their loaders were read, ut4.0 through ut4.48, built
// between December 2018 and November 2026, 20kB to 1.4MB. Every one
// publishes the same fifteen members in the same order. That list is
// theirs: do not add to it, and do not reorder it.
//
// THE RULES. Both of their hosts in one line, .com and the .cn that serves
// the same loaders:
//   ||tags.tiqcdn.*/utag/*/utag.js$script,redirect=tealium.js
// or as two, where a list would rather not wildcard a tld:
//   ||tags.tiqcdn.com/utag/*/utag.js$script,redirect=tealium.js
//   ||tags.tiqcdn.cn/utag/*/utag.js$script,redirect=tealium.js
// and a line per first-party host, of which two are known:
//   ||tags.stepstone.com/utag/*/utag.js$script,redirect=tealium.js
//   ||tm.pluto.tv/*/prod/utag.js$script,redirect=tealium.js
// Two more files need their own lines, because neither name contains the
// string utag.js and the rule above cannot reach either. The version ping,
// two bytes of comment, on both of its paths - tiqapp's and the tenant's
// own:
//   ||tags.tiqcdn.*/utag/*/utag.v.js$script
// And their sync file, on both hosts:
//   ||tags.tiqcdn.*/utag/*/utag.sync.js$script
// Block that one or point it here, either is fine - whichever copy runs
// second finds a loader already standing and leaves it alone. What must
// not happen is letting it through, because it is not only a tag loader:
// three of six sampled carry Adobe Alloy's pre-hiding snippet, which sets
// body opacity to zero and takes it off again on a timeout, and a
// populated one calls utag.link and reads utag.data.
// Never widen one of these to the host or to /utag/*. That prefix also
// carries an Adobe Launch property on ml.com, which has nothing to do
// with the loader. Naming the file is the point.
// On a tenant's own host the path is a vanity one - stepstone serves
// /utag/de/prod/utag.js and is really stepstone/stepstone-de, pluto has no
// utag segment at all - so no account comes out of it and utag.id
// publishes empty. Nothing else depends on it.
//
// THE DECISIONS, every one load-bearing. Reversing one needs the .md and
// field evidence, not a tidy-up.
//   Tags never load and extensions never run. Ninety-nine per cent of what
//   rides on this loader is tracking, and the rest is a tenant's own code
//   that cannot be stood in for.
//   It dispatches no events, ever. A page that drains a queue into a
//   facade the extensions never built throws on the first method it
//   reaches.
//   utag.gdpr refuses and stores nothing: state 0, no categories, every
//   setter drops. CONSENTMGR is never written and never cleared, because a
//   site's real cmp has its own resource in src/.
//   getEnforcementMode() answers none, which buys compatibility and claims
//   no consent.
//   Their records go by prefix - utag_main and utag_main_*, tealium_va and
//   tealium_va_* - and never by a computed name, because a vanity path
//   carries no account to compute one from.
//   track() returns true, and view, link and track all run the page's
//   callback. A page's own script has to carry on past the call: that is
//   the breakage this exists for, and a request answered at 200 is the
//   other half of it.
//   The console line stays.
//
// BEFORE COUNTING ANYTHING IN ONE OF THEIR FILES, use a reader that
// ignores line length. Twelve of the forty-nine carry a line over 100k
// characters, and a line-oriented search answers zero on those - three
// numbers in the notes were wrong that way. Some builds also ship their
// extensions pretty-printed with the core still minified, so a pattern
// written for the minified form matches none of them.
(function() {
    'use strict';
    const w = window;
    const doc = w.document;
    const NAME = 'tealium';
    const VERSION = '1.0.0';
    const IN_URL =
        /\/utag\/([\w.-]{1,40})\/([\w.-]{1,40})\/[\w.-]{1,24}\/utag[\w.]*\.js/;
    const noopfn = ( ) => { };
    // Both halves are kept, not only the dotted id: their own visitor
    // attribute store is keyed tealium_va_<account>_<profile>.
    let account = '';
    let profile = '';
    const idFrom = text => {
        if ( typeof text !== 'string' ) { return ''; }
        const match = IN_URL.exec(text);
        if ( match === null ) { return ''; }
        account = match[1];
        profile = match[2];
        return account + '.' + profile;
    };
    let from = 'none';
    const identify = ( ) => {
        try {
            const mine = doc.currentScript;
            const found = idFrom(mine !== null ? mine.src : '');
            if ( found !== '' ) { from = 'element'; return found; }
        } catch ( ex ) {
        }
        try {
            const tags = doc.querySelectorAll('script[src*="/utag/"]');
            for ( const tag of tags ) {
                const found = idFrom(tag.src);
                if ( found !== '' ) { from = 'scan'; return found; }
            }
        } catch ( ex ) {
        }
        return '';
    };
    const id = identify();
    const COOKIE = 'utag_main';
    const STORED = 'tealium_va';
    const mine = name => name === STORED ||
        name.indexOf(STORED + '_') === 0;
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
    const forget = ( ) => {
        const done = { cleared: 0, storage: 0 };
        for ( const store of [ 'localStorage', 'sessionStorage' ] ) {
            let store_;
            try { store_ = w[store]; } catch ( ex ) { continue; }
            if ( store_ === null || store_ === undefined ) { continue; }
            let was = 0;
            try { was = store_.length; } catch ( ex ) { }
            if ( was === 0 ) { continue; }
            const names = [];
            try {
                // was is that length, read once, and nothing is removed
                // until this walk is done. See the .md.
                for ( let i = 0; i < was; i++ ) {
                    const name = store_.key(i);
                    if ( typeof name === 'string' && mine(name) ) {
                        names.push(name);
                    }
                }
            } catch ( ex ) { }
            for ( const name of names ) {
                try { store_.removeItem(name); } catch ( ex ) { }
            }
            try { done.storage += Math.max(0, was - store_.length); }
            catch ( ex ) { }
        }
        let held = '';
        try { held = String(doc.cookie || ''); } catch ( ex ) { return done; }
        if ( held === '' ) { return done; }
        const theirs = [];
        for ( const part of held.split(';') ) {
            const at = part.indexOf('=');
            const name = (at === -1 ? part : part.slice(0, at)).trim();
            if ( name === COOKIE || name.indexOf(COOKIE + '_') === 0 ) {
                theirs.push(name);
            }
        }
        if ( theirs.length === 0 ) { return done; }
        const where = suffixes();
        for ( const name of theirs ) {
            done.cleared += 1;
            for ( const domain of where ) {
                const parts = [ name + '=', 'path=/',
                    'expires=Thu, 01 Jan 1970 00:00:01 GMT' ];
                if ( domain !== '' ) { parts.push('domain=' + domain); }
                try { doc.cookie = parts.join('; '); } catch ( ex ) { }
            }
        }
        return done;
    };
    const taken = forget();
    let data = {};
    try {
        const held = w.utag_data;
        if ( held !== null && typeof held === 'object' ) { data = held; }
    } catch ( ex ) {
    }
    const answer = entry => {
        if ( typeof entry !== 'function' ) { return; }
        entry();
    };
    const track = function(a, b, c) {
        try {
            if ( typeof a === 'string' ) {
                answer(c);
            } else if ( a !== null && typeof a === 'object' ) {
                const cfg = a.cfg;
                answer(cfg !== null && cfg !== undefined ? cfg.cb : undefined);
            }
        } catch ( ex ) {
        }
        // Theirs ends on return true, and a page that tests the return of
        // a link call should read the same thing here.
        return true;
    };
    const ut = {
        // pad(a, b) is hex, not decimal: a = "" + ((a-0).toString(16)),
        // zero-filled up to b.
        pad: (a, b) => {
            let out = '';
            try { out = '' + ((a - 0).toString(16)); } catch ( ex ) { }
            let fill = '';
            for ( let i = 0; i < (b - out.length); i++ ) { fill += '0'; }
            return '' + fill + out;
        },
        vi: ( ) => '',
        hasOwn: (o, a) => {
            try {
                return o !== null &&
                    Object.prototype.hasOwnProperty.call(o, a);
            } catch ( ex ) {
            }
            return false;
        },
        isEmptyObject: o => {
            try {
                for ( const key in o ) {
                    if ( key !== undefined ) { return false; }
                }
            } catch ( ex ) {
            }
            return true;
        },
        // Theirs answers by type first: a number is empty when it is NaN, a
        // boolean never is, a string is when it has no length.
        isEmpty: o => {
            const t = ut.typeOf(o);
            if ( t === 'number' ) { return isNaN(o); }
            if ( t === 'boolean' ) { return false; }
            if ( t === 'string' ) { return o.length === 0; }
            return ut.isEmptyObject(o);
        },
        // Their own line, which answers date and regexp where a typeof
        // would answer object.
        typeOf: e => {
            try {
                return ({}).toString.call(e)
                    .match(/\s([a-zA-Z]+)/)[1].toLowerCase();
            } catch ( ex ) {
            }
            return 'undefined';
        },
        // Dotted keys, theirs: an array or a non-object lands as a value, an
        // empty object is dropped, anything else recurses under its prefix.
        flatten: o => {
            const out = {};
            const walk = (c, prefix) => {
                if ( Object(c) !== c || ut.typeOf(c) === 'array' ) {
                    out[prefix] = c;
                    return;
                }
                if ( ut.isEmptyObject(c) ) { return; }
                for ( const key in c ) {
                    walk(c[key], prefix ? prefix + '.' + key : key);
                }
            };
            try { walk(o, ''); } catch ( ex ) { }
            return out;
        },
        merge: (a, b, c) => {
            try {
                for ( const key in b ) {
                    if ( c ) { a[key] = b[key]; }
                    else if ( typeof a[key] === 'undefined' ) {
                        a[key] = b[key];
                    }
                }
            } catch ( ex ) {
            }
            return a;
        },
        decode: s => {
            try { return decodeURIComponent(s); } catch ( ex ) { }
            return s;
        },
        encode: s => {
            try { return encodeURIComponent(s); } catch ( ex ) { }
            return s;
        },
        error: noopfn,
        loader: noopfn,
    };
    const loader = {
        q: [], lq: [], wq: [], bq: [], rq: [], ready_q: [], sendq: [],
        lc: {}, f: {}, ol: {}, bk: {}, p: 0, rf: 0, ri: 0, rp: 0, lh: 0,
        cfg: {},
        GV: o => o || {},
        WQ: noopfn, AS: noopfn, OU: noopfn, RC: noopfn, SC: noopfn,
        LOAD: noopfn, EV: noopfn, END: noopfn, RD: noopfn,
        run_ready_q: noopfn,
        INIT: noopfn, PINIT: noopfn, GET: noopfn,
        deleteCookie: noopfn, deleteIndividualCookies: noopfn,
    };
    // Where a tenant compiled in their consent manager, in the shapes
    // their own enforcement reads back.
    const gdpr = {
        getConsentState: ( ) => 0,
        getSelectedCategories: ( ) => [],
        getCategories: ( ) => [],
        getCookieValues: ( ) => ({}),
        getEnforcementMode: ( ) => 'none',
        getLanguage: ( ) => '',
        applyConsentState: noopfn,
        promptEnabledSetting: noopfn,
        setConsentValue: noopfn,
        setAllCategories: noopfn,
        setPreferencesValues: noopfn,
        setPreferencesFromList: noopfn,
        setCookieValue: noopfn,
        setCookie: noopfn,
        refreshCookie: noopfn,
        showConsentPreferences: noopfn,
        showExplicitConsent: noopfn,
        shouldBlockTag: ( ) => true,
        shouldTagFire: ( ) => false,
        showDoNotSellBanner: noopfn,
        dns: {
            getDnsState: ( ) => true,
            getBlockedDnsTagLookup: ( ) => ({}),
        },
        updateConsentCookie: noopfn,
        setCCPCookie: noopfn,
        setEventCookie: noopfn,
        setConsentValueOld: noopfn,
        setPreferencesValuesOld: noopfn,
        // Their own id setter, and the one place this surface could put
        // one back: a no-op, because nothing here stores an identifier.
        setVisitorId: noopfn,
        getTraceId: ( ) => '',
        typeOf: e => ut.typeOf(e),
        isEmpty: o => ut.isEmpty(o),
        merge: (a, b, c) => ut.merge(a, b, c),
        clone: o => ut.merge({}, o, 1),
        keys: o => {
            try { return Object.keys(o); } catch ( ex ) { }
            return [];
        },
        values: o => {
            try { return Object.values(o); } catch ( ex ) { }
            return [];
        },
        processQueue: noopfn,
        queue: [],
        omittedTags: {},
        doNotSell: {},
        consent_prompt: { isEnabled: false, categories: [] },
        preferences_prompt: { isEnabled: false, categories: [] },
    };
    const cfg = {};
    try {
        const over = w.utag_cfg_ovrd;
        if ( over !== null && typeof over === 'object' ) {
            for ( const key of Object.keys(over) ) { cfg[key] = over[key]; }
        }
    } catch ( ex ) {
    }
    const utag = {
        id: id,
        o: {},
        sender: {},
        send: {},
        rpt: noopfn,
        dbi: [],
        db_log: [],
        loader: loader,
        DB: noopfn,
        RP: noopfn,
        view: function(a, c, d) {
            return this.track({
                event: 'view', data: a || {}, cfg: { cb: c, uids: d },
            });
        },
        link: function(a, c, d) {
            return this.track({
                event: 'link', data: a || {}, cfg: { cb: c, uids: d },
            });
        },
        track: track,
        handler: {
            base: noopfn, df: noopfn, o: {}, send: noopfn, iflag: 0,
            INIT: noopfn, test: noopfn, LR: noopfn, RE: noopfn,
            trigger: noopfn, C: noopfn,
            extend: [], cfg_extend: [],
        },
        ut: ut,
        cfg: cfg,
        data: data,
        udoname: 'utag_data',
        gdpr: gdpr,
    };
    const claimed = value => {
        if ( value === null || value === undefined ) { return false; }
        if ( typeof value !== 'object' ) { return false; }
        try { return typeof value.track === 'function'; } catch ( ex ) { }
        return false;
    };
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
                (where !== '' ? ' on ' + where : '')
            );
        } catch ( ex ) {
        }
    };
    if ( claimed(w.utag) ) {
        report('theirs');
        return;
    }
    try {
        w.utag = utag;
    } catch ( ex ) {
        report('refused');
        return;
    }
    if ( w.utag !== utag ) {
        report('refused');
        return;
    }
    report('utag');
})();
