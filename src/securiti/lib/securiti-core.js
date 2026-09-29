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

    Stands in for Securiti's cookie-consent-sdk-loader.js, the bootstrapper: it
    asks app.securiti.ai where the visitor is, decides whether TCF applies, and
    then loads the SDK itself - 600kB of it - along with its CSS, its utils and
    the site's configuration. Replacing the loader means none of that is asked
    for.

    Read off the loader and the SDK rather than from documentation:
      the script tag        carries data-tenant-uuid and data-domain-uuid, and
                            is found by [data-domain-uuid] as their loader does
      the queued API        initCmp, setConsentBannerParams,
                            showConsentPreferencesPopup, overrideThemeMatching
                            and registerSrtiCookieSDKEvents are parked by the
                            loader before the SDK arrives
      window.SecuritiSDK    { registerEvent, onReady }, and the events are
                            onLoad, onReady, onConsentGiven and the rest
      __privaci_cookie_consents   the record: { consents, st, gcm, ts }
      __privaci_cookie_consent_uuid   the visitor id beside it
      consentTypeIdMap      their Google consent-mode keys, the standard seven

    The categories are the part no page can supply. They live in the tenant's
    configuration, fetched from their CDN by id, so a refusal cannot name them -
    and does not have to: every reader in their SDK asks whether a category id
    is set in the record's consents map, so a record whose map is empty refuses
    all of them, whatever they turn out to be called.

*/

