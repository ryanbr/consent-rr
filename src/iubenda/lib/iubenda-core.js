/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    Home: https://github.com/ryanbr/consent-rr

    iubenda's Cookie Solution. The file a page loads is a 4KB loader,
    cdn.iubenda.com/cs/iubenda_cs.js, and all it does is read
    _iub.csConfiguration, install window._cmp.pubSub, set a handful of _iub
    fields and fetch the real thing:

        "https://cdn.iubenda.com/cookie_solution/iubenda_cs/1.108.0/core-"
            + o.lang + ".js"

    which is 450KB. Replacing the loader means neither arrives, so everything
    below stands in for both.

    THEIR RECORD, which is what stops the banner coming back. Their own
    getConsentObj builds it:

        {timestamp: new Date().toISOString(), version: <bundle version>}

    plus, when perPurposeConsent is on and one of gdprApplies, lgpdApplies or
    fadpApplies is set:

        purposes: {1: true, 2: false, 3: false, 4: false, 5: false}

    and otherwise the simple form, consent: false. Purpose 1 is true in every
    case because their own storeConsent forces it:

        if ("purposes" in i) { var r = A(i.purposes); r[1] = !0; ... }

    Their five purposes, from their own per_purpose table:

        1 necessary   2 functionality   3 experience
        4 measurement 5 marketing

    It goes where theirs goes: a cookie named _iub_cs- plus their storage id,
    which is "s" + siteId when storage.useSiteId is on and the cookiePolicyId
    otherwise, URL-encoded because their own converter encodes a value that
    looks like JSON for cookie storage and leaves it decoded for
    localStorage. Their storage.type picks between the two, per item, and
    where a record already exists in the other one it is overwritten there
    too - with storage.autoSync on, the one left behind would be read back.

    Nothing is minted: their cons.rand comes from their consent-log server
    and a record without it simply has no preference id, which is a shape
    their own getPreferenceId handles. An existing one is carried over.

    WHAT IS NOT REQUESTED: the 450KB core, the per-site configuration at
    cs.iubenda.com/cookie-solution/confs/js/<id>.js, their consent-log API,
    the loopback iframe at cdn.iubenda.com/cs/bridge/, and the cookie policy
    itself. Nothing is sent anywhere.

    THEIR CALLBACKS, in the order their own code fires them for a stored
    decision, measured in the core:

        this.state.needsConsent && this.isPreferenceExpressed()
            ? (this.isConsentGiven()
                ? this.fireCallback("onPreferenceExpressed", ...)
                : (this.options.callback.onConsentRead
                    ? this.fireCallback("onConsentRead")
                    : this.isConsentRejected() &&
                        this.fireCallback("onConsentRejected"),
                   this.fireCallback("onPreferenceExpressed", ...)))

    with fireCallback itself doing two things worth copying: onReady is always
    called with consent.consent as its argument, and onConsentRead falls back
    to onConsentGiven when no onConsentRead is defined and consent was given -
    which is how a page's onConsentGiven fires on a return visit. csReady then
    sets _iub.csReady = true and fires onReady.

    THE AUTO-BLOCKER. Their blocker parks a tag by class and keeps the real
    url in a suppressed attribute:

        ["_iub_cs_activate-inline", "_iub_cs_activate",
         "_iub_cs_activate_iframe", "_iub_cs_activate_notused",
         "_iub_cs_prompt"]
        data-iub-purposes          the purposes it waits for
        data-suppressedsrc | suppressedsrc | src
        _iub_cs_activate-activated what a freed one is marked with
        _iub_cs_activate-overlay   their click-to-accept cover

    A refusal leaves all of it alone. iubenda-reject-unblock.js and
    iubenda-accept.js free what the blocker parked, by those markers, and the
    pass runs again as the document arrives because this stands in for a
    script in <head>.

    GOOGLE CONSENT MODE is theirs as well, including the mapping:

        analytics_storage       purpose 4
        ad_storage              purpose 5
        functionality_storage   purpose 2
        personalization_storage purpose 3
        security_storage        purpose 2
        ad_personalization      purpose 5
        ad_user_data            purpose 5

    Their own sender prefers window.gtag, falls back to pushing an array onto
    the data layer their googleConsentModeDataLayerName names, and has a
    "template" mode that pushes to _iub.gtmDataLayer and _iub.gtmDataLayerV2
    instead. All three are honoured. The default-then-update pair is this
    repo's choice rather than theirs: theirs reads a default the page or their
    GTM template already pushed, and without one an update that denies
    arrives after tags have already fired.

*/

// @include ../../shared/lib/deferred.js

