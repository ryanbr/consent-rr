/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    Home: https://github.com/ryanbr/consent-rr

    CookieConsent v3 by Orest Bida - the MIT-licensed one a site loads as

        cdn.jsdelivr.net/gh/orestbida/cookieconsent@3.1.0/dist/cookieconsent.umd.js

    or self-hosts beside its own assets. NOT Osano's old "cookieconsent"
    library, which is a different project with the same common name; Osano's
    current CMP has its own family here.

    Being open source, every value below was read off the shipped bundle
    rather than inferred - and the 3.1.0 file on jsDelivr is byte-identical to
    the copy csc.edu serves from its own domain, so one resource covers both.

    THEIR OWN DEFAULTS, verbatim from the bundle:

        {
            mode: 'opt-in', revision: 0, autoShow: true,
            lazyHtmlGeneration: true, autoClearCookies: true,
            manageScriptTags: true, hideFromBots: true,
            cookie: {
                name: 'cc_cookie', expiresAfterDays: 182, domain: '',
                path: '/', secure: true, sameSite: 'Lax'
            }
        }

    THEIR RECORD, which is what stops the banner coming back:

        {
            categories: [...], revision: 0, data: null,
            consentTimestamp: '<iso>', consentId: '<uuid>',
            services: { <category>: [...] }, languageCode: 'en',
            lastConsentTimestamp: '<iso>', expirationTime: <ms>
        }

    and their own gate, which decides whether to show the banner:

        e.V && _ && d !== t.revision && (e.j = !1)
        e.T = !(_ && e.j && e.C && e.S && f)

    - a string consentId, a revision equal to the page's, both timestamps and
    categories as an array. Miss any one and their banner is back, which is
    why all of them are written here.

    THE consentId IS MINTED, unlike the families whose id comes from a consent
    log server. Theirs is made in the browser, and this makes it the same way:

        ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, e =>
            (e ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> e/4)
                .toString(16))

    An existing one is carried over rather than replaced.

    WHERE IT GOES: a cookie by default, localStorage where their
    cookie.useLocalStorage says so, with their own attributes -

        name + '=' + encodeURIComponent(JSON.stringify(record))
            + '; expires=' + <expiresAfterDays>
            + '; Path=' + path + '; SameSite=' + sameSite
            + (hostname has a dot ? '; Domain=' + domain : '')
            + (secure && https ? '; Secure' : '')

    - and their run() sets cookie.domain to location.hostname before any of
    that, so the domain is the page's own host unless the site overrode it.

    THEIR AUTO-CLEAR IS DONE, because it is the visible half of a refusal:
    a category with autoClear.cookies has those cookies deleted, their own
    way - host-only, with the configured domain dot-prefixed, and for a www
    host the bare domain as well. Their reloadPage is NOT honoured: theirs
    reloads when a category goes from accepted to refused, and a resource that
    writes a refusal on every load would reload every load.

    THEIR SCRIPT TAGS, by their own contract and their own activation order:

        script[data-category]       the parked tag
        data-category="!analytics"  a leading ! inverts it
        data-service, data-src, data-type
        type="text/plain"           what the page leaves it as

    The copy takes the real type from data-type and the real src from
    data-src, carries every other attribute, and chains onload so order
    holds - which is what theirs does. A refusal leaves all of it parked.

    THEIR EVENTS GO TO THE WINDOW: their dispatcher is a bare
    dispatchEvent(new CustomEvent(name, {detail})), which is window's, and the
    detail is {cookie} for cc:onFirstConsent and cc:onConsent, plus
    changedCategories and changedServices for cc:onChange. The config
    callbacks of the same names are called with the same payload.

    BOTS ARE LEFT ALONE, because theirs leaves them alone: with hideFromBots
    on - their default - a user agent matching /bot|crawl|spider|slurp|teoma/i
    or navigator.webdriver makes their own run() return before doing anything,
    so this does too.

*/

