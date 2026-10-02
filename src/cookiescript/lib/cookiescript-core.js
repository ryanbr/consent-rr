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

    Stands in for CookieScript's per-site bundle, cdn.cookie-script.com/s/
    <hash>.js, which is the whole CMP: the banner, the auto-blocker, the
    tenant's configuration and the loader for their IAB SDK.

    Read off that bundle rather than from documentation:

      CookieScriptConsent       their cookie, plain JSON, written by
                                a(name, value) one field at a time -
                                  { action, categories, consenttime, key }
                                with categories a JSON string of its own. A
                                reject-all writes action "reject" and
                                categories "[]", and consenttime only where
                                their configuration carries one.
      the categories            functionality, targeting, strict, performance
                                and unclassified, with strict the one that is
                                never refused
      90 days, host minus www   their expiry and their cookie domain,
                                window.location.host.replace(/^www\./, "")
      [data-cookiescript="accepted"]  what their auto-blocker parks, with the
                                real url in data-src and scripts typed
                                text/plain. Freeing one copies every attribute
                                onto a fresh element, sets the type back to
                                text/javascript and drops the marker.
      their category filter     an element is freed only when EVERY category
                                on it is allowed: they strip the allowed names
                                out of data-cookiecategory and skip it if
                                anything is left. So a tag marked
                                "strict targeting" stays parked.
      window.CookieScript       the instance, whose own method names are
                                currentState, expireDays, hash, show, hide,
                                showDetails, categories, acceptAllAction,
                                acceptAction, rejectAllAction, getCMPId and
                                the rest, with onAcceptAll, onAccept, onReject,
                                onClose and onChange as the callbacks
      cmpId 374                 their own, from getCMPId()
      CookieScriptConsentString the TC string, in localStorage. Their own text
                                says the TCF signal is only read when the
                                CookieScriptConsent cookie is there, which is
                                why this writes the cookie whatever happens
                                and the string only where a page shows sign of
                                TCF.
      navigator.doNotTrack      read, but only to report it to their collector
                                as &dnt= - never to decide anything. Nothing
                                is reported here.
      their reject-all path     Kt(): instance.onReject(), then the events
                                CookieScriptReject and
                                CookieScriptCurrentState carrying
                                currentState(), then the strict category freed
                                and CookieScriptConsentUpdated[strict] pushed.
                                CookieScriptAcceptAll is their accept-all
                                event and has no business firing here.

*/