function consentRRIubenda(mode, installTcf) {
    'use strict';

    const w = window;
    const doc = w.document;
    const iub = w._iub = w._iub || {};

    // What their loader puts on _iub before it fetches anything, which is what
    // an integration reads while it waits.
    try {
        iub.csConfigLegacy = false;
        iub.invTcfC = Date.now() - 31104e6;
        iub.GVL2 = iub.GVL2 || 224;
        iub.GVL3 = iub.GVL3 || 179;
        iub.vendorsCountGVL3 = iub.vendorsCountGVL3 || 1223;
    } catch ( ex ) {
    }

    // Their loader reads _iub.csConfiguration synchronously and cannot work
    // without it - it reads o.lang off it on the next line - so a page always
    // sets it above their script tag, which is where a redirect lands too.
    //
    // A SCRIPTLET RUNS EARLIER THAN THAT. At document_start the page has run
    // nothing, so there is no configuration to read, and everything that comes
    // off it - the cookie name their storage id builds, whether consent is
    // per-purpose, the tenant's own callbacks - would be read off an empty
    // object. Measured, before this waited: a record named _iub_cs- with no
    // tenant id, in their simple form on a per-purpose tenant, and not one of
    // the page's callbacks fired.
    //
    // So nothing is done until it exists: at once where it already does, and
    // otherwise as the document arrives.
    let installed = false;
    // Read off window._iub as it is now, not off the object captured above:
    // their own documented snippet is "var _iub = _iub || []", which keeps
    // whatever is already there, but a page that assigns window._iub outright
    // replaces it - and then a captured reference never sees the
    // configuration at all. Measured, that wrote no record whatsoever.
    const configured = ( ) => {
        const held = w._iub;
        if ( typeof held !== 'object' || held === null ) { return false; }
        const config = held.csConfiguration;
        if ( typeof config !== 'object' || config === null ) { return false; }
        return Object.keys(config).length !== 0;
    };
    const start = ( ) => {
        if ( installed ) { return 0; }
        if ( configured() === false ) { return 0; }
        installed = true;
        consentRRIubendaInstall(mode, installTcf);
        return 0;
    };
    start();
    if ( installed === false ) {
        // The pass-again is the guarantee: it looks once more on every batch
        // of nodes the parser delivers, at DOMContentLoaded and at load. The
        // tick below only decides how SOON - a configuration set by an inline
        // script in <head> is picked up on the next tick rather than waiting
        // for the first batch of body nodes, which is the difference between
        // writing the refusal before the page's other scripts run and after.
        // No test distinguishes the two, because in a harness the document is
        // ready within the same few milliseconds either way.
        try {
            w.setTimeout(start, 0);
        } catch ( ex ) {
        }
        consentRRDeferred(w, doc, start, '');
    }
}

