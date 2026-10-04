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

    Shared implementation for didomi-accept.js / didomi-reject.js.

    Didomi's per-tenant loader is the whole CMP: it sets the IAB vendor list,
    carries the tenant's configuration, and fetches the SDK and the UI bundle.
    Replacing the loader means nothing asks for the other two.

    Everything below was read off their own SDK rather than their docs. The
    record they write, from the function that builds a fresh one:

      { user_id, created, updated,
        vendors:     { enabled: [], disabled: [] },
        purposes:    { enabled: [], disabled: [] },
        vendors_li:  { enabled: [], disabled: [] },
        purposes_li: { enabled: [], disabled: [] },
        version: null }

    base64 in a didomi_token cookie, and in localStorage under the same name -
    their setTokenToStorages writes both, which is why this does too.

    An empty 'enabled' IS the refusal: nothing is consented, and their own
    reject path produces exactly that with the tenant's ids listed under
    'disabled'.

    Their decision path does not end at storage, which is the mistake this
    repo has made before and now checks for. After writing the token their
    code emits, in order:

      internal.consent.updated
      internal.consent.changed
      consent.changed   { consentToken, fromEUConsent, action }

    and then setBrowserCookieState(purposes.enabled). A resource that writes
    the record and stops leaves a page that is still waiting.

    What this version does NOT answer, deliberately, so a reader can tell:
    IAB TCF. There is no __tcfapi, no euconsent-v2 and no addtl_consent, and
    getUserStatus() reports an empty consent_string. A tenant whose tags wait
    on the TCF API will still need an exception until didomi-tcf.js lands. A
    wrong TC string is worse than none, because a vendor reads it as consent.

*/

