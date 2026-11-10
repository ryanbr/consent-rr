/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    Home: https://github.com/ryanbr/consent-rr

    Sourcepoint's unified wrapper: the window._sp_ surface, the queue their
    own loader drains, the event callbacks a page registers through
    _sp_.config.events, and the refusal.

    Everything here was measured in the file being replaced -
    cdn.privacy-mgmt.com/unified/wrapperMessagingWithoutDetection.js, build
    4.40.3 - and in the campaign chunk it loads for a GDPR property,
    unified/4.40.3/gdpr-tcf.<hash>.bundle.js. Nothing is from their docs.

    WHY THE WHOLE THING GOES WITH ONE RULE. That file is a webpack bundle with
    its chunks behind __webpack_require__.e, and its publicPath is

        window._sp_.config.baseEndpoint || "https://cdn.privacy-mgmt.com"
        ... + "/unified/4.40.3/"

    so the campaign modules - ccpa, ccpa-gpp, custom, gdpr, gdpr-tcf,
    globalcmp, hbbtv, preferences, usnat, usnat-uspapi - are only ever asked
    for by the wrapper. Replace the wrapper and no chunk is ever requested,
    which is also why nothing is left to put up a banner: their message is an
    iframe one of those chunks appends.

    WHAT THEY DO ON A PROPERTY WITH NOTHING TO SHOW is the specification for
    this, the same way Funding Choices' inactive script was for theirs. Their
    gdpr campaign's checkForMessage() ends:

        this.updateCmpPost()
        executeEventCallback("onMessageReceiveData", [{messageId: 0}], "gdpr")
        executeEventCallback("onConsentReady",
            [uuid, euconsent,
             {addtlConsent, applies, consentedToAll: consentStatus &&
              consentStatus.consentedAll}], "gdpr")

    and the wrapper around it fires onSPPMObjectReady and onSPReady first,
    then dispatches sp:onBeforeShowMessages at the window with a messageCount,
    then onInteractionComplete and sp:onAfterShowMessages. That order is
    reproduced exactly, with messageCount 0, because a refusal has no message.

    THEIR CALLBACK SIGNATURE PUTS THE CAMPAIGN FIRST. executeEventCallback is

        l[name].forEach(cb => cb.call(null, category, ...args))

    so a page's onConsentReady is called (campaign, uuid, euconsent, info) and
    not (uuid, euconsent, info). Reading that off their dispatcher rather than
    off a doc page matters: the arguments a page destructures would all be one
    position out.

    THE REFUSAL IS euconsent-v2 AND NOTHING ELSE OF THEIRS, because of how
    their consent is stored. Their own script writes no consent cookie
    directly: the campaign response carries a cookies array and their
    setCookiesAction writes what the server says, so the names and values of
    consentUUID and gdprApplies are their consent service's to mint, not a
    stub's. euconsent-v2 is the one in that set anything else reads - an ad
    stack, an SSP, the publisher's own server off the Cookie header - so that
    one is written, with a string that grants nothing. Their own
    resetUserState names the three for a gdpr property, which is where the
    list comes from:

        gdpr: ["consentUUID", "gdprApplies", "euconsent-v2"]

    A record a visitor consented to before this was installed is cleared:
    their localStorage record under _sp_user_consent_<propertyId>, its
    _sp_sync_consent_<propertyId> twin, the legacy _sp_user_consent their own
    cleanOldConsent removes, and the consentUUID that keys them at their
    service. gdprApplies is left exactly as it is - it says whether the
    regulation applies to this visitor, which is not an answer a visitor gave.

    Nothing is written in their record's place. Its key needs the propertyId
    their /get-property endpoint answers with, and the only thing that reads
    the record is the script being replaced.

*/

// @include ../../shared/lib/present.js
// @include ../../shared/lib/deferred.js

