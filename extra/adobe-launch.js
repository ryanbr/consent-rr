/// adobe-launch.js
// Resource replacement for the Adobe Experience Platform Tags runtime, once
// Adobe Launch and before that DTM: assets.adobedtm.com/<property>/<env>/
// launch-<build>.min.js, the older flat launch-EN<id>.min.js, and the
// satelliteLib-<hash>.js filename a property migrated from DTM keeps - that
// one is a current turbine build under the old name, not the old library.
// Not a cookie-consent resource: it lives outside src/ and is not built
// into dist/ by tools/build.mjs. Hand-maintained, ship as-is.
// THE NOTES ARE IN extra/adobe-launch.md - what their runtime publishes,
// where each member here came from, and what each decision traded.
// The comments below are a line each; the reasoning for them is there.
//
// THE RULES
//   ||assets.adobedtm.com/*/launch-*.min.js$script,redirect=adobe-launch.js
//   ||assets.adobedtm.com/launch-*.min.js$script,redirect=adobe-launch.js
//   ||assets.adobedtm.com/*/satelliteLib-*.js$script,redirect=adobe-launch.js
//   ||assets.adobedtm.com/satelliteLib-*.js$script,redirect=adobe-launch.js
//   ||lightning.cnn.com/launch/*/launch-*.min.js$script,redirect=adobe-launch.js
// The last one is a site serving the runtime from its own host. There is no
// generic rule for that - the path shape is Adobe's, the host is anybody's -
// so each one is its own line, written against a url somebody has seen. It
// is also where this matters most: the components and the Analytics library
// are first-party there too, so nothing else can be reached by host.
// The satelliteLib ones were checked against a served file: same turbine
// version, same _satellite surface, same wording. Do not assume the name
// means the old library.
// Replace the runtime, not what it fetches. Their rule components, the
// RC<uuid>-source.min.js files, are requested BY the runtime, so a stub
// means none of them is asked for - including the ones that are a whole
// Web SDK bundle. Do not write a rule for those files: their own loader
// resolves a failed one to undefined and the rule carries on, so blocking
// them breaks nothing and redirecting them buys nothing. The .md has the
// source of their loader that says so.
//
// The page keeps a working window._satellite - getVar, setVar, track,
// pageBottom, cookie, logger, notify, the deprecated cookie aliases, and
// the property, company, environment and buildInfo objects - so page code
// and container code that calls into it proceeds. What it loses is every
// rule, data element and extension: no Analytics, no Target, no Audience
// Manager, no ECID, no Web SDK, no direct-call rules, and no custom code
// fetched from their CDN.
//
// A comment indented into the body ships to every user - uBO strips only
// the ones at column zero - so keep those to one line and put the rest in
// the .md.
// The "///" line above is the resource header uBO reads, and a comment to
// JavaScript. uBO drops these "//" lines when it parses.
(function() {
    'use strict';
    const w = window;
    const doc = w.document;
    const existing = w._satellite;
    if ( existing && typeof existing.getVar === 'function' ) {
        return;
    }
    const TURBINE_VERSION = '29.1.0';
    // Their notify levels: 3 info, 4 warn, 5 error, anything else log.
    const LEVELS = { 3: 'info', 4: 'warn', 5: 'error' };
    // The redirected url carries the property, environment and build, and
    // the environment hash is the only one of them anything here publishes -
    // the others would be inventing an id. The flat legacy embed has none.
    const environmentId = ( ) => {
        try {
            const el = doc.currentScript;
            const src = el && el.src || '';
            const found =
                /\/[0-9a-f]{6,}\/([0-9a-f]{6,})\/launch-[0-9A-Za-z]+\./
                    .exec(src);
            return found !== null ? found[1] : '';
        } catch ( ex ) {
            return '';
        }
    };
    const environment = environmentId();
    // Silent until setDebug turns it on, which is theirs as well.
    let debugging = false;
    const say = (level, parts) => {
        if ( debugging === false ) { return; }
        try {
            const console_ = w.console;
            if ( typeof console_[level] !== 'function' ) { return; }
            console_[level].apply(console_, parts);
        } catch ( ex ) {
        }
    };
    const logger = {};
    for ( const level of [ 'log', 'info', 'warn', 'error', 'debug' ] ) {
        logger[level] = (...parts) => { say(level, parts); };
    }
    logger.deprecation = (...parts) => { say('warn', parts); };
    // setVar writes one, getVar reads it back. Data elements are the other
    // thing getVar answers, and there are none.
    const vars = new Map();
    const getVar = name => {
        if ( typeof name !== 'string' ) { return ''; }
        if ( vars.has(name) ) { return vars.get(name); }
        // Container code calls string methods straight on the answer.
        return '';
    };
    const setVar = (name, value) => {
        if ( name !== null && typeof name === 'object' ) {
            for ( const key of Object.keys(name) ) {
                vars.set(key, name[key]);
            }
            return;
        }
        if ( typeof name !== 'string' ) { return; }
        vars.set(name, value);
    };
    const decode = text => {
        try { return decodeURIComponent(text); } catch ( ex ) { return text; }
    };
    // Reading is the page's own document; writing is what is being removed.
    const cookie = {
        // The name is decoded as well as the value, as theirs does, so a jar
        // their library wrote encoded matches one the page wrote raw.
        get: name => {
            if ( typeof name !== 'string' || name === '' ) { return undefined; }
            let jar = '';
            try { jar = doc.cookie || ''; } catch ( ex ) { }
            for ( const part of jar.split(';') ) {
                const at = part.indexOf('=');
                if ( at === -1 ) { continue; }
                if ( decode(part.slice(0, at).trim()) !== name ) { continue; }
                return decode(part.slice(at + 1).trim());
            }
            return undefined;
        },
        // A removal only ever takes something away, so it is honoured.
        remove: (name, options) => {
            if ( typeof name !== 'string' || name === '' ) { return; }
            const where = options && typeof options === 'object' ? options : {};
            // Both spellings when they differ: theirs encodes the name it
            // writes, so one the page set raw survives expiring the other.
            const names = [ encodeURIComponent(name) ];
            if ( names[0] !== name ) { names.push(name); }
            for ( const spelling of names ) {
                let line = spelling + '=; expires=Thu, 01 Jan 1970 00:00:01' +
                    ' GMT; path=' + (where.path || '/');
                if ( where.domain ) { line += '; domain=' + where.domain; }
                try { doc.cookie = line; } catch ( ex ) { }
            }
        },
        // A write is removed; a deletion is honoured. Three shapes, measured.
        set: (name, value, options) => {
            if ( typeof name !== 'string' || name === '' ) { return; }
            const opts = options !== null && typeof options === 'object'
                ? options
                : {};
            const expires = typeof options === 'number' ? options : opts.expires;
            // Duck-typed: a Date from another realm fails instanceof. A day
            // count stays separate from a timestamp - 30 is a number too.
            const stamp = expires && typeof expires.getTime === 'function'
                ? expires.getTime()
                : undefined;
            const gone = value === '' || value === null ||
                value === undefined ||
                (typeof expires === 'number' && expires <= 0) ||
                (stamp !== undefined && stamp <= Date.now());
            if ( gone ) { cookie.remove(name, opts); }
        },
        withConverter: ( ) => cookie,
    };
    const satellite = existing !== null && typeof existing === 'object'
        ? existing
        : {};
    // Set by a page or a debugger before the library loads; theirs keeps it.
    if ( Array.isArray(satellite._monitors) === false ) {
        satellite._monitors = [];
    }
    satellite.getVar = getVar;
    satellite.setVar = setVar;
    satellite.cookie = cookie;
    satellite.logger = logger;
    // With no rules, theirs answers every identifier with the line below.
    satellite.track = (identifier, detail) => {
        const name = typeof identifier === 'string'
            ? identifier.trim()
            : String(identifier);
        void detail;
        logger.log('"' + name + '" does not match any direct call identifiers.');
    };
    // Nothing waits on the page-bottom trigger, and theirs no-ops too.
    satellite.pageBottom = ( ) => { };
    // Their ECID extension replaces getVisitorId with the Visitor instance,
    // and page code chains off it - getVisitorId().getMarketingCloudVisitorID()
    // is in the corpus 32 times. null there is a TypeError on a page a block
    // would have left alone, which is a blank page somebody writes an
    // exception for. Members read off the library bundled in their runtimes.
    // Every getter answers empty and calls a callback it is handed, because a
    // page waiting for one that never comes is the same blank page.
    const answer = value => (callback, ...rest) => {
        void rest;
        // A fresh object each call, as theirs builds one: a page that writes
        // on the answer must not have that come back on the next call.
        const given = value !== null && typeof value === 'object' ? {} : value;
        if ( typeof callback === 'function' ) {
            try { callback(given); } catch ( ex ) { }
        }
        return given;
    };
    const noopfn = ( ) => { };
    const visitor = {
        getMarketingCloudVisitorID: answer(''),
        getVisitorValues: answer({}),
        getAnalyticsVisitorID: answer(''),
        getAudienceManagerLocationHint: answer(''),
        getAudienceManagerBlob: answer(''),
        getLocationHint: answer(''),
        getCustomerIDs: answer({}),
        getSupplementalDataID: answer(''),
        isClientSideMarketingCloudVisitorID: answer(false),
        getOptOut: answer(''),
        setCustomerIDs: noopfn,
        setMarketingCloudVisitorID: noopfn,
        idSyncByURL: noopfn,
        resetState: noopfn,
        version: '',
    };
    satellite.getVisitorId = ( ) => visitor;
    satellite.notify = (message, level) => {
        // Their wording, less the backticks this repo bans in a resource.
        logger.deprecation('_satellite.notify is deprecated. Please use the ' +
            '_satellite.logger API.');
        logger[LEVELS[level] || 'log'](message);
    };
    // The three deprecated aliases, each with the wording theirs prints.
    satellite.setCookie = (name, value, days) => {
        const tail = days !== undefined ? ', { expires: ' + days + ' }' : '';
        logger.deprecation('_satellite.setCookie is deprecated. Please use ' +
            '_satellite.cookie.set("' + name + '", "' + value + '"' + tail +
            ').');
        cookie.set(name, value, days !== undefined ? { expires: days } : {});
    };
    satellite.readCookie = name => {
        logger.deprecation('_satellite.readCookie is deprecated. Please use ' +
            '_satellite.cookie.get("' + name + '").');
        return cookie.get(name);
    };
    satellite.removeCookie = name => {
        logger.deprecation('_satellite.removeCookie is deprecated. Please ' +
            'use _satellite.cookie.remove("' + name + '").');
        cookie.remove(name);
    };
    satellite.setDebug = value => { debugging = value === true; };
    satellite.property = { name: '', id: '' };
    satellite.company = { orgId: '' };
    satellite.environment = { id: environment, stage: 'production' };
    satellite.buildInfo = {
        minified: true,
        buildDate: '',
        turbineBuildDate: '',
        turbineVersion: TURBINE_VERSION,
    };
    // A component already in the page registers here; nothing asks again.
    satellite.__registerScript = ( ) => { };
    satellite._onCustomCodeSuccess = ( ) => { };
    satellite._onCustomCodeFailure = ( ) => { };
    // The globals their extensions install, which a page can reach for as
    // readily as _satellite - and which a blocked library leaves undefined,
    // so a page guarded on them skips, while a page that is not throws.
    // Members read off the bundled at.js and ECID library; every call either
    // answers or settles, because a page waiting on Target is a blank page.
    // Only installed when absent: a real library that nothing blocked must
    // still win. See the .md.
    const settle = value => {
        try { return w.Promise.resolve(value); } catch ( ex ) { return value; }
    };
    const offers = { execute: { pageLoad: {}, mboxes: [] }, prefetch: {} };
    const targetApi = {
        VERSION: '',
        event: {},
        getOffer: options => {
            const done = options && options.success;
            if ( typeof done === 'function' ) {
                try { done([]); } catch ( ex ) { }
            }
        },
        getOffers: options => {
            const done = options && options.success;
            if ( typeof done === 'function' ) {
                try { done(offers); } catch ( ex ) { }
            }
            return settle(offers);
        },
        applyOffer: options => {
            const done = options && options.success;
            if ( typeof done === 'function' ) {
                try { done(); } catch ( ex ) { }
            }
        },
        applyOffers: ( ) => settle(undefined),
        sendNotifications: ( ) => settle(undefined),
        triggerView: noopfn,
        trackEvent: noopfn,
        registerExtension: noopfn,
    };
    try {
        w.adobe = w.adobe !== null && typeof w.adobe === 'object'
            ? w.adobe
            : {};
        if ( w.adobe.target === undefined ) { w.adobe.target = targetApi; }
    } catch ( ex ) {
    }
    try {
        if ( w.Visitor === undefined ) {
            const Visitor = ( ) => visitor;
            Visitor.getInstance = ( ) => visitor;
            Visitor.AuthState = {
                UNKNOWN: 0, AUTHENTICATED: 1, LOGGED_OUT: 2,
            };
            Visitor.version = '';
            w.Visitor = Visitor;
        }
    } catch ( ex ) {
    }
    const container = {
        buildInfo: satellite.buildInfo,
        environment: satellite.environment,
        property: satellite.property,
        company: satellite.company,
        dataElements: {},
        rules: [],
        extensions: {},
    };
    // Theirs warns once, on the first read, and so does this.
    let warned = false;
    try {
        Object.defineProperty(satellite, '_container', {
            configurable: true,
            enumerable: true,
            get: ( ) => {
                if ( warned === false ) {
                    logger.warn('_satellite._container may change at any ' +
                        'time and should only be used for debugging.');
                    warned = true;
                }
                return container;
            },
        });
    } catch ( ex ) {
        satellite._container = container;
    }
    satellite.container = container;
    w._satellite = satellite;
    // Their double-init guard is deliberately NOT set. Theirs checks
    // window.__satelliteLoaded before hydrating, so setting it makes a real
    // library that arrives afterwards stand down - which breaks a page where
    // nothing blocked that library, and the scriptlet form blocks nothing.
    // Reported from the field as a page broken by the stub alone. The .md
    // has it.
    // Their pre-hiding snippet goes in the page, hides the body, and waits
    // for at.js or alloy to take the style away. Neither runs now, so this
    // does what they would. The ids are theirs, and removing a style can
    // only reveal content. See the .md.
    // Some pages define this and wait to be called. Nothing in a corpus of
    // 123 bundled runtimes calls it, and 23 of them publish pageBottom, so
    // it is a legacy hook rather than a live one - but a page that defines
    // it and is never called is the stall this whole file is about, so it
    // is answered, at most once.
    //
    // The schedule is the point. At document_start the page below does not
    // exist, so a callback an inline script is about to define cannot be
    // seen yet: a single check here only ever fires for the redirect
    // delivery, where this runs at the embed's own position after earlier
    // inline scripts. For the scriptlet delivery it has to run again as the
    // document arrives - the mistake AGENTS.md records for parked tags.
    //
    // It rides the DOMContentLoaded listener the reveal below already
    // registers rather than adding a second one, because a test asserts
    // this file touches the page exactly once and that is worth keeping.
    let told = false;
    const tellLoaded = ( ) => {
        if ( told ) { return; }
        const fn = w.__satelliteLoadedCallback;
        if ( typeof fn !== 'function' ) { return; }
        told = true;
        try { fn(satellite); } catch ( ex ) { }
    };
    tellLoaded();
    const HIDDEN = [ 'at-body-style', 'alloy-prehiding' ];
    const reveal = ( ) => {
        for ( const id of HIDDEN ) {
            try {
                const el = doc.getElementById(id);
                if ( el === null || el.parentNode === null ) { continue; }
                el.parentNode.removeChild(el);
            } catch ( ex ) { }
        }
    };
    reveal();
    // The snippet usually sits beside the embed, so it may not have run yet.
    // Watch while the head is still arriving and stop at the end of it.
    if ( doc.readyState === 'loading' ) {
        let watch = null;
        // The head only, and its own children only: their snippet goes
        // there, and a subtree watch on the document makes the engine build
        // a record for every node the page parses - 12000 of them on a page
        // of 8000, for two ids that can only appear in one place.
        try {
            watch = new w.MutationObserver(reveal);
            watch.observe(doc.head || doc.documentElement || doc, {
                childList: true,
            });
        } catch ( ex ) {
            watch = null;
        }
        doc.addEventListener('DOMContentLoaded', ( ) => {
            reveal();
            tellLoaded();
            if ( watch !== null ) { watch.disconnect(); watch = null; }
        }, { once: true });
    }
})();
