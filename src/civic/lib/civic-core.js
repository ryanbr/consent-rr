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

    Stands in for Civic Cookie Control's cookieControl-9.x.min.js.

    The page drives this one: it loads the script and then calls
    CookieControl.load({...}) with its whole configuration inline - the
    categories, their onAccept and onRevoke callbacks, the cookie settings, and
    whether the IAB module is on. So everything this answers with is the site's
    own, and nothing has to be guessed at.

    Read off their file rather than from documentation:
      CookieControl           the object, with load, open, getCategoryConsent,
                              changeCategory, getCookie and the rest
      CookieControl cookie    URL-encoded JSON: necessaryCookies,
                              optionalCookies { <name>: "accepted"|"revoked" },
                              statement, consentDate, consentExpiry,
                              interactedWith, user
      category key            the name with () <> @ , ; : " ? = {} / \ [] and
                              whitespace stripped out - their _validCookieName
      interactedWith: true    what stops the banner being built at all
      consentCookieExpiry     90 days by default, path /, SameSite=Lax, and
                              scoped by trying the registered domain first
    Their own load only calls onAccept, and only for categories that are
    accepted; onRevoke fires when someone changes a category, not on load. So
    neither is called here: nothing is accepted, and nobody changed anything.

    A tag parked for a category carries data-cc-category and data-src, and is
    freed by copying data-src into src when that category is accepted. Nothing
    is accepted here, so parked tags stay parked.

*/

