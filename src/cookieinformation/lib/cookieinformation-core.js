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

    Stands in for Cookie Information's uc.js, approving the necessary category
    and nothing else.

    Read off that file rather than from documentation:
      window.cicc            the consent map, category to boolean
      window.cicl            the categories a page actually uses
      getConsentGivenFor(c)  returns window.cicc[c], and nothing more
      [data-category-consent] a parked tag, its real url in data-consent-src
    A tag is parked by having no src at all, not by a text/plain type - the
    string "text/plain" appears nowhere in uc.js. Their loader copies the
    attributes onto a fresh element, sets src from data-consent-src, inserts it
    after the original and removes it; a tag it will not free, it hides.

*/

function consentRRCookieInformation() {
    const w = window;
    const doc = w.document;
    const VERSION = '@@VERSION@@';
    const NAME = 'cookieinformation-reject';

    const preset = typeof w.CookieInformation === 'object' && w.CookieInformation !== null
        ? w.CookieInformation
        : null;
    if ( preset !== null && preset.consentRR !== undefined ) { return; }

    const noopfn = function() {
    }.bind();

    const NECESSARY = 'cookie_cat_necessary';
    const categories = new Set([
        NECESSARY,
        'cookie_cat_functional',
        'cookie_cat_statistic',
        'cookie_cat_marketing',
        'cookie_cat_unclassified',
    ]);

    const selector = '[data-category-consent]';

    const collectCategories = nodes => {
        for ( const node of nodes ) {
            const id = node.getAttribute('data-category-consent');
            if ( typeof id === 'string' && id !== '' ) { categories.add(id); }
        }
    };

    const approved = ( ) => [ NECESSARY ];

    const denied = ( ) => {
        const yes = new Set(approved());
        return Array.from(categories).filter(id => yes.has(id) === false);
    };

    /**************************************************************************/

    const readCookie = name => {
        for ( const cookie of String(doc.cookie).split(';') ) {
            const pos = cookie.indexOf('=');
            if ( pos === -1 ) { continue; }
            if ( cookie.slice(0, pos).trim() !== name ) { continue; }
            return decodeURIComponent(cookie.slice(pos + 1).trim());
        }
        return '';
    };

    // Their own code scopes the cookie to the parent domain. There is no public
    // suffix list in a page, so probe for the broadest one the browser accepts.
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
        const attributes = '; path=/; max-age=31536000; samesite=lax';
        try {
            if ( cookieDomain !== '' ) {
                doc.cookie = name + '=; path=/; max-age=0';
                doc.cookie = name + '=' + value + attributes +
                    '; domain=' + cookieDomain;
                return;
            }
            doc.cookie = name + '=' + value + attributes;
        } catch(ex) {
        }
    };

    const uuid = ( ) => {
        try {
            if ( typeof crypto.randomUUID === 'function' ) {
                return crypto.randomUUID();
            }
        } catch(ex) {
        }
        let out = '';
        for ( let i = 0; i < 36; i++ ) {
            out += i === 8 || i === 13 || i === 18 || i === 23
                ? '-'
                : Math.floor(Math.random() * 16).toString(16);
        }
        return out;
    };

    // Field for field what a real refusal writes. website_uuid and
    // consent_website belong to the tenant, so they are carried over from an
    // existing cookie when there is one and left empty otherwise rather than
    // invented. user_agent is in their format, and stays in the browser.
    const writeConsentCookie = ( ) => {
        let previous = {};
        try {
            previous = JSON.parse(readCookie('CookieInformationConsent')) || {};
        } catch(ex) {
        }
        const record = {
            website_uuid: typeof previous.website_uuid === 'string'
                ? previous.website_uuid
                : '',
            timestamp: (new Date()).toISOString(),
            consent_url: String(w.location.href),
            consent_website: typeof previous.consent_website === 'string'
                ? previous.consent_website
                : '',
            consent_domain: String(w.location.hostname),
            user_uid: typeof previous.user_uid === 'string' && previous.user_uid !== ''
                ? previous.user_uid
                : uuid(),
            consents_approved: approved(),
            consents_denied: denied(),
            user_agent: String(w.navigator.userAgent),
        };
        writeCookie(
            'CookieInformationConsent',
            encodeURIComponent(JSON.stringify(record))
        );
        return readCookie('CookieInformationConsent') !== '';
    };

    /**************************************************************************/

    const setGlobals = ( ) => {
        const told = new Set(approved());
        const map = {};
        for ( const id of categories ) { map[id] = told.has(id); }
        w.cicc = map;
        w.cicl = Array.from(categories);
        w.isCookieInformationAPIReady = true;
        return map;
    };

    // One push per approved category, and the template event their GCM
    // integration listens for.
    const pushDataLayer = ( ) => {
        const told = approved();
        const dl = w.dataLayer;
        if ( Array.isArray(dl) === false ) {
            w.dataLayer = told.map(id => ({ event: id }));
            return;
        }
        for ( const id of told ) {
            try {
                dl.push({ event: id });
            } catch(ex) {
            }
        }
    };

    const dispatchOn = (name, detail) => {
        let event;
        try {
            event = new CustomEvent(name, { detail });
        } catch(ex) {
            return;
        }
        w.dispatchEvent(event);
    };

    /**************************************************************************/

    const matching = root => {
        const out = [];
        if ( typeof root.matches === 'function' && root.matches(selector) ) {
            out.push(root);
        }
        for ( const node of root.querySelectorAll(selector) ) { out.push(node); }
        return out;
    };

    const mayRevive = node => {
        const id = node.getAttribute('data-category-consent');
        return approved().indexOf(id) !== -1;
    };

    // Their loader, step for step: a fresh element of the same kind, the
    // attributes copied over, src taken from data-consent-src, inserted after
    // the original, the original removed. What it will not free, it hides.
    const activateTags = nodes => {
        for ( const node of nodes ) {
            // A tag is parked by having no src at all. The freed copy keeps the
            // attributes, this one included, so without this the observer would
            // see its own work and free it again, and again.
            const live = node.getAttribute('src');
            if ( live !== null && live !== '' ) { continue; }
            const src = node.getAttribute('data-consent-src');
            if ( mayRevive(node) === false ) {
                try {
                    node.style.display = 'none';
                } catch(ex) {
                }
                continue;
            }
            if ( src === null || src === '' ) { continue; }
            const parent = node.parentNode;
            if ( parent === null ) { continue; }
            const clone = doc.createElement(node.tagName);
            for ( const attr of node.attributes ) {
                try {
                    clone.setAttribute(attr.name, attr.value);
                } catch(ex) {
                }
            }
            clone.setAttribute('src', src);
            parent.insertBefore(clone, node.nextSibling);
            parent.removeChild(node);
        }
    };

    let scanTimer;
    let pendingRoots;

    const scan = (root = doc) => {
        const nodes = matching(root);
        collectCategories(nodes);
        const map = setGlobals();
        activateTags(nodes);
        return map;
    };

    const safeScan = root => {
        try {
            return scan(root);
        } catch(ex) {
        }
        return setGlobals();
    };

    const flushScan = ( ) => {
        scanTimer = undefined;
        const roots = pendingRoots;
        pendingRoots = undefined;
        if ( roots === undefined ) {
            safeScan();
            return;
        }
        for ( const root of roots ) { safeScan(root); }
    };

    const scanDeferred = records => {
        if ( Array.isArray(records) ) {
            for ( const record of records ) {
                for ( const node of record.addedNodes ) {
                    if ( node.nodeType !== 1 ) { continue; }
                    if ( pendingRoots === undefined ) { pendingRoots = new Set(); }
                    pendingRoots.add(node);
                }
            }
            if ( pendingRoots === undefined ) { return; }
        }
        if ( scanTimer !== undefined ) { return; }
        scanTimer = w.setTimeout(flushScan, 100);
    };

    /**************************************************************************/

    const statusOfUsedConsentTypes = ( ) => {
        const told = new Set(approved());
        const out = {};
        for ( const id of categories ) { out[id] = told.has(id); }
        return out;
    };

    const api = {
        consentRR: { mode: 'reject', version: VERSION },
        getConsentGivenFor: id => w.cicc[id] === true,
        getStatusOfUsedConsentTypes: statusOfUsedConsentTypes,
        // The decision is fixed by which resource was injected.
        submitAllCategories: noopfn,
        declineAllCategories: noopfn,
        submitConsent: noopfn,
        sendConsent: noopfn,
        // There is no banner to have shown, and the choice is already made.
        wasBannerShown: ( ) => false,
        wasBannerConfirmed: ( ) => true,
        cmp: {},
        gppCmp: {},
        enableYoutubeNotVisibleDescription: false,
        youtubeBlockedCSSClassName: '',
        youtubeCategorySdk: 'cookie_cat_marketing',
        youtubeNotVisibleDescription: '',
    };

    w.CookieInformation = Object.assign({}, preset, api);
    w.CookieConsent = Object.assign({}, w.CookieConsent, {
        show: noopfn,
        renew: noopfn,
        dialog: {},
    });
    w.CookieConsentDialog = Object.assign({}, w.CookieConsentDialog);

    /**************************************************************************/

    const map = safeScan();
    let stored = false;
    try {
        stored = writeConsentCookie();
    } catch(ex) {
    }
    // On the marker as well as the console, so one expression answers "did this
    // run, which version, and did the cookie stick".
    w.CookieInformation.consentRR.cookie = stored ? 'written' : 'refused';
    w.CookieInformation.consentRR.domain = cookieDomain === ''
        ? 'host-only'
        : cookieDomain;

    try {
        new MutationObserver(scanDeferred).observe(doc.documentElement || doc, {
            childList: true,
            subtree: true,
        });
    } catch(ex) {
    }

    // Their init fires both of these on every load, consent being stored, so a
    // page waiting on either is answered rather than left waiting.
    const onReady = ( ) => {
        safeScan();
        pushDataLayer();
        dispatchOn('CookieInformationAPIReady', null);
        dispatchOn('CookieInformationConsentGiven', {
            consents: statusOfUsedConsentTypes(),
        });
        dispatchOn('CookieInformationConsentSubmitted', {
            consents: statusOfUsedConsentTypes(),
        });
        const granted = {};
        for ( const id of approved() ) { granted[id] = true; }
        dispatchOn('CookieInformationConsentForGCMTemplate', granted);
    };

    if ( doc.readyState === 'loading' ) {
        doc.addEventListener('DOMContentLoaded', onReady, { once: true });
    } else {
        w.setTimeout(onReady, 0);
    }

    if ( typeof console === 'object' && typeof console.info === 'function' ) {
        console.info(
            '[consent-rr] ' + NAME + ' ' + VERSION +
            ' approved=' + approved().join(',') +
            ' denied=' + denied().join(',') +
            ' cookie=' + (stored ? 'written' : 'refused')
        );
    }
    void map;
}
