/// tealium.js
// Resource replacement for the Tealium universal tag loader, served from
// tags.tiqcdn.com/utag/<account>/<profile>/<env>/utag.js
// Not a cookie-consent resource, though it answers a consent api where a
// tenant compiled one in: it lives outside src/ and is not built into
// dist/ by tools/build.mjs. Hand-maintained, ship as-is.
// Read off thirteen tenant loaders - elsgroup/actuel-rh, cbsi/cbstve,
// gendigital/ccleaner, foxcorp/fscom-main, tsb/tsb-uk-new, cdw/main,
// epson/secglobal, hsbc/global-common-dotcom, ccl/main,
// newbalance/nb-jnbo-new, barclaysuk/barclaycard-public,
// academysports/main and hktdc/main, 32kB to 771kB - and four
// tag files: lbg/code utag.2.js at 515 bytes, and tsb's
// utag.419.js, utag.263.js and utag.272.js at 37kB, 27kB and 12.6kB, 77kB
// of vendors on one page.
// Two generations are in there. Ten are utag.loader ut4.0, from
// 201812202215 to 202611251444, minified. barclaysuk is ut4.46.202609221137
// and ships pretty-printed over 4496 lines, which is worth knowing before
// counting anything in it: a pattern written for the minified form, like
// view:function, matches none of it.
// Eight years and two generations, and all thirteen publish the same
// fifteen members in the same order. That is why this pins the contract and
// nothing about a build.
// Their environment is not always prod either - barclaysuk serves from
// PROD-A - so the path pattern takes a hyphen and a capital there.
// Count anything in these with a reader that does not care about line
// length. Their longest lines run from 4.6k characters to 469k, and a
// line-oriented search quietly answers zero on the big ones, which is how
// three of the numbers here were wrong until they were counted again.
// A page loads several of theirs at once, and only the first needs a rule.
// A tag file's url is built by their own loader, in AS:
//   a.src = utag.cfg.path + 'ut'+'ag.' + a.id + '.js'
// and that split string is why "utag." does not appear as a literal in any
// of them. AS is a no-op on this object, so no utag.N.js is ever asked
// for and no rule is needed for one.
// utag.v.js is the third kind of line on such a page, and it comes from
// two paths: utag/tiqapp/utag.v.js, and the tenant's own
// utag/<account>/<profile>/<env>/utag.v.js. All three read were two bytes
// and a comment. The payload is the query string either way,
// a=<account>/<profile>/<version> with a cache buster, so it is a version
// ping wearing a script's clothes. None of the loaders names it, so a tag
// file or their companion asks for it rather than the loader. Nothing is
// lost by blocking it and nothing is gained by replacing it.
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
//                           to create an identifier, and which builds it
//                           out of the browser - navigator.plugins, then
//                           screen.width + screen.height + parseInt(
//                           screen.colorDepth || screen.pixelDepth), go
//                           into theirs, so the id it mints is a
//                           fingerprint with a random prefix
//   cfg                     with window.utag_cfg_ovrd copied over it, as
//                           theirs does, so a page that set noview or
//                           nocookie there reads it back
//   udoname                 utag_data, the global theirs merges into
//                           utag.data as window[utag.udoname]
// ONE MORE KNOWN GAP, found by union across the thirteen: utag.ut.sha256,
// and md5 with it. Neither is the loader's own - both are installed by a
// tenant extension, inside one of the utag.handler.extend functions, as
// utag.ut.sha256 = function(t, n) { ... } over a crypto-js derivative, in
// six of the thirteen. The extension pass that installs them is part of
// what this refuses, and the same extensions are the ones hashing
// utag.data['customer_email'] on their way to a tag. A page that calls
// utag.ut.sha256 itself therefore finds nothing, and would have found
// nothing on the other seven tenants either. Implementing a hash on
// speculation looked worse than saying this: if a site turns out to call
// it, it is a pure function and can be added.
// WHAT IS DELIBERATELY NOT THERE, beyond the data-layer readers: utag.v_id,
// because it is the identifier, and the loader internals it assigns to
// itself as it runs - cl, cond, pre, runonce, initcatch, tagsettings and
// the jdh trio - which no page reads and which only mean anything to a
// loader that is loading tags. utag.pagevars is the page's own to assign,
// and assigning it onto this object works as it would; nothing calls it,
// because the pass that would is the one gathering the data layer.
// ONE KNOWN GAP: window.tealiumConsentRegister. Their loader only reads
// it - no build assigns it - so it is their consent manager tag that
// creates it, and that tag is one of the ones this stops arriving. A page
// calling it directly rather than through utag.gdpr finds nothing, and
// inventing a shape for it from four loaders that never build one would
// be guessing.
// WHERE A TENANT COMPILED IN THEIR CONSENT MANAGER, five of the six did,
// foxcorp alone having none of it and tsb carrying 239 references where
// the others carry 41,
// utag.gdpr answers a refusal in the shapes their own enforcement reads:
// getConsentState() a number, and 0 rather than 1, which is the value
// their applyConsentState tests with parseInt(cs)!==1;
// getSelectedCategories() an array, and an empty one, which their code
// unshifts always_on onto; getCookieValues() an object; getEnforcementMode
// a string, and none rather than opt-in: see the note at the member for
// what that trades. The two prompts carry isEnabled false, since there is
// no prompt to enable with no tag to run it.
// Three of the eleven - hsbc, tsb and barclaysuk, with 223, 232 and 243
// references to it where the other three with a manager have 41 - carry
// the whole of it, setters and prompts included, and those are the
// page-facing half: a cookie
// preferences link calls showConsentPreferences(_lang) or
// showExplicitConsent(_lang), and a tenant's own banner calls
// setConsentValue(1), setAllCategories(false), setPreferencesValues(prefs,
// noCollect) or setPreferencesFromList(list). All of them are here. The
// setters take what they are given and drop it, because nothing stores and
// no tag is waiting on a category, and the two show calls do nothing,
// because no prompt arrives to be shown - a link that does nothing is
// better than a link that throws, which is what a missing member gives.
// getCategories() answers an array, empty, since the tenant's categories
// arrive with the prompt this stops; shouldBlockTag() answers true, which
// is the refusal their own
// if (!utag.gdpr.shouldBlockTag(uid)) uids.push(uid) reads.
// WHAT IT REFUSES, all of it read off their loader: every utag.N.js tag
// file, which is where the vendors are and which the loader is the only
// thing that requests; the senders, which are image and script beacons
// built in their own send and sender; the utag_main cookie, which is where
// their visitor id, session id and session number live as v_id, ses_id and
// _sn; and the data layer itself, which is the collection worth naming.
// RDcp reads every cookie into o["cp."+name] and is in all six, as are
// RDmeta, RDqp, RDdom and RDpv for the meta tags, the query string, the
// document and the page variables. RDlocalStorage, which walks
// Object.keys(window.localStorage) into o["ls."+key], and RDsessionStorage
// beside it are in three of the six - cdw, gendigital and tsb - so
// harvesting the stores is a build or a tenant setting rather than a
// given, and ignoreLocalStorage turns it off where it is there. A tenant's
// tags see all of it. None of those readers is on the object this
// installs, which is the one place where being less complete than theirs
// is the point.
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
// nothing. The version ping can go in a list if a list wants it, and one
// line reaches both of its paths:
//   ||tags.tiqcdn.com/utag/*/utag.v.js$script
// which costs a page two bytes of comment it never reads. That pattern
// cannot take the loader with it, since the loader's name is utag.js and
// this one asks for utag.v.js; and the redirect rule above cannot take
// the ping, for the same reason in reverse.
// utag.sync.js is the one line the rule above does not reach, because
// utag.sync.js does not contain the string utag.js. It is theirs for sync
// tags, the vendor snippets a tenant wants running before the page draws,
// and the page carries that script tag itself rather than the loader
// fetching it - no loader read here references it. The one read was 109
// bytes and nothing but its own copyright line, a tenant with no sync tags
// configured, so what a populated one carries is the tags themselves
// rather than any of the api. That makes it a block rather than a
// replacement:
//   ||tags.tiqcdn.com/utag/*/utag.sync.js$script
// If a list points it here instead, nothing breaks: the id comes out of
// that url too, and whichever copy runs second finds a loader already
// standing and leaves it alone.
// The account and profile come from the url, which is also where
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
            // An empty store has nothing of theirs in it, so the removals
            // and the second count are both waste - and an empty store is
            // exactly what a first visit looks like.
            if ( was === 0 ) { continue; }
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
    // Their helpers, written to their own implementations rather than to
    // what the names suggest - the ten loaders read carry the same bodies,
    // from the 2018 build to this month's, and a page that calls one of
    // these should get their answer and not a near miss.
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
        // merge(a, b, c): c decides. Theirs overwrites when it is truthy
        // and fills only what is undefined when it is not, and the second
        // is the call their own loader makes.
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
    // The queues a page or a tag pushes to, and the named calls theirs
    // exposes. Not the RD readers - RDcp, RDlocalStorage, RDsessionStorage,
    // RDmeta, RDqp, RDdom, RDpv, RDva, RDut, RDses - which are the data
    // layer being gathered, and are the one part of their surface this is
    // deliberately missing.
    const loader = {
        q: [], lq: [], wq: [], bq: [], rq: [], ready_q: [], sendq: [],
        lc: {}, f: {}, ol: {}, bk: {}, p: 0, rf: 0, ri: 0, rp: 0, lh: 0,
        // Their tag config map, keyed by tag id and read in all thirteen
        // as utag.loader.cfg. Empty here, which is the truth: no tag is
        // configured to run.
        cfg: {},
        GV: o => o || {},
        WQ: noopfn, AS: noopfn, OU: noopfn, RC: noopfn, SC: noopfn,
        LOAD: noopfn, EV: noopfn, END: noopfn, RD: noopfn,
        run_ready_q: noopfn,
        // The two entry points theirs calls on itself, in case something
        // on the page reaches for one to re-run the loader, and their
        // cookie remover, which has nothing left to remove.
        INIT: noopfn, PINIT: noopfn, deleteCookie: noopfn,
    };
    // Where a tenant compiled in their consent manager, in the shapes
    // their own enforcement reads back.
    const gdpr = {
        getConsentState: ( ) => 0,
        getSelectedCategories: ( ) => [],
        getCategories: ( ) => [],
        getCookieValues: ( ) => ({}),
        // none, and that is a decision taken for the page rather than
        // against it. Their own enforcement returns early on it -
        // if (enforcementMode === 'none') return - so none reads as
        // nothing being gated, which is what page logic usually treats as
        // no consent being needed.
        // opt-in was the other answer, and it says the stronger thing:
        // tags are gated, which here is true in the strongest sense since
        // none of them will run at all. It breaks two page shapes though,
        // and both are common. A page that withholds an embed until
        // marketing consent sees enforcement on with getConsentState() 0,
        // reads it as a visitor who has not consented, and keeps the embed
        // hidden. And a page that draws its own banner keeps drawing it,
        // because the setters here drop and the record their manager keeps
        // in a CONSENTMGR cookie - barclaysuk refers to it nineteen times,
        // tsb reads it back as cp.CONSENTMGR - is never written. Theirs
        // cannot re-prompt, since their prompt arrives with the consent
        // manager tag this stops, but a tenant's own code can.
        // What none does NOT do is claim a consent. getConsentState stays
        // 0, the categories stay empty, and the tag filters still refuse,
        // because the shape that actually costs a visitor something is
        // if (getConsentState() === 1) { inject vendor } - a page told yes
        // goes and loads the tracker itself, which is worse than an embed
        // that stays hidden. If a site gates content on that value rather
        // than on the mode, lift the rule for it.
        getEnforcementMode: ( ) => 'none',
        getLanguage: ( ) => '',
        applyConsentState: noopfn,
        promptEnabledSetting: noopfn,
        // Their setters, taken and dropped. setConsentValue(1) is a page
        // granting, and there is nothing to grant to and nothing here that
        // stores: no tag is waiting on a category and no cookie is written
        // either way.
        setConsentValue: noopfn,
        setAllCategories: noopfn,
        setPreferencesValues: noopfn,
        setPreferencesFromList: noopfn,
        setCookieValue: noopfn,
        setCookie: noopfn,
        refreshCookie: noopfn,
        // The two a preferences link calls, theirs taking a language. No
        // prompt arrives to be shown, so a link that calls one of these
        // does nothing - which is what a link whose script was replaced
        // can do, and is better than the exception it would throw if the
        // member were missing.
        showConsentPreferences: noopfn,
        showExplicitConsent: noopfn,
        // if (!utag.gdpr.shouldBlockTag(uid)) uids.push(uid) is how the
        // ut4.0 builds filter a track call's uids, so true is the refusal
        // and leaves that list empty. ut4.46 asks the question the other
        // way round, as shouldTagFire, so that one answers false. Both are
        // here because a page on either generation may ask either.
        shouldBlockTag: ( ) => true,
        shouldTagFire: ( ) => false,
        // What ut4.46 added, and the page-facing half of it first: a do
        // not sell link calls showDoNotSellBanner, and their own flow
        // reaches it through
        // if (!utag.gdpr.dns.getDnsState()) { showDoNotSellBanner() }.
        // That call site is all their loader has - getDnsState itself is
        // defined in the consent manager tag, which is one of the ones
        // this stops arriving, so the answer below is read off the call
        // and not off an implementation. true says the visitor is already
        // opted out of a sale, which they are, since nothing is collected
        // to sell, and it is also what keeps their banner from being asked
        // for. Their own flow never reaches it in any case: doNotSell is
        // {} here, so the isEnabled it tests first is undefined, and dns
        // is here for a page that calls it rather than for them.
        showDoNotSellBanner: noopfn,
        dns: {
            getDnsState: ( ) => true,
            getBlockedDnsTagLookup: ( ) => ({}),
        },
        // The cookie writers ut4.46 exposes, taken and dropped like the
        // rest. updateConsentCookie is also reachable without touching
        // gdpr at all - their track handles an update_consent_cookie
        // event with a consent_categories payload - and that path lands on
        // the same refusal, since this track stores nothing whatever the
        // event says.
        updateConsentCookie: noopfn,
        setCCPCookie: noopfn,
        setEventCookie: noopfn,
        setConsentValueOld: noopfn,
        setPreferencesValuesOld: noopfn,
        // Three of their own helpers live on gdpr as well as on ut, and
        // their enforcement calls utag.gdpr.typeOf itself, so these are
        // the same implementations rather than second ones.
        typeOf: e => ut.typeOf(e),
        isEmpty: o => ut.isEmpty(o),
        merge: (a, b, c) => ut.merge(a, b, c),
        processQueue: noopfn,
        queue: [],
        omittedTags: {},
        doNotSell: {},
        // categories beside isEnabled, because a page that reads a
        // prompt's categories to draw its own list would otherwise be
        // iterating undefined. Theirs guards that with
        // if (!Array.isArray(_prompt.categories)) return []; a page has no
        // reason to.
        consent_prompt: { isEnabled: false, categories: [] },
        preferences_prompt: { isEnabled: false, categories: [] },
    };
    // Their cfg carries the tenant's build settings, and theirs merges
    // window.utag_cfg_ovrd over them - a page that sets noview or
    // nocookie there reads it back on utag.cfg, so it is copied in. By
    // value, since it is the page's own object and this one has no
    // settings of its own to defend.
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
            // Arrays in all thirteen, and the place a tenant's extensions
            // live: utag.handler.extend = [ function(a, b){ ... } ] with
            // utag.handler.cfg_extend = [ { id, blr, alr, ... } ] beside
            // it. Empty here, and that is the extension pass this
            // refuses rather than an oversight - those functions are
            // where a tenant reads utag.data['customer_email'] and the
            // rest of the data layer. A page that pushes to one of them
            // finds an array to push to, and nothing that will run it.
            extend: [], cfg_extend: [],
        },
        ut: ut,
        cfg: cfg,
        data: data,
        // The name of the global their loader merges into utag.data, which
        // theirs reads as window[utag.udoname]. utag_data is the default
        // and the one this resource took its data from.
        udoname: 'utag_data',
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
