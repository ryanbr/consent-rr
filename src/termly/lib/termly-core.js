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

    Stands in for Termly's resource-blocker, which is their whole CMP: the
    auto-blocker, the banner, the tenant configuration and the visitor's geo,
    all inlined in a 460kB file served per request from app.termly.io.

    Read off that file rather than from documentation:

      TERMLY_API_CACHE        one localStorage key holding a namespaced cache,
                              { <name>: { createdAt, value } }, and the consent
                              entry is named TERMLY_COOKIE_CONSENT
      the categories          advertising, analytics, essential, performance,
                              social_networking and unclassified, plus
                              do_not_sell beside them
      the polarity            true is consented, which took checking: their
                              OPT_IN constant is the refusal - essential true
                              and the rest false - and their consentAll() sets
                              OPT_OUT. Their own isAllDeclined() reads
                              every(c => c === ESSENTIAL || !state[c])
      [data-categories]       what the auto-blocker parks, with the real url in
                              data-src or data-href and scripts typed
                              text/plain. Releasing one clones the node, puts
                              the url back, retypes a script text/javascript
                              and replaces the original
      their essentials path   where their CMP is disabled for a region and the
                              visitor sends GPC, they release the elements
                              whose categories include essential and leave the
                              rest parked. That is what a refusal does here.
      window.Termly           consentAll, getConsentState, checkConsentLoadOrder,
                              isGCMConsentLate, on, off and initialize
      Google consent mode     gtag is window.dataLayer.push(arguments), with a
                              developer id set first, and their own denied map
                              grants security_storage alone. The keys map to
                              categories: ad_* to advertising, analytics_storage
                              to analytics, functionality_storage and
                              personalization_storage to performance,
                              security_storage to essential, social_storage to
                              social_networking, unclassified_storage to
                              unclassified. So a refusal derives exactly their
                              map rather than inventing one.
      userPrefUpdate          the data-layer event that follows, carrying
                              cookiesAccepted and termlyConsentSettings, then
                              Termly.consentSaveDone
      their disabled ping     a TCF tenant's __tcfapi comes from this same
                              file, and where their CMP is off for a region
                              they leave behind a ping answering cmpId 412,
                              cmpVersion 1, cmpStatus "error", cmpLoaded false
                              and displayStatus "disabled", preserving whatever
                              gdprApplies the page's own stub had. That is put
                              back rather than a TC string invented: a vendor
                              reading it has no consent to act on, which is the
                              answer, and the alternative would be guessing a
                              vendor list and a policy version for a framework
                              this tenant may not even have enabled.

*/