function consentRRIubendaInstall(mode, installTcf) {
    'use strict';

    // Once only, whatever lands this here. A user with the network rule AND
    // the scriptlet gets both, and without this the page's own callbacks fire
    // twice and the consent-mode signals go out twice. The marker is the
    // guard, the same way the Cookiez family guards itself.
    if ( typeof window.iubendaConsentRR === 'object' &&
        window.iubendaConsentRR !== null ) {
        return;
    }

    const w = window;
    const doc = w.document;
    const NAME = 'iubenda-' + mode;
    const VERSION = '@@VERSION@@';

    // The bundle version their loader names in the url it fetches. Nothing
    // reads it back - their own invalidation works off invalidateConsentBefore
    // timestamps - but their record carries it, so this one does too.
    const BUNDLE_VERSION = '1.108.0';

    const accept = mode === 'accept';
    const unblockAll = mode === 'reject-unblock';
    // Accept frees the parked tags because that is what their accept does;
    // reject-unblock frees them for a site that withholds content.
    const activate = accept || unblockAll;
    // What the page's own scripts are told. The stored record, the consent
    // mode signals and the IAB string follow accept alone.
    const reported = accept || unblockAll;

    const PURPOSES = [ 1, 2, 3, 4, 5 ];
    const PURPOSE_NAMES = {
        1: 'necessary',
        2: 'functionality',
        3: 'experience',
        4: 'measurement',
        5: 'marketing',
    };
    // Their mapping, signal by signal.
    const CONSENT_MODE = {
        'analytics_storage': [ 4 ],
        'ad_storage': [ 5 ],
        'functionality_storage': [ 2 ],
        'personalization_storage': [ 3 ],
        'security_storage': [ 2 ],
        'ad_personalization': [ 5 ],
        'ad_user_data': [ 5 ],
    };

    const PARKED = [
        '_iub_cs_activate-inline',
        '_iub_cs_activate',
        '_iub_cs_activate_iframe',
        '_iub_cs_activate_notused',
        '_iub_cs_prompt',
    ];
    // What this frees: their notused marker is a node their own blocker
    // decided against, and their prompt is the click-to-accept cover, which
    // is removed rather than activated.
    const FREEABLE = [
        '_iub_cs_activate-inline',
        '_iub_cs_activate',
        '_iub_cs_activate_iframe',
    ];
    const ACTIVATED = '_iub_cs_activate-activated';
    const OVERLAY = '_iub_cs_activate-overlay';
    const PROMPT = '_iub_cs_prompt';
    const PURPOSES_ATTR = 'data-iub-purposes';

    /**************************************************************************/

    const iub = w._iub = w._iub || {};
    const config = typeof iub.csConfiguration === 'object' &&
        iub.csConfiguration !== null
        ? iub.csConfiguration
        : {};

    const option = (name, fallback) => {
        const value = config[name];
        return value === undefined ? fallback : value;
    };
    const nested = (name, key, fallback) => {
        const group = config[name];
        if ( typeof group !== 'object' || group === null ) { return fallback; }
        const value = group[key];
        return value === undefined ? fallback : value;
    };

    const perPurpose = option('perPurposeConsent', false) === true;
    const gdprApplies = option('gdprApplies', undefined);
    // Their own setGdprApplies, in their own order: CIPA forces it on, a
    // tenant with enableGdpr off forces it off, gdprAppliesGlobally - true by
    // default - forces it on, and only then does their own gdprApplies decide.
    // Their geo detection is the one step not reproducible here.
    const gdprOn = ( ) => {
        if ( option('enableCipa', false) === true ) { return true; }
        if ( option('enableGdpr', true) === false ) { return false; }
        if ( option('gdprAppliesGlobally', true) === true ) { return true; }
        return gdprApplies === true;
    };
    const gdpr = gdprOn();
    const lgpdApplies = option('lgpdApplies', undefined);
    const fadpApplies = option('fadpApplies', undefined);
    const ccpaApplies = option('ccpaApplies', undefined);
    const cookiePolicyId = option('cookiePolicyId', null);
    const siteId = option('siteId', null);
    const useSiteId = nested('storage', 'useSiteId', false) === true;
    const storageId = siteId !== null && useSiteId
        ? 's' + String(siteId)
        : String(cookiePolicyId === null ? '' : cookiePolicyId);
    const cookieName = '_iub_cs-' + storageId;
    const expireAfter = Number(nested('preferenceCookie', 'expireAfter', 365));
    const tcfName = String(nested('preferenceCookie', 'tcfV2Name', 'euconsent-v2'));
    const enableTcf = option('enableTcf', false) === true;
    const consentPath = String(option('localConsentPath', '/') || '/');
    const consentDomain = option('localConsentDomain', null);
    const domainExact = option('localConsentDomainExact', false) === true;

    // Their own per-item storage type, with the group default behind it.
    const storageType = ( ) => {
        const items = nested('storage', 'items', null);
        const core = items !== null && typeof items === 'object'
            ? items.core
            : null;
        const own = core !== null && typeof core === 'object'
            ? core.type
            : undefined;
        const group = nested('storage', 'type', 'cookie');
        return String(own === undefined ? group : own);
    };
    const toLocalStorage = storageType() === 'localStorage';

    // Their enabled purposes, where a tenant named a subset. Their config
    // takes "1,4,5" or an array; everything they define is the full five.
    const enabledPurposes = ( ) => {
        const named = option('purposes', null);
        let list = [];
        if ( typeof named === 'string' ) {
            list = named.split(',');
        } else if ( Array.isArray(named) ) {
            list = named;
        }
        const out = [];
        for ( const entry of list ) {
            const id = parseInt(String(entry).trim(), 10);
            if ( PURPOSES.indexOf(id) !== -1 && out.indexOf(id) === -1 ) {
                out.push(id);
            }
        }
        return out.length !== 0 ? out.sort() : PURPOSES.slice();
    };
    const purposeIds = enabledPurposes();

    /**************************************************************************/

    // The record. Purpose 1 is true whatever the mode, because their own
    // storeConsent forces it, and the rest follow the resource.
    const purposeMap = granted => {
        const out = {};
        for ( const id of purposeIds ) {
            out[id] = id === 1 ? true : granted === true;
        }
        return out;
    };

    const storedPurposes = purposeMap(accept);
    // What the page is told, which in reject-unblock is not what is stored.
    const reportedPurposes = purposeMap(reported);

    const readRaw = ( ) => {
        try {
            const items = String(doc.cookie || '').split(';');
            for ( const item of items ) {
                const pos = item.indexOf('=');
                if ( pos === -1 ) { continue; }
                if ( item.slice(0, pos).trim() !== cookieName ) { continue; }
                return decodeURIComponent(item.slice(pos + 1).trim());
            }
        } catch ( ex ) {
        }
        try {
            const local = w.localStorage.getItem(cookieName);
            if ( local !== null ) { return local; }
        } catch ( ex ) {
        }
        return '';
    };

    // Their cons object is minted by their consent-log server. An existing
    // one is carried over; absent is a shape their own reader handles.
    const carried = ( ) => {
        const raw = readRaw();
        if ( raw === '' ) { return null; }
        try {
            const previous = JSON.parse(raw);
            if ( typeof previous !== 'object' || previous === null ) {
                return null;
            }
            return previous.cons !== undefined ? previous.cons : null;
        } catch ( ex ) {
        }
        return null;
    };

    const cons = carried();
    const record = {
        'timestamp': new Date().toISOString(),
        'version': BUNDLE_VERSION,
    };
    if ( perPurpose && (gdpr || lgpdApplies === true || fadpApplies === true) ) {
        record.purposes = Object.assign({}, storedPurposes);
    } else {
        record.consent = accept;
    }
    if ( cons !== null ) { record.cons = cons; }

    /**************************************************************************/

    // Their own two-level suffix awareness is not needed here: their
    // localConsentDomain is the only domain they write with, and absent it
    // theirs is host-only too.
    const writeCookie = (name, value) => {
        const parts = [ name + '=' + value ];
        parts.push('path=' + consentPath);
        if ( expireAfter > 0 ) {
            const until = new Date(Date.now() + expireAfter * 864e5);
            parts.push('expires=' + until.toUTCString());
            parts.push('max-age=' + Math.floor(expireAfter * 86400));
        }
        if ( typeof consentDomain === 'string' && consentDomain !== '' ) {
            parts.push('domain=' + (domainExact || consentDomain.charAt(0) === '.'
                ? consentDomain
                : '.' + consentDomain));
        }
        parts.push('SameSite=Lax');
        try {
            if ( w.location.protocol === 'https:' ) { parts.push('Secure'); }
        } catch ( ex ) {
        }
        try {
            doc.cookie = parts.join('; ');
            return true;
        } catch ( ex ) {
        }
        return false;
    };

    const hasCookie = name => {
        try {
            return String(doc.cookie || '').split(';').some(item =>
                item.split('=')[0].trim() === name
            );
        } catch ( ex ) {
        }
        return false;
    };

    const hasLocal = name => {
        try {
            return w.localStorage.getItem(name) !== null;
        } catch ( ex ) {
        }
        return false;
    };

    const writeLocal = (name, value) => {
        try {
            w.localStorage.setItem(name, value);
            return true;
        } catch ( ex ) {
        }
        return false;
    };

    // Their converter: a value that looks like JSON is URL-encoded for a
    // cookie and left decoded for localStorage.
    const json = JSON.stringify(record);
    let written = '';
    if ( toLocalStorage ) {
        if ( writeLocal(cookieName, json) ) { written = 'localStorage'; }
        // With their autoSync on, a record left in the cookie would be read
        // back over this one.
        if ( hasCookie(cookieName) ) {
            writeCookie(cookieName, encodeURIComponent(json));
            written += '+cookie';
        }
    } else {
        if ( writeCookie(cookieName, encodeURIComponent(json)) ) {
            written = 'cookie';
        }
        if ( hasLocal(cookieName) ) {
            writeLocal(cookieName, json);
            written += '+localStorage';
        }
    }

    /**************************************************************************/

    // The IAB layer, where their tenant switched it on.
    let tcString = '';
    if ( enableTcf && typeof installTcf === 'function' ) {
        try {
            // Their cmpVersion.tcf, where the tenant set one: theirs comes
            // down with the per-tenant configuration.
            tcString = String(
                installTcf(accept, nested('cmpVersion', 'tcf', undefined)) || ''
            );
        } catch ( ex ) {
        }
        if ( tcString !== '' ) {
            writeCookie(tcfName, tcString);
        }
    }

    /**************************************************************************/

    // Their consent mode, by their own mapping and through their own sender.
    // Their mapping, read off the stored purposes. There is no separate
    // granted flag: every signal has a purpose behind it, so the record is
    // the only input - a flag here could only ever disagree with it.
    const signals = ( ) => {
        const out = {};
        for ( const name of Object.keys(CONSENT_MODE) ) {
            let allowed = true;
            for ( const id of CONSENT_MODE[name] ) {
                if ( storedPurposes[id] !== true ) { allowed = false; }
            }
            out[name] = allowed ? 'granted' : 'denied';
        }
        return out;
    };

    const dataLayerName = String(
        option('googleConsentModeDataLayerName', 'dataLayer')
    );
    const consentMode = option('googleConsentMode', undefined);

    // Their own sender: gtag where the page has one, their template pair
    // where the tenant asked for it, and the named data layer otherwise -
    // pushed as an array, which is what theirs does.
    const send = (...args) => {
        try {
            if ( consentMode === 'template' ) {
                iub.gtmDataLayer = iub.gtmDataLayer || [];
                iub.gtmDataLayerV2 = iub.gtmDataLayerV2 || [];
                const stripped = JSON.parse(JSON.stringify(args));
                if ( typeof stripped[2] === 'object' && stripped[2] !== null ) {
                    delete stripped[2].ad_user_data;
                    delete stripped[2].ad_personalization;
                }
                iub.gtmDataLayer.push(stripped);
                iub.gtmDataLayerV2.push(args);
                return true;
            }
            if ( typeof w.gtag === 'function' ) {
                w.gtag.apply(w, args);
                return true;
            }
            const layer = w[dataLayerName];
            if ( layer !== undefined && typeof layer.push === 'function' ) {
                layer.push(args);
                return true;
            }
        } catch ( ex ) {
        }
        return false;
    };

    // Whether the page or their GTM template already pushed a default, which
    // is what their own reader looks for before sending an update.
    const hasDefault = ( ) => {
        try {
            const layer = w[dataLayerName];
            if ( Array.isArray(layer) === false ) { return false; }
            for ( const entry of layer ) {
                if ( entry === null || typeof entry !== 'object' ) { continue; }
                if ( entry[0] === 'consent' && entry[1] === 'default' ) {
                    return true;
                }
            }
        } catch ( ex ) {
        }
        return false;
    };

    // The default goes in now, because a tag that fires before any default
    // fires as granted - and theirs relies on the page or their own GTM
    // template having put one in. The update waits for announce below, which
    // is where theirs lands: their core is fetched asynchronously, so a page's
    // own gtag defaults are already in by the time it answers. Pushed from
    // here at document_start, an update would be overridden by a default the
    // page pushes afterwards.
    let told = 0;
    if ( consentMode !== false && hasDefault() === false ) {
        if ( send('consent', 'default', signals()) ) { told += 1; }
    }

    // Their uetConsentMode, for Bing's own signal.
    if ( option('uetConsentMode', undefined) === true ) {
        try {
            w.uetq = w.uetq || [];
            w.uetq.push('consent', 'update', {
                'ad_storage': accept ? 'granted' : 'denied',
            });
            told += 1;
        } catch ( ex ) {
        }
    }

    /**************************************************************************/

    // Their page-facing surface. Everything here answers from the record
    // above, except where reject-unblock tells the page its purposes are on.
    const preferences = ( ) => {
        const out = { 'id': cookiePolicyId };
        if ( cons !== null ) { out.cons = cons; }
        out.timestamp = record.timestamp;
        if ( perPurpose ) {
            out.purposes = Object.assign({}, reportedPurposes);
        } else {
            out.consent = reported;
        }
        return out;
    };

    const purposesState = ( ) => Object.assign({}, reportedPurposes);

    const allApproved = ( ) => {
        for ( const id of purposeIds ) {
            if ( reportedPurposes[id] !== true ) { return false; }
        }
        return true;
    };

    const consentGivenNow = ( ) => perPurpose ? allApproved() : reported;

    const api = {
        // Reads.
        isConsentGiven: ( ) => consentGivenNow(),
        isPreferenceExpressed: ( ) => true,
        getPreferences: ( ) => preferences(),
        getUserPreferences: ( ) => preferences(),
        getPurposesState: ( ) => purposesState(),
        getConsentAction: ( ) => accept ? 'accept' : 'reject',
        // Theirs reads a stored id first, and otherwise builds one from the
        // timestamp and cons.rand through a hash of their own. A stored one
        // is answered here; a constructed one is not invented.
        getPreferenceId: ( ) => {
            try {
                const held = w.localStorage.getItem(
                    '_iub_previous_preference_id'
                );
                if ( held === null ) { return undefined; }
                const parsed = JSON.parse(held);
                if ( typeof parsed !== 'object' || parsed === null ) {
                    return undefined;
                }
                const own = parsed[cookieName];
                return typeof own === 'string' ? own : undefined;
            } catch ( ex ) {
            }
            return undefined;
        },
        gdprApplies: ( ) => gdpr,
        lgpdApplies: ( ) => lgpdApplies === true,
        ccpaApplies: ( ) => ccpaApplies === true,
        // Nothing was asked of their US flow and nothing was sent, so their
        // own default answer stands: not acknowledged, not opted out.
        isCcpaAcknowledged: ( ) => false,
        isCcpaOptedOut: ( ) => false,
        // Theirs answers true unconditionally.
        isGoogleNonPersonalizedAds: ( ) => true,
        getGoogleAdditionalConsent: ( ) => undefined,
        // Theirs flattens their whole default table, which is the list of
        // every option they support and is not derivable without the bundle
        // this stands in for. The tenant's own keys are what is on the page.
        getSupportedOptions: ( ) => Object.keys(config),
        arePurposesAccepted: (ids, options) => {
            const list = Array.isArray(ids) ? ids : [];
            if ( list.length === 0 ) {
                return Promise.reject(
                    new Error('Specify purposes list as an array')
                );
            }
            const state = purposesState();
            return Promise.resolve(
                list.every(id => state[id] === true)
            );
        },
        // Writes, which a banner's own buttons would call. There is no
        // banner, and the record does not move: a page cannot argue a
        // refusal up, and does not have to argue an acceptance up either.
        acceptAll: ( ) => {},
        rejectAll: ( ) => {},
        setPreferences: ( ) => {},
        storeConsent: ( ) => {},
        setConsentOnScrollOnElement: ( ) => {},
        askCcpaOptOut: ( ) => {},
        // UI, which does not exist.
        showBanner: ( ) => {},
        showCP: ( ) => {},
        openPreferences: ( ) => {},
        openAdvertisingPreferences: ( ) => {},
        showTcfVendors: ( ) => {},
        emailMarketing: ( ) => {},
        accessibilityWidget: ( ) => {},
        printErrors: ( ) => {},
        // Their own storage reset, which is a real action: the record goes.
        resetCookies: ( ) => {
            try {
                writeCookie(cookieName, '');
                doc.cookie = cookieName + '=; path=' + consentPath +
                    '; expires=Thu, 01 Jan 1970 00:00:01 GMT';
            } catch ( ex ) {
            }
            try {
                w.localStorage.removeItem(cookieName);
            } catch ( ex ) {
            }
        },
    };
    api.resetStorage = api.resetCookies;
    api.consentGiven = ( ) => consentGivenNow();

    /**************************************************************************/

    // Their auto-blocker's own activation, by their own markers.
    let freed = 0;
    const suppressed = (node, name) => {
        const value = node.getAttribute('data-suppressed' + name) ||
            node.getAttribute('suppressed' + name) ||
            node.getAttribute(name);
        return value === null ? '' : value;
    };

    const wanted = node => {
        const named = node.getAttribute(PURPOSES_ATTR);
        if ( named === null || named === '' ) { return true; }
        const ids = String(named).replace(/\s+/g, '').split(',');
        for ( const entry of ids ) {
            const id = parseInt(entry, 10);
            if ( isNaN(id) ) { continue; }
            if ( reportedPurposes[id] !== true ) { return false; }
        }
        return true;
    };

    // Everything their own activators restore, not only src: their generic
    // reader is data-suppressed<attr> || suppressed<attr> || <attr>, and they
    // call it with href for a link, poster for a video and data for an
    // object. Restoring src alone left a parked stylesheet dead with their
    // marker still on it.
    const SUPPRESSED = [ 'src', 'href', 'poster', 'data' ];
    const IN_PLACE = [ 'IFRAME', 'IMG', 'SOURCE', 'TRACK', 'LINK', 'VIDEO',
        'AUDIO', 'OBJECT', 'EMBED', 'A' ];

    const restore = node => {
        let any = false;
        for ( const name of SUPPRESSED ) {
            const value = suppressed(node, name);
            if ( value === '' ) { continue; }
            node.setAttribute(name, value);
            any = true;
        }
        return any;
    };

    const stripMarkers = node => {
        for ( const attribute of Array.from(node.attributes) ) {
            const name = attribute.name;
            if ( name.startsWith('suppressed') ||
                name.startsWith('data-suppressed') ) {
                node.removeAttribute(name);
            }
        }
    };

    const freeNode = node => {
        const tag = String(node.tagName || '').toUpperCase();
        const src = suppressed(node, 'src');
        if ( IN_PLACE.indexOf(tag) !== -1 ) {
            restore(node);
            stripMarkers(node);
            for ( const name of FREEABLE ) { node.classList.remove(name); }
            node.classList.add(ACTIVATED);
            // Their own video and audio activator loads the element again
            // once its sources are back; a source or track asks its parent.
            const target = tag === 'VIDEO' || tag === 'AUDIO'
                ? node
                : node.parentNode;
            if ( target !== null && typeof target.load === 'function' ) {
                try {
                    target.load();
                } catch ( ex ) {
                }
            }
            freed += 1;
            return;
        }
        // A parked script cannot be un-parked in place: the browser has
        // already skipped it. A copy is what runs, and theirs builds it the
        // same way - every attribute but the suppressed ones and the type,
        // async off so order holds.
        const copy = doc.createElement(tag === '' ? 'script' : tag);
        for ( const attribute of Array.from(node.attributes) ) {
            const name = attribute.name;
            if ( name === 'type' || name === 'src' ) { continue; }
            if ( name.startsWith('suppressed') ) { continue; }
            if ( name.startsWith('data-suppressed') ) { continue; }
            if ( name === 'class' ) { continue; }
            copy.setAttribute(name, attribute.value);
        }
        const classes = [];
        for ( const name of Array.from(node.classList) ) {
            if ( FREEABLE.indexOf(name) !== -1 ) { continue; }
            classes.push(name);
        }
        classes.push(ACTIVATED);
        copy.setAttribute('class', classes.join(' '));
        if ( tag === 'SCRIPT' ) {
            copy.async = false;
            if ( src !== '' ) {
                copy.src = src;
            } else if ( node.textContent !== '' ) {
                copy.textContent = node.textContent;
            }
        } else if ( src !== '' ) {
            copy.setAttribute('src', src);
        }
        const parent = node.parentNode;
        if ( parent === null ) { return; }
        parent.insertBefore(copy, node);
        parent.removeChild(node);
        freed += 1;
    };

    const seen = new WeakSet();
    const scan = ( ) => {
        if ( activate === false ) { return 0; }
        let count = 0;
        const selector = FREEABLE.map(name => '.' + name).join(',');
        let nodes = [];
        try {
            nodes = Array.from(doc.querySelectorAll(selector));
        } catch ( ex ) {
            return 0;
        }
        for ( const node of nodes ) {
            if ( seen.has(node) ) { continue; }
            seen.add(node);
            try {
                if ( node.classList.contains(ACTIVATED) ) { continue; }
                if ( wanted(node) === false ) { continue; }
                const before = freed;
                freeNode(node);
                if ( freed !== before ) { count += 1; }
            } catch ( ex ) {
            }
        }
        // Their covers go with the tags they were covering.
        try {
            for ( const node of Array.from(
                doc.querySelectorAll('.' + OVERLAY + ',.' + PROMPT)
            ) ) {
                if ( node.parentNode === null ) { continue; }
                node.parentNode.removeChild(node);
            }
        } catch ( ex ) {
        }
        return count;
    };

    if ( activate ) {
        consentRRDeferred(w, doc, scan, NAME + ' ' + VERSION);
    }

    /**************************************************************************/

    // Their PubSub, which their loader installs and an integration can
    // subscribe to before any of this. Reimplemented rather than stubbed,
    // because a subscriber whose topic never publishes waits for ever.
    const pubSub = ( ) => {
        const topics = {};
        const onceOnly = {};
        const replay = {};
        const add = (store, topic, subscriberId, callback) => {
            if ( !store[topic] ) { store[topic] = []; }
            const found = store[topic].find(
                entry => entry.subscriberId === subscriberId
            );
            if ( found === undefined ) {
                store[topic].push({ subscriberId, callback });
            }
            const held = replay[topic];
            if ( held !== undefined ) {
                publish(topic, held.publisherId, held.message);
            }
        };
        const fire = (store, topic, message, once) => {
            if ( !store[topic] ) { return; }
            for ( const entry of store[topic].slice() ) {
                try {
                    entry.callback(message);
                } catch ( ex ) {
                }
            }
            if ( once ) { delete store[topic]; }
        };
        const publish = (topic, publisherId, message, keep) => {
            if ( keep ) {
                replay[topic] = {
                    publisherId,
                    message: JSON.parse(JSON.stringify(message)),
                };
            }
            fire(topics, topic, message, false);
            fire(onceOnly, topic, message, true);
        };
        const drop = (store, subscriberId, topic) => {
            if ( !store[topic] ) { return; }
            store[topic] = store[topic].filter(
                entry => entry.subscriberId !== subscriberId
            );
        };
        return {
            topics,
            onceOnly,
            replayPublishers: replay,
            subscribe(topic, subscriberId, callback, once) {
                if ( !topic || !subscriberId ) { return; }
                add(once ? onceOnly : topics, topic, subscriberId, callback);
            },
            subscribeOnce(topic, subscriberId, callback) {
                add(onceOnly, topic, subscriberId, callback);
            },
            subscribeRegular(topic, subscriberId, callback) {
                add(topics, topic, subscriberId, callback);
            },
            unsubscribe(subscriberId, topic) {
                drop(topics, subscriberId, topic);
                drop(onceOnly, subscriberId, topic);
            },
            unsubscribeFromRegular(subscriberId, topic) {
                drop(topics, subscriberId, topic);
            },
            unsubscribeFromOnceOnly(subscriberId, topic) {
                drop(onceOnly, subscriberId, topic);
            },
            publish,
            publishToRegularSubscribers(topic, publisherId, message) {
                fire(topics, topic, message, false);
            },
            publishToOnceSubscribers(topic, publisherId, message) {
                fire(onceOnly, topic, message, true);
            },
        };
    };

    try {
        w._cmp = w._cmp || {};
        if ( w._cmp.pubSub === undefined ) { w._cmp.pubSub = pubSub(); }
    } catch ( ex ) {
    }

    /**************************************************************************/

    // A small cs around their api, which is the object their own docs point a
    // page at. Only what answers from the record above is on it.
    const cs = {
        api,
        consent: record,
        options: config,
        settings: { version: BUNDLE_VERSION },
        isConsentGiven: ( ) => consentGivenNow(),
        isPreferenceExpressed: ( ) => true,
        isConsentRejected: ( ) => reported === false,
        getPreferences: ( ) => preferences(),
        getUserPreferences: ( ) => preferences(),
        consentRR: { name: NAME, version: VERSION, mode: mode },
    };
    try {
        iub.cs = cs;
    } catch ( ex ) {
    }

    /**************************************************************************/

    // Their callbacks, in the order their own code fires them for a stored
    // decision, and with their own fireCallback quirks: onReady takes
    // consent.consent, and onConsentRead falls back to onConsentGiven where
    // consent was given and no onConsentRead is defined.
    const callbacks = typeof config.callback === 'object' &&
        config.callback !== null
        ? config.callback
        : {};
    let fired = 0;
    const fire = (name, argument) => {
        let callback = callbacks[name];
        if ( name === 'onConsentRead' && !callback && consentGivenNow() ) {
            callback = callbacks.onConsentGiven;
        }
        if ( typeof callback !== 'function' ) { return; }
        try {
            callback(argument);
            fired += 1;
        } catch ( ex ) {
        }
    };
    const fireExpressed = argument => {
        fire('onPreferenceExpressed', argument);
        fire('onPreferenceExpressedOrNotNeeded', argument);
    };

    const expressed = ( ) => ({
        consent: reported,
        purposes: Object.assign({}, reportedPurposes),
    });

    const announce = ( ) => {
        if ( consentMode !== false ) {
            if ( send('consent', 'update', signals()) ) { told += 1; }
        }
        fire('onBeforePreload');
        iub.csReady = true;
        fire('onReady', record.consent);
        if ( consentGivenNow() ) {
            fireExpressed(expressed());
            fire('onConsentRead');
        } else {
            if ( typeof callbacks.onConsentRead === 'function' ) {
                fire('onConsentRead');
            } else {
                fire('onConsentRejected');
            }
            fireExpressed(expressed());
        }
        fire('onActivationDone');
        // Said here rather than at the top: told and fired are only final
        // once their callbacks and the consent-mode update have gone out.
        if ( typeof console === 'object' && typeof console.info === 'function' ) {
            const names = [];
            for ( const id of purposeIds ) {
                if ( storedPurposes[id] !== true ) { continue; }
                names.push(PURPOSE_NAMES[id] || String(id));
            }
            console.info(
                '[consent-rr] ' + NAME + ' ' + VERSION +
                ' cookie=' + cookieName +
                ' stored=' + (written === '' ? 'none' : written) +
                ' mode=' + (perPurpose ? 'per-purpose' : 'simple') +
                ' accepted=' + (names.length !== 0 ? names.join(',') : 'none') +
                ' surface=' + (reported ? 'granted' : 'denied') +
                ' tcf=' + (enableTcf
                    ? (tcString !== ''
                        ? (accept ? 'granted' : 'refused')
                        : 'absent')
                    : 'off') +
                ' told=' + told +
                ' banner=none sent=none'
            );
    
        }
    };

    // After the page has had a chance to define them: their loader runs
    // before the core arrives, and a page that sets _iub.csConfiguration.
    // callback after the loader tag still gets called by theirs.
    if ( doc.readyState === 'loading' ) {
        doc.addEventListener('DOMContentLoaded', announce, { once: true });
    } else {
        w.setTimeout(announce, 0);
    }

    /**************************************************************************/

    try {
        Object.defineProperty(w, 'iubendaConsentRR', {
            value: {
                name: NAME,
                version: VERSION,
                mode: mode,
                state: function() {
                    return {
                        cookie: cookieName,
                        written: written,
                        perPurpose: perPurpose,
                        purposes: Object.assign({}, storedPurposes),
                        reported: Object.assign({}, reportedPurposes),
                        tcf: tcString !== '' ? 'refused' : enableTcf
                            ? 'absent'
                            : 'off',
                        told: told,
                        freed: freed,
                        fired: fired,
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
