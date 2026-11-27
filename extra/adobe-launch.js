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
    const logger = {
        log: (...parts) => { say('log', parts); },
        info: (...parts) => { say('info', parts); },
        warn: (...parts) => { say('warn', parts); },
        error: (...parts) => { say('error', parts); },
        debug: (...parts) => { say('debug', parts); },
        deprecation: (...parts) => { say('warn', parts); },
    };
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
    // Reading is the page's own document; writing is what is being removed.
    const cookie = {
        get: name => {
            if ( typeof name !== 'string' || name === '' ) { return undefined; }
            let jar = '';
            try { jar = doc.cookie || ''; } catch ( ex ) { }
            for ( const part of jar.split(';') ) {
                const at = part.indexOf('=');
                if ( at === -1 ) { continue; }
                let found = part.slice(0, at).trim();
                // Theirs decodes the name it reads, so a jar written by it
                // is matched as well as one the page wrote raw.
                try { found = decodeURIComponent(found); } catch ( ex ) { }
                if ( found !== name ) { continue; }
                try {
                    return decodeURIComponent(part.slice(at + 1).trim());
                } catch ( ex ) {
                    return part.slice(at + 1).trim();
                }
            }
            return undefined;
        },
        // A removal only ever takes something away, so it is honoured.
        remove: (name, options) => {
            if ( typeof name !== 'string' || name === '' ) { return; }
            const where = options && typeof options === 'object' ? options : {};
            // Both spellings when they differ: theirs encodes the name it
            // writes, so a cookie the page set raw survives a removal that
            // only expires the encoded one. Expiring both can only take
            // something away.
            const names = [ encodeURIComponent(name) ];
            if ( names[0] !== name ) { names.push(name); }
            for ( const spelling of names ) {
                const bits = [
                    spelling + '=',
                    'expires=Thu, 01 Jan 1970 00:00:01 GMT',
                    'path=' + (where.path || '/'),
                ];
                if ( where.domain ) { bits.push('domain=' + where.domain); }
                try { doc.cookie = bits.join('; '); } catch ( ex ) { }
            }
        },
        // A write is removed; a deletion is honoured. Three shapes, measured.
        set: (name, value, options) => {
            if ( typeof name !== 'string' || name === '' ) { return; }
            const bare = typeof options === 'number' ? options : undefined;
            const opts = options !== null && typeof options === 'object'
                ? options
                : {};
            const expires = bare !== undefined ? bare : opts.expires;
            let gone = value === '' || value === null || value === undefined;
            if ( typeof expires === 'number' && expires <= 0 ) { gone = true; }
            // Duck-typed: a Date from another realm fails instanceof.
            const at = expires !== null && typeof expires === 'object' &&
                typeof expires.getTime === 'function'
                ? expires.getTime()
                : undefined;
            if ( typeof at === 'number' && at <= Date.now() ) { gone = true; }
            if ( gone === false ) { return; }
            cookie.remove(name, opts);
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
    satellite.getVisitorId = ( ) => null;
    satellite.notify = (message, level) => {
        // Their wording, less the backticks this repo bans in a resource.
        logger.deprecation('_satellite.notify is deprecated. Please use the ' +
            '_satellite.logger API.');
        if ( level === 3 ) { logger.info(message); return; }
        if ( level === 4 ) { logger.warn(message); return; }
        if ( level === 5 ) { logger.error(message); return; }
        logger.log(message);
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
    // Their double-init guard, set where theirs is. See the .md.
    try { w.__satelliteLoaded = true; } catch ( ex ) { }
    // Their embed calls this on load, and some pages define it.
    if ( typeof w.__satelliteLoadedCallback === 'function' ) {
        try { w.__satelliteLoadedCallback(satellite); } catch ( ex ) { }
    }
})();
