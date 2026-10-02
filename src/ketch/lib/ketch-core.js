/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see {http://www.gnu.org/licenses/}.

    Home: https://github.com/ryanbr/consent-rr

    Stands in for Ketch's boot.js, which is the loader: it inlines the
    property's own configuration and a country-to-jurisdiction table, puts
    their command queue on the page, and then fetches the SDK - 1.9MB of it -
    which goes on to fetch the config, a geo lookup and the vendor list.
    Replacing the loader means none of that is requested.

    Read off boot.js and that SDK rather than from documentation:

      window.semaphore         their command queue, with
                               window.ketch = function() { semaphore.push(arguments) }
                               and ["init", config] unshifted ahead of it.
                               Their SDK shifts that entry off, drains the
                               rest, then replaces semaphore.push with its own
                               router and sets semaphore.ketch and
                               semaphore.loaded. All of that is reproduced,
                               because page code waits on it.
      the router               push() takes a string or an array-like whose
                               first element is the command. Trailing function
                               arguments are the resolve and reject callbacks,
                               which is how ketch("getConsent", fn) works. Its
                               commands are getConfig, getFullConfig,
                               getConsent, getConsentNoCache, getSubscriptions,
                               getProfilePreferences, setProfilePreferences,
                               getEnvironment, getGeoIP, getIdentities,
                               getJurisdiction, getJurisdictionForRegion,
                               getRegionInfo, getIsDisplayed, setIdentities,
                               setUserAttributes, showConsent, showPreferences,
                               reinit, handleKeyboardEvent,
                               returnKeyboardControl, registerPlugin, on, off
                               and their deprecated on<Event> spellings. Note
                               showConsent and showPreferences rather than the
                               longer names their SDK object uses - and no emit
                               or once, which their router does not route.
      semaphore.ketch          their SDK instance rather than that router, so
                               the longer spellings belong there. One object
                               answers both here, carrying each set of names.
      the consent object       { purposes, vendors, googleVendors,
                               vendorConsents: { tcf, google } } - their own
                               retrieveConsent() answers exactly that shape
                               with everything empty when nothing is recorded
      _ketch_consent_v1_       the record third parties read, in localStorage
                               and in a cookie, base64 of JSON shaped
                               { <purpose code>: { status, canonicalPurposes } }
      their own writer         setPublicConsent() builds that map from the
                               property's purposes and returns without writing
                               anything when the map comes out empty

    The purpose codes are the part a replaced loader cannot know: they arrive
    in the config.json the SDK fetches. So the refusal is expressed where it
    does not need them - the API answers nothing consented, and Google consent
    mode is denied - and the record is rewritten only where the visitor already
    has one, with every status flipped to denied and their canonical purposes
    kept. On a first visit nothing is written, which is their own behaviour for
    an empty map rather than a shortcut taken here.

*/

function consentRRKetch(unblockAll) {
    const w = window;
    const doc = w.document;
    const VERSION = '@@VERSION@@';
    const NAME = 'ketch-reject';

    if ( w.semaphore !== undefined && w.semaphore !== null ) {
        if ( w.semaphore.consentRR !== undefined ) { return; }
    }

    const KEY = '_ketch_consent_v1_';
    const TTL = 604800;             // their cookie store's default, seven days

    const readCookie = name => {
        const pairs = String(doc.cookie).split(';');
        for ( const pair of pairs ) {
            const pos = pair.indexOf('=');
            if ( pos === -1 ) { continue; }
            if ( pair.slice(0, pos).trim() !== name ) { continue; }
            return pair.slice(pos + 1).trim();
        }
        return undefined;
    };

    let cookieDomain;
    const findCookieDomain = ( ) => {
        const host = w.location.hostname;
        if ( /^[0-9.]+$/.test(host) || host.indexOf('.') === -1 ) { return ''; }
        const parts = host.split('.');
        const probe = 'consentrr' + Math.floor(Math.random() * 1e6);
        for ( let i = parts.length - 2; i >= 0; i-- ) {
            const candidate = parts.slice(i).join('.');
            try {
                doc.cookie = probe + '=1; path=/; domain=' + candidate;
                if ( readCookie(probe) === undefined ) { continue; }
                doc.cookie = probe + '=; path=/; max-age=0; domain=' + candidate;
                return candidate;
            } catch(ex) {
            }
        }
        return '';
    };

    const writeCookie = (name, value) => {
        if ( cookieDomain === undefined ) {
            try {
                cookieDomain = findCookieDomain();
            } catch(ex) {
                cookieDomain = '';
            }
        }
        const secure = w.location.protocol === 'https:' ? '; secure' : '';
        const attributes = '; path=/; max-age=' + TTL + '; samesite=lax' + secure;
        try {
            if ( cookieDomain !== '' ) {
                doc.cookie = name + '=' + value + attributes +
                    '; domain=' + cookieDomain;
                if ( readCookie(name) === value ) { return true; }
            }
            doc.cookie = name + '=' + value + attributes;
            return readCookie(name) === value;
        } catch(ex) {
        }
        return false;
    };

    // Their record is base64 of JSON, in both places they keep it.
    const readRecord = ( ) => {
        const sources = [];
        try {
            const stored = w.localStorage.getItem(KEY);
            if ( typeof stored === 'string' && stored !== '' ) {
                sources.push(stored);
            }
        } catch(ex) {
        }
        const cookie = readCookie(KEY);
        if ( typeof cookie === 'string' && cookie !== '' ) {
            sources.push(decodeURIComponent(cookie));
        }
        for ( const source of sources ) {
            try {
                const parsed = JSON.parse(atob(source));
                if ( parsed !== null && typeof parsed === 'object' ) {
                    return parsed;
                }
            } catch(ex) {
            }
        }
        return null;
    };

    // Every code the visitor already has, denied, with their canonical
    // purposes kept - those come from the config this never fetches, so a
    // record already carrying them is the only place to learn them.
    const previous = readRecord();
    const denied = {};
    const codes = [];
    if ( previous !== null ) {
        for ( const code of Object.keys(previous) ) {
            const entry = previous[code];
            const next = { status: 'denied' };
            if ( entry !== null && typeof entry === 'object' ) {
                if ( Array.isArray(entry.canonicalPurposes) ) {
                    next.canonicalPurposes = entry.canonicalPurposes.slice();
                }
            }
            denied[code] = next;
            codes.push(code);
        }
    }

    // Their setPublicConsent returns without writing when the map is empty,
    // so this does too rather than inventing a record with no codes in it.
    const store = ( ) => {
        if ( codes.length === 0 ) { return 'nocodes'; }
        let encoded;
        try {
            encoded = btoa(JSON.stringify(denied));
        } catch(ex) {
            return 'refused';
        }
        let wrote = false;
        try {
            w.localStorage.setItem(KEY, encoded);
            wrote = w.localStorage.getItem(KEY) === encoded;
        } catch(ex) {
        }
        if ( writeCookie(KEY, encoded) ) { wrote = true; }
        return wrote ? 'revoked' : 'refused';
    };

    const stored = store();

    // The shape their own retrieveConsent() answers with nothing recorded,
    // plus the codes this knows about, all refused. This is what goes into
    // the record and the data layer in either mode: what is stored and what
    // is sent says no.
    const purposes = ( ) => {
        const out = {};
        for ( const code of codes ) { out[code] = false; }
        return out;
    };

    // The unblock mode answers the page differently, and only the page: every
    // purpose reads as consented, including the ones this cannot know the
    // names of. A site gating content on one of them - realtruck reads
    // consent.purposes.optional - lets it through, while the record and the
    // consent-mode signal still refuse.
    //
    // The keys cannot be enumerated in advance, so this answers by key rather
    // than by list. The handful of names that are not purposes are left to
    // the object underneath, because a truthy "then" would make an awaited
    // answer hang and a truthy "toJSON" would break stringifying it.
    const NOT_PURPOSES = [
        'then', 'catch', 'finally', 'toJSON', 'toString', 'valueOf',
        'constructor', 'hasOwnProperty', 'isPrototypeOf',
        'propertyIsEnumerable', 'toLocaleString', 'length', 'inspect',
        // Not a purpose either, and answering a consent value to it would
        // hand back a boolean where a prototype belongs.
        '__proto__', 'prototype',
    ];

    const isPurposeKey = property => typeof property === 'string' &&
        NOT_PURPOSES.indexOf(property) === -1;

    const permissive = ( ) => {
        const base = {};
        for ( const code of codes ) { base[code] = true; }
        if ( typeof Proxy !== 'function' ) { return base; }
        try {
            return new Proxy(base, {
                get(target, property) {
                    if ( isPurposeKey(property) === false ) {
                        return target[property];
                    }
                    // A code asked for is a code this now knows about, so a
                    // site that reads one and then iterates - or spreads, or
                    // stringifies - sees it there rather than an empty map.
                    target[property] = true;
                    return true;
                },
                // Mirrors get rather than answering true to everything: a
                // caller testing for Symbol.iterator and being told yes would
                // take an iterate path that then throws.
                has(target, property) {
                    if ( isPurposeKey(property) === false ) {
                        return property in target;
                    }
                    target[property] = true;
                    return true;
                },
            });
        } catch(ex) {
        }
        return base;
    };

    const reported = ( ) => (unblockAll === true ? permissive() : purposes());

    const consent = ( ) => ({
        purposes: reported(),
        vendors: [],
        googleVendors: [],
        vendorConsents: { tcf: {}, google: {} },
    });

    // Their Google consent mode: everything denied, redaction on, and the two
    // data-layer events their googletag plugin pushes beside it.
    const GCM = {
        ad_storage: 'denied',
        ad_personalization: 'denied',
        ad_user_data: 'denied',
        analytics_storage: 'denied',
        personalization_storage: 'denied',
        functionality_storage: 'denied',
        security_storage: 'granted',
    };

    const pushGcm = ( ) => {
        try {
            if ( Array.isArray(w.dataLayer) === false ) { w.dataLayer = []; }
            const layer = w.dataLayer;
            if ( typeof w.gtag !== 'function' ) {
                w.gtag = function() {
                    layer.push(arguments);
                };
            }
            w.gtag('consent', 'update', GCM);
            w.gtag('set', 'ads_data_redaction', true);
            const permits = purposes();
            const ketchEvent = { event: 'ketchPermitChanged' };
            const switchbitEvent = { event: 'switchbitPermitChanged' };
            for ( const code of Object.keys(permits) ) {
                // Theirs skips the dotted codes.
                if ( code.indexOf('.') !== -1 ) { continue; }
                ketchEvent[code] = permits[code];
                switchbitEvent[code] = permits[code];
            }
            layer.push(ketchEvent);
            layer.push(switchbitEvent);
            return 'denied';
        } catch(ex) {
        }
        return 'refused';
    };

    const pushed = pushGcm();

    const listeners = new Map();
    // Their consent event fires once, after the queue has been drained. A
    // listener that was already queued hears it then; one registered
    // afterwards has missed it and is answered on the spot instead. Doing both
    // to the same listener would call it twice, which theirs never does.
    let announced = false;
    const emit = (name, value) => {
        const callbacks = listeners.get(name);
        if ( Array.isArray(callbacks) === false ) { return; }
        for ( const callback of callbacks.slice() ) {
            try {
                callback(value);
            } catch(ex) {
            }
        }
    };

    // A primitive can be handed out as often as asked. An object cannot: a
    // page that mutates what it was given would be mutating the answer every
    // later caller gets, and the mutation it would most likely make is
    // granting itself something. Theirs builds a fresh one per call, so this
    // does too.
    const resolved = value => ( ) => Promise.resolve(value);
    const fresh = make => ( ) => Promise.resolve(make());
    const empty = ( ) => ({});
    const config = ( ) => ({ purposes: [] });

    // Their router's commands, answering a refusal. The ones that would show
    // an experience or record a decision resolve without doing either.
    const commands = {
        getConsent: fresh(consent),
        getConsentNoCache: fresh(consent),
        getConfig: fresh(config),
        getFullConfig: fresh(config),
        getEnvironment: fresh(( ) => ({ code: 'production' })),
        getGeoIP: fresh(empty),
        getIdentities: fresh(empty),
        getJurisdiction: fresh(( ) => ({ code: '' })),
        getJurisdictionForRegion: fresh(( ) => ({ code: '' })),
        getRegionInfo: resolved(''),
        getSubscriptions: fresh(empty),
        getProfilePreferences: fresh(empty),
        setProfilePreferences: resolved(undefined),
        getIsDisplayed: resolved(false),
        setConsent: fresh(consent),
        // Their router's names.
        showConsent: resolved(undefined),
        showPreferences: resolved(undefined),
        // Routed too, and what a site calls to open their banner - realtruck
        // does. An earlier reading of their router missed it because its body
        // is not one of the one-line delegations the others are.
        showExperience: resolved(undefined),
        setIdentities: resolved(undefined),
        setUserAttributes: resolved(undefined),
        reinit: resolved(undefined),
        registerPlugin: resolved(undefined),
        handleKeyboardEvent: resolved(undefined),
        returnKeyboardControl: resolved(undefined),
        // And the spellings their SDK object carries, which is what
        // semaphore.ketch is in their world.
        showConsentExperience: resolved(undefined),
        showPreferenceExperience: resolved(undefined),
        on: (name, callback) => {
            if ( typeof callback === 'function' ) {
                if ( listeners.has(name) === false ) { listeners.set(name, []); }
                listeners.get(name).push(callback);
                // The consent event has already happened by the time this
                // runs, so a listener arriving later is answered at once.
                if ( name === 'consent' && announced ) {
                    try {
                        callback(consent());
                    } catch(ex) {
                    }
                }
            }
            return Promise.resolve();
        },
        // once is deliberately absent: their router does not route it, and a
        // page written against their SDK never calls it.
        off: (name, callback) => {
            const callbacks = listeners.get(name);
            if ( Array.isArray(callbacks) ) {
                const at = callbacks.indexOf(callback);
                if ( at !== -1 ) { callbacks.splice(at, 1); }
            }
            return Promise.resolve();
        },
        // Their deprecated spellings, which their own router still answers.
        onConsent: callback => commands.on('consent', callback),
        onEnvironment: callback => commands.on('environment', callback),
        onJurisdiction: callback => commands.on('jurisdiction', callback),
        onIdentities: callback => commands.on('identities', callback),
        onRegionInfo: callback => commands.on('regionInfo', callback),
    };

    // Their push(): a string, or an array-like whose head is the command, with
    // trailing functions taken as resolve and reject.
    const route = entry => {
        if ( entry === undefined || entry === null ) { return; }
        let name;
        let args;
        if ( typeof entry === 'string' ) {
            name = entry;
            args = [];
        } else {
            args = Array.from(entry);
            name = args.shift();
        }
        const command = commands[name];
        if ( typeof command !== 'function' ) { return; }
        let reject;
        let resolve;
        if ( args.length > command.length ) {
            const last = args[args.length - 1];
            const second = args.length > 1 ? args[args.length - 2] : undefined;
            if ( typeof last === 'function' && typeof second === 'function' &&
                args.length === command.length + 2 ) {
                reject = args.pop();
                resolve = args.pop();
            } else if ( typeof last === 'function' ) {
                resolve = args.pop();
            }
        }
        let outcome;
        try {
            outcome = command.apply(null, args);
        } catch(ex) {
            if ( typeof reject === 'function' ) {
                try {
                    reject(ex);
                } catch(inner) {
                }
            }
            return;
        }
        if ( outcome === null || typeof outcome.then !== 'function' ) { return; }
        outcome.then(value => {
            if ( typeof resolve === 'function' ) { resolve(value); }
        }).catch(error => {
            if ( typeof reject === 'function' ) { reject(error); }
        });
    };

    const queue = Array.isArray(w.semaphore) ? w.semaphore : [];
    // Their own init shifts its own entry off the front before draining.
    const pending = [];
    for ( const entry of queue ) {
        if ( Array.isArray(entry) && entry.length === 2 && entry[0] === 'init' ) {
            continue;
        }
        pending.push(entry);
    }

    let installed = false;
    try {
        queue.length = 0;
        queue.push = route;
        queue.ketch = commands;
        queue.loaded = true;
        queue.consentRR = VERSION;
        w.semaphore = queue;
        w.ketch = function() {
            route(arguments);
        };
        installed = w.semaphore.loaded === true;
    } catch(ex) {
    }

    // Whatever the page had queued before this arrived is answered now.
    let answered = 0;
    for ( const entry of pending ) {
        route(entry);
        answered += 1;
    }

    emit('consent', consent());
    announced = true;

    try {
        w.console.info(
            '[consent-rr] ' + NAME + ' ' + VERSION +
            ' purposes=' + (codes.length !== 0 ? codes.length + ' denied' : 'none known') +
            (unblockAll === true ? ' surface=granted stored=denied' : '') +
            ' record=' + stored +
            ' gcm=' + pushed +
            ' queue=' + (installed ? 'ready' : 'refused') +
            ' drained=' + answered
        );
    } catch(ex) {
    }
}
