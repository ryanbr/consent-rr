/// tealium.js
// Resource replacement for the Tealium universal tag loader, served from
// tags.tiqcdn.com/utag/<account>/<profile>/<env>/utag.js
// Not a cookie-consent resource, though it answers a consent api where a
// tenant compiled one in: it lives outside src/ and is not built into
// dist/ by tools/build.mjs. Hand-maintained, ship as-is.
// Read off four tenant loaders - elsgroup/actuel-rh, cbsi/cbstve,
// gendigital/ccleaner and foxcorp/fscom-main, 32kB to 771kB, carrying
// utag.loader versions ut4.0.202501242212 through ut4.0.202611252057 - and
// one tag file, lbg/code utag.2.js at 515 bytes, which is one vendor's tag
// rather than the loader and is never requested once the loader is gone.
// All four publish the same fifteen members on window.utag, in the same
// order: id o sender send rpt dbi db_log loader DB RP view link track
// handler ut.
// WHAT THE PAGE KEEPS, because a page calls these itself:
//   view(data, cb, uids)    their own thin wrappers over track - theirs
//   link(data, cb, uids)    are literally
//                           view:function(a,c,d){return this.track({
//                           event:'view',data:a||{},cfg:{cb:c,uids:d}})}
//   track(a, b, c, d, e)    taking either their object shape or an event
//                           name with the callback as the third argument
//   THE CALLBACK IS THE POINT. utag.link({...}, function(){ location =
//   somewhere }) is how a page defers a navigation until tracking says it
//   is done, and a stub that never calls back is a dead link. It is called
//   synchronously here, which keeps the user gesture a navigation needs;
//   theirs calls it once its senders have gone, which is the one
//   divergence that matters and is in the page's favour.
//   data                    window.utag_data where the page set one, left
//                           exactly as it is rather than copied
//   id, cfg, o, sender, send, rpt, dbi, db_log, DB, RP, handler, loader
//   and ut, so a page or a tag reading any of the fifteen finds it
//   ut.vi                   their visitor-id minter, which answers the
//                           empty string here: the one member whose job is
//                           to create an identifier
// WHERE A TENANT COMPILED IN THEIR CONSENT MANAGER, two of the four did,
// utag.gdpr answers a refusal in the shapes their own enforcement reads:
// getConsentState() a number, and 0 rather than 1, which is the value
// their applyConsentState tests with parseInt(cs)!==1;
// getSelectedCategories() an array, and an empty one, which their code
// unshifts always_on onto; getCookieValues() an object; getEnforcementMode
// a string; the two prompts objects carrying isEnabled false, since there
// is no prompt to enable with no tag to run it.
// WHAT IT REFUSES, all of it read off their loader: every utag.N.js tag
// file, which is where the vendors are and which the loader is the only
// thing that requests; the senders, which are image and script beacons
// built in their own send and sender; the utag_main cookie, which is where
// their visitor id, session id and session number live as v_id, ses_id and
// _sn; and the data layer itself, which is the collection worth naming -
// RDlocalStorage walks Object.keys(window.localStorage) into o["ls."+key]
// and RDsessionStorage does the same, RDcp reads every cookie into
// o["cp."+name], and RDmeta, RDqp, RDdom and RDpv add the meta tags, the
// query string, the document and the page variables, unless a tenant set
// ignoreLocalStorage or ignoreSessionStorage. A tenant's tags see all of
// it. None of those readers is on the object this installs, which is the
// one place being less complete than theirs is the point.
// WHAT IT CLEARS: utag_main, on the host and every parent suffix of two
// labels or more, and only where it is in the jar - their visitor id is
// inside it, and replacing the loader stops a new one being written
// without taking away the one already there. With it, their visitor
// attributes: RDva reads them back as readAttr(o, "tealium_va") and
// readAttr(o, "tealium_va_" + account + "_" + profile), so both names go
// from storage, which is why the url's two halves are kept apart and not
// only joined into their id.
// The rule it answers:
//   ||tags.tiqcdn.com/utag/*/utag.js$script,redirect=tealium.js
// A tag file is a separate request that nothing makes once the loader is
// replaced, so no rule is needed for utag.N.js and blocking those buys
// nothing. The account and profile come from the url, which is also where
// their own id comes from, so the resource needs nothing per tenant.
// The "///" line above is the resource header uBO reads, and a comment to
// JavaScript. uBO drops these "//" lines when it parses.
(function() {
    'use strict';
    const w = window;
    const doc = w.document;
    const NAME = 'tealium';
    const VERSION = '1.0.0';
    // Their own id is account.profile - id:"elsgroup.actuel-rh" in the
    // loader for /utag/elsgroup/actuel-rh/prod/utag.js - so the url the
    // redirected element still carries is where both halves are.
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
    // Their cookie, and the one thing in it worth taking away: v_id, read
    // back as o["cp.utag_main_v_id"] and handed to the data layer as
    // tealium_visitor_id. ses_id and _sn ride along in the same cookie.
    const COOKIE = 'utag_main';
    // Their visitor attributes, read back by RDva as
    // readAttr(o, "tealium_va") and
    // readAttr(o, "tealium_va_" + o["ut.account"] + "_" + o["ut.profile"]).
    // Replacing the loader stops new ones arriving and leaves whatever is
    // already there, so both names go - localStorage is the one they read,
    // and the other store costs a call to be sure.
    const stored = ( ) => {
        const out = [ 'tealium_va' ];
        if ( account !== '' && profile !== '' ) {
            out.push('tealium_va_' + account + '_' + profile);
        }
        return out;
    };
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
    // One read of the jar, and only to find out whether there is anything
    // to expire: a name that is not in document.cookie has nothing to
    // expire at any suffix either, since a cookie set on a parent domain
    // is in document.cookie as well.
    const forget = ( ) => {
        const done = { cleared: 0, storage: 0 };
        const names = stored();
        for ( const store of [ 'localStorage', 'sessionStorage' ] ) {
            let store_;
            try { store_ = w[store]; } catch ( ex ) { continue; }
            if ( store_ === null || store_ === undefined ) { continue; }
            // Counted by what the store lost rather than by what was asked
            // of it: removing a key that was never there is a no-op, and a
            // count of the asking would say two on an untouched store. The
            // length of a store is a count and not a read of anything in
            // it.
            let was = 0;
            try { was = store_.length; } catch ( ex ) { }
            for ( const name of names ) {
                try { store_.removeItem(name); } catch ( ex ) { }
            }
            try { done.storage += Math.max(0, was - store_.length); }
            catch ( ex ) { }
        }
        let held = '';
        try { held = String(doc.cookie || ''); } catch ( ex ) { return done; }
        if ( held.indexOf(COOKIE + '=') !== 0 &&
             held.indexOf('; ' + COOKIE + '=') === -1 ) { return done; }
        done.cleared = 1;
        for ( const domain of suffixes() ) {
            const parts = [ COOKIE + '=', 'path=/',
                'expires=Thu, 01 Jan 1970 00:00:01 GMT' ];
            if ( domain !== '' ) { parts.push('domain=' + domain); }
            try { doc.cookie = parts.join('; '); } catch ( ex ) { }
        }
        return done;
    };
    const taken = forget();
    // The data layer is the page's own object. Theirs reads it and adds
    // its own several hundred keys; this one hands back what the page put
    // there and nothing else, by reference, so a page that keeps writing
    // to window.utag_data keeps seeing it on utag.data as it would.
    let data = {};
    try {
        const held = w.utag_data;
        if ( held !== null && typeof held === 'object' ) { data = held; }
    } catch ( ex ) {
    }
    // Their callback, called rather than dropped. A page that passes one
    // is usually waiting to navigate.
    // No catch of its own: track wraps every call to this, so one here
    // would be unreachable - and a guard nothing can reach is a guard
    // nothing can check.
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
    // Their utilities, as far as they are pure. vi mints a visitor id, so
    // it answers the empty string; flatten and loader are theirs to use on
    // data this one does not gather.
    const ut = {
        pad: (n, len) => {
            let out = String(n === undefined ? '' : n);
            while ( out.length < len ) { out = '0' + out; }
            return out;
        },
        vi: ( ) => '',
        hasOwn: (o, p) => {
            try {
                return Object.prototype.hasOwnProperty.call(o, p);
            } catch ( ex ) {
            }
            return false;
        },
        isEmptyObject: o => {
            try { return Object.keys(o).length === 0; } catch ( ex ) { }
            return true;
        },
        isEmpty: o => {
            if ( o === undefined || o === null || o === '' ) { return true; }
            try { return Object.keys(o).length === 0; } catch ( ex ) { }
            return false;
        },
        typeOf: o => {
            if ( o === null ) { return 'null'; }
            if ( Array.isArray(o) ) { return 'array'; }
            return typeof o;
        },
        flatten: ( ) => ({}),
        merge: (a, b) => {
            try {
                for ( const key of Object.keys(b || {}) ) { a[key] = b[key]; }
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
    // The queues a page or a tag pushes to, and the named calls theirs
    // exposes. Not the RD readers - RDcp, RDlocalStorage, RDsessionStorage,
    // RDmeta, RDqp, RDdom, RDpv, RDva, RDut, RDses - which are the data
    // layer being gathered, and are the one part of their surface this is
    // deliberately missing.
    const loader = {
        q: [], lq: [], wq: [], bq: [], rq: [], ready_q: [], sendq: [],
        lc: {}, f: {}, ol: {}, bk: {}, p: 0, rf: 0, ri: 0, rp: 0, lh: 0,
        GV: o => o || {},
        WQ: noopfn, AS: noopfn, OU: noopfn, RC: noopfn, SC: noopfn,
        LOAD: noopfn, EV: noopfn, END: noopfn, RD: noopfn,
        run_ready_q: noopfn,
    };
    // Where a tenant compiled in their consent manager, in the shapes
    // their own enforcement reads back.
    const gdpr = {
        getConsentState: ( ) => 0,
        getSelectedCategories: ( ) => [],
        getCookieValues: ( ) => ({}),
        getEnforcementMode: ( ) => 'opt-in',
        applyConsentState: noopfn,
        promptEnabledSetting: noopfn,
        omittedTags: {},
        doNotSell: {},
        consent_prompt: { isEnabled: false },
        preferences_prompt: { isEnabled: false },
    };
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
        },
        ut: ut,
        cfg: {},
        data: data,
        gdpr: gdpr,
    };
    // A page element with id="utag" is a named property of the window, so
    // what is standing there may be a tag rather than a loader. Only a
    // loader - an object carrying their track - is left alone.
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
