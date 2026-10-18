/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    Home: https://github.com/ryanbr/consent-rr

    The IAB TCF side of the Sourcepoint resource.

    Their wrapper does not define __tcfapi: the string "__tcfapi" does not
    appear in wrapperMessagingWithoutDetection.js at all. It is in the chunk
    the wrapper fetches for a GDPR property that has the module switched on -
    unified/4.40.3/gdpr-tcf.<hash>.bundle.js - which is why blocking the one
    file takes the CMP's whole IAB surface with it, and why a page or a vendor
    waiting on a CMP then waits for ever.

    Every constant below was read off that chunk, not off a doc page:

      cmpId 6          their constants module, the same one holding
                       https://cdn.privacy-mgmt.com, exports it as the default
                       cmp id: the chunk's CmpApi is built
                       new CmpApi(decoded.cmpId || THAT, 1, true, custom)
                       and 6 is Sourcepoint Technologies, Inc. on the IAB's
                       own published list
      cmpVersion 1     the second argument of that same call
      serviceSpecific  the third, true
      policy version 5 their TCModel's own default, policyVersion_ = 5, which
                       the IAB's current list agrees with (tcfPolicyVersion 5)
      apiVersion "2"   their CmpApiModel: apiVersion is the string "2", handed
                       back through String(). Not "2.2"
      publisherCC AA   their TCModel default publisherCountryCode_
      language EN      their TCModel default consentLanguage_, used where the
                       property's own consentLanguage is "browserDefault" -
                       which is what their config normaliser writes when the
                       publisher names none

    THE REFUSAL GRANTS NOTHING, in any set the string carries: no purpose
    consents, no purpose legitimate interests, no vendor consents, no vendor
    legitimate interests, no special features, nothing for the publisher.
    Unlike the InMobi resource, no legitimate interest is kept: that one could
    read a real refusal of theirs off a sampled euconsent-v2 and keep what it
    kept, while Sourcepoint's refusal string is minted by their consent
    service - the campaign response carries the cookies to write - so there is
    no sample to copy and nothing to justify keeping anything.

    That also settles Global Privacy Control: their own wrapper reads it for
    ccpa, globalcmp and usnat properties and not for gdpr, and a string that
    grants nothing is already everything that signal could ask for here.

    THE VENDOR LIST VERSION says which list the decisions were made against,
    and every decision here is no. A returning visitor's own euconsent-v2
    carries the number their service last used, so it is lifted out of that
    where there is one; 181 is what vendor-list.consensu.org served on
    2026-10-19, for a first visit.

    WHAT THEIR OWN CUSTOM COMMANDS ARE, measured in the same chunk, because a
    page calls these through __tcfapi rather than through _sp_:
    euconsentWithDisclosedVendors, getCustomVendorConsents, postCustomConsent,
    postRejectAll and getVendorPurposeMapping, plus a getTCData of their own
    that adds addtlConsent to the payload. Their wiring then points the
    addEventListener and removeEventListener commands at that same getTCData -
    so theirs answers a listener once and never again. This registers the
    listener properly instead, which comes to the same thing: nothing here
    will ever change the string.

    THE LOCATOR FRAME AND THE postMessage RELAY are the one place this does
    more than they do. Neither __tcfapiLocator nor __tcfapiCall appears in
    their wrapper or in the chunk: Sourcepoint leaves both to the IAB stub a
    publisher pastes above the script tag, whose own relay forwards to
    whatever window.__tcfapi is - this. So the frame goes up only where there
    is none, which leaves a page carrying their stub exactly as it was and
    answers a vendor in a frame on a page that has no stub.

*/