function consentRRSecuriti() {
    const w = window;
    const doc = w.document;
    const VERSION = '@@VERSION@@';
    const NAME = 'securiti-reject';

    if ( w.SecuritiSDK !== null && typeof w.SecuritiSDK === 'object' ) {
        if ( w.SecuritiSDK.consentRR !== undefined ) { return; }
    }

    const CONSENTS = '__privaci_cookie_consents';
    const UUID = '__privaci_cookie_consent_uuid';
    // Their PRIVACI_COOKIES_LIST, minus the two above: the no-action marker is
    // what tells their SDK nobody has answered yet, so it is not written.
    const NO_ACTION = '__privaci_cookie_no_action';
    // Their consentTypeIdMap, in their order.
    const GCM_KEYS = [
        'ad_storage', 'ad_user_data', 'ad_personalization',
        'analytics_storage', 'functionality_storage',
        'personalization_storage', 'security_storage',
    ];

    const script = doc.querySelector('[data-domain-uuid]');

    const attribute = name => {
        if ( script === null ) { return ''; }
        try {
            const value = script.getAttribute(name);
            return typeof value === 'string' ? value : '';
        } catch(ex) {
        }
        return '';
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

    // Their own reader tries base64 before falling back to the raw value.
    const decode = value => {
        try {
            if ( /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value) ) {
                return atob(value);
            }
        } catch(ex) {
        }
        return value;
    };

    const readRecord = ( ) => {
        const raw = readCookie(CONSENTS);
        if ( typeof raw !== 'string' || raw === '' ) { return null; }
        try {
            return JSON.parse(decode(decodeURIComponent(raw)));
        } catch(ex) {
        }
        try {
            return JSON.parse(decode(raw));
        } catch(ex) {
        }
        return null;
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
            out += (i === 19 ? (digit & 3) | 8 : digit).toString(16);
        }
        return out;
    };

    const previous = readRecord();
    let visitor = readCookie(UUID);
    if ( typeof visitor !== 'string' || visitor === '' ) { visitor = uuid(); }

    // Everything denied, and security_storage granted as every consent manager
    // in here grants it.
    const gcm = {};
    for ( const key of GCM_KEYS ) {
        gcm[key] = key === 'security_storage' ? 'granted' : 'denied';
    }

    // Their own record shape. An empty consents map is the refusal: their
    // readers ask whether a category's id is set in it, and none is.
    const record = {
        consents: {},
        st: {},
        gcm,
        ts: Math.floor(Date.now() / 1000),
    };
    if ( previous !== null && typeof previous.ts === 'number' ) {
        record.ts = previous.ts;
    }

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

    const writeCookie = (name, value) => {
        if ( cookieDomain === undefined ) {
            try {
                cookieDomain = findCookieDomain();
            } catch(ex) {
                cookieDomain = '';
            }
        }
        const secure = w.location.protocol === 'https:' ? '; secure' : '';
        const attributes = '; path=/; max-age=31536000; samesite=lax' + secure;
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

    const stored = writeCookie(CONSENTS, JSON.stringify(record)) &&
        writeCookie(UUID, visitor);
    // Whatever said nobody had answered is no longer true.
    try {
        doc.cookie = NO_ACTION + '=; path=/; max-age=0';
    } catch(ex) {
    }

    // Their GCM push, which is gtag's own shape: the arguments object goes
    // into the data layer.
    const pushConsentMode = ( ) => {
        try {
            if ( Array.isArray(w.dataLayer) === false ) { w.dataLayer = []; }
            const layer = w.dataLayer;
            (function() {
                layer.push(arguments);
            })('consent', 'update', gcm);
        } catch(ex) {
        }
    };
    pushConsentMode();

    // What their SDK hands to an onConsentGiven listener: a category map, and
    // the Google one. The names are the tenant's, so none can be listed.
    const consentDetail = ( ) => ({
        category: {},
        gcm,
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

    const callSafely = (fn, args) => {
        try {
            fn.apply(null, args);
        } catch(ex) {
            if ( typeof console === 'object' ) {
                console.error('Error in SDK callback', ex);
            }
        }
    };

    const sdk = {
        registerEvent: function(name, callback) {
            if ( typeof callback !== 'function' ) { return; }
            listenersFor(name).push(callback);
            // The three that describe a decision already made are answered on
            // registration, because theirs fires them once the SDK is ready
            // and this is ready as soon as it exists.
            if ( name === 'onLoad' || name === 'onReady' ) {
                callSafely(callback, [ sdk ]);
                return;
            }
            if ( name === 'onConsentGiven' ) {
                callSafely(callback, [ sdk, consentDetail() ]);
            }
        },
        onReady: function(callback) {
            if ( typeof callback !== 'function' ) {
                if ( typeof console === 'object' ) {
                    console.error('Callback should be a function');
                }
                return;
            }
            callSafely(callback, [ sdk ]);
        },
        consentRR: {
            mode: 'reject',
            version: VERSION,
        },
    };

    const noopfn = function() {
    }.bind();

    w.SecuritiSDK = sdk;
    w.__ScrtSdkApiOps = {
        events: {},
        processDataLayer: noopfn,
        ns: {
            showBanner: null,
            banner: null,
            allowSingleUpload: false,
            basicOptions: null,
        },
    };

    // The five their loader parks for the SDK to drain. There is no banner to
    // show, no theme to match and no parameters to set.
    w.initCmp = noopfn;
    w.setConsentBannerParams = noopfn;
    w.showConsentPreferencesPopup = noopfn;
    w.overrideThemeMatching = noopfn;
    w.registerSrtiCookieSDKEvents = function(name, callback) {
        sdk.registerEvent(name, callback);
    };

    // What their loader sets from the location call it makes. No call is made,
    // and no location is claimed: TCF applies where a tenant says so, and that
    // answer is not in the page.
    w.__isTcfEnabledForLocation = false;
    w.loadConfigFile = function(value) {
        return value;
    };

    w.getterUtils = {
        getConsentCookies: function() {
            return Promise.resolve(consentDetail());
        },
        getCookieConsentStatus: function() {
            return Promise.resolve({ consents: {} });
        },
        getUserLocationAndLanguage: function() {
            return null;
        },
    };

    if ( typeof console === 'object' && typeof console.info === 'function' ) {
        console.info(
            '[consent-rr] ' + NAME + ' ' + VERSION +
            ' consents=none' +
            ' tenant=' + (attribute('data-tenant-uuid') !== '' ? 'read' : 'unknown') +
            ' gcm=denied' +
            ' cookie=' + (stored ? 'written' : 'refused')
        );
    }
}
