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

    Stands in for Usercentrics' loader.js, the CMP itself. Their blocker is a
    separate script, uc-block.bundle.js from privacy-proxy.usercentrics.eu, and
    it is deliberately left in place: it is the thing that enforces a refusal,
    and it reads that refusal out of localStorage rather than from the CMP.

    Read off the shipped bundles rather than from documentation:
      uc-block.js         isCMPv3() is script[src$=".cmp.usercentrics.eu/ui
                          /loader.js"], and for v3 it reads consent from
                          JSON.parse(localStorage.ucData).consent.services
      uc-block.js         it patches Storage.prototype.setItem and watches
                          uc_settings, ucSettings and ucData: a write marks the
                          CMP loaded and sets each service's status. A write of
                          a value it already has is skipped, so the write here
                          happens once
      uc-block.js         disabledProviders is every provider NOT in
                          whitelisted, and whitelisted holds the ids that have
                          consent - so a provider it was never told about stays
                          blocked
      loader.js           window.__ucCmp = new D, then UC_CMP_API_READY, then
                          the config off <script id="usercentrics-cmp">, then
                          UC_UI_INITIALIZED once the UI is up
      websdk.js           localStorage keys ucString, ucData, ucGcmStatus,
                          ucTaglogger, cmpPrivacyNoticeDismissed
      websdk.js           the Google consent-mode map, adsDataRedaction with
                          adStorage, adPersonalization, adUserData and
                          analyticsStorage, pushed as gtag pushes: the
                          arguments object into window.dataLayer

    The service ids are the part no page can supply. They come back from their
    settings API, keyed per tenant, so a first visit can only write an empty
    services map - which is enough, because the blocker's disabledProviders is
    every provider NOT in its whitelist, so an id it was never told about stays
    blocked.

    An empty map is not enough for a visitor who had accepted, though, and that
    is the one case worth getting right. The blocker builds its whitelist at
    construction from whatever record is already there, and its setItem hook
    only visits the ids present in the value written over it - so an empty map
    says nothing about them and they stay consented. The ids are in that old
    record, so the refusal names every one of them with consent:false, which is
    what their own deny-all writes too. Both shapes are read: ucData for a v3
    page, and uc_settings - their v2 key, { services: [ { id, status } ] } -
    because the blocker falls back to the v2 branch whenever it cannot see a
    loader tag, which is what injecting as a scriptlet looks like.

*/

function consentRRUsercentrics() {
    const w = window;
    const doc = w.document;
    const VERSION = '@@VERSION@@';
    const NAME = 'usercentrics-reject';

    // Does nothing the second time it is injected.
    if ( w.__ucCmp !== null && typeof w.__ucCmp === 'object' ) {
        if ( w.__ucCmp.consentRR !== undefined ) { return; }
    }

    // Their localStorageService key, and the v2 one their blocker still reads.
    const DATA = 'ucData';
    const SETTINGS = 'uc_settings';

    // Their own script tag lookup, which also carries the configuration.
    const tag = doc.getElementById('usercentrics-cmp');

    const attribute = name => {
        if ( tag === null ) { return ''; }
        try {
            const value = tag.getAttribute(name);
            return typeof value === 'string' ? value : '';
        } catch(ex) {
        }
        return '';
    };

    const settingsId = attribute('data-settings-id');

    // Their languages are lowercase two-letter codes, so a document language
    // of en-GB is read as en. Only the blocker reads this, to pick the
    // translation for a placeholder it leaves in place.
    const language = ( ) => {
        const named = attribute('data-language');
        if ( named !== '' ) { return named.toLowerCase().slice(0, 2); }
        try {
            const lang = doc.documentElement.lang;
            if ( typeof lang === 'string' && lang !== '' ) {
                return lang.toLowerCase().slice(0, 2);
            }
        } catch(ex) {
        }
        return 'en';
    };

    const gpc = w.navigator.globalPrivacyControl === true;

    // Their GcmModel map with nothing granted. adsDataRedaction is theirs for
    // a denied visitor, and it is the one field that is not a consent state.
    const GCM = {
        adsDataRedaction: true,
        adStorage: 'denied',
        adPersonalization: 'denied',
        adUserData: 'denied',
        analyticsStorage: 'denied',
    };

    const read = name => {
        try {
            const raw = w.localStorage.getItem(name);
            if ( typeof raw !== 'string' || raw === '' ) { return null; }
            const parsed = JSON.parse(raw);
            if ( parsed === null || typeof parsed !== 'object' ) { return null; }
            return parsed;
        } catch(ex) {
        }
        return null;
    };

    // Every service id already on record, named so the refusal revokes it.
    // Their own deny-all keeps each service's name beside its consent, so a
    // name already there is kept.
    const refuse = ( ) => {
        const services = {};
        const previous = read(DATA);
        try {
            const theirs = previous !== null && previous.consent !== null &&
                typeof previous.consent === 'object'
                ? previous.consent.services
                : null;
            if ( theirs !== null && typeof theirs === 'object' ) {
                for ( const id of Object.keys(theirs) ) {
                    const service = theirs[id];
                    const name = service !== null && typeof service === 'object'
                        ? service.name
                        : undefined;
                    services[id] = typeof name === 'string'
                        ? { name, consent: false }
                        : { consent: false };
                }
            }
        } catch(ex) {
        }
        // Their v2 record, which is a list rather than a map.
        const legacy = read(SETTINGS);
        try {
            const list = legacy !== null ? legacy.services : null;
            if ( Array.isArray(list) ) {
                for ( const service of list ) {
                    if ( service === null || typeof service !== 'object' ) { continue; }
                    const id = service.id;
                    if ( typeof id !== 'string' || id === '' ) { continue; }
                    if ( services[id] !== undefined ) { continue; }
                    services[id] = typeof service.name === 'string'
                        ? { name: service.name, consent: false }
                        : { consent: false };
                }
            }
        } catch(ex) {
        }
        return { services, legacy };
    };

    const refused = refuse();

    // The record their blocker reads.
    const record = {
        gcm: GCM,
        consent: { services: refused.services },
        ui: { language: language() },
    };

    const value = JSON.stringify(record);

    // Their setItem patch skips a value it already has, which would leave the
    // blocker unaware on a second page. Reading first keeps the write to the
    // one case where it tells them something.
    const store = ( ) => {
        try {
            if ( w.localStorage.getItem(DATA) === value ) { return 'kept'; }
            w.localStorage.setItem(DATA, value);
            return w.localStorage.getItem(DATA) === value ? 'written' : 'refused';
        } catch(ex) {
        }
        return 'refused';
    };

    // Their v2 record is only rewritten where the page already has one: the
    // blocker reads it whenever it cannot see a loader tag, and a status left
    // true there would keep that service whitelisted. None is invented.
    const storeLegacy = ( ) => {
        const legacy = refused.legacy;
        if ( legacy === null ) { return 'absent'; }
        if ( Array.isArray(legacy.services) === false ) { return 'absent'; }
        try {
            const services = legacy.services.map(service => {
                if ( service === null || typeof service !== 'object' ) { return service; }
                return Object.assign({}, service, { status: false });
            });
            const next = JSON.stringify(Object.assign({}, legacy, { services }));
            if ( w.localStorage.getItem(SETTINGS) === next ) { return 'kept'; }
            w.localStorage.setItem(SETTINGS, next);
            return 'written';
        } catch(ex) {
        }
        return 'refused';
    };

    // Their GcmModel.push: the arguments object, into window.dataLayer. Not an
    // array of it - consent mode reads the first kind.
    const pushGcm = ( ) => {
        try {
            if ( Array.isArray(w.dataLayer) === false ) { w.dataLayer = []; }
            const layer = w.dataLayer;
            const push = function() {
                layer.push(arguments);
            };
            // Their order, and their own condition: an explicit save pushes
            // the update even when everything in it is denied.
            push('consent', 'update', {
                ad_storage: GCM.adStorage,
                ad_personalization: GCM.adPersonalization,
                ad_user_data: GCM.adUserData,
                analytics_storage: GCM.analyticsStorage,
            });
            push('set', 'ads_data_redaction', GCM.adsDataRedaction);
            return true;
        } catch(ex) {
        }
        return false;
    };

    const fire = (name, detail) => {
        try {
            const event = detail === undefined
                ? new w.CustomEvent(name)
                : new w.CustomEvent(name, { detail });
            w.dispatchEvent(event);
        } catch(ex) {
        }
    };

    const resolved = value_ => ( ) => Promise.resolve(value_);

    // Their __ucCmp facade, which answers with promises as theirs does. The
    // ones that would show a layer, save a decision or take one resolve
    // without doing anything: there is no UI, and nothing is granted here.
    const cmp = {
        consentRR: VERSION,
        init: resolved(undefined),
        isInitialized: resolved(true),
        getCmpConfig: resolved({ i18n: {}, ui: {} }),
        getConsentDetails: resolved({ services: {}, categories: {} }),
        getServicesBaseInfo: resolved([]),
        getServicesFullInfo: resolved([]),
        getActiveLanguage: resolved(record.ui.language),
        getControllerId: resolved(''),
        getSettingsCore: resolved(settingsId === ''
            ? undefined
            : { id: settingsId }),
        isConsentRequired: resolved(false),
        areAllConsentsAccepted: resolved(false),
        areAllRequiredConsentsAccepted: resolved(false),
        showFirstLayer: resolved(undefined),
        showSecondLayer: resolved(undefined),
        showServiceDetails: resolved(undefined),
        showDsrForm: resolved(undefined),
        showAutoblockerMoreInfoView: resolved(undefined),
        closeCmp: resolved(undefined),
        acceptAllConsents: resolved(undefined),
        denyAllConsents: resolved(undefined),
        updateServicesConsents: resolved(undefined),
        updateCategoriesConsents: resolved(undefined),
        updateTcfConsents: resolved(undefined),
        saveConsents: resolved(undefined),
        changeLanguage: resolved(undefined),
        updateTheme: resolved(undefined),
        refreshScripts: resolved(undefined),
        removePreviousEmbeddings: resolved(undefined),
        hydrateEmbeddings: resolved(undefined),
        isAgeVerificationConfigured: resolved(false),
        isAgeVerificationEnabled: resolved(false),
        isAgeVerificationRequired: resolved(false),
        clearUserSession: resolved(undefined),
        clearStorage: resolved(undefined),
        restoreUserSession: resolved(undefined),
        setView: resolved(undefined),
        loadCmpView: resolved(undefined),
    };

    // Their UC_UI compat layer, which is what a site's own code calls and what
    // the blocker asks when it cannot see a v3 loader tag - injected as a
    // scriptlet there is none, and its isCMPv2() branch is the one that runs.
    const ui = {
        consentRR: VERSION,
        isInitialized: ( ) => true,
        getServicesBaseInfo: ( ) => [],
        getServicesFullInfo: ( ) => [],
        getSettingsLabels: ( ) => ({}),
        // Theirs answer undefined on a v3 page, so these do too.
        getSettingsCore: ( ) => undefined,
        getSettingsUI: ( ) => undefined,
        getTCFVendors: ( ) => undefined,
        areAllConsentsAccepted: ( ) => false,
        areAllRequiredConsentsAccepted: ( ) => false,
        getControllerId: resolved(''),
        getActiveLanguage: resolved(record.ui.language),
        getConsentDetails: cmp.getConsentDetails,
        isConsentRequired: resolved(false),
        acceptService: resolved(undefined),
        acceptServices: resolved(undefined),
        rejectService: resolved(undefined),
        rejectServices: resolved(undefined),
        acceptAllConsents: resolved(undefined),
        denyAllConsents: resolved(undefined),
        denyAndCloseCcpa: resolved(undefined),
        updateServices: resolved(undefined),
        updateChoicesForTcf: resolved(undefined),
        enableScriptsForServicesWithConsent: resolved(undefined),
        getTCFDisclosedVendorsSegmentString: resolved(''),
        injectTCString: resolved(false),
        showFirstLayer: resolved(undefined),
        showSecondLayer: resolved(undefined),
        showServiceDetails: resolved(undefined),
        closeCMP: resolved(undefined),
        restartCMP: resolved(undefined),
        restartEmbeddings: resolved(undefined),
        updateLanguage: resolved(undefined),
        clearStorage: resolved(undefined),
    };

    const define = (name, object) => {
        try {
            w[name] = object;
            return w[name] === object;
        } catch(ex) {
        }
        return false;
    };

    define('__ucCmp', cmp);
    // Their order: the API exists, and is announced, before anything else.
    fire('UC_CMP_API_READY');

    const stored = store();
    const storedLegacy = storeLegacy();
    const pushed = pushGcm();
    define('UC_UI', ui);

    if ( settingsId !== '' ) {
        fire('UC_SETTINGS_ID_RESOLVED', { settingsId, sandbox: false });
    }
    fire('UC_GCM_UPDATE', GCM);
    // Last, as theirs is: the blocker marks the CMP loaded here, and for a v3
    // page re-reads the record this already wrote.
    fire('UC_UI_INITIALIZED');

    try {
        w.console.info(
            '[consent-rr] ' + NAME + ' ' + VERSION +
            ' settings=' + (settingsId !== '' ? settingsId : 'unknown') +
            ' lang=' + record.ui.language +
            ' revoked=' + (Object.keys(refused.services).length || 'none') +
            ' gcm=' + (pushed ? 'denied' : 'refused') +
            ' gpc=' + (gpc ? 'on' : 'off') +
            ' data=' + stored +
            (storedLegacy !== 'absent' ? ' v2=' + storedLegacy : '')
        );
    } catch(ex) {
    }
}