function consentRRSourcepointTcf(config, priorTcString) {
    'use strict';

    const w = window;
    const doc = w.document;

    const B64 =
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const CMP_ID = 6;
    const CMP_VERSION = 1;
    const POLICY_VERSION = 5;
    const VENDOR_LIST_VERSION_FALLBACK = 181;
    const PURPOSE_COUNT = 11;
    const SPECIAL_FEATURE_COUNT = 2;

    const settings = typeof config === 'object' && config !== null
        ? config
        : {};
    // The core segment's leading fields are fixed width, so a prior string's
    // vendor list version can be lifted out without a library: 6 version, 36
    // created, 36 last updated, 12 cmpId, 12 cmpVersion, 6 consent screen,
    // 12 language, then the list version at bit 120.
    const priorVendorListVersion = text => {
        try {
            if ( typeof text !== 'string' ) { return 0; }
            const core = text.split('.')[0];
            if ( core.length < 24 ) { return 0; }
            let bits = '';
            for ( const character of core.slice(0, 24) ) {
                const index = B64.indexOf(character);
                if ( index === -1 ) { return 0; }
                bits += index.toString(2).padStart(6, '0');
            }
            if ( parseInt(bits.substr(0, 6), 2) !== 2 ) { return 0; }
            return parseInt(bits.substr(120, 12), 2);
        } catch ( ex ) {
        }
        return 0;
    };

    const carried = priorVendorListVersion(priorTcString);
    const VENDOR_LIST_VERSION = carried !== 0
        ? carried
        : VENDOR_LIST_VERSION_FALLBACK;

    const twoLetters = (value, fallback) => {
        const text = typeof value === 'string' ? value.toUpperCase() : '';
        const match = /^[A-Z]{2}/.exec(text);
        return match !== null ? match[0] : fallback;
    };

    // Their normaliser keeps the property's consentLanguage where it has one
    // and writes "browserDefault" where it does not, so that string is not a
    // language: it means take the browser's.
    const languageOf = ( ) => {
        const named = settings.consentLanguage;
        if ( typeof named === 'string' && named !== 'browserDefault' ) {
            const from = twoLetters(named, '');
            if ( from !== '' ) { return from; }
        }
        let fromPage = '';
        try {
            fromPage = String(doc.documentElement.lang || '');
        } catch ( ex ) {
        }
        if ( fromPage === '' ) {
            try {
                fromPage = String(w.navigator.language || '');
            } catch ( ex ) {
            }
        }
        return twoLetters(fromPage, 'EN');
    };

    const language = languageOf();
    // Their TCModel's own default, and left at it: nothing their config
    // carries names a publisher country, and the first draft here read a
    // gdpr.publisherCountryCode that does not exist in their bundle - a
    // field invented by looking at a sibling family rather than at this one.
    const publisherCC = 'AA';
    // A property with a gdpr campaign configured is a property where their
    // own answer to this is yes until their service says otherwise, and a
    // vendor that asked is waiting for an answer either way.
    const gdprApplies = true;
    const serviceSpecific = true;

    /**************************************************************************/

    const bitWriter = ( ) => {
        const chunks = [];
        const push = (value, width) => {
            let text = Math.max(0, Math.floor(value)).toString(2);
            if ( text.length > width ) { text = text.slice(-width); }
            chunks.push(text.padStart(width, '0'));
        };
        const pushLetters = letters => {
            for ( const letter of letters ) {
                push(letter.charCodeAt(0) - 65, 6);
            }
        };
        const pushZeros = width => {
            chunks.push('0'.repeat(width));
        };
        // Max vendor id zero, so no bit field and no range list follows:
        // the shortest way to say that not one vendor is consented to.
        const pushNoVendors = ( ) => {
            push(0, 16);
            push(0, 1);
        };
        const toString = ( ) => {
            let stream = chunks.join('');
            while ( stream.length % 6 !== 0 ) { stream += '0'; }
            let out = '';
            for ( let i = 0; i < stream.length; i += 6 ) {
                out += B64.charAt(parseInt(stream.slice(i, i + 6), 2));
            }
            return out;
        };
        return { push, pushLetters, pushZeros, pushNoVendors, toString };
    };

    // Midnight UTC: the string is then stable for the day rather than
    // different on every page load, which is what makes it cacheable and
    // comparable.
    const now = new Date();
    const midnight = Date.UTC(
        now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()
    );

    const encodeCore = ( ) => {
        const {
            push, pushLetters, pushZeros, pushNoVendors, toString,
        } = bitWriter();
        push(2, 6);                     // TC string version
        push(midnight / 100, 36);       // created
        push(midnight / 100, 36);       // last updated
        push(CMP_ID, 12);
        push(CMP_VERSION, 12);
        push(0, 6);                     // consent screen
        pushLetters(language);
        push(VENDOR_LIST_VERSION, 12);
        push(POLICY_VERSION, 6);
        push(serviceSpecific ? 1 : 0, 1);
        push(0, 1);                     // standard stacks and texts
        pushZeros(12);                  // special feature opt-ins: none
        pushZeros(24);                  // purpose consents: none
        pushZeros(24);                  // purpose legitimate interests: none
        push(0, 1);                     // purpose one treatment
        pushLetters(publisherCC);
        pushNoVendors();                // vendor consents
        pushNoVendors();                // vendor legitimate interests
        push(0, 12);                    // publisher restrictions: none
        return toString();
    };

    // Segment type 3, the publisher's own purposes, which a real string
    // carries beside the core.
    const encodePublisher = ( ) => {
        const { push, pushZeros, toString } = bitWriter();
        push(3, 3);
        pushZeros(24);                  // publisher consents: none
        pushZeros(24);                  // publisher legitimate interests
        push(0, 6);                     // no custom purposes
        return toString();
    };

    const tcString = encodeCore() + '.' + encodePublisher();

    /**************************************************************************/

    const allFalse = count => {
        const out = {};
        for ( let id = 1; id <= count; id++ ) { out[id] = false; }
        return out;
    };

    const tcData = listenerId => {
        // Built fresh each answer rather than shared: these are eleven and
        // two keys, and a page that writes into one payload must not be able
        // to reach the next one through it.
        const purposeFlags = allFalse(PURPOSE_COUNT);
        const data = {
            tcString,
            tcfPolicyVersion: POLICY_VERSION,
            cmpId: CMP_ID,
            cmpVersion: CMP_VERSION,
            gdprApplies,
            eventStatus: 'tcloaded',
            cmpStatus: 'loaded',
            isServiceSpecific: serviceSpecific,
            useNonStandardTexts: false,
            useNonStandardStacks: false,
            publisherCC,
            purposeOneTreatment: false,
            // Their own getTCData adds this one, off the stored record's
            // addtlConsent. Nothing is stored, and a refusal consents to no
            // Google vendor either, so it is here and empty rather than
            // missing from a payload theirs always carries it in.
            addtlConsent: '',
            outOfBand: {
                allowedVendors: {},
                disclosedVendors: {},
            },
            purpose: {
                consents: purposeFlags,
                legitimateInterests: allFalse(PURPOSE_COUNT),
            },
            vendor: {
                consents: {},
                legitimateInterests: {},
            },
            specialFeatureOptins: allFalse(SPECIAL_FEATURE_COUNT),
            publisher: {
                consents: allFalse(PURPOSE_COUNT),
                legitimateInterests: allFalse(PURPOSE_COUNT),
                customPurpose: {
                    consents: {},
                    legitimateInterests: {},
                },
                restrictions: {},
            },
        };
        if ( listenerId !== undefined ) { data.listenerId = listenerId; }
        return data;
    };

    const pingData = ( ) => ({
        gdprApplies,
        cmpLoaded: true,
        cmpStatus: 'loaded',
        displayStatus: 'hidden',
        apiVersion: '2',
        cmpVersion: CMP_VERSION,
        cmpId: CMP_ID,
        gvlVersion: VENDOR_LIST_VERSION,
        tcfPolicyVersion: POLICY_VERSION,
    });

    // The answer their own getCustomVendorConsents hands back off a stored
    // record, which for a refusal is nothing consented and no grants.
    const customVendorConsents = ( ) => ({
        consentedPurposes: [],
        consentedVendors: [],
        legIntPurposes: [],
        dateCreated: new Date(midnight).toISOString(),
        grants: {},
        newUser: false,
    });

    /**************************************************************************/

    const listeners = new Map();
    let nextListenerId = 1;

    const callSafely = (callback, value, success) => {
        try {
            callback(value, success);
        } catch ( ex ) {
        }
    };

    const tcfApi = (command, version, callback, parameter) => {
        // No arguments hands back the queue, which is how their own chunk
        // finds what a stub parked: this.callQueue = window.__tcfapi() || [].
        // Nothing is parked here, so the queue is empty.
        if ( command === undefined ) { return []; }
        if ( typeof callback !== 'function' ) { return; }
        if ( version !== undefined && version !== null && version !== 2 ) {
            callSafely(callback, null, false);
            return;
        }
        switch ( command ) {
        case 'ping':
            callSafely(callback, pingData(), true);
            break;
        case 'getTCData':
        case 'getInAppTCData':
            callSafely(callback, tcData(), true);
            break;
        case 'addEventListener': {
            const listenerId = nextListenerId;
            nextListenerId += 1;
            listeners.set(listenerId, callback);
            callSafely(callback, tcData(listenerId), true);
            break;
        }
        case 'removeEventListener':
            callSafely(callback, listeners.delete(Number(parameter)), undefined);
            break;
        // Their euconsentWithDisclosedVendors answers with the stored string
        // of that name. A refusal discloses no vendor - there was no dialog
        // to disclose one in - so the string it answers with is the core one,
        // without a disclosed-vendors segment.
        case 'euconsentWithDisclosedVendors':
            callSafely(callback, tcString, true);
            break;
        case 'getCustomVendorConsents':
            callSafely(callback, customVendorConsents(), true);
            break;
        case 'postCustomConsent':
        case 'postRejectAll':
            callSafely(callback, customVendorConsents(), true);
            break;
        // Theirs fetches /vendor-list/vendor-purpose-mapping and calls back
        // (null, false) when that fails, which is this case exactly.
        case 'getVendorPurposeMapping':
            callSafely(callback, null, false);
            break;
        default:
            callSafely(callback, null, false);
            break;
        }
    };

    // Their chunk drains a stub's queue with a zero-argument call and then
    // replays it through the real api. Same here, in the same order, so a
    // vendor that asked before this ran is answered rather than dropped.
    let queued = [];
    let hadStub = false;
    try {
        if ( typeof w.__tcfapi === 'function' ) {
            hadStub = true;
            const held = w.__tcfapi();
            if ( Array.isArray(held) ) { queued = held.slice(); }
        }
    } catch ( ex ) {
    }
    w.__tcfapi = tcfApi;
    for ( const call of queued ) {
        if ( Array.isArray(call) === false ) { continue; }
        try {
            tcfApi(call[0], call[1], call[2], call[3]);
        } catch ( ex ) {
        }
    }

    /**************************************************************************/

    let framed = false;
    let waitsLeft = 200;

    const addLocatorFrame = ( ) => {
        try {
            if ( doc.querySelector('iframe[name="__tcfapiLocator"]') !== null ) {
                return;
            }
            const parent = doc.body || doc.documentElement;
            if ( parent === null ) {
                // Bounded, because a document that never grows one would
                // otherwise leave a 5ms timer running for as long as the page
                // is open. A second of parsing is already far more than any
                // page needs to produce a body.
                waitsLeft -= 1;
                if ( waitsLeft > 0 ) { w.setTimeout(addLocatorFrame, 5); }
                return;
            }
            const frame = doc.createElement('iframe');
            frame.name = '__tcfapiLocator';
            frame.style.display = 'none';
            frame.setAttribute('aria-hidden', 'true');
            parent.appendChild(frame);
            framed = true;
        } catch ( ex ) {
        }
    };

    // The publisher's stub, where there is one, owns both the frame and the
    // relay - and its relay already forwards to whatever __tcfapi is, which
    // is this. Answering as well would mean two replies to one callId.
    //
    // What says the stub is there is that it had defined __tcfapi before
    // this ran, not that a frame exists: the IAB stub installs the function
    // and the listener together, while a frame on its own says nothing about
    // who is listening. A snippet that adds the frame and no relay would
    // otherwise leave every vendor in a frame unanswered - which is the
    // failure that matters, a duplicate reply carrying the same answer being
    // the one that does not.
    if ( hadStub === false ) {
        addLocatorFrame();
        w.addEventListener('message', ev => {
            let payload = ev.data;
            let wasString = false;
            if ( typeof payload === 'string' ) {
                try {
                    payload = JSON.parse(payload);
                    wasString = true;
                } catch ( ex ) {
                    return;
                }
            }
            if ( typeof payload !== 'object' || payload === null ) { return; }
            const call = payload.__tcfapiCall;
            if ( typeof call !== 'object' || call === null ) { return; }
            if ( call.callId === undefined ) { return; }
            if ( ev.source === null || ev.source === undefined ) { return; }
            tcfApi(call.command, call.version, (returnValue, success) => {
                let response = {
                    __tcfapiReturn: {
                        returnValue,
                        success,
                        callId: call.callId,
                    },
                };
                if ( wasString ) { response = JSON.stringify(response); }
                try {
                    ev.source.postMessage(
                        response,
                        ev.origin === 'null' ? '*' : ev.origin
                    );
                } catch ( ex ) {
                }
            }, call.parameter);
        });
    }

    return {
        tcString,
        gdprApplies,
        vendorListVersion: VENDOR_LIST_VERSION,
        language,
        framed,
    };
}