function consentRRTermly() {
    const w = window;
    const doc = w.document;
    const VERSION = '@@VERSION@@';
    const NAME = 'termly-reject';

    if ( w.Termly !== null && typeof w.Termly === 'object' ) {
        if ( w.Termly.consentRR !== undefined ) { return; }
    }

    const CACHE = 'TERMLY_API_CACHE';
    const ENTRY = 'TERMLY_COOKIE_CONSENT';
    const ESSENTIAL = 'essential';
    const CATEGORIES = [
        'advertising', 'analytics', 'essential', 'performance',
        'social_networking', 'unclassified',
    ];

    // Their state, with nothing consented but the category they never block.
    // do_not_sell is true where theirs leaves it false: a visitor refusing is
    // refusing that too, and it is the only field in here a US tenant reads.
    const state = { do_not_sell: true };
    for ( const category of CATEGORIES ) {
        state[category] = category === ESSENTIAL;
    }

    // Their own denied map, which these categories derive exactly.
    const GCM = {
        ad_personalization: 'denied',
        ad_storage: 'denied',
        ad_user_data: 'denied',
        analytics_storage: 'denied',
        functionality_storage: 'denied',
        personalization_storage: 'denied',
        security_storage: 'granted',
        social_storage: 'denied',
        unclassified_storage: 'denied',
    };

    const readCache = ( ) => {
        try {
            const raw = w.localStorage.getItem(CACHE);
            if ( typeof raw !== 'string' || raw === '' ) { return {}; }
            const parsed = JSON.parse(raw);
            return parsed !== null && typeof parsed === 'object' ? parsed : {};
        } catch(ex) {
        }
        return {};
    };

    // Their cache writer merges into whatever is there, so the entries beside
    // this one - and a document version already recorded against it - survive.
    const store = ( ) => {
        const cache = readCache();
        const previous = cache[ENTRY];
        const value = Object.assign({}, state);
        try {
            if ( previous !== null && typeof previous === 'object' ) {
                const old = previous.value;
                if ( old !== null && typeof old === 'object' ) {
                    if ( old.document_version_id !== undefined ) {
                        value.document_version_id = old.document_version_id;
                    }
                }
            }
        } catch(ex) {
        }
        cache[ENTRY] = { createdAt: Date.now(), value };
        try {
            w.localStorage.setItem(CACHE, JSON.stringify(cache));
            return w.localStorage.getItem(CACHE) !== null ? 'written' : 'refused';
        } catch(ex) {
        }
        return 'refused';
    };

    const stored = store();

    // Their gtag, which is the arguments object into the data layer.
    const pushGcm = ( ) => {
        try {
            if ( w.TERMLY_FORCE_DISABLE_GCM ) { return 'disabled'; }
            if ( Array.isArray(w.dataLayer) === false ) { w.dataLayer = []; }
            const layer = w.dataLayer;
            const gtag = function() {
                layer.push(arguments);
            };
            gtag('set', 'developer_id.dNzg2MD', true);
            gtag('consent', 'default', GCM);
            const accepted = CATEGORIES.filter(category => state[category]);
            layer.push({
                event: 'userPrefUpdate',
                cookiesAccepted: accepted,
                termlyConsentSettings: Object.assign({}, state),
            });
            layer.push({ event: 'Termly.consentSaveDone' });
            return 'denied';
        } catch(ex) {
        }
        return 'refused';
    };

    const pushed = pushGcm();

    // Their release, element for element: clone, put the url back, retype a
    // script, drop the markers, replace. Only the elements whose categories
    // include the one they never block, which is their own behaviour where
    // the CMP is off and the visitor sends GPC.
    const release = element => {
        try {
            const clone = element.cloneNode(true);
            clone.onload = element.onload;
            if ( clone.tagName === 'SCRIPT' ) {
                clone.setAttribute('type', 'text/javascript');
            } else if ( clone.tagName === 'IFRAME' ) {
                if ( clone.dataset.display ) {
                    clone.style.display = clone.dataset.display;
                    clone.removeAttribute('data-display');
                } else {
                    clone.style.display = null;
                }
            }
            if ( clone.hasAttribute('data-src') ) {
                const src = element.getAttribute('data-src');
                if ( src && src !== 'null' && src !== 'undefined' ) {
                    clone.setAttribute('src', src);
                }
                clone.removeAttribute('data-src');
            }
            if ( clone.hasAttribute('data-href') ) {
                clone.setAttribute('href', element.getAttribute('data-href'));
                clone.removeAttribute('data-href');
            }
            clone.removeAttribute('data-autoblocked');
            element.replaceWith(clone);
            return true;
        } catch(ex) {
        }
        return false;
    };

    const releaseEssentials = ( ) => {
        let freed = 0;
        try {
            const parked = doc.querySelectorAll('[data-categories]');
            for ( const element of Array.from(parked) ) {
                const categories = String(element.dataset.categories || '')
                    .split(',')
                    .map(entry => entry.trim());
                // Their filter is some(), so an element naming essential
                // among others is released by their essentials path too.
                if ( categories.indexOf(ESSENTIAL) === -1 ) { continue; }
                if ( release(element) ) { freed += 1; }
            }
        } catch(ex) {
        }
        return freed;
    };

    const freed = releaseEssentials();

    // Their consent event, and the hook a page can define beside it.
    const listeners = new Map();
    const detail = ( ) => ({
        categories: Object.assign({}, state),
        consentState: Object.assign({}, state),
        cookies: [],
        uuid: undefined,
    });

    const announce = ( ) => {
        try {
            const hook = w.getUpdatedCookieWhitelistByTermly;
            if ( typeof hook === 'function' ) {
                hook({
                    categories: Object.assign({}, state),
                    cookies: [],
                    uuid: undefined,
                });
            }
        } catch(ex) {
        }
        for ( const callbacks of listeners.values() ) {
            for ( const callback of callbacks.slice() ) {
                try {
                    callback(detail());
                } catch(ex) {
                }
            }
        }
    };

    const api = {
        consentRR: VERSION,
        // Theirs grants everything. Nothing here does that, so it records the
        // refusal again rather than pretending to have run.
        consentAll: ( ) => Promise.resolve(),
        getConsentState: ( ) => Object.assign({}, state),
        checkConsentLoadOrder: ( ) => undefined,
        isGCMConsentLate: ( ) => false,
        initialize: ( ) => Promise.resolve(),
        on: (name, callback) => {
            if ( typeof callback !== 'function' ) { return; }
            if ( listeners.has(name) === false ) { listeners.set(name, []); }
            listeners.get(name).push(callback);
            // A listener for the event that has already happened is answered
            // at once, rather than waiting for one that will not come again.
            if ( name === 'consent' ) {
                try {
                    callback(detail());
                } catch(ex) {
                }
            }
        },
        off: (name, callback) => {
            const callbacks = listeners.get(name);
            if ( Array.isArray(callbacks) === false ) { return; }
            const at = callbacks.indexOf(callback);
            if ( at !== -1 ) { callbacks.splice(at, 1); }
        },
    };

    let installed = false;
    try {
        w.Termly = Object.assign({}, w.Termly, api);
        installed = w.Termly.consentRR === VERSION;
    } catch(ex) {
    }

    // Only where the page shows a TCF stub or its locator frame: whether a
    // tenant has that framework on is in the configuration this replaced, and
    // a page with neither is not handed an API their CMP would not have had.
    const tcfWanted = ( ) => {
        try {
            if ( typeof w.__tcfapi === 'function' ) { return 'stub'; }
        } catch(ex) {
        }
        try {
            if ( w.frames.__tcfapiLocator !== undefined ) { return 'locator'; }
        } catch(ex) {
        }
        return '';
    };

    const installTcf = ( ) => {
        const evidence = tcfWanted();
        if ( evidence === '' ) { return 'off'; }
        let gdprApplies;
        try {
            const previous = w.__tcfapi;
            if ( typeof previous === 'function' ) {
                previous('ping', 2, data => {
                    if ( data !== null && typeof data === 'object' ) {
                        gdprApplies = data.gdprApplies;
                    }
                });
            }
        } catch(ex) {
        }
        const ping = (command, version, callback) => {
            if ( typeof callback !== 'function' ) { return; }
            if ( command !== 'ping' ) {
                callback(null, false);
                return;
            }
            callback({
                apiVersion: '2',
                cmpId: 412,
                cmpVersion: 1,
                cmpLoaded: false,
                cmpStatus: 'error',
                displayStatus: 'disabled',
                gdprApplies,
            }, true);
        };
        try {
            w.__tcfapi = ping;
            return w.__tcfapi === ping ? evidence : 'refused';
        } catch(ex) {
        }
        return 'refused';
    };

    const tcf = installTcf();

    announce();

    try {
        w.console.info(
            '[consent-rr] ' + NAME + ' ' + VERSION +
            ' consented=' + ESSENTIAL +
            ' denied=' + CATEGORIES.filter(c => c !== ESSENTIAL).join(',') +
            ' dns=true' +
            ' gcm=' + pushed +
            ' freed=' + freed +
            ' api=' + (installed ? 'ready' : 'refused') +
            ' tcf=' + (tcf === 'off' ? 'off' : 'disabled/' + tcf) +
            ' cache=' + stored
        );
    } catch(ex) {
    }
}
