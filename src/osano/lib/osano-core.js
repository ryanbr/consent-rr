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

    Stands in for Osano's osano.js, which is the whole CMP in one file.

    Read off that file rather than from documentation:
      window.Osano        a function of its own making - it installs
                          Osano = Osano || function(){ Osano.data.push(arguments) }
                          and Osano.data = Osano.data || [], so a page can call
                          it before the script lands. Setup drains that queue and
                          replaces its push, so later calls are handled live.
      Osano("onX", fn)    becomes addEventListener("osano-cm-x", fn); any other
                          first argument is a property set on Osano.cm.
      osano_consentmanager          JSON.stringify({ consent, consentTimestamp })
      osano_consentmanager_uuid     the consent id
      osano_consentmanager_expdate  cleared whenever consent is saved
    All three live in a cookie and in localStorage at once, scoped to the
    longest configured domain the hostname matches, path /, max-age 31536000.
    A real record is encrypted with that domain as the key, but their own
    reader tries JSON.parse first and only then decrypts - so the plain JSON
    written here is what osano.js itself would read back, if it ever loaded.

    The consent map is theirs too, and a refusal is their own default state:
    ESSENTIAL accepted, STORAGE, MARKETING, PERSONALIZATION and ANALYTICS
    denied. OPT_OUT follows Global Privacy Control, because that is the one
    input their code turns into an opt-out by itself.

*/

