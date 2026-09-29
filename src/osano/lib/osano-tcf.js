/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    The IAB TCF side of the Osano resource.

    A tenant with the IAB module on gets a bundle that ends
    C({gpp: ..., tcf: ..., usp: ...}) instead of C({usp: ...}), and that bundle
    installs window.__tcfapi, a __tcfapiLocator frame and the postMessage
    bridge. Replacing osano.js without putting them back leaves every vendor
    waiting on the CMP - the ad stack, prebid, embedded players - with no banner
    left to click. It goes in whether or not the tenant had it, for the same
    reason the OneTrust resource does: a stalled vendor is the worse failure,
    and refusing is the conservative direction to be wrong in.

    Values are read off an IAB-enabled bundle rather than from documentation:
      cmpId 279, cmpVersion 3332, policy version 5, GVL fallback 187
      purpose consents all false, legitimate interests true for 2, 7, 8, 9,
        10 and 11 - their own default IAB state
      no vendors at all, which is that state too
      isServiceSpecific true, no publisher restrictions
      created and last-updated rounded to UTC midnight, as their encoder does
    Their field sequence carries the core segment and an optional disclosed-
    vendors segment, and no publisher-purposes segment, so neither does this.

    Two deliberate departures. Their publisher country falls back to "US" where
    the location lookup has not answered; this writes AA, the user-assigned
    code, because US names a country that cannot be known from a page. And
    Global Privacy Control withdraws legitimate interest here, as it does in the
    other resources in this repo - their own default keeps it either way, but
    that signal is the objection a plain refusal is not.

*/

