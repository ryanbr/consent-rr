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

    Stands in for Cookiebot's uc.js, which is the engine: it defines the API,
    blocks the tags, writes the cookie and fires the events. cc.js beside it is
    the dialog and the site's own configuration, and is never asked for here.

    Read off uc.js rather than from documentation:
      window.CookieConsent    the object, and window.Cookiebot is the same one
      its default state       necessary true, preferences, statistics and
                              marketing false - their refusal is their default
      CookieConsent cookie    {stamp:%27..%27%2Cnecessary:true%2C...} - an
                              object literal with the quotes and commas already
                              percent-escaped, which their own reader unescapes
      hasResponse             true is what stops the banner being built
      declined                set when none of the three optional ones is on
      parked tags             script[type="text/plain"][data-cookieconsent] for
                              scripts, and data-src or data-cookieblock-src on
                              iframe, img, embed, video, audio, picture, source
      the script element      carries the site's configuration as data-cbid,
                              data-framework, data-culture and the rest
    Only preferences, statistics and marketing are checked against a tag's
    categories, so a tag marked necessary runs under a refusal - as it does
    with their own script - and everything else stays parked.

    The consent-mode signals are theirs too, values and order: Google's seven
    keys, their developer id, Microsoft's uetq and Clarity.

    One thing uc.js does that this does not: where a site sets data-framework to
    one of the IAB values, theirs installs the IAB stub and then loads a
    separate module that implements __tcfapi. That module is not in either file
    here, so its identity cannot be read off anything, and a TC string is not
    something to invent. Such a site is named on the console line instead -
    "iab=IAB" rather than "iab=off" - so it is visible rather than silent.

*/