function consentRROsano(installUsp, installTcf, installGpp) {
    const w = window;
    const doc = w.document;
    const VERSION = '@@VERSION@@';
    const NAME = 'osano-reject';

    const existing = w.Osano;
    if ( typeof existing === 'function' && existing.consentRR !== undefined ) {
        return;
    }

    const KEY = 'osano_consentmanager';
    const UUID_KEY = KEY + '_uuid';
    const EXPIRY_KEY = KEY + '_expdate';
    // Their own maxConsentSeconds, a year.
    const MAX_AGE = 31536000;
    // The build this was read off. A page reading it wants a version, not this
    // resource's own.
    const CMP_VERSION = '2026.9.6';
    const ACCEPT = 'ACCEPT';
    const DENY = 'DENY';
    const OPT_OUT = 'OPT_OUT';
    const EVENTS = {
        INIT: 'osano-cm-initialized',
        CONSENT_SAVED: 'osano-cm-consent-saved',
    };

    const gpc = w.navigator.globalPrivacyControl === true;

    // Their state's own default consent, which is a refusal already. OPT_OUT is
    // asserted only under Global Privacy Control: their selector returns ACCEPT
    // for it when the signal is on, and the stored value otherwise.
    const consent = {
        ESSENTIAL: ACCEPT,
        STORAGE: DENY,
        MARKETING: DENY,
        PERSONALIZATION: DENY,
        ANALYTICS: DENY,
        OPT_OUT: gpc ? ACCEPT : DENY,
    };

    const copyConsent = ( ) => {
        const out = {};
        for ( const name of Object.keys(consent) ) { out[name] = consent[name]; }
        return out;
    };

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

    const readLocal = name => {
        try {
            return w.localStorage.getItem(name);
        } catch(ex) {
        }
        return null;
    };

    // localStorage first, because that is where their own reader looks first:
    // the cookie is the mirror they sync across domains with.
    const readStored = name => {
        const fromLocal = readLocal(name);
        if ( fromLocal !== null && fromLocal !== '' ) { return fromLocal; }
        const fromCookie = readCookie(name);
        if ( fromCookie === undefined || fromCookie === '' ) { return undefined; }
        try {
            return decodeURIComponent(fromCookie);
        } catch(ex) {
        }
        return fromCookie;
    };

    // Their code scopes the cookie to a configured domain - the longest one the
    // hostname matches. A page carries no such list and no public suffix list,
    // so probe for the broadest domain the browser will accept, which is the
    // same registered domain that list names.
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

    const writeCookie = (name, value, maxAge) => {
        if ( cookieDomain === undefined ) {
            try {
                cookieDomain = findCookieDomain();
            } catch(ex) {
                cookieDomain = '';
            }
        }
        const secure = w.location.protocol === 'https:' ? '; secure' : '';
        const attributes = '; path=/; max-age=' + maxAge + secure;
        try {
            if ( cookieDomain !== '' ) {
                doc.cookie = name + '=; path=/; max-age=0';
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

    // Both halves, the way their own writer does it: localStorage first, then
    // the cookie.
    //
    // The cookie copy is percent-encoded, where theirs is not. Theirs holds an
    // encrypted record, which is safe to put in a header as it stands; this one
    // is the plain JSON their reader accepts, and a quote or a comma sent
    // unencoded in a Cookie header is what a strict server-side parser refuses -
    // taking the rest of the header with it. localStorage, which their reader
    // consults first, still carries it verbatim.
    const writeBoth = (name, value) => {
        try {
            w.localStorage.setItem(name, value);
        } catch(ex) {
        }
        return writeCookie(name, encodeURIComponent(value), MAX_AGE);
    };

    const removeBoth = name => {
        try {
            w.localStorage.removeItem(name);
        } catch(ex) {
        }
        writeCookie(name, '', 0);
    };

    const uuid = ( ) => {
        try {
            if ( typeof w.crypto.randomUUID === 'function' ) {
                return w.crypto.randomUUID();
            }
        } catch(ex) {
        }
        let out = '';
        for ( let i = 0; i < 36; i++ ) {
            if ( i === 8 || i === 13 || i === 18 || i === 23 ) {
                out += '-';
                continue;
            }
            if ( i === 14 ) { out += '4'; continue; }
            const digit = Math.floor(Math.random() * 16);
            const value = i === 19 ? (digit & 3) | 8 : digit;
            out += value.toString(16);
        }
        return out;
    };

    // A record already stored keeps its id and its timestamp, so a site does not
    // see a decision made afresh on every page load. One written by the real
    // script is encrypted and will not parse, which leaves it replaced.
    let consentTimestamp = Date.now();
    let consentId = uuid();
    const stored = readStored(KEY);
    if ( typeof stored === 'string' ) {
        try {
            const record = JSON.parse(decodeURIComponent(stored));
            const when = parseInt(record && record.consentTimestamp, 10);
            if ( Number.isNaN(when) === false && when > 0 ) {
                consentTimestamp = when;
            }
        } catch(ex) {
        }
    }
    const storedId = readStored(UUID_KEY);
    if ( typeof storedId === 'string' && storedId !== '' ) {
        consentId = storedId;
    }

    const record = JSON.stringify({
        consent: copyConsent(),
        consentTimestamp,
    });

    const listeners = new Map();

    const listenersFor = name => {
        let list = listeners.get(name);
        if ( list === undefined ) {
            list = [];
            listeners.set(name, list);
        }
        return list;
    };

    const callSafely = (fn, value) => {
        try {
            fn(value);
        } catch(ex) {
            if ( typeof console === 'object' ) {
                console.error('Osano CMP: error in event listener', ex);
            }
        }
    };

    // Theirs answers a late consent-saved listener on the next frame. Where
    // there is no frame loop to wait for, the next turn will do.
    const soon = fn => {
        if ( typeof w.requestAnimationFrame === 'function' ) {
            w.requestAnimationFrame(fn);
            return;
        }
        w.setTimeout(fn, 0);
    };

    const emit = (name, value) => {
        const list = listenersFor(name).slice();
        for ( const entry of list ) {
            if ( entry.once ) {
                const at = listenersFor(name).indexOf(entry);
                if ( at !== -1 ) { listenersFor(name).splice(at, 1); }
            }
            callSafely(entry.fn, value);
        }
    };

    let locale = String(doc.documentElement.lang || 'en').slice(0, 2);
    let userData = '';

    const cm = {
        addEventListener: function(name, fn) {
            if ( typeof fn !== 'function' ) { return; }
            switch ( name ) {
            case EVENTS.INIT:
                // Registered once and answered at once, as theirs is: the CMP
                // has already initialised by the time anything can ask.
                listenersFor(name).push({ fn, once: true });
                emit(name, copyConsent());
                break;
            case EVENTS.CONSENT_SAVED:
                // Theirs calls a listener on registration when a decision is
                // already stored, on the next frame rather than inline.
                listenersFor(name).push({ fn, once: false });
                soon(( ) => {
                    callSafely(fn, copyConsent());
                });
                break;
            default:
                // Everything else - the per-category events, the blocking and
                // ui ones - would fire on a consent this refusal never gives.
                listenersFor(name).push({ fn, once: false });
                break;
            }
        },
        removeEventListener: function(name, fn) {
            const list = listenersFor(name);
            for ( let i = list.length - 1; i >= 0; i-- ) {
                if ( list[i].fn !== fn ) { continue; }
                list.splice(i, 1);
            }
        },
        emit: function(name) {
            if ( name !== 'osano-cm-dom-info-dialog-open' ) { return; }
            cm.showDrawer();
        },
        getConsent: function() {
            return copyConsent();
        },
        // There is no interface to open: the decision is already made, and
        // nothing was rendered to show.
        showWidget: function() {},
        hideWidget: function() {},
        showOptOutWidget: function() {},
        hideOptOutWidget: function() {},
        showDialog: function() {},
        hideDialog: function() {},
        showDrawer: function() {},
        hideDrawer: function() {},
        showDoNotSell: function() {},
        hideDoNotSell: function() {},
        render: function() {},
        ready: function() {},
    };
    cm.on = cm.addEventListener;
    cm.off = cm.removeEventListener;

    const readOnly = (name, get) => {
        try {
            Object.defineProperty(cm, name, { get, enumerable: true });
        } catch(ex) {
        }
    };

    readOnly('analytics', ( ) => consent.ANALYTICS === ACCEPT);
    readOnly('marketing', ( ) => consent.MARKETING === ACCEPT);
    readOnly('personalization', ( ) => consent.PERSONALIZATION === ACCEPT);
    readOnly('optOut', ( ) => consent[OPT_OUT] === ACCEPT);
    readOnly('drawerOpen', ( ) => false);
    readOnly('dialogOpen', ( ) => false);
    readOnly('mode', ( ) => 'production');
    readOnly('consentModel', ( ) => 'explicit');
    readOnly('cmpVersion', ( ) => CMP_VERSION);
    readOnly('storage', ( ) => ({ getConsent: ( ) => copyConsent() }));
    // Tenant data this cannot know, left empty rather than invented: the
    // jurisdiction comes from a lookup, the rest from the tenant's own config.
    readOnly('jurisdiction', ( ) => '');
    readOnly('countryCode', ( ) => '');
    readOnly('cmpContentHash', ( ) => '');
    readOnly('publishTimestamp', ( ) => 0);
    readOnly('revision', ( ) => 0);
    // The protective answer where it cannot be known, and the one a refusal is
    // consistent with.
    readOnly('gdprApplies', ( ) => true);

    try {
        Object.defineProperty(cm, 'locale', {
            get: ( ) => locale,
            set: value => { locale = String(value); },
            enumerable: true,
        });
        Object.defineProperty(cm, 'userData', {
            get: ( ) => userData,
            set: value => { userData = String(value).slice(0, 128); },
            enumerable: true,
        });
    } catch(ex) {
    }

    // Their bootstrap, and then their queue handling: "onFooBar" becomes the
    // osano-cm-foo-bar listener, anything else sets a property on Osano.cm.
    const osano = typeof existing === 'function'
        ? existing
        : function() {
            osano.data.push(arguments);
        };
    if ( Array.isArray(osano.data) === false ) { osano.data = []; }
    osano.cm = cm;
    osano.consentRR = {
        mode: 'reject',
        version: VERSION,
        uuid: consentId,
    };
    w.Osano = osano;

    const handle = args => {
        const call = Array.prototype.slice.call(args);
        const name = call[0];
        const rest = call.slice(1);
        if ( typeof name !== 'string' ) { return; }
        if ( name.startsWith('on') ) {
            const event = 'osano-cm-' + name.slice(2)
                .replace(/([a-z])([A-Z])/g, '$1-$2')
                .toLowerCase();
            cm.addEventListener(event, rest[0]);
            return;
        }
        if ( rest.length !== 1 ) { return; }
        try {
            cm[name] = rest[0];
        } catch(ex) {
        }
    };

    const queued = osano.data.slice();
    osano.data.push = handle;
    osano.data.splice(0, osano.data.length);
    for ( const call of queued ) {
        if ( call === null || typeof call !== 'object' ) { continue; }
        handle(call);
    }

    // Google consent mode, which this tenant type has on: the category to
    // signal map is theirs, ESSENTIAL is always granted, and the rest follow
    // the decision. gtag is the page's own - theirs calls it without checking
    // and swallows the error, so a page without one loses the signal either way.
    //
    // "default" is the mode their own restore-from-storage path sends, which is
    // the path this stands in for, and they skip it where the page has already
    // sent one of its own. Pages do: the tenant this was read off pairs its own
    // default with wait_for_update, and a second default would be ignored
    // anyway - consent mode takes the first.
    const alreadyDefaulted = ( ) => {
        try {
            const layer = w.dataLayer || [];
            return Array.prototype.some.call(layer, entry =>
                entry && entry[0] === 'consent' && entry[1] === 'default'
            );
        } catch(ex) {
        }
        return false;
    };

    const pushConsentMode = ( ) => {
        try {
            w.dataLayer = Array.isArray(w.dataLayer) ? w.dataLayer : [];
            const marker = 'developer_id.dMzRlOT';
            const seen = w.dataLayer.some(entry => entry && entry[1] === marker);
            if ( seen === false ) { w.dataLayer.push([ 'set', marker, true ]); }
        } catch(ex) {
        }
        const signals = {
            security_storage: 'granted',
            functionality_storage: 'granted',
            analytics_storage: consent.ANALYTICS === ACCEPT ? 'granted' : 'denied',
            personalization_storage:
                consent.PERSONALIZATION === ACCEPT ? 'granted' : 'denied',
        };
        for ( const name of [ 'ad_storage', 'ad_user_data', 'ad_personalization' ] ) {
            signals[name] = consent.MARKETING === ACCEPT ? 'granted' : 'denied';
        }
        if ( alreadyDefaulted() ) { return; }
        try {
            w.gtag('consent', 'default', signals);
        } catch(ex) {
        }
    };
    pushConsentMode();

    // The IAB layers. A tenant with the module on gets a bundle that installs
    // __tcfapi, __gpp and __uspapi; one without gets __uspapi alone. Which it
    // is lives in the tenant's own configuration, which a page cannot be asked,
    // so all three go in - a vendor stalled on an API that never answers is the
    // worse failure, and refusing is the conservative direction to be wrong in.
    const usp = installUsp(gpc);
    const tcf = installTcf(gpc, locale);
    installGpp(tcf, usp);

    const written = writeBoth(KEY, record) && writeBoth(UUID_KEY, consentId);
    // Saving clears the expiry key, as theirs does.
    removeBoth(EXPIRY_KEY);

    if ( typeof console === 'object' && typeof console.info === 'function' ) {
        console.info(
            '[consent-rr] ' + NAME + ' ' + VERSION +
            ' consent=' + Object.keys(consent)
                .filter(name => consent[name] === ACCEPT)
                .join(',') +
            ' denied=' + Object.keys(consent)
                .filter(name => consent[name] !== ACCEPT)
                .join(',') +
            ' tcf=refused' +
            ' li=' + (tcf.keptLegitimateInterest ? 'kept' : 'objected') +
            ' gpp=refused' +
            ' usp=' + usp.uspString +
            ' cookie=' + (written ? 'written' : 'refused')
        );
    }
}