function consentRRCookieScript() {
    const w = window;
    const doc = w.document;
    const VERSION = '@@VERSION@@';
    const NAME = 'cookiescript-reject';

    if ( w.CookieScript !== undefined && w.CookieScript !== null ) {
        if ( w.CookieScript.consentRR !== undefined ) { return; }
    }

    const COOKIE = 'CookieScriptConsent';
    const TC_KEY = 'CookieScriptConsentString';
    const DAYS = 90;
    const STRICT = 'strict';
    const CATEGORIES = [
        'functionality', 'targeting', 'strict', 'performance', 'unclassified',
    ];

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

    // Their own domain rule, which is the host with a leading www dropped.
    const cookieDomain = ( ) => {
        try {
            return w.location.host.replace(/^www\./, '');
        } catch(ex) {
        }
        return '';
    };

    // Their record, one field at a time as their a() builds it. Whatever was
    // already in it is kept: their key comes back from their collector, which
    // nothing here talks to.
    const record = ( ) => {
        let previous = {};
        try {
            const raw = readCookie(COOKIE);
            if ( typeof raw === 'string' && raw !== '' ) {
                const parsed = JSON.parse(decodeURIComponent(raw));
                if ( parsed !== null && typeof parsed === 'object' ) {
                    previous = parsed;
                }
            }
        } catch(ex) {
        }
        previous.action = 'reject';
        // Theirs is a JSON string inside the record, and a reject-all makes it
        // the empty list.
        previous.categories = JSON.stringify([]);
        return previous;
    };

    const store = ( ) => {
        const value = JSON.stringify(record()).replace(/=/g, '%3D');
        const domain = cookieDomain();
        const expires = new Date(Date.now() + DAYS * 86400000).toUTCString();
        const secure = w.location.protocol === 'https:' ? '; secure' : '';
        const attributes = '; path=/; expires=' + expires + '; samesite=lax' +
            secure;
        try {
            if ( domain !== '' ) {
                doc.cookie = COOKIE + '=' + value + attributes +
                    '; domain=' + domain;
                if ( readCookie(COOKIE) === value ) { return 'written'; }
            }
            doc.cookie = COOKIE + '=' + value + attributes;
            return readCookie(COOKIE) === value ? 'written' : 'refused';
        } catch(ex) {
        }
        return 'refused';
    };

    const stored = store();

    // Their freeing routine, kind by kind: a fresh element carrying every
    // attribute, the type back to text/javascript, the marker gone.
    const free = element => {
        try {
            const tag = element.tagName;
            if ( tag === 'SCRIPT' ) {
                const fresh = doc.createElement('script');
                fresh.innerHTML = element.innerHTML;
                for ( const attribute of Array.from(element.attributes) ) {
                    fresh.setAttribute(attribute.name, attribute.value);
                }
                fresh.setAttribute('type', 'text/javascript');
                fresh.removeAttribute('data-cookiescript');
                const src = element.getAttribute('data-src');
                if ( src ) {
                    fresh.setAttribute('src', src);
                    fresh.removeAttribute('data-src');
                }
                element.parentNode.replaceChild(fresh, element);
                return true;
            }
            const src = element.getAttribute('data-src');
            if ( src ) {
                element.setAttribute('src', src);
                element.removeAttribute('data-src');
            }
            const href = element.getAttribute('data-href');
            if ( href ) {
                element.setAttribute('href', href);
                element.removeAttribute('data-href');
            }
            element.removeAttribute('data-cookiescript');
            return true;
        } catch(ex) {
        }
        return false;
    };

    // Only where every category on the element is allowed, which is their own
    // test: they strip the allowed names and skip anything left over.
    const freeStrict = ( ) => {
        let freed = 0;
        try {
            const parked = doc.querySelectorAll('[data-cookiescript="accepted"]');
            for ( const element of Array.from(parked) ) {
                let categories = element.getAttribute('data-cookiecategory');
                if ( categories !== null && categories !== '' ) {
                    categories = categories.split(STRICT).join('').trim();
                    if ( categories !== '' ) { continue; }
                }
                if ( free(element) ) { freed += 1; }
            }
        } catch(ex) {
        }
        return freed;
    };

    const freed = freeStrict();

    // Their data-layer events, with the one category that survives a refusal.
    const pushEvents = ( ) => {
        try {
            if ( Array.isArray(w.dataLayer) === false ) { w.dataLayer = []; }
            w.dataLayer.push({ event: 'CookieScriptConsentUpdated[strict]' });
            if ( typeof w.gtag === 'function' ) {
                w.gtag('consent', 'update', {
                    ad_storage: 'denied',
                    ad_user_data: 'denied',
                    ad_personalization: 'denied',
                    analytics_storage: 'denied',
                    functionality_storage: 'denied',
                    personalization_storage: 'denied',
                    security_storage: 'granted',
                });
                w.dataLayer.push({ event: 'CookieScriptGoogleConsentUpdated' });
                return 'denied';
            }
            return 'nogtag';
        } catch(ex) {
        }
        return 'refused';
    };

    const pushed = pushEvents();

    const noop = ( ) => undefined;

    // Their instance, under their own method names. The ones that would show
    // the banner or record a decision do neither.
    const instance = {
        consentRR: VERSION,
        version: 0,
        currentState: ( ) => ({ action: 'reject', categories: [] }),
        expireDays: ( ) => DAYS,
        hash: ( ) => '',
        categories: ( ) => CATEGORIES.slice(),
        show: noop,
        hide: noop,
        showDetails: noop,
        showIABSpecificTab: noop,
        acceptAllAction: noop,
        acceptAction: noop,
        rejectAllAction: noop,
        getCMPId: ( ) => 374,
        getIABSdkUrl: ( ) => '',
        getIABVendorsIds: ( ) => [],
        getGoogleVendorsIds: ( ) => [],
        getIABLegIntPurposes: ( ) => [],
        getLanguagesKeys: ( ) => [],
        getCMPCookie: ( ) => {
            try {
                return w.localStorage.getItem(TC_KEY) || '';
            } catch(ex) {
            }
            return '';
        },
        setCMPCookie: noop,
        getGoogleACStringCookie: ( ) => '',
        setGoogleACStringCookie: noop,
        getCookieValueForQueryArg: ( ) => '',
        getGeoTargeting: ( ) => '',
        isCdn: ( ) => true,
        applyTranslation: noop,
        applyTranslationByCode: noop,
        applyCurrentCookiesState: noop,
        forceDispatchCSLoadEvent: noop,
        onAcceptAll: noop,
        onAccept: noop,
        onReject: noop,
        onClose: noop,
        onChange: noop,
        // Their own instance fields, which page code reads.
        dispatchEventNames: [],
        currentLang: null,
        iabCMP: null,
        tcString: undefined,
        googleAcString: undefined,
    };

    let installed = false;
    try {
        const previous = w.CookieScript;
        w.CookieScript = Object.assign(
            typeof previous === 'object' && previous !== null ? previous : {},
            { consentRR: VERSION, instance }
        );
        installed = w.CookieScript.instance === instance;
    } catch(ex) {
    }

    const fire = (name, detail) => {
        try {
            const event = detail === undefined
                ? new w.CustomEvent(name)
                : new w.CustomEvent(name, { detail });
            w.dispatchEvent(event);
        } catch(ex) {
        }
    };

    // Their load event, which goes out as soon as they are there.
    fire('CookieScriptLoaded');

    // The rest is their reject-all path, in their order - the callback the
    // page may have set, then the refusal, then the state. It waits a tick:
    // a page assigns CookieScript.instance.onReject in the script after
    // theirs, which has not run yet at this point.
    const announce = ( ) => {
        try {
            if ( typeof instance.onReject === 'function' ) {
                instance.onReject();
            }
        } catch(ex) {
        }
        fire('CookieScriptReject');
        fire('CookieScriptCurrentState', instance.currentState());
    };
    try {
        w.setTimeout(announce, 0);
    } catch(ex) {
        announce();
    }

    try {
        w.console.info(
            '[consent-rr] ' + NAME + ' ' + VERSION +
            ' action=reject categories=none' +
            ' cookie=' + stored +
            ' freed=' + freed +
            ' gcm=' + pushed +
            ' api=' + (installed ? 'ready' : 'refused')
        );
    } catch(ex) {
    }
}