function consentRRSourcepoint(installTcf) {
    'use strict';

    const w = window;
    const doc = w.document;
    const NAME = 'sourcepoint-reject';
    const VERSION = '@@VERSION@@';

    // The build of the file this stands in for, as its own BUILD_INFORMATION
    // and its publicPath both carry it. A page reads _sp_.version for their
    // metrics payload; it is not a gate anywhere, so claiming it is a
    // description of what was replaced rather than a version of this.
    const SCRIPT_VERSION = '4.40.3';
    // Their own default baseEndpoint, from the constants module that also
    // holds the cmp id: a = ccpa-pm.sp-prod.net, c = preprod-cdn, d = this.
    const DEFAULT_ORIGIN = 'https://cdn.privacy-mgmt.com';
    const RECORD_KEY = '_sp_user_consent_';
    const SYNC_KEY = '_sp_sync_consent_';
    const LEGACY_RECORD = '_sp_user_consent';
    // Thirteen months is the IAB's re-ask ceiling for a TCF record and is
    // what their service sets euconsent-v2 for. The expiry is the one value
    // here their server would otherwise have chosen.
    const CONSENT_DAYS = 390;
    const CAMPAIGNS = [
        'ccpa', 'custom', 'gdpr', 'globalcmp', 'preferences', 'usnat',
    ];

    let cookiesWritten = 0;
    let cleared = 0;
    let fired = 0;
    let drained = 0;
    let tcfState = 'off';

    /**************************************************************************/

    const configOf = ( ) => {
        try {
            const sp = w._sp_;
            if ( typeof sp !== 'object' || sp === null ) { return; }
            const config = sp.config;
            if ( typeof config !== 'object' || config === null ) { return; }
            return config;
        } catch ( ex ) {
        }
    };

    // An absent configuration is not an empty one: a page that prints
    // window._sp_ = {config: {...}} in one statement is ready at once, while
    // one that builds it up over two is not ready at the first. Their own
    // normaliser defaults every field it cares about, so a config with
    // anything in it is a real deployment.
    const configReady = config => {
        if ( config === undefined ) { return false; }
        try {
            return Object.keys(config).length !== 0;
        } catch ( ex ) {
        }
        return false;
    };

    const asString = (value, fallback) => (
        typeof value === 'string' && value !== '' ? value : fallback
    );

    /**************************************************************************/

    // Their setCookies: the host, and then again on the registrable domain,
    // with .co.uk, .com.br, .com.au, .co.nz, .co.jp and .com.hk taking three
    // labels instead of two. Theirs writes no path, which scopes a cookie
    // written on /article to that directory; this adds path=/ so a refusal
    // holds for the whole site, which is the one deliberate difference.
    const domainsFor = host => {
        const out = [];
        try {
            if ( typeof host !== 'string' || host === '' ) { return out; }
            const labels = host.split('.');
            const twoLevel =
                /\.co\.uk$|\.com\.br$|\.com\.au$|\.co\.nz$|\.co\.jp$|\.com\.hk$/
                .test(host);
            const keep = twoLevel ? 3 : 2;
            if ( labels.length > keep ) {
                out.push(labels.slice(labels.length - keep).join('.'));
            } else if ( labels.length === keep ) {
                out.push(host);
            }
        } catch ( ex ) {
        }
        return out;
    };

    const writeCookie = (key, value, days) => {
        const bits = [ key + '=' + value, 'path=/' ];
        if ( typeof days === 'number' ) {
            const when = new Date(Date.now() + days * 86400000);
            bits.push('expires=' + when.toUTCString());
        }
        let host = '';
        try {
            host = String(w.location.hostname || '');
        } catch ( ex ) {
        }
        try {
            doc.cookie = bits.join('; ');
        } catch ( ex ) {
        }
        for ( const domain of domainsFor(host) ) {
            try {
                doc.cookie = bits.concat('domain=' + domain).join('; ');
            } catch ( ex ) {
            }
        }
    };

    const readCookie = key => {
        try {
            for ( const pair of String(doc.cookie).split(';') ) {
                const at = pair.indexOf('=');
                if ( at === -1 ) { continue; }
                if ( pair.slice(0, at).trim() !== key ) { continue; }
                return pair.slice(at + 1).trim();
            }
        } catch ( ex ) {
        }
        return '';
    };

    const dropCookie = key => {
        writeCookie(key, '', -1);
    };

    /**************************************************************************/

    // The stale record. Their own key is _sp_user_consent_<propertyId>, and
    // the propertyId comes off their /get-property call - so the keys are
    // found by their prefix rather than rebuilt, which also catches a visitor
    // whose property id changed.
    const clearStoredConsent = ( ) => {
        try {
            const store = w.localStorage;
            const doomed = [];
            for ( let i = 0; i < store.length; i++ ) {
                const key = store.key(i);
                if ( typeof key !== 'string' ) { continue; }
                if (
                    key === LEGACY_RECORD ||
                    key.startsWith(RECORD_KEY) ||
                    key.startsWith(SYNC_KEY)
                ) {
                    doomed.push(key);
                }
            }
            for ( const key of doomed ) {
                store.removeItem(key);
                cleared += 1;
            }
        } catch ( ex ) {
        }
        if ( readCookie('consentUUID') !== '' ) {
            dropCookie('consentUUID');
            cleared += 1;
        }
    };

    /**************************************************************************/

    const listeners = new Map();

    const addListener = (name, fn) => {
        if ( typeof name !== 'string' || typeof fn !== 'function' ) { return; }
        const held = listeners.get(name);
        if ( held === undefined ) {
            listeners.set(name, [ fn ]);
            return;
        }
        held.push(fn);
    };

    const removeListener = (name, fn) => {
        const held = listeners.get(name);
        if ( held === undefined ) { return; }
        listeners.set(name, held.filter(entry => entry !== fn));
    };

    // Theirs, argument for argument: the campaign name goes in front of
    // whatever the caller passed. Theirs logs a callback that throws; this
    // stays quiet, because a page's own exception on somebody else's console
    // line is noise rather than evidence.
    const executeEventCallback = (name, args, category) => {
        const held = listeners.get(name);
        if ( held === undefined ) { return; }
        const passed = Array.isArray(args) ? args : [];
        for ( const fn of held.slice() ) {
            if ( typeof fn !== 'function' ) { continue; }
            try {
                fn.call(null, category, ...passed);
                fired += 1;
            } catch ( ex ) {
            }
        }
    };

    // Their dispatchEvent: a CustomEvent at the WINDOW, carrying detail.
    // Not at the document - a page hooks these with window.addEventListener.
    const dispatchAt = (name, detail) => {
        try {
            const ev = new w.CustomEvent(name, { detail });
            w.dispatchEvent(ev);
        } catch ( ex ) {
        }
    };

    /**************************************************************************/

    // Their queue hand-off, exactly: run what is already queued with the
    // _sp_ object, keep it as processedQueue, then replace _sp_queue with an
    // array whose push IS the runner, so a later push executes at once.
    // One function, not one per call: theirs compares _sp_queue.push against
    // the runner to decide whether the hand-off has already happened, and a
    // closure built inside the call can never match it - the guard would read
    // as if it did something and do nothing.
    const runQueued = fn => {
        try {
            if ( typeof fn === 'function' ) {
                fn(w._sp_);
                drained += 1;
            }
        } catch ( ex ) {
        }
    };

    const drainQueue = ( ) => {
        const call = runQueued;
        try {
            if ( Array.isArray(w._sp_queue) === false ) { w._sp_queue = []; }
            if ( w._sp_queue.push === call ) { return; }
            const queued = w._sp_queue;
            queued.map(call);
            w._sp_.processedQueue = queued;
            w._sp_queue = Object.defineProperties([], {
                push: { value: call },
            });
        } catch ( ex ) {
        }
    };

    /**************************************************************************/

    // Their own wrapper reads it as exactly true, and only for their ccpa,
    // globalcmp and usnat campaigns - which is why it reaches the callbacks
    // for those and nothing else here.
    const gpcSignal = ( ) => {
        try {
            return w.navigator.globalPrivacyControl === true;
        } catch ( ex ) {
        }
        return false;
    };

    const uuid = ( ) => {
        try {
            const bytes = new Uint8Array(16);
            w.crypto.getRandomValues(bytes);
            bytes[6] = (bytes[6] & 0x0f) | 0x40;
            bytes[8] = (bytes[8] & 0x3f) | 0x80;
            const hex = [];
            for ( const byte of bytes ) {
                hex.push((byte < 16 ? '0' : '') + byte.toString(16));
            }
            const text = hex.join('');
            return [
                text.slice(0, 8), text.slice(8, 12), text.slice(12, 16),
                text.slice(16, 20), text.slice(20),
            ].join('-');
        } catch ( ex ) {
        }
        return '';
    };

    /**************************************************************************/

    // What their gdpr campaign hangs on _sp_.gdpr once its chunk has run:
    // deleteConsentCookies, loadPrivacyManagerModal, loadPrivacyManagerOtt
    // and loadNativeOtt from the campaign itself, and
    // getCustomVendorConsents, postCustomConsent, postRejectAll and
    // getVendorPurposeMapping from the module their TCF custom commands
    // share. Argument orders are theirs: the callback comes first in
    // getCustomVendorConsents and postCustomConsent, because their wrapper
    // passes it on as n.c(callback_second) - see module 203.
    const gdprApi = tcString => {
        // Their getCustomVendorConsentFromMemory shape, answered off a
        // refusal: nothing consented, no grants. newUser is false because a
        // decision does exist - theirs reads a stored consentStatus to say
        // the same thing.
        const consents = ( ) => ({
            consentedPurposes: [],
            consentedVendors: [],
            legIntPurposes: [],
            dateCreated: new Date().toISOString(),
            grants: {},
            newUser: false,
        });
        const answer = (fn, value, ok) => {
            try {
                if ( typeof fn === 'function' ) { fn(value, ok); }
            } catch ( ex ) {
            }
        };
        return {
            deleteConsentCookies: ( ) => {
                for ( const key of [ 'consentUUID', 'euconsent-v2' ] ) {
                    dropCookie(key);
                }
                clearStoredConsent();
                return Promise.resolve();
            },
            // There is no privacy manager to open: it is an iframe served by
            // a chunk of the file that was replaced. A page's settings
            // button gets a resolved promise and no dialog, rather than a
            // rejection it has no handler for.
            loadPrivacyManagerModal: ( ) => Promise.resolve(),
            loadPrivacyManagerOtt: ( ) => Promise.resolve(),
            loadNativeOtt: ( ) => Promise.resolve(),
            getCustomVendorConsents: fn => {
                answer(fn, consents(), true);
            },
            // Asked to consent to custom vendors, this answers with the
            // refusal it already recorded rather than posting one: their
            // call is a POST to /consent/v3/custom, and the endpoint is
            // behind the file that is gone.
            postCustomConsent: fn => {
                answer(fn, consents(), true);
            },
            postRejectAll: fn => {
                answer(fn, consents(), true);
            },
            // Their own failure path for this one calls back (null, false),
            // which is what a mapping that cannot be fetched looks like.
            getVendorPurposeMapping: fn => {
                answer(fn, null, false);
            },
        };
    };

    /**************************************************************************/

    const install = config => {
        const sp = w._sp_;
        const events = typeof config.events === 'object' && config.events !== null
            ? config.events
            : {};
        const origin = asString(config.wrapperAPIOrigin, DEFAULT_ORIGIN);
        const present = CAMPAIGNS.filter(name => {
            const campaign = config[name];
            return typeof campaign === 'object' && campaign !== null;
        });

        const surface = {
            addEventListener: addListener,
            removeEventListener: removeListener,
            destroyMessages: ( ) => {
                try {
                    w._sp_queue = [];
                } catch ( ex ) {
                }
            },
            metricUrl: origin + '/metrics/v1/custom-metrics',
            metricData: {
                accountId: String(config.accountId === undefined
                    ? ''
                    : config.accountId),
                propertyHref: config.propertyHref,
                propertyId: '',
            },
            resetUserState: category => {
                const theirs = {
                    adblock: [],
                    ccpa: [ 'ccpaUUID', 'ccpaApplies' ],
                    gdpr: [ 'consentUUID', 'gdprApplies', 'euconsent-v2' ],
                    globalcmp: [ 'globalcmpUUID' ],
                    preferences: [],
                    usnat: [ 'usNatUUID' ],
                };
                let names = [
                    'hasGlobalScope', '_sp_enable_dfp_personalized_ads',
                    'authId', 'resolved',
                ];
                if ( typeof category === 'string' ) {
                    names = names.concat(theirs[category] || []);
                } else {
                    for ( const key of Object.keys(theirs) ) {
                        names = names.concat(theirs[key]);
                    }
                }
                for ( const key of names ) { dropCookie(key); }
                clearStoredConsent();
            },
            requestUUID: uuid(),
            version: SCRIPT_VERSION,
            writeCookie: value => {
                try {
                    doc.cookie = value;
                } catch ( ex ) {
                }
            },
            // Theirs is their Google consent mode module's own entry point.
            // Nothing is pushed to a page's dataLayer here: the gcmStatus
            // their callbacks are handed is built by their consent service,
            // and a refusal invented in its shape would be a payload nobody
            // measured. See the gaps in the list.
            gcm: { detectLateConsent: ( ) => undefined },
            updateGoogleConsentMode: fn => {
                if ( typeof fn === 'function' ) { addListener('gcm', fn); }
            },
            ccpa: {},
            globalcmp: {},
            preferences: {},
            usnat: {},
        };
        surface.destroyMessaging = surface.destroyMessages;

        for ( const key of Object.keys(surface) ) {
            try {
                sp[key] = surface[key];
            } catch ( ex ) {
            }
        }

        // Their clearEventListeners runs before the page's own events are
        // registered, so a second pass cannot double-register them.
        listeners.clear();
        for ( const name of Object.keys(events) ) {
            addListener(name, events[name]);
        }

        // The IAB layer goes in where the property has a gdpr campaign and
        // has not turned it off, which is their own test: includeTcfApi
        // false loads the plain gdpr chunk, anything else loads gdpr-tcf.
        const gdpr = config.gdpr;
        const wantsTcf = typeof gdpr === 'object' && gdpr !== null &&
            gdpr.includeTcfApi !== false;
        let tcString = null;
        if ( wantsTcf && typeof installTcf === 'function' ) {
            // In its own try: the rest of this - their surface, their
            // callbacks, the stale record - is worth having even if the IAB
            // layer cannot be built, and the line then says tcf=off rather
            // than the install going missing without a word.
            try {
                const layer = installTcf(config, readCookie('euconsent-v2'));
                if ( layer !== undefined && layer !== null ) {
                    tcString = layer.tcString;
                    tcfState = 'refused';
                }
            } catch ( ex ) {
            }
        }

        clearStoredConsent();
        if ( typeof tcString === 'string' && tcString !== '' ) {
            writeCookie('euconsent-v2', tcString, CONSENT_DAYS);
            cookiesWritten += 1;
        }

        sp.gdpr = typeof gdpr === 'object' && gdpr !== null
            ? gdprApi(tcString)
            : {};

        sp.consentRR = { name: NAME, version: VERSION };

        drainQueue();

        // Their order, with no message to show.
        const messaging = ( ) => {
            executeEventCallback('onSPPMObjectReady');
            executeEventCallback('onSPReady');
            // Theirs normalises this as "void 0 === S || S", so an absent
            // value runs the pass and ANY falsy one turns it off - not just
            // a literal false.
            if (
                config.runMessaging !== undefined &&
                Boolean(config.runMessaging) === false
            ) {
                return;
            }
            for ( const name of present ) {
                executeEventCallback(
                    'onMessageReceiveData', [ { messageId: 0 } ], name
                );
                // Their five campaign chunks do NOT agree past this point,
                // which is the whole reason this is a table rather than one
                // call. Their own checkForMessage, chunk by chunk:
                //   gdpr        onConsentReady [uuid, euconsent,
                //               {addtlConsent, applies, consentedToAll}]
                //   ccpa        onConsentReady [uuid, uspString,
                //               {applies, gpcEnabled}]
                //   usnat       the same pair of fields as ccpa
                //   globalcmp   the same again
                //   custom      nothing else at all
                //   preferences nothing else at all
                // So a US campaign is answered in the shape their US chunks
                // answer in - a page reading info.gpcEnabled gets it, and
                // one reading consentedToAll does not get a key their own
                // ccpa path never carries.
                if ( name === 'custom' || name === 'preferences' ) {
                    continue;
                }
                // uuid is null rather than minted: theirs is the id their
                // consent service answered with, and there is no call to
                // make. The string is the refusal for a gdpr property and
                // null for the US ones, whose strings their service mints
                // and whose APIs this does not answer - see the gaps.
                const info = name === 'gdpr'
                    ? {
                        addtlConsent: undefined,
                        applies: true,
                        consentedToAll: false,
                    }
                    : { applies: true, gpcEnabled: gpcSignal() };
                executeEventCallback('onConsentReady', [
                    null,
                    name === 'gdpr' ? tcString : null,
                    info,
                ], name);
            }
            dispatchAt('sp:onBeforeShowMessages', { messageCount: 0 });
            executeEventCallback('onInteractionComplete');
            dispatchAt('sp:onAfterShowMessages', { messageCount: 0 });
        };

        // Their non-SPA path runs the pass at once and again on a persisted
        // pageshow - a back-forward restore, where their own code re-runs
        // the whole of it. An SPA gets executeMessaging to call instead,
        // which is the one they hand over.
        if ( config.isSPA === true ) {
            sp.executeMessaging = messaging;
        } else {
            try {
                w.addEventListener('pageshow', ev => {
                    if ( ev.persisted === true ) { messaging(); }
                });
            } catch ( ex ) {
            }
            messaging();
        }

        if ( typeof console !== 'object' ) { return; }
        if ( typeof console.info !== 'function' ) { return; }
        console.info(
            '[consent-rr] ' + NAME + ' ' + VERSION +
            ' campaigns=' + (present.length !== 0 ? present.join(',') : 'none') +
            ' tcf=' + tcfState +
            ' written=' + cookiesWritten +
            ' cleared=' + cleared +
            ' events=' + fired +
            ' queued=' + drained +
            ' banner=none'
        );
    };

    /**************************************************************************/

    const start = ( ) => {
        let done = false;
        // False says the passes below are finished, so the observer waiting
        // for their config comes down with the install rather than firing for
        // the rest of the page's life on a call that returns at once.
        const attempt = ( ) => {
            if ( done ) { return false; }
            try {
                const sp = w._sp_;
                if ( typeof sp !== 'object' || sp === null ) { return 0; }
                // A user with the network rule AND the scriptlet gets this
                // twice; the marker is what makes the second one a no-op.
                if ( sp.consentRR !== undefined ) {
                    done = true;
                    return false;
                }
                const config = configOf();
                if ( configReady(config) === false ) { return 0; }
                done = true;
                install(config);
            } catch ( ex ) {
                done = true;
            }
            return false;
        };
        attempt();
        if ( done ) { return; }
        // The tick only decides how SOON. A config an inline script in
        // <head> prints is picked up on the next tick rather than waiting for
        // the first batch of body nodes, which is the difference between
        // answering before the page's other scripts run and after.
        try {
            w.setTimeout(attempt, 0);
        } catch ( ex ) {
        }
        // Their script is loaded under the page's own config, so a
        // $redirect= install finds it already there. A scriptlet runs before
        // the page has run anything at all, so the passes below are what
        // catch a config printed after this - now, on added nodes, at
        // DOMContentLoaded and at load. The label is empty because there is
        // nothing to report until the install itself reports.
        consentRRDeferred(w, doc, attempt, '');
    };

    consentRRWhenPresent(w, { globals: [ '_sp_' ] }, start);
}