function consentRRDidomi(mode) {
    const w = window;
    const doc = w.document;

    const accept = mode === 'accept';
    const NAME = 'didomi-' + mode;
    const VERSION = '@@VERSION@@';

    const COOKIE = 'didomi_token';
    // 13 months, which is the retention their own configuration defaults to.
    const DAYS = 396;

    // Their purpose ids are a fixed vocabulary rather than per-tenant strings,
    // which is what makes an accept resource possible here at all: OneTrust's
    // category ids have to be harvested from the page's parked nodes, and
    // these do not. Taken from the tenant configuration their loader carries.
    const PURPOSES = [
        'cookies',
        'select_basic_ads',
        'create_ads_profile',
        'select_personalized_ads',
        'create_content_profile',
        'select_personalized_content',
        'measure_ad_performance',
        'measure_content_performance',
        'market_research',
        'improve_products',
        'geolocation_data',
        'device_characteristics',
    ];

    const say = what => {
        try {
            w.console.info('[consent-rr] ' + NAME + ' ' + VERSION + ' ' + what);
        } catch(ex) {
        }
    };

    /**************************************************************************/

    // A page may have set its own configuration before the loader would have
    // run - didomiConfig is theirs and documented - and a tenant can name
    // purposes of its own in it. Those are ids this cannot know otherwise, so
    // they are read rather than guessed.
    const configured = ( ) => {
        const out = [];
        try {
            const config = w.didomiConfig;
            if ( config === null || typeof config !== 'object' ) { return out; }
            const custom = config.app && config.app.customPurposes;
            if ( Array.isArray(custom) === false ) { return out; }
            for ( const purpose of custom ) {
                if ( purpose === null || typeof purpose !== 'object' ) { continue; }
                const id = purpose.id;
                if ( typeof id !== 'string' || id === '' ) { continue; }
                out.push(id);
            }
        } catch(ex) {
        }
        return out;
    };

    const purposeIds = ( ) => {
        const seen = [];
        for ( const id of PURPOSES.concat(configured()) ) {
            if ( seen.includes(id) === false ) { seen.push(id); }
        }
        return seen;
    };

    const enabledIds = ( ) => accept ? purposeIds() : [];
    const disabledIds = ( ) => accept ? [] : purposeIds();

    /**************************************************************************/

    // Their own id is a uuid. One is generated here rather than left out,
    // because their record carries one and code that reads it expects the
    // shape - but it is made fresh per page load and never transmitted, so it
    // identifies nothing across a visit. No part of this resource sends it
    // anywhere.
    const newId = ( ) => {
        try {
            if ( w.crypto && typeof w.crypto.randomUUID === 'function' ) {
                return w.crypto.randomUUID();
            }
        } catch(ex) {
        }
        let out = '';
        const hex = '0123456789abcdef';
        for ( let i = 0; i < 36; i += 1 ) {
            if ( i === 8 || i === 13 || i === 18 || i === 23 ) { out += '-'; continue; }
            if ( i === 14 ) { out += '4'; continue; }
            let n = 0;
            try {
                n = Math.floor(Math.random() * 16);
            } catch(ex) {
            }
            out += hex.charAt(i === 19 ? (n & 0x3) | 0x8 : n);
        }
        return out;
    };

    const token = ( ) => {
        const now = (new Date()).toISOString();
        return {
            user_id: newId(),
            created: now,
            updated: now,
            vendors: { enabled: [], disabled: [] },
            purposes: { enabled: enabledIds(), disabled: disabledIds() },
            vendors_li: { enabled: [], disabled: [] },
            purposes_li: { enabled: enabledIds(), disabled: disabledIds() },
            // null where no TCF version applies, which is this resource's
            // position until didomi-tcf.js exists.
            version: null,
        };
    };

    let record = token();

    const encoded = ( ) => {
        try {
            return w.btoa(JSON.stringify(record));
        } catch(ex) {
        }
        return '';
    };

    /**************************************************************************/

    // Their storage service writes the token to both, so both are written
    // here. A cookie on a public suffix is refused by the browser without a
    // word, so the shortest registrable name that the browser accepts is the
    // one to use - the same walk the other resources here make.
    const writeRecord = ( ) => {
        const value = encoded();
        if ( value === '' ) { return false; }
        try {
            w.localStorage.setItem(COOKIE, value);
        } catch(ex) {
        }
        const when = new Date();
        when.setTime(when.getTime() + DAYS * 86400000);
        const tail = '; expires=' + when.toUTCString() +
            '; path=/; samesite=lax';
        let host = '';
        try {
            host = String(w.location.hostname || '');
        } catch(ex) {
        }
        const parts = host.split('.');
        for ( let i = parts.length - 2; i >= 0; i -= 1 ) {
            const domain = parts.slice(i).join('.');
            try {
                doc.cookie = COOKIE + '=' + value + tail + '; domain=.' + domain;
                if ( String(doc.cookie).indexOf(COOKIE + '=') !== -1 ) {
                    return true;
                }
            } catch(ex) {
            }
        }
        try {
            doc.cookie = COOKIE + '=' + value + tail;
        } catch(ex) {
        }
        return String(doc.cookie).indexOf(COOKIE + '=') !== -1;
    };

    /**************************************************************************/

    // What their SDK publishes for a page and for a tag manager to read. The
    // field names and the comma-joined shape are theirs; sites gate their own
    // players on these exactly as they do on OptanonActiveGroups.
    const joined = list => list.join(',');

    const stateFor = ( ) => {
        const on = enabledIds();
        const off = disabledIds();
        return {
            didomiRegulationName: 'gdpr',
            didomiGDPRApplies: 1,
            // Empty until didomi-tcf.js: there is no TC string here, and
            // inventing one would tell every vendor on the page it may
            // proceed.
            didomiIABConsent: '',
            didomiVendorsConsent: '',
            didomiVendorsConsentUnknown: '',
            didomiVendorsConsentDenied: '',
            didomiPurposesConsent: joined(on),
            didomiPurposesConsentUnknown: '',
            didomiPurposesConsentDenied: joined(off),
            didomiVendorsRawConsent: '',
            didomiVendorsRawConsentUnknown: '',
            didomiVendorsRawConsentDenied: '',
            didomiExperimentId: '',
            didomiExperimentUserGroup: '',
            didomiVendorsEnabled: '',
            didomiVendorsDisabled: '',
            didomiVendorsUnknown: '',
            didomiPurposesEnabled: joined(on),
            didomiPurposesDisabled: joined(off),
            didomiPurposesUnknown: '',
        };
    };

    const publishState = ( ) => {
        const state = stateFor();
        try {
            w.didomiState = state;
        } catch(ex) {
        }
        // Theirs pushes the same object into the data layer, which is how a
        // container's tags are gated on it.
        try {
            if ( Array.isArray(w.dataLayer) === false ) { w.dataLayer = []; }
            w.dataLayer.push(state);
        } catch(ex) {
        }
        return state;
    };

    /**************************************************************************/

    const consented = id => {
        if ( typeof id !== 'string' || id === '' ) { return accept; }
        return enabledIds().includes(id);
    };

    const userStatus = ( ) => {
        const on = enabledIds();
        const off = disabledIds();
        const both = { enabled: on, disabled: off };
        return {
            purposes: {
                consent: { enabled: on, disabled: off },
                legitimate_interest: { enabled: on, disabled: off },
                global: both,
                essential: [],
            },
            vendors: {
                consent: { enabled: [], disabled: [] },
                legitimate_interest: { enabled: [], disabled: [] },
                global: { enabled: [], disabled: [] },
                global_consent: [],
                global_li: [],
            },
            user_id: record.user_id,
            created: record.created,
            updated: record.updated,
            consent_string: '',
            addtl_consent: '',
        };
    };

    /**************************************************************************/

    // Their listener registry: an array of { event, listener } the page fills
    // before the SDK arrives, and a didomiOnReady array of plain functions.
    // Both are drained, and both keep working afterwards - a page that pushes
    // later is a page still waiting.
    const listeners = [];

    const callListener = (entry, payload) => {
        if ( entry === null || typeof entry !== 'object' ) { return; }
        const fn = entry.listener;
        if ( typeof fn !== 'function' ) { return; }
        try {
            fn(payload);
        } catch(ex) {
        }
    };

    const emit = (name, payload) => {
        for ( const entry of listeners.slice() ) {
            if ( entry.event !== name ) { continue; }
            callListener(entry, payload);
        }
    };

    const api = { };

    const consentPayload = ( ) => ({
        consentToken: record,
        fromEUConsent: false,
        action: accept ? 'agreeToAll' : 'disagreeToAll',
    });

    // Their order, from sendEvents(): the two internal names first, then the
    // public one. A page listening for any of the three hears it.
    const announce = ( ) => {
        emit('internal.consent.updated', consentPayload());
        emit('internal.consent.changed', consentPayload());
        emit('consent.changed', consentPayload());
    };

    const settle = ( ) => {
        record.updated = (new Date()).toISOString();
        writeRecord();
        publishState();
        announce();
    };

    /**************************************************************************/

    const noop = ( ) => undefined;
    const noopTrue = ( ) => true;
    const noopFalse = ( ) => false;
    const noopList = ( ) => [];

    api.on = (name, listener) => {
        listeners.push({ event: name, listener });
        // Already settled by the time a page asks, so a late listener for the
        // ready or consent events is answered rather than parked for ever.
        if ( name === 'ready' || name === 'consent.changed' ||
            name === 'internal.consent.changed' ||
            name === 'internal.consent.updated' )
        {
            callListener(
                { event: name, listener },
                name === 'ready' ? api : consentPayload()
            );
        }
        return api;
    };
    api.addEventListener = api.on;
    api.once = api.on;
    api.off = (name, listener) => {
        for ( let i = listeners.length - 1; i >= 0; i -= 1 ) {
            if ( listeners[i].event !== name ) { continue; }
            if ( listener !== undefined && listeners[i].listener !== listener ) {
                continue;
            }
            listeners.splice(i, 1);
        }
        return api;
    };
    api.removeEventListener = api.off;

    api.getUserStatus = userStatus;
    api.getCurrentUserStatus = userStatus;
    api.getUserConsentToken = ( ) => record;
    api.getUserConsentStatus = consented;
    api.getUserConsentStatusForPurpose = consented;
    api.getUserConsentStatusForVendor = ( ) => accept;
    api.getUserStatusForVendor = ( ) => accept;
    api.getUserLegitimateInterestStatusForPurpose = consented;
    api.getLegitimateInterestStatusForPurpose = consented;
    api.getLegitimateInterestStatusForVendor = ( ) => accept;
    api.getRequiredPurposes = ( ) => purposeIds().map(id => ({ id }));
    api.getRequiredPurposeIds = purposeIds;
    api.getRequiredVendors = noopList;
    api.getRequiredVendorIds = noopList;
    api.getConfig = ( ) => {
        try {
            return w.didomiConfig || {};
        } catch(ex) {
        }
        return {};
    };
    api.getTranslatedText = text => text;
    api.getTCFVersion = ( ) => null;
    api.getObservableOnUserConsentStatusForVendor = ( ) => ({
        subscribe: noop,
        unsubscribe: noop,
    });

    // The questions a page asks before deciding to show anything of its own.
    // A visitor who has already answered is the whole point of this resource.
    api.isConsentRequired = noopFalse;
    api.shouldConsentBeCollected = noopFalse;
    api.isUserConsentStatusPartial = noopFalse;
    api.isUserLegitimateInterestStatusPartial = noopFalse;
    api.willNoticeBeShown = noopFalse;
    api.willAutoShowNotice = noopFalse;
    api.isNoticeVisible = noopFalse;
    api.isPreferencesVisible = noopFalse;
    api.isRegulationApplied = ( ) => 'gdpr';
    api.isPurposeRestrictedForVendor = noopFalse;

    // Their UI, which is not here. hide() answering is what matters: a page
    // that closes the banner itself must not throw.
    api.notice = {
        show: noop,
        hide: noop,
        isVisible: noopFalse,
        willNoticeBeShown: noopFalse,
    };
    api.preferences = {
        show: noop,
        hide: noop,
        isVisible: noopFalse,
    };
    api.openCurrentIABVendor = noopFalse;

    // A page may drive the decision itself. Honour the call rather than
    // ignoring it: a reject resource asked to agree re-records as agreed, and
    // the page gets what it asked for.
    const setAll = agreed => {
        if ( agreed === accept ) {
            settle();
            return true;
        }
        return false;
    };
    api.setUserAgreeToAll = ( ) => setAll(true);
    api.setUserDisagreeToAll = ( ) => setAll(false);
    api.setUserStatus = noopTrue;
    api.setCurrentUserStatus = noopTrue;
    api.setUserStatusGlobally = noopTrue;
    api.reset = noop;
    api.updateSelectedUIVendor = noop;
    api.setUserAuthToken = noop;
    api.getUserAuthToken = ( ) => null;
    api.setStorageItem = noop;
    api.getStorageItem = ( ) => null;
    api.initWidgets = noop;
    api.sendPageview = noop;
    api.loadExternalConsent = noopTrue;
    api.getVersion = ( ) => '';
    api.consentRRDidomi = VERSION;

    /**************************************************************************/

    const drainReady = ( ) => {
        let queued = [];
        try {
            if ( Array.isArray(w.didomiOnReady) ) { queued = w.didomiOnReady; }
        } catch(ex) {
        }
        const ready = [];
        ready.push = fn => {
            if ( typeof fn !== 'function' ) { return 1; }
            try {
                fn(api);
            } catch(ex) {
            }
            return 1;
        };
        try {
            w.didomiOnReady = ready;
        } catch(ex) {
        }
        for ( const fn of queued.slice() ) {
            if ( typeof fn !== 'function' ) { continue; }
            try {
                fn(api);
            } catch(ex) {
            }
        }
        return queued.length;
    };

    const drainListeners = ( ) => {
        let queued = [];
        try {
            if ( Array.isArray(w.didomiEventListeners) ) {
                queued = w.didomiEventListeners;
            }
        } catch(ex) {
        }
        for ( const entry of queued.slice() ) {
            if ( entry === null || typeof entry !== 'object' ) { continue; }
            listeners.push(entry);
        }
        const kept = listeners;
        const live = [];
        live.push = entry => {
            if ( entry !== null && typeof entry === 'object' ) {
                kept.push(entry);
                if ( entry.event === 'ready' ) { callListener(entry, api); }
                else if ( String(entry.event || '').indexOf('consent.') !== -1 ) {
                    callListener(entry, consentPayload());
                }
            }
            return 1;
        };
        try {
            w.didomiEventListeners = live;
        } catch(ex) {
        }
        return queued.length;
    };

    /**************************************************************************/

    let there = null;
    try {
        there = w.Didomi;
    } catch(ex) {
    }
    if ( there !== null && there !== undefined ) {
        // Their SDK arrived, or a second copy of this did. Theirs owns the
        // page either way.
        say('kept=theirs');
        return;
    }

    try {
        w.Didomi = api;
    } catch(ex) {
        say('refused=window');
        return;
    }

    const wrote = writeRecord();
    publishState();
    const listenerCount = drainListeners();
    const readyCount = drainReady();
    announce();

    // Their own DOM event, for a page that waits on it rather than on the
    // listener registry.
    try {
        const event = new w.Event('didomi-ready');
        w.dispatchEvent(event);
    } catch(ex) {
    }

    say('purposes=' + (accept ? 'all' : 'none') +
        ' token=' + (wrote ? 'written' : 'refused') +
        ' ready=' + readyCount +
        ' listeners=' + listenerCount +
        ' tcf=absent');
}