function consentRRCookiebot() {
    const w = window;
    const doc = w.document;
    const VERSION = '@@VERSION@@';
    const NAME = 'cookiebot-reject';

    const existing = w.CookieConsent;
    if ( existing !== null && typeof existing === 'object' ) {
        if ( existing.consentRR !== undefined ) { return; }
    }

    const COOKIE = 'CookieConsent';
    // Their own optOutLifetime, in months.
    const LIFETIME_MONTHS = 12;
    const CATEGORIES = [ 'preferences', 'statistics', 'marketing' ];
    const SRC_TAGS = [
        'iframe', 'img', 'embed', 'video', 'audio', 'picture', 'source',
    ];

    // The tag that loaded this, which carries the site's configuration.
    //
    // Looked for each time until it turns up, rather than once: as a redirect
    // it is document.currentScript and it is there immediately, but injected as
    // a scriptlet this runs at document_start, before the parser has reached
    // the tag - and a lookup then finds nothing at all. Everything read off it
    // is therefore answered when it is asked for, and what goes in the cookie
    // is settled again once the document has been parsed.
    let found = null;

    const script = ( ) => {
        if ( found !== null ) { return found; }
        try {
            const current = doc.currentScript;
            if ( current !== null && current !== undefined ) {
                if ( current.hasAttribute('data-cbid') ) {
                    found = current;
                    return found;
                }
            }
            const byId = doc.getElementById('Cookiebot');
            found = byId !== null ? byId : doc.querySelector('script[data-cbid]');
        } catch(ex) {
        }
        return found;
    };

    const attribute = name => {
        const element = script();
        if ( element === null ) { return ''; }
        try {
            const value = element.getAttribute(name);
            return typeof value === 'string' ? value : '';
        } catch(ex) {
        }
        return '';
    };

    // Their own settings come from the tag's attributes or from its src, which
    // is still the original url on a redirected script - uBO swaps what is
    // served, not what the element says.
    const urlParam = name => {
        const element = script();
        if ( element === null ) { return ''; }
        try {
            const src = String(
                element.src || element.getAttribute('src') || ''
            );
            const at = src.indexOf('?');
            if ( at === -1 ) { return ''; }
            const value = new URLSearchParams(src.slice(at + 1)).get(name);
            return typeof value === 'string' ? value : '';
        } catch(ex) {
        }
        return '';
    };

    const setting = (attr, param) => {
        const value = attribute(attr);
        return value !== '' ? value : urlParam(param);
    };

    // Their framework check, name for name.
    const framework = ( ) => setting('data-framework', 'framework');

    const hasFramework = ( ) => [
        'iab', 'iab1', 'iabv2', 'tcfv2.2', 'tcfv2.3', 'tcf',
    ].indexOf(framework().toLowerCase()) !== -1;

    const userCountry = ( ) =>
        setting('data-user-country', 'user_country').toLowerCase();

    const readCookie = name => {
        const pairs = String(doc.cookie).split(';');
        for ( const pair of pairs ) {
            const pos = pair.indexOf('=');
            if ( pos === -1 ) { continue; }
            if ( pair.slice(0, pos).trim() !== name ) { continue; }
            return pair.slice(pos + 1);
        }
        return undefined;
    };

    // Their own parser: unescape, then quote the bare keys and turn the single
    // quotes into double ones, then JSON.parse.
    const readRecord = ( ) => {
        const raw = readCookie(COOKIE);
        if ( typeof raw !== 'string' || raw === '' ) { return null; }
        let text;
        try {
            text = unescape(raw);
        } catch(ex) {
            return null;
        }
        if ( text.indexOf('{') !== 0 ) { return null; }
        try {
            return JSON.parse(
                text.replace(/%2c/g, ',')
                    .replace(/'/g, '"')
                    .replace(/([{\[,])\s*([a-zA-Z0-9_]+?):/g, '$1"$2":')
            );
        } catch(ex) {
        }
        return null;
    };

    const previous = readRecord();
    // Their own initial stamp. The real one is a hash their server issues, and
    // nothing here can compute it, so a stamp already stored is kept and their
    // placeholder stands in otherwise.
    let stamp = '0';
    if ( previous !== null ) {
        if ( typeof previous.stamp === 'string' && previous.stamp !== '' ) {
            stamp = previous.stamp;
        }
    }

    const consent = {
        stamp,
        necessary: true,
        preferences: false,
        statistics: false,
        marketing: false,
        method: 'explicit',
    };

    const utc = Date.now();

    const writeCookie = ( ) => {
        const expires = new Date(utc);
        expires.setMonth(expires.getMonth() + LIFETIME_MONTHS);
        const country = userCountry();
        const region = country !== ''
            ? '%2Cregion:%27' + country + '%27'
            : '';
        // Built the way theirs is: the escapes are in the value as written.
        const value = '{stamp:%27' + stamp + '%27' +
            '%2Cnecessary:true' +
            '%2Cpreferences:false' +
            '%2Cstatistics:false' +
            '%2Cmarketing:false' +
            '%2Cmethod:%27explicit%27' +
            '%2Cver:1' +
            '%2Cutc:' + utc +
            region +
            '}';
        const secure = w.location.protocol === 'https:' ? ';secure' : '';
        try {
            // Path and expiry as their own writer passes them, and no domain,
            // which is what their setCookie is called with.
            doc.cookie = COOKIE + '=' + value +
                ';expires=' + expires.toUTCString() + ';path=/' + secure;
            return readCookie(COOKIE) === value;
        } catch(ex) {
        }
        return false;
    };

    let stored = writeCookie();

    const dataLayer = ( ) => {
        try {
            if ( Array.isArray(w.dataLayer) === false ) { w.dataLayer = []; }
            return w.dataLayer;
        } catch(ex) {
        }
        return null;
    };

    const pushGoogleConsent = function() {
        const layer = dataLayer();
        if ( layer === null ) { return; }
        layer.push(arguments);
    };

    // Their signalGoogleConsentAPI, key for key, with everything optional
    // denied and security_storage granted as theirs always is.
    const signalConsentModes = ( ) => {
        try {
            pushGoogleConsent('set', 'developer_id.dMWZhNz', true);
            pushGoogleConsent('consent', 'update', {
                ad_storage: 'denied',
                ad_user_data: 'denied',
                ad_personalization: 'denied',
                analytics_storage: 'denied',
                functionality_storage: 'denied',
                personalization_storage: 'denied',
                security_storage: 'granted',
            });
            // Their dynamic redaction mode, which is the default.
            pushGoogleConsent('set', 'ads_data_redaction', true);
            const layer = dataLayer();
            if ( layer !== null ) { layer.push({ event: 'cookie_consent_update' }); }
        } catch(ex) {
        }
        try {
            if ( Array.isArray(w.uetq) === false ) { w.uetq = []; }
            w.uetq.push('consent', 'update', { ad_storage: 'denied' });
        } catch(ex) {
        }
        try {
            if ( typeof w.clarity === 'function' ) {
                w.clarity('consentv2', {
                    source: 152,
                    ad_Storage: 'denied',
                    analytics_Storage: 'denied',
                });
            }
        } catch(ex) {
        }
    };

    const addClass = (node, name) => {
        try {
            node.classList.add(name);
        } catch(ex) {
        }
    };

    // Their own check: only these three are tested, so a tag naming none of
    // them - necessary, say - runs.
    const mayRun = node => {
        let allowed = true;
        const raw = node.getAttribute('data-cookieconsent');
        for ( const entry of String(raw).toLowerCase().split(',') ) {
            const category = entry.trim();
            if ( CATEGORIES.indexOf(category) === -1 ) { continue; }
            addClass(node, 'cookieconsent-optin-' + category);
            if ( consent[category] !== true ) { allowed = false; }
        }
        return allowed;
    };

    const cloneScriptTag = node => {
        const clone = doc.createElement('script');
        for ( const attr of Array.prototype.slice.call(node.attributes) ) {
            if ( attr.name === 'type' ) { continue; }
            try {
                clone.setAttribute(attr.name, attr.value);
            } catch(ex) {
            }
        }
        clone.type = 'text/javascript';
        clone.text = node.text;
        return clone;
    };

    const runScriptTags = ( ) => {
        const parked = [];
        for ( const node of doc.getElementsByTagName('script') ) {
            if ( node.hasAttribute('data-cookieconsent') === false ) { continue; }
            if ( node.hasAttribute('type') === false ) { continue; }
            if ( node.getAttribute('type').toLowerCase() !== 'text/plain' ) {
                continue;
            }
            const raw = node.getAttribute('data-cookieconsent').toLowerCase();
            if ( raw === 'ignore' ) { continue; }
            if ( node.cookiesProcessed !== undefined ) { continue; }
            node.cookiesProcessed = 1;
            parked.push(node);
        }
        for ( const node of parked ) {
            if ( mayRun(node) === false ) { continue; }
            try {
                const clone = cloneScriptTag(node);
                if ( node.parentNode === null ) { continue; }
                node.parentNode.insertBefore(clone, node.nextElementSibling);
            } catch(ex) {
            }
        }
    };

    const runSrcTags = ( ) => {
        for ( const name of SRC_TAGS ) {
            for ( const node of doc.getElementsByTagName(name) ) {
                if ( node.hasAttribute('data-cookieconsent') === false ) {
                    continue;
                }
                const blocked = node.hasAttribute('data-cookieblock-src');
                if ( blocked === false && node.hasAttribute('data-src') === false ) {
                    continue;
                }
                if ( node.getAttribute('data-cookieconsent').toLowerCase() === 'ignore' ) {
                    continue;
                }
                if ( mayRun(node) === false ) { continue; }
                try {
                    if ( blocked ) {
                        node.src = node.getAttribute('data-cookieblock-src');
                        node.removeAttribute('data-cookieblock-src');
                        continue;
                    }
                    node.src = node.getAttribute('data-src');
                } catch(ex) {
                }
            }
        }
    };

    const fire = name => {
        try {
            const event = doc.createEvent('Event');
            event.initEvent(name, true, true);
            w.dispatchEvent(event);
        } catch(ex) {
        }
    };

    const callback = name => {
        for ( const prefix of [ 'CookiebotCallback_', 'CookieConsentCallback_' ] ) {
            const fn = w[prefix + name];
            if ( typeof fn !== 'function' ) { continue; }
            try {
                fn();
            } catch(ex) {
            }
            return;
        }
    };

    const noopfn = function() {
    }.bind();

    // Their setDNTState, which is the browser's signal or cookies being off -
    // and not a consent state: everything is refused with or without it. A
    // page reading CookieConsent.doNotTrack gets the same answer theirs gives.
    const doNotTrack = ( ) => {
        try {
            const nav = w.navigator;
            if ( nav.doNotTrack === 'yes' || nav.doNotTrack === '1' ) { return true; }
            if ( nav.msDoNotTrack === '1' ) { return true; }
            if ( nav.cookieEnabled === false ) { return true; }
        } catch(ex) {
        }
        return false;
    };

    const cookieConsent = {
        name: COOKIE,
        consent,
        consented: false,
        declined: true,
        changed: false,
        hasResponse: true,
        consentID: stamp,
        consentUTC: new Date(utc),
        version: 1,
        // Their own responseMode for a record with nothing consented to.
        responseMode: 'leveloptin',
        method: 'explicit',
        doNotTrack: doNotTrack(),
        isOutsideEU: false,
        isOutOfRegion: false,
        consentLevel: 'strict',
        scriptId: 'Cookiebot',
        frameworkLoaded: false,
        IABConsentString: '',
        GACMConsentString: '',
        // Theirs derives these from the visitor's country, which comes with the
        // dialog request this never makes.
        regulations: {
            gdprApplies: true,
            ccpaApplies: false,
            lgpdApplies: false,
        },
        onload: noopfn,
        onaccept: noopfn,
        ondecline: noopfn,
        ontagsexecuted: noopfn,
        getCookie: readCookie,
        setCookie: function(value, expiredate, path, domain, secure) {
            const isSecure = secure || w.location.protocol === 'https:';
            try {
                doc.cookie = COOKIE + '=' + value +
                    (expiredate ? ';expires=' + expiredate.toUTCString() : '') +
                    (path ? ';path=' + path : '') +
                    (domain ? ';domain=' + domain : '') +
                    (isSecure ? ';secure' : '');
            } catch(ex) {
            }
        },
        deleteConsentCookie: noopfn,
        resetCookies: noopfn,
        // There is no dialog to show, renew or withdraw from: the decision is
        // recorded and nothing was rendered.
        show: noopfn,
        hide: noopfn,
        renew: noopfn,
        withdraw: noopfn,
        submitCustomConsent: noopfn,
        updateRegulations: noopfn,
        // Theirs loads a script and calls back. Nothing third-party is
        // fetched here, but a caller waiting on that callback is not left
        // waiting for it.
        getScript: function(url, async, callback) {
            if ( typeof callback !== 'function' ) { return; }
            w.setTimeout(( ) => {
                try {
                    callback();
                } catch(ex) {
                }
            }, 0);
        },
        runScripts: function() {
            runScriptTags();
            runSrcTags();
            if ( w.CB_OnTagsExecuted_Processed !== undefined ) { return; }
            w.CB_OnTagsExecuted_Processed = 1;
            try {
                cookieConsent.ontagsexecuted();
            } catch(ex) {
            }
            callback('OnTagsExecuted');
            fire('CookiebotOnTagsExecuted');
            fire('CookieConsentOnTagsExecuted');
        },
        consentRR: {
            mode: 'reject',
            version: VERSION,
        },
    };

    // Read when asked for, because the tag they come from may not have been
    // parsed yet when this runs.
    for ( const [ name, get ] of [
        [ 'serial', ( ) => attribute('data-cbid') ],
        [ 'scriptElement', script ],
        [ 'framework', framework ],
        [ 'hasFramework', hasFramework ],
        [ 'userCountry', userCountry ],
    ] ) {
        try {
            Object.defineProperty(cookieConsent, name, {
                get,
                enumerable: true,
            });
        } catch(ex) {
        }
    }

    w.CookieConsent = cookieConsent;
    w.Cookiebot = cookieConsent;

    signalConsentModes();

    // Their own order, once the state is in place: onload, then the decline
    // half, then the tags, then consent-ready a tick later.
    const announce = ( ) => {
        try {
            cookieConsent.onload();
        } catch(ex) {
        }
        callback('OnLoad');
        fire('CookiebotOnLoad');
        fire('CookieConsentOnLoad');
        try {
            cookieConsent.ondecline();
        } catch(ex) {
        }
        callback('OnDecline');
        fire('CookiebotOnDecline');
        fire('CookieConsentOnDecline');
        // Theirs runs these from the accepted half and from its blocking-mode
        // queue; a tag naming only necessary is freed either way, and one
        // naming a refused category stays parked.
        cookieConsent.runScripts();
        w.setTimeout(( ) => {
            fire('CookiebotOnConsentReady');
            fire('CookieConsentOnConsentReady');
        }, 1);
        announced();
    };

    // Said at the end, once the tag has certainly been parsed, so it reports
    // what went in rather than what was known at document_start.
    const announced = ( ) => {
        // The region comes off that tag, so the cookie is settled again here.
        if ( userCountry() !== '' ) { stored = writeCookie(); }
        if ( typeof console !== 'object' ) { return; }
        if ( typeof console.info !== 'function' ) { return; }
        console.info(
            '[consent-rr] ' + NAME + ' ' + VERSION +
            ' necessary=true' +
            ' denied=' + CATEGORIES.join(',') +
            ' iab=' + (hasFramework() ? framework() : 'off') +
            ' cookie=' + (stored ? 'written' : 'refused')
        );
    };

    if ( doc.readyState === 'loading' ) {
        doc.addEventListener('DOMContentLoaded', announce, { once: true });
    } else {
        w.setTimeout(announce, 0);
    }

}