function consentRROsanoTcf(gpc, language) {
    const w = window;
    const doc = w.document;

    const B64 =
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const CMP_ID = 279;             // Osano's own IAB CMP id
    const CMP_VERSION = 3332;       // their IAB_CMP_VERSION
    const POLICY_VERSION = 5;
    const VENDOR_LIST_VERSION = 187;    // their fallbackGvlVersion
    const PUBLISHER_CC = 'AA';
    const PURPOSES_LI = [ 2, 7, 8, 9, 10, 11 ];
    const API_VERSION = '2.0';      // what their own ping answers with

    // Consent overrides nothing here - this refuses - but the signal is an
    // objection to legitimate interest, which a refusal on its own is not.
    const keepLegitimateInterest = gpc !== true;
    const purposesLi = keepLegitimateInterest ? PURPOSES_LI : [];
    const gdprApplies = true;

    const twoLetters = (value, fallback) => {
        const text = typeof value === 'string' ? value.toUpperCase() : '';
        const match = /[A-Z]{2}/.exec(text);
        return match !== null ? match[0] : fallback;
    };

    const consentLanguage = twoLetters(
        typeof language === 'string' && language !== ''
            ? language
            : doc.documentElement.lang,
        'EN'
    );

    // Bits in, base64url out, 6 bits per character.
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
        const pushFlags = (ids, width) => {
            let text = '';
            for ( let position = 1; position <= width; position++ ) {
                text += ids.indexOf(position) !== -1 ? '1' : '0';
            }
            chunks.push(text);
        };
        const pushNoVendors = ( ) => {
            push(0, 16);            // max vendor id, so nothing follows
            push(0, 1);             // bit field encoding, of width zero
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
        return { push, pushLetters, pushFlags, pushNoVendors, toString };
    };

    // Midnight UTC, the way their own encoder rounds: stable for the day.
    const now = new Date();
    const midnight = Date.UTC(
        now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()
    );

    // Their coreFieldSequence, field for field and width for width.
    const encodeCoreString = ( ) => {
        const { push, pushLetters, pushFlags, pushNoVendors, toString } =
            bitWriter();
        push(2, 6);                     // version
        push(midnight / 100, 36);       // created
        push(midnight / 100, 36);       // lastUpdated
        push(CMP_ID, 12);
        push(CMP_VERSION, 12);
        push(0, 6);                     // consentScreen
        pushLetters(consentLanguage);
        push(VENDOR_LIST_VERSION, 12);
        push(POLICY_VERSION, 6);
        push(1, 1);                     // isServiceSpecific
        push(0, 1);                     // useNonStandardTexts
        pushFlags([], 12);              // specialFeatureOptins: none
        pushFlags([], 24);              // purposeConsents: none
        pushFlags(purposesLi, 24);      // purposeLegitimateInterests
        push(0, 1);                     // purposeOneTreatment
        pushLetters(PUBLISHER_CC);
        pushNoVendors();                // vendorConsents
        pushNoVendors();                // vendorLegitimateInterests
        push(0, 12);                    // numPubRestrictions
        return toString();
    };

    const tcString = encodeCoreString();

    const flags = (ids, count) => {
        const out = {};
        for ( let id = 1; id <= count; id++ ) {
            out[id] = ids.indexOf(id) !== -1;
        }
        return out;
    };

    const boolList = (ids, count) => {
        const out = [];
        for ( let id = 1; id <= count; id++ ) {
            out.push(ids.indexOf(id) !== -1);
        }
        return out;
    };

    const noPurposes = flags([], 11);
    const purposeLegitimateInterests = flags(purposesLi, 11);

    const tcData = listenerId => {
        const data = {
            tcString,
            tcfPolicyVersion: POLICY_VERSION,
            cmpId: CMP_ID,
            cmpVersion: CMP_VERSION,
            gdprApplies,
            eventStatus: 'tcloaded',
            cmpStatus: 'loaded',
            isServiceSpecific: true,
            useNonStandardTexts: false,
            useNonStandardStacks: false,
            publisherCC: PUBLISHER_CC,
            purposeOneTreatment: false,
            consentLanguage,
            outOfBand: {
                allowedVendors: {},
                disclosedVendors: {},
            },
            purpose: {
                consents: noPurposes,
                legitimateInterests: purposeLegitimateInterests,
            },
            vendor: {
                consents: {},
                legitimateInterests: {},
            },
            specialFeatureOptins: flags([], 2),
            publisher: {
                consents: noPurposes,
                legitimateInterests: purposeLegitimateInterests,
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

    // The fields their own ping answers with, and only those.
    const pingData = ( ) => ({
        apiVersion: API_VERSION,
        cmpId: CMP_ID,
        cmpLoaded: true,
        cmpStatus: 'loaded',
        cmpVersion: CMP_VERSION,
        displayStatus: 'hidden',
        gdprApplies,
        gvlVersion: VENDOR_LIST_VERSION,
        tcfPolicyVersion: POLICY_VERSION,
    });

    // The section as @iabgpp/cmpapi parses a tcfeuv2 one, for __gpp callers.
    const section = {
        Version: 2,
        Created: new Date(midnight).toISOString(),
        LastUpdated: new Date(midnight).toISOString(),
        CmpId: CMP_ID,
        CmpVersion: CMP_VERSION,
        ConsentScreen: 0,
        ConsentLanguage: consentLanguage,
        VendorListVersion: VENDOR_LIST_VERSION,
        PolicyVersion: POLICY_VERSION,
        IsServiceSpecific: true,
        UseNonStandardStacks: false,
        SpecialFeatureOptins: boolList([], 12),
        PurposeConsents: boolList([], 24),
        PurposeLegitimateInterests: boolList(purposesLi, 24),
        PurposeOneTreatment: false,
        PublisherCountryCode: PUBLISHER_CC,
        VendorConsents: [],
        VendorLegitimateInterests: [],
        PublisherRestrictions: [],
        PublisherPurposesSegmentType: 3,
        PublisherConsents: boolList([], 24),
        PublisherLegitimateInterests: boolList([], 24),
        NumCustomPurposes: 0,
        PublisherCustomConsents: [],
        PublisherCustomLegitimateInterests: [],
        VendorsDisclosedSegmentType: 1,
        VendorsDisclosed: [],
        VendorsAllowedSegmentType: 2,
        VendorsAllowed: [],
    };

    const listeners = new Map();
    let nextListenerId = 1;

    const callSafely = (callback, value, success) => {
        try {
            callback(value, success);
        } catch(ex) {
        }
    };

    const tcfApi = (command, version, callback, parameter) => {
        if ( typeof callback !== 'function' ) { return; }
        if ( version !== undefined && version !== null && version !== 2 ) {
            callSafely(callback, undefined, false);
            return;
        }
        switch ( command ) {
        case 'ping':
            callSafely(callback, pingData(), true);
            break;
        case 'getTCData':
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
            listeners.delete(Number(parameter));
            callSafely(callback, true, undefined);
            break;
        case 'setGdprApplies':
            // Theirs records it and answers "set". Nothing here branches on it:
            // the refusal is the same either way.
            if ( typeof parameter === 'boolean' ) {
                callSafely(callback, 'set', true);
                break;
            }
            callSafely(callback, undefined, false);
            break;
        default:
            callSafely(callback, undefined, false);
            break;
        }
    };

    w.__tcfapi = tcfApi;

    const addLocatorFrame = ( ) => {
        try {
            if ( doc.querySelector('iframe[name="__tcfapiLocator"]') !== null ) {
                return;
            }
            const parent = doc.body || doc.documentElement;
            if ( parent === null ) {
                w.setTimeout(addLocatorFrame, 5);
                return;
            }
            const frame = doc.createElement('iframe');
            frame.name = '__tcfapiLocator';
            frame.style.display = 'none';
            frame.setAttribute('aria-hidden', 'true');
            parent.appendChild(frame);
        } catch(ex) {
        }
    };
    addLocatorFrame();

    w.addEventListener('message', ev => {
        let payload = ev.data;
        let wasString = false;
        if ( typeof payload === 'string' ) {
            try {
                payload = JSON.parse(payload);
                wasString = true;
            } catch(ex) {
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
            } catch(ex) {
            }
        }, call.parameter);
    });

    return {
        tcString,
        section,
        gdprApplies,
        keptLegitimateInterest: keepLegitimateInterest,
        // For __gpp's section passthrough, "tcfeuv2.getTCData".
        call: (command, callback, parameter) =>
            tcfApi(command, 2, callback, parameter),
    };
}