function consentRRCivic(installTcf, unblockAll) {
    const w = window;
    const doc = w.document;
    const VERSION = '@@VERSION@@';
    const NAME = unblockAll === true ? 'civic-reject-unblock' : 'civic-reject';

    const existing = w.CookieControl;
    if ( existing !== null && typeof existing === 'object' ) {
        if ( existing.consentRR !== undefined ) { return; }
    }

    // Categories to accept anyway, named by the filter that injected this.
    // uBlock Origin substitutes a scriptlet's arguments for these; where there
    // are none, and where the resource is served as a redirect - which takes no
    // arguments at all - they stay as they are, and a placeholder matches no
    // category name, so nothing is accepted.
    //
    // A site that withholds content behind a category needs this: refusing is
    // the whole point, but a page gating its videos on "embedded" shows a
    // placeholder until that category's onAccept has run.
    const named = [ '{{1}}', '{{2}}', '{{3}}' ];

    const CC_COOKIE = 'CookieControl';
    const TC_COOKIE = 'CookieControlTC';
    const ACCEPTED = 'accepted';
    const REVOKED = 'revoked';
    // Their own version string, for CookieControl.info().
    const PRODUCT_VERSION = '9.11.1';

    // Their defaultSettings, trimmed to what this answers with or acts on. The
    // rest of a site's configuration is carried through untouched.
    const DEFAULTS = {
        ccCookie: CC_COOKIE,
        consentCookieExpiry: 90,
        subDomains: true,
        sameSiteCookie: true,
        sameSiteValue: 'Lax',
        secureCookie: false,
        encodeCookie: false,
        mode: 'gdpr',
        iabCMP: false,
        setCookieControlTC: false,
        notifyOnce: false,
        initialState: 'open',
        necessaryCookies: [],
        optionalCookies: [],
    };

    let config = null;
    let record = null;

    // Their _validCookieName: the separators a cookie name may not carry.
    const validName = name =>
        String(name).replace(/[\s()<>@,;:"?={}\/\\\[\]]/g, '');

    const readCookie = name => {
        const pairs = String(doc.cookie).split(';');
        for ( const pair of pairs ) {
            const pos = pair.indexOf('=');
            if ( pos === -1 ) { continue; }
            if ( pair.slice(0, pos).trim() !== validName(name) ) { continue; }
            return pair.slice(pos + 1).trim();
        }
        return null;
    };

    const allCookies = ( ) => {
        const out = {};
        for ( const pair of String(doc.cookie).split(';') ) {
            const pos = pair.indexOf('=');
            if ( pos === -1 ) { continue; }
            out[pair.slice(0, pos).trim()] = pair.slice(pos + 1).trim();
        }
        return out;
    };

    // Their saveCookie walks out from the registered domain until one sticks.
    // A page has no public suffix list, so probe for the broadest one accepted.
    let cookieDomain;

    const findCookieDomain = ( ) => {
        const host = String(w.location.hostname);
        if ( host === '' || /^[[\d.]/.test(host) ) { return ''; }
        const labels = host.split('.');
        const probe = 'consentRRProbe';
        for ( let i = labels.length - 2; i >= 0; i-- ) {
            const candidate = labels.slice(i).join('.');
            try {
                doc.cookie = probe + '=1; path=/; domain=' + candidate;
                if ( readCookie(probe) !== '1' ) { continue; }
                doc.cookie = probe + '=; path=/; max-age=0; domain=' + candidate;
                return candidate;
            } catch(ex) {
            }
        }
        return '';
    };

    const writeCookie = (name, value, days, encode) => {
        const key = validName(name);
        const text = encode === false ? String(value)
            : encodeURIComponent(String(value));
        const expires = new Date(Date.now() + days * 86400000);
        const settings = config || DEFAULTS;
        let attributes = '; path=/; expires=' + expires.toUTCString();
        if ( settings.sameSiteCookie !== false ) {
            attributes += '; SameSite=' + (settings.sameSiteValue || 'Lax');
        }
        if ( settings.secureCookie === true ) {
            attributes += '; Secure';
        }
        if ( settings.subDomains !== false ) {
            if ( cookieDomain === undefined ) {
                try {
                    cookieDomain = findCookieDomain();
                } catch(ex) {
                    cookieDomain = '';
                }
            }
            if ( cookieDomain !== '' ) {
                try {
                    doc.cookie = key + '=; path=/; max-age=0';
                    doc.cookie = key + '=' + text + attributes +
                        '; domain=' + cookieDomain;
                    if ( readCookie(key) === text ) { return true; }
                } catch(ex) {
                }
            }
        }
        try {
            doc.cookie = key + '=' + text + attributes;
            return readCookie(key) === text;
        } catch(ex) {
        }
        return false;
    };

    // Their own generator, character for character.
    const uuid = ( ) => {
        const alphabet =
            '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
                .split('');
        const out = [];
        out[8] = out[13] = out[18] = out[23] = '-';
        out[14] = '4';
        for ( let i = 0; i < 36; i++ ) {
            if ( out[i] ) { continue; }
            const n = 0 | (16 * Math.random());
            out[i] = alphabet[i === 19 ? (3 & n) | 8 : n];
        }
        return out.join('');
    };

    const readRecord = ( ) => {
        const raw = readCookie(CC_COOKIE);
        if ( raw === null || raw === '' ) { return null; }
        try {
            return JSON.parse(decodeURIComponent(raw));
        } catch(ex) {
        }
        try {
            return JSON.parse(raw);
        } catch(ex) {
        }
        return null;
    };

    const merge = settings => {
        const out = {};
        for ( const key of Object.keys(DEFAULTS) ) { out[key] = DEFAULTS[key]; }
        if ( settings === null || typeof settings !== 'object' ) { return out; }
        for ( const key of Object.keys(settings) ) { out[key] = settings[key]; }
        if ( Array.isArray(out.optionalCookies) === false ) {
            out.optionalCookies = [];
        }
        if ( Array.isArray(out.necessaryCookies) === false ) {
            out.necessaryCookies = [];
        }
        return out;
    };

    // Their own matching is on the category's name. Accept a filter that names
    // it either as written or as the key it is stored under.
    const isNamed = name => {
        // The unblock resource frees the lot: a redirect carries no arguments,
        // so naming one category is not something it can be told.
        if ( unblockAll === true ) { return true; }
        const plain = String(name).toLowerCase();
        const key = validName(name).toLowerCase();
        for ( const entry of named ) {
            const wanted = entry.trim().toLowerCase();
            if ( wanted === '*' ) { return true; }
            if ( wanted === plain || wanted === key ) { return true; }
        }
        return false;
    };

    const categories = ( ) => {
        const out = [];
        for ( const entry of config.optionalCookies ) {
            if ( entry === null || typeof entry !== 'object' ) { continue; }
            if ( typeof entry.name !== 'string' || entry.name === '' ) {
                continue;
            }
            out.push(entry);
        }
        return out;
    };

    const buildRecord = ( ) => {
        const previous = readRecord();
        const expiry = typeof config.consentCookieExpiry === 'number'
            ? config.consentCookieExpiry
            : 90;
        const out = {
            necessaryCookies: config.necessaryCookies,
            optionalCookies: {},
            statement: {},
            consentDate: Date.now(),
            consentExpiry: expiry,
            // What keeps the banner from being built: their own finaliseSetup
            // only shows one when this is false.
            interactedWith: true,
            user: uuid(),
        };
        if ( previous !== null ) {
            if ( typeof previous.user === 'string' && previous.user !== '' ) {
                out.user = previous.user;
            }
            const when = parseInt(previous.consentDate, 10);
            if ( Number.isNaN(when) === false && when > 0 ) {
                out.consentDate = when;
            }
        }
        for ( const entry of categories() ) {
            out.optionalCookies[validName(entry.name)] =
                isNamed(entry.name) ? ACCEPTED : REVOKED;
        }
        // Their own shape: the statement is recorded as shown, so a site that
        // re-prompts on a new statement date does not re-prompt now.
        if ( config.statement !== null && typeof config.statement === 'object' ) {
            if ( typeof config.statement.updated === 'string' ) {
                out.statement = {
                    shown: true,
                    updated: config.statement.updated,
                };
            }
        }
        if ( config.mode === 'ccpa' ) {
            const ccpa = config.ccpaConfig;
            if ( ccpa !== null && typeof ccpa === 'object' ) {
                if ( typeof ccpa.updated === 'string' ) {
                    out.ccpa = { shown: true, updated: ccpa.updated };
                }
            }
        }
        return out;
    };

    let tcString = '';

    const save = ( ) => {
        const expiry = typeof record.consentExpiry === 'number'
            ? record.consentExpiry
            : 90;
        return writeCookie(
            CC_COOKIE, JSON.stringify(record), expiry, true
        );
    };

    let stored = false;

    // Their _optionalCategoryAccept, both halves: the category's own callback,
    // then any tag parked for it, whose real url waits in data-src.
    const acceptCategory = entry => {
        if ( typeof entry.onAccept === 'function' ) {
            try {
                entry.onAccept();
            } catch(ex) {
            }
        }
        let parked;
        try {
            parked = doc.querySelectorAll(
                '[data-cc-category="' + entry.name + '"]'
            );
        } catch(ex) {
            return;
        }
        for ( const node of parked ) {
            const source = node.getAttribute('data-src');
            if ( source === null || source === '' ) { continue; }
            node.setAttribute('src', source);
        }
    };

    const load = settings => {
        config = merge(settings);
        record = buildRecord();
        // The IAB module is a paid option, and the page says whether it is on.
        // With it on their own record drops the categories and carries the TC
        // string instead, and window.__tcfapi goes in.
        if ( config.iabCMP === true && typeof installTcf === 'function' ) {
            const iab = installTcf(config);
            tcString = iab.tcString;
            delete record.optionalCookies;
            delete record.ccpa;
            record.iabConsent = tcString;
            if ( config.setCookieControlTC === true ) {
                writeCookie(TC_COOKIE, tcString, record.consentExpiry, true);
            }
        }
        // Before the record is saved, as theirs does it.
        for ( const entry of categories() ) {
            if ( isNamed(entry.name) === false ) { continue; }
            if ( record.optionalCookies === undefined ) { continue; }
            acceptCategory(entry);
        }
        stored = save();
        // Theirs calls onLoad a second after everything else has settled.
        if ( typeof config.onLoad === 'function' ) {
            w.setTimeout(( ) => {
                try {
                    config.onLoad();
                } catch(ex) {
                }
            }, 1000);
        }
        announce();
        return true;
    };

    const announce = ( ) => {
        if ( typeof console !== 'object' ) { return; }
        if ( typeof console.info !== 'function' ) { return; }
        const refused = [];
        const allowed = [];
        for ( const entry of categories() ) {
            if ( isNamed(entry.name) ) {
                allowed.push(entry.name);
                continue;
            }
            refused.push(entry.name);
        }
        console.info(
            '[consent-rr] ' + NAME + ' ' + VERSION +
            ' mode=' + config.mode +
            ' revoked=' + (refused.length !== 0 ? refused.join(',') : '(none)') +
            (allowed.length !== 0 ? ' accepted=' + allowed.join(',') : '') +
            ' iab=' + (config.iabCMP === true ? 'refused' : 'off') +
            ' cookie=' + (stored ? 'written' : 'refused')
        );
    };

    const categoryConsent = index => {
        if ( config === null ) { return null; }
        const list = categories();
        if ( typeof index !== 'number' ) { return null; }
        if ( list[index] === undefined ) { return null; }
        if ( record === null || record.optionalCookies === undefined ) {
            return null;
        }
        const key = validName(list[index].name);
        if ( record.optionalCookies[key] === undefined ) { return null; }
        return record.optionalCookies[key] === ACCEPTED;
    };

    const noopfn = function() {
    }.bind();

    const cookieControl = {
        geo: null,
        info: function() {
            return 'Cookie Control Version: ' + PRODUCT_VERSION;
        },
        config: function() {
            return config !== null ? config : merge(null);
        },
        load,
        update: function(settings) {
            if ( config === null ) { return false; }
            config = merge(Object.assign({}, config, settings));
            record = buildRecord();
            if ( config.iabCMP === true && tcString !== '' ) {
                delete record.optionalCookies;
                delete record.ccpa;
                record.iabConsent = tcString;
            }
            stored = save();
            return true;
        },
        getAllCookies: allCookies,
        getCookie: readCookie,
        saveCookie: function(name, value, days, path, encode) {
            const expiry = typeof days === 'number' ? days : 90;
            return writeCookie(name, value, expiry, encode);
        },
        delete: function(name) {
            const key = validName(name);
            try {
                doc.cookie = key + '=; path=/; max-age=0';
                if ( cookieDomain !== undefined && cookieDomain !== '' ) {
                    doc.cookie = key +
                        '=; path=/; max-age=0; domain=' + cookieDomain;
                }
            } catch(ex) {
            }
            return readCookie(key) === null;
        },
        // Their own deleteAll removes every cookie outside the consented set.
        // That is the blocking half of this CMP, which uBlock Origin is doing
        // instead, and deleting a visitor's cookies is not this stub's to do.
        deleteAll: function() {
            return false;
        },
        getCategoryConsent: categoryConsent,
        // A decision is already recorded, and there is no interface to change
        // it in: theirs re-renders a panel that was never built.
        changeCategory: function() {
            return false;
        },
        toggleCategory: function() {
            return false;
        },
        open: noopfn,
        hide: noopfn,
        notify: noopfn,
        acceptAll: noopfn,
        rejectAll: noopfn,
        notifyAccept: noopfn,
        notifyReject: noopfn,
        notifyDismiss: noopfn,
        // Their geo comes back with the API key check, which is not made here.
        geoInfo: function() {
            return false;
        },
        geoTest: function(product, key, callback) {
            if ( typeof callback === 'function' ) { callback(false); }
            return false;
        },
        consentRR: {
            mode: unblockAll === true ? 'reject-unblock' : 'reject',
            version: VERSION,
        },
    };

    w.CookieControl = cookieControl;
}