function consentRRCookieConsent(mode) {
    'use strict';

    const w = window;
    const doc = w.document;
    const NAME = 'cookieconsent-' + mode;
    const VERSION = '@@VERSION@@';

    const accept = mode === 'accept';
    const unblockAll = mode === 'reject-unblock';
    // Accept frees the parked tags because that is what their accept does;
    // reject-unblock frees them for a site that withholds content.
    const activate = accept || unblockAll;
    // What the page's own reads are told. The record follows accept alone.
    const reported = accept || unblockAll;

    // Their own event names.
    const EVENTS = {
        firstConsent: 'cc:onFirstConsent',
        consent: 'cc:onConsent',
        change: 'cc:onChange',
        modalShow: 'cc:onModalShow',
        modalHide: 'cc:onModalHide',
        modalReady: 'cc:onModalReady',
    };

    // Their own defaults.
    const DEFAULTS = {
        mode: 'opt-in',
        revision: 0,
        autoShow: true,
        lazyHtmlGeneration: true,
        autoClearCookies: true,
        manageScriptTags: true,
        hideFromBots: true,
    };
    const COOKIE_DEFAULTS = {
        name: 'cc_cookie',
        expiresAfterDays: 182,
        domain: '',
        path: '/',
        secure: true,
        sameSite: 'Lax',
    };
    const reBot = /bot|crawl|spider|slurp|teoma/i;

    /**************************************************************************/

    let config = {};
    let cookieConfig = Object.assign({}, COOKIE_DEFAULTS);
    let categories = {};
    let categoryIds = [];
    let readOnlyIds = [];
    let servicesByCategory = {};
    let acceptedCategories = [];
    let reportedCategories = [];
    let acceptedServices = {};
    let reportedServices = {};
    let record = {};
    let started = false;
    let stored = '';
    let told = 0;
    let freed = 0;
    let cleared = 0;
    let parked = [];

    const option = (name, fallback) => {
        const value = config[name];
        return value === undefined ? fallback : value;
    };

    /**************************************************************************/

    // Their own uuid, built in the browser the same way.
    const mintId = ( ) => {
        try {
            return String([ 1e7 ] + -1e3 + -4e3 + -8e3 + -1e11).replace(
                /[018]/g,
                digit => (
                    digit ^ w.crypto.getRandomValues(new Uint8Array(1))[0] &
                        15 >> digit / 4
                ).toString(16)
            );
        } catch ( ex ) {
        }
        // No crypto is not a reason to write a record their reader throws
        // away: their gate only asks for a string.
        let out = '';
        for ( let i = 0; i < 32; i += 1 ) {
            out += Math.floor(Math.random() * 16).toString(16);
        }
        return out.slice(0, 8) + '-' + out.slice(8, 12) + '-' +
            out.slice(12, 16) + '-' + out.slice(16, 20) + '-' + out.slice(20);
    };

    // Their own reader: the cookie is URL-encoded JSON, localStorage is not.
    const readRecord = ( ) => {
        const name = cookieConfig.name;
        if ( cookieConfig.useLocalStorage === true ) {
            try {
                const raw = w.localStorage.getItem(name);
                if ( raw !== null ) { return JSON.parse(raw) || {}; }
            } catch ( ex ) {
            }
            return {};
        }
        try {
            const match = String(doc.cookie || '').match(
                '(^|;)\\s*' + name + '\\s*=\\s*([^;]+)'
            );
            if ( match === null ) { return {}; }
            return JSON.parse(decodeURIComponent(match.pop())) || {};
        } catch ( ex ) {
        }
        return {};
    };

    // Their own writer, attribute for attribute.
    const writeRecord = ( ) => {
        const days = Number(cookieConfig.expiresAfterDays);
        const ms = (isFinite(days) ? days : 182) * 864e5;
        const until = new Date();
        until.setTime(until.getTime() + ms);
        record.expirationTime = until.getTime();
        const json = JSON.stringify(record);
        if ( cookieConfig.useLocalStorage === true ) {
            try {
                w.localStorage.setItem(cookieConfig.name, json);
                return 'localStorage';
            } catch ( ex ) {
            }
            return '';
        }
        let out = cookieConfig.name + '=' + encodeURIComponent(json);
        if ( ms !== 0 ) { out += '; expires=' + until.toUTCString(); }
        out += '; Path=' + cookieConfig.path;
        out += '; SameSite=' + cookieConfig.sameSite;
        try {
            if ( String(w.location.hostname).indexOf('.') !== -1 ) {
                out += '; Domain=' + cookieConfig.domain;
            }
            if ( cookieConfig.secure && w.location.protocol === 'https:' ) {
                out += '; Secure';
            }
        } catch ( ex ) {
        }
        try {
            doc.cookie = out;
            return 'cookie';
        } catch ( ex ) {
        }
        return '';
    };

    // Their own eraser: host-only, the configured domain dot-prefixed, and
    // for a www host the bare domain as well.
    const eraseCookies = (names, path, domain) => {
        if ( Array.isArray(names) === false || names.length === 0 ) { return; }
        const useDomain = domain || cookieConfig.domain;
        const usePath = path || cookieConfig.path;
        const isWww = String(useDomain).slice(0, 4) === 'www.';
        const bare = isWww ? String(useDomain).substring(4) : '';
        const erase = (name, host) => {
            let on = host;
            if ( on && String(on).slice(0, 1) !== '.' ) { on = '.' + on; }
            try {
                doc.cookie = name + '=; path=' + usePath +
                    (on ? '; domain=' + on : '') +
                    '; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
                cleared += 1;
            } catch ( ex ) {
            }
        };
        for ( const name of names ) {
            erase(name, domain);
            if ( !domain ) { erase(name, useDomain); }
            if ( isWww ) { erase(name, bare); }
        }
    };

    /**************************************************************************/

    // Their own acceptType: all where every category is in, necessary where
    // only the read-only ones are, custom otherwise.
    const acceptType = list => {
        if ( list.length === categoryIds.length ) { return 'all'; }
        if ( list.length === readOnlyIds.length ) { return 'necessary'; }
        return 'custom';
    };

    const rejectedOf = list =>
        categoryIds.filter(id => list.indexOf(id) === -1);

    const servicesFor = list => {
        const out = {};
        for ( const id of categoryIds ) {
            out[id] = list.indexOf(id) !== -1
                ? (servicesByCategory[id] || []).slice()
                : [];
        }
        return out;
    };

    const rejectedServicesFor = list => {
        const out = {};
        for ( const id of categoryIds ) {
            const all = servicesByCategory[id] || [];
            const on = list.indexOf(id) !== -1 ? all : [];
            out[id] = all.filter(name => on.indexOf(name) === -1);
        }
        return out;
    };

    /**************************************************************************/

    // Their own script manager, by their own markers and in their own order.
    const collectParked = ( ) => {
        if ( option('manageScriptTags', DEFAULTS.manageScriptTags) === false ) {
            return;
        }
        let nodes = [];
        try {
            nodes = Array.from(doc.querySelectorAll('script[data-category]'));
        } catch ( ex ) {
            return;
        }
        for ( const node of nodes ) {
            let category = String(node.getAttribute('data-category') || '');
            let service = String(node.dataset.service || '');
            let inverted = false;
            if ( category !== '' && category.charAt(0) === '!' ) {
                category = category.slice(1);
                inverted = true;
            }
            if ( service.charAt(0) === '!' ) {
                service = service.slice(1);
                inverted = true;
            }
            if ( categoryIds.indexOf(category) === -1 ) { continue; }
            parked.push({
                node: node,
                done: false,
                inverted: inverted,
                category: category,
                service: service,
            });
        }
    };

    const runParked = ( ) => {
        if ( option('manageScriptTags', DEFAULTS.manageScriptTags) === false ) {
            return;
        }
        const on = reportedCategories;
        const next = index => {
            if ( index >= parked.length ) { return; }
            const entry = parked[index];
            if ( entry.done ) { next(index + 1); return; }
            const node = entry.node;
            const hasCategory = on.indexOf(entry.category) !== -1;
            const hasService = entry.service !== '' &&
                (reportedServices[entry.category] || [])
                    .indexOf(entry.service) !== -1;
            // Their own four cases, including the inverted ones.
            const wanted = entry.service === ''
                ? (entry.inverted ? hasCategory === false : hasCategory)
                : (entry.inverted ? hasService === false : hasService);
            if ( wanted === false ) { next(index + 1); return; }
            entry.done = true;
            let chained = false;
            try {
                const type = node.getAttribute('data-type');
                if ( type !== null ) {
                    node.removeAttribute('data-type');
                } else {
                    node.removeAttribute('type');
                }
                node.removeAttribute('data-category');
                const src = node.getAttribute('data-src');
                if ( src !== null ) { node.removeAttribute('data-src'); }
                const copy = doc.createElement('script');
                copy.textContent = node.innerHTML;
                for ( const attribute of Array.from(node.attributes) ) {
                    copy.setAttribute(attribute.name, attribute.value);
                }
                if ( type !== null ) { copy.type = type; }
                const url = src !== null ? src : node.src;
                if ( src !== null ) { copy.src = src; }
                chained = Boolean(url) && (
                    type === null ||
                    [ 'text/javascript', 'module' ].indexOf(type) !== -1
                );
                if ( chained ) {
                    copy.onload = copy.onerror = ( ) => { next(index + 1); };
                }
                node.replaceWith(copy);
                freed += 1;
            } catch ( ex ) {
                chained = false;
            }
            if ( chained === false ) { next(index + 1); }
        };
        next(0);
    };

    /**************************************************************************/

    // Their own auto-clear: the cookies a refused category names, and the
    // cookies a refused service names. Their reloadPage is not honoured -
    // see the header.
    const autoClear = ( ) => {
        if ( option('autoClearCookies', DEFAULTS.autoClearCookies) === false ) {
            return;
        }
        for ( const id of categoryIds ) {
            const category = categories[id];
            if ( category === null || typeof category !== 'object' ) {
                continue;
            }
            if ( category.readOnly === true ) { continue; }
            if ( acceptedCategories.indexOf(id) !== -1 ) { continue; }
            const clear = category.autoClear;
            if ( clear === null || typeof clear !== 'object' ) { continue; }
            const cookies = Array.isArray(clear.cookies) ? clear.cookies : [];
            for ( const entry of cookies ) {
                if ( entry === null || typeof entry !== 'object' ) { continue; }
                const name = entry.name;
                if ( typeof name === 'string' ) {
                    eraseCookies([ name ], entry.path, entry.domain);
                } else if ( name instanceof RegExp ) {
                    eraseCookies(matching(name), entry.path, entry.domain);
                }
            }
            const services = category.services;
            if ( services === null || typeof services !== 'object' ) {
                continue;
            }
            for ( const key of Object.keys(services) ) {
                const service = services[key];
                if ( service === null || typeof service !== 'object' ) {
                    continue;
                }
                const own = Array.isArray(service.cookies)
                    ? service.cookies
                    : [];
                for ( const entry of own ) {
                    if ( entry === null || typeof entry !== 'object' ) {
                        continue;
                    }
                    if ( typeof entry.name === 'string' ) {
                        eraseCookies([ entry.name ], entry.path, entry.domain);
                    } else if ( entry.name instanceof RegExp ) {
                        eraseCookies(
                            matching(entry.name), entry.path, entry.domain
                        );
                    }
                }
            }
        }
    };

    // Their own name matching, for an autoClear entry written as a regexp.
    const matching = expression => {
        const out = [];
        try {
            for ( const item of String(doc.cookie || '').split(';') ) {
                const name = item.split('=')[0].trim();
                if ( name !== '' && expression.test(name) ) { out.push(name); }
            }
        } catch ( ex ) {
        }
        return out;
    };

    /**************************************************************************/

    // Their own callback-and-event pair, with their own payloads.
    const fire = (name, detail) => {
        const callbacks = {
            'cc:onFirstConsent': config.onFirstConsent,
            'cc:onConsent': config.onConsent,
            'cc:onChange': config.onChange,
            'cc:onModalShow': config.onModalShow,
            'cc:onModalHide': config.onModalHide,
            'cc:onModalReady': config.onModalReady,
        };
        const callback = callbacks[name];
        if ( typeof callback === 'function' ) {
            try {
                callback(detail);
                told += 1;
            } catch ( ex ) {
            }
        }
        // Theirs is a bare dispatchEvent(new CustomEvent(...)), which is the
        // window's.
        try {
            w.dispatchEvent(new w.CustomEvent(name, { detail: detail }));
            told += 1;
        } catch ( ex ) {
        }
    };

    /**************************************************************************/

    const run = given => {
        // Their own guard, and their own flag: a second run does nothing.
        if ( w._ccRun === true ) { return; }
        w._ccRun = true;

        config = given !== null && typeof given === 'object' ? given : {};
        categories = config.categories !== null &&
            typeof config.categories === 'object'
            ? config.categories
            : {};
        categoryIds = Object.keys(categories);
        readOnlyIds = categoryIds.filter(id => {
            const entry = categories[id];
            return entry !== null && typeof entry === 'object' &&
                entry.readOnly === true;
        });
        servicesByCategory = {};
        for ( const id of categoryIds ) {
            const entry = categories[id];
            const services = entry !== null && typeof entry === 'object' &&
                entry.services !== null && typeof entry.services === 'object'
                ? entry.services
                : {};
            servicesByCategory[id] = Object.keys(services);
        }

        cookieConfig = Object.assign({}, COOKIE_DEFAULTS);
        // Theirs sets this before merging the page's own cookie options.
        try {
            cookieConfig.domain = w.location.hostname;
        } catch ( ex ) {
        }
        if ( config.cookie !== null && typeof config.cookie === 'object' ) {
            cookieConfig = Object.assign({}, cookieConfig, config.cookie);
        }

        // Theirs returns before doing anything where it thinks it is talking
        // to a crawler, so neither does this.
        if ( option('hideFromBots', DEFAULTS.hideFromBots) !== false ) {
            try {
                const agent = w.navigator.userAgent;
                if ( (agent && reBot.test(agent)) || w.navigator.webdriver ) {
                    started = true;
                    return;
                }
            } catch ( ex ) {
            }
        }

        acceptedCategories = accept ? categoryIds.slice() : readOnlyIds.slice();
        reportedCategories = reported ? categoryIds.slice() : acceptedCategories;
        acceptedServices = servicesFor(acceptedCategories);
        reportedServices = servicesFor(reportedCategories);

        const previous = readRecord();
        const heldId = typeof previous.consentId === 'string' &&
            previous.consentId !== ''
            ? previous.consentId
            : '';
        const now = new Date();
        record = {
            categories: acceptedCategories.slice(),
            revision: option('revision', DEFAULTS.revision),
            data: previous.data !== undefined ? previous.data : null,
            consentTimestamp: typeof previous.consentTimestamp === 'string'
                ? previous.consentTimestamp
                : now.toISOString(),
            consentId: heldId !== '' ? heldId : mintId(),
            services: servicesFor(acceptedCategories),
            languageCode: language(),
            lastConsentTimestamp: now.toISOString(),
        };

        collectParked();
        stored = writeRecord();
        autoClear();

        // Their own gate on what was already there, which is what decides
        // whether this is a first consent or a change:
        //
        //   e.V && _ && d !== t.revision && (e.j = !1)
        //   e.T = !(_ && e.j && e.C && e.S && f)
        //
        // a string consentId, a revision equal to the page's, both timestamps
        // and categories as an array.
        const held = typeof previous.consentId === 'string' &&
            previous.consentId !== '' &&
            previous.revision === record.revision &&
            typeof previous.consentTimestamp === 'string' &&
            typeof previous.lastConsentTimestamp === 'string' &&
            Array.isArray(previous.categories);

        const changedCategories = held
            ? difference(previous.categories, record.categories)
            : [];
        const changedServices = {};
        let serviceChanged = false;
        if ( held ) {
            const before = previous.services !== null &&
                typeof previous.services === 'object'
                ? previous.services
                : {};
            for ( const id of categoryIds ) {
                const was = Array.isArray(before[id]) ? before[id] : [];
                const now = record.services[id] || [];
                changedServices[id] = difference(was, now);
                if ( changedServices[id].length !== 0 ) { serviceChanged = true; }
            }
        }
        const changed = changedCategories.length !== 0 || serviceChanged;

        const detail = { cookie: clone(record) };
        if ( held === false ) {
            // Their first-consent path, measured against their own bundle:
            // onFirstConsent then onConsent, and onChange only where the
            // tenant is not in their default opt-in mode.
            fire(EVENTS.firstConsent, detail);
            fire(EVENTS.consent, detail);
            if ( option('mode', DEFAULTS.mode) !== DEFAULTS.mode ) {
                fire(EVENTS.change, {
                    cookie: clone(record),
                    changedCategories: changedCategories,
                    changedServices: changedServices,
                });
            }
        } else {
            // A visitor who had already answered. Theirs fires onConsent as
            // the page loads and onChange when the answer moves, which is
            // what overwriting a stored acceptance is - measured: onChange
            // carried changedCategories ["analytics"] and changedServices
            // {analytics:["ga4"]} where that acceptance was being undone.
            fire(EVENTS.consent, detail);
            if ( changed ) {
                fire(EVENTS.change, {
                    cookie: clone(record),
                    changedCategories: changedCategories,
                    changedServices: changedServices,
                });
            }
        }

        if ( activate ) { runParked(); }
        started = true;
        announce();
    };

    // Their own G(): what is in one list and not the other, both ways.
    const difference = (a, b) => {
        const left = Array.isArray(a) ? a : [];
        const right = Array.isArray(b) ? b : [];
        return left.filter(item => right.indexOf(item) === -1)
            .concat(right.filter(item => left.indexOf(item) === -1));
    };

    const clone = value => {
        try {
            return JSON.parse(JSON.stringify(value));
        } catch ( ex ) {
        }
        return value;
    };

    // Their own language pick, as far as the page can decide it: their
    // autoDetect takes the browser or the document, and their own fallback is
    // the configured default.
    const language = ( ) => {
        const given = config.language;
        if ( given === null || typeof given !== 'object' ) { return 'en'; }
        const detect = given.autoDetect;
        try {
            if ( detect === 'browser' ) {
                return String(w.navigator.language || 'en').slice(0, 2);
            }
            if ( detect === 'document' ) {
                const named = doc.documentElement.getAttribute('lang');
                if ( named ) { return String(named).slice(0, 2); }
            }
        } catch ( ex ) {
        }
        return typeof given.default === 'string' ? given.default : 'en';
    };

    /**************************************************************************/

    // Their api, method for method.
    const api = {
        run: run,
        // There is no banner and no preferences modal, so their show and hide
        // are no-ops rather than lies: nothing is built to show.
        show: ( ) => {},
        hide: ( ) => {},
        showPreferences: ( ) => {},
        hidePreferences: ( ) => {},
        acceptCategory: ( ) => {},
        acceptService: ( ) => {},
        acceptedCategory: id => reportedCategories.indexOf(String(id)) !== -1,
        acceptedService: (service, id) => {
            const list = reportedServices[String(id)];
            return Array.isArray(list) && list.indexOf(String(service)) !== -1;
        },
        validConsent: ( ) => started && stored !== '',
        validCookie: name => {
            try {
                const match = String(doc.cookie || '').match(
                    '(^|;)\\s*' + name + '\\s*=\\s*([^;]+)'
                );
                return match !== null && match.pop() !== '';
            } catch ( ex ) {
            }
            return false;
        },
        eraseCookies: (names, path, domain) => {
            const list = Array.isArray(names) ? names : [ names ];
            eraseCookies(list.map(String), path, domain);
        },
        getCookie: field => {
            const held = clone(record);
            return field === undefined ? held : held[field];
        },
        getConfig: field => {
            const all = Object.assign({}, DEFAULTS, config, {
                cookie: Object.assign({}, cookieConfig),
            });
            return field === undefined ? all : all[field];
        },
        getUserPreferences: ( ) => ({
            acceptType: acceptType(reportedCategories),
            acceptedCategories: reportedCategories.slice(),
            rejectedCategories: rejectedOf(reportedCategories),
            acceptedServices: clone(reportedServices),
            rejectedServices: rejectedServicesFor(reportedCategories),
        }),
        // Theirs appends a script to the head and resolves on load. A page
        // calling this is loading something of its own, by its own decision.
        loadScript: (src, attributes) => new Promise(resolve => {
            try {
                const already = doc.querySelector(
                    'script[src="' + String(src) + '"]'
                );
                if ( already !== null ) { return resolve(true); }
                const script = doc.createElement('script');
                if ( attributes !== null && typeof attributes === 'object' ) {
                    for ( const key of Object.keys(attributes) ) {
                        script.setAttribute(key, attributes[key]);
                    }
                }
                script.onload = ( ) => resolve(true);
                script.onerror = ( ) => {
                    script.remove();
                    resolve(false);
                };
                script.src = String(src);
                doc.head.appendChild(script);
            } catch ( ex ) {
                resolve(false);
            }
        }),
        // Their setCookieData writes the data field of their own record,
        // which is a page's to use. It is theirs, so it works.
        setCookieData: given => {
            if ( given === null || typeof given !== 'object' ) { return false; }
            const value = given.value;
            if ( given.mode === 'update' ) {
                const held = record.data;
                if ( held !== null && typeof held === 'object' &&
                    value !== null && typeof value === 'object' ) {
                    let changed = false;
                    for ( const key of Object.keys(value) ) {
                        if ( held[key] === value[key] ) { continue; }
                        held[key] = value[key];
                        changed = true;
                    }
                    if ( changed ) { stored = writeRecord(); }
                    return changed;
                }
                if ( held === value ) { return false; }
            }
            record.data = value;
            stored = writeRecord();
            return true;
        },
        setLanguage: async given => {
            record.languageCode = String(given || record.languageCode);
            stored = writeRecord();
            return true;
        },
        // Theirs erases the record, drops its listeners and lets a later run
        // start over. Nothing here holds listeners, and the flag is theirs.
        reset: erase => {
            if ( erase ) {
                if ( cookieConfig.useLocalStorage === true ) {
                    try {
                        w.localStorage.removeItem(cookieConfig.name);
                    } catch ( ex ) {
                    }
                } else {
                    eraseCookies(
                        [ cookieConfig.name ],
                        cookieConfig.path,
                        cookieConfig.domain
                    );
                }
            }
            started = false;
            stored = '';
            w._ccRun = false;
        },
    };

    /**************************************************************************/

    let said = false;
    const announce = ( ) => {
        if ( said ) { return; }
        said = true;
        if ( typeof console !== 'object' ) { return; }
        if ( typeof console.info !== 'function' ) { return; }
        console.info(
            '[consent-rr] ' + NAME + ' ' + VERSION +
            ' store=' + (stored === '' ? 'none' : stored) +
            ' name=' + cookieConfig.name +
            ' accepted=' + (acceptedCategories.length !== 0
                ? acceptedCategories.join(',')
                : 'none') +
            ' type=' + acceptType(acceptedCategories) +
            ' surface=' + acceptType(reportedCategories) +
            ' parked=' + parked.length +
            ' freed=' + freed +
            ' cleared=' + cleared +
            ' told=' + told +
            ' banner=none'
        );
    };

    // Their UMD puts the api on the global and nothing else happens until a
    // page calls run() - which is their own contract, so this waits for it
    // exactly as theirs does.
    try {
        w.CookieConsent = api;
    } catch ( ex ) {
    }

    try {
        Object.defineProperty(w, 'cookieConsentRR', {
            value: {
                name: NAME,
                version: VERSION,
                mode: mode,
                state: function() {
                    return {
                        started: started,
                        store: stored,
                        cookie: cookieConfig.name,
                        accepted: acceptedCategories.slice(),
                        reported: reportedCategories.slice(),
                        parked: parked.length,
                        freed: freed,
                        cleared: cleared,
                        told: told,
                    };
                },
            },
            configurable: true,
            enumerable: false,
            writable: true,
        });
    } catch ( ex ) {
    }
}
