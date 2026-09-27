/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    The IAB TCF side of the InMobi Choice resource, and the whole of it: this
    CMP is a TCF CMP, where OneTrust's categories come first and TCF is a module
    a tenant may or may not have on.

    cmp2.js is what defines window.__tcfapi. The page itself only carries the
    IAB stub, which parks calls and answers a ping with cmpStatus "stub", so
    every vendor waiting on the CMP waits forever if the replacement leaves
    __tcfapi alone.

    Values are read off cmp2.js and off a real refusal's euconsent-v2 rather
    than from documentation:
      cmpId 10, policy version 5, vendor list 178
      consents all zero, and legitimate interests kept
      created and last-updated rounded to UTC midnight, not midday as OneTrust
      rounds, so the string is stable for a day instead of per page load
    The refusal sampled kept legitimate interest for purposes 2, 7, 8, 9, 10 and
    11 - which is what the tenant's own coreConfig.legitimateInterestOptIn asks
    for - and for 212 named vendors. Which 212 is a fact about the vendor list,
    not about the page, so vendors are granted as one range here, the same way
    the OneTrust resource does it. Global Privacy Control withdraws all of it:
    that signal is the objection a plain refusal is not.

    Tenant-specific fields come from the coreConfig that choice.js passes to
    __tcfapi('init'), so the publisher country, the consent language and the
    legitimate-interest purposes are the tenant's own rather than a guess. With
    no config to read they fall back to what cmp2.js itself defaults to.

*/

function consentRRInMobiTcf(coreConfig) {
    const w = window;
    const doc = w.document;

    const B64 =
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const CMP_ID = 10;              // InMobi's own IAB CMP id
    const CMP_VERSION = 61;         // as the sampled refusal carried
    const POLICY_VERSION = 5;
    const VENDOR_LIST_VERSION = 178;
    // Vendor ids are granted as one range, so a generous ceiling costs nothing
    // in the string. The sampled refusal carried ids up to 1645 of 1015 named.
    const VENDOR_MAX = 2000;
    // cmp2.js' own coreConfig defaults, for a page that has no config to read.
    const PURPOSES_LI_DEFAULT = [ 2, 7, 8, 9, 10, 11 ];

    const config = typeof coreConfig === 'object' && coreConfig !== null
        ? coreConfig
        : {};

    const twoLetters = (value, fallback) => {
        const text = typeof value === 'string' ? value.toUpperCase() : '';
        const match = /[A-Z]{2}/.exec(text);
        return match !== null ? match[0] : fallback;
    };

    const idsFrom = (value, limit, fallback) => {
        if ( Array.isArray(value) === false ) { return fallback; }
        const out = [];
        for ( const entry of value ) {
            const id = Number(entry);
            if ( Number.isInteger(id) === false ) { continue; }
            if ( id < 1 || id > limit ) { continue; }
            if ( out.indexOf(id) !== -1 ) { continue; }
            out.push(id);
        }
        return out.length !== 0 ? out : fallback;
    };

    // A refusal is not an objection to legitimate interest, which needs its own
    // action - but Global Privacy Control is exactly that objection.
    const keepLegitimateInterest =
        config.legitimateInterestOptIn !== false &&
        w.navigator.globalPrivacyControl !== true;

    const purposesLi = keepLegitimateInterest
        ? idsFrom(
            config.vendorPurposeLegitimateInterestIds, 11, PURPOSES_LI_DEFAULT
        )
        : [];
    const publisherCC = twoLetters(config.publisherCountryCode, 'AA');
    const language = twoLetters(
        typeof config.lang_ === 'string' && config.lang_ !== ''
            ? config.lang_
            : doc.documentElement.lang,
        'EN'
    );
    // GDPR is what this string is about; a tenant that has the mode off is
    // still answered, because a vendor that asked is waiting on an answer.
    const gdprApplies = Array.isArray(config.privacyMode)
        ? config.privacyMode.indexOf('GDPR') !== -1
        : true;
    const serviceSpecific = typeof config.consentScope === 'string'
        ? config.consentScope === 'service'
        : true;

    // Bits in, base64url out, 6 bits per character.
    const bitWriter = ( ) => {
        const chunks = [];
        const pushBits = text => {
            chunks.push(text);
        };
        const push = (value, width) => {
            let text = Math.max(0, Math.floor(value)).toString(2);
            if ( text.length > width ) { text = text.slice(-width); }
            pushBits(text.padStart(width, '0'));
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
            pushBits(text);
        };
        // One range covering every vendor id, rather than a bit per vendor.
        const pushVendorRange = ( ) => {
            push(VENDOR_MAX, 16);   // max vendor id
            push(1, 1);             // range encoding
            push(1, 12);            // one entry
            push(1, 1);             // which is a range
            push(1, 16);            // from
            push(VENDOR_MAX, 16);   // to
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
        return {
            push, pushBits, pushLetters, pushFlags,
            pushVendorRange, pushNoVendors, toString,
        };
    };

    // Midnight UTC, the way this CMP rounds: stable for the day.
    const now = new Date();
    const midnight = Date.UTC(
        now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()
    );

    // Field order and widths are the IAB core segment layout.
    const encodeCoreString = ( ) => {
        const {
            push, pushLetters, pushFlags, pushVendorRange, pushNoVendors,
            toString,
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
        pushFlags([], 12);              // special features: none opted into
        pushFlags([], 24);              // purpose consents: none
        pushFlags(purposesLi, 24);      // purpose legitimate interests
        push(0, 1);                     // purpose one treatment
        pushLetters(publisherCC);
        pushNoVendors();                // vendor consents: none at all
        if ( keepLegitimateInterest ) {
            pushVendorRange();          // vendor legitimate interests, kept
        } else {
            pushNoVendors();            // objected to, by Global Privacy Control
        }
        push(0, 12);                    // publisher restrictions: none
        return toString();
    };

    // Segment type 3, which a real string carries alongside the core: the same
    // answer again, for the publisher's own purposes.
    const encodePublisherSegment = ( ) => {
        const { push, pushFlags, toString } = bitWriter();
        push(3, 3);                     // segment type
        pushFlags([], 24);              // publisher consents: none
        pushFlags(purposesLi, 24);      // publisher legitimate interests
        push(0, 6);                     // no custom purposes
        return toString();
    };

    const tcString = encodeCoreString() + '.' + encodePublisherSegment();

    const flags = (ids, count) => {
        const out = {};
        for ( let id = 1; id <= count; id++ ) {
            out[id] = ids.indexOf(id) !== -1;
        }
        return out;
    };

    const range = count => {
        const out = {};
        for ( let id = 1; id <= count; id++ ) { out[id] = true; }
        return out;
    };

    const boolList = (ids, count) => {
        const out = [];
        for ( let id = 1; id <= count; id++ ) {
            out.push(ids.indexOf(id) !== -1);
        }
        return out;
    };

    const idList = count => {
        const out = [];
        for ( let id = 1; id <= count; id++ ) { out.push(id); }
        return out;
    };

    // Built once: a vendor object runs to a few hundred entries and every
    // getTCData answer shares it.
    const noPurposes = flags([], 11);
    const purposeLegitimateInterests = flags(purposesLi, 11);
    const vendorLegitimateInterests = keepLegitimateInterest
        ? range(VENDOR_MAX)
        : {};

    const tcData = listenerId => {
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
                legitimateInterests: vendorLegitimateInterests,
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

    const pingData = ( ) => ({
        gdprApplies,
        cmpLoaded: true,
        cmpStatus: 'loaded',
        displayStatus: 'hidden',
        apiVersion: '2.2',
        cmpVersion: CMP_VERSION,
        cmpId: CMP_ID,
        gvlVersion: VENDOR_LIST_VERSION,
        tcfPolicyVersion: POLICY_VERSION,
    });

    // The same answer again in the field names @iabgpp/cmpapi parses a tcfeuv2
    // section into, for whatever asks __gpp instead of __tcfapi.
    const section = {
        Version: 2,
        Created: new Date(midnight).toISOString(),
        LastUpdated: new Date(midnight).toISOString(),
        CmpId: CMP_ID,
        CmpVersion: CMP_VERSION,
        ConsentScreen: 0,
        ConsentLanguage: language,
        VendorListVersion: VENDOR_LIST_VERSION,
        PolicyVersion: POLICY_VERSION,
        IsServiceSpecific: serviceSpecific,
        UseNonStandardStacks: false,
        SpecialFeatureOptins: boolList([], 12),
        PurposeConsents: boolList([], 24),
        PurposeLegitimateInterests: boolList(purposesLi, 24),
        PurposeOneTreatment: false,
        PublisherCountryCode: publisherCC,
        VendorConsents: [],
        VendorLegitimateInterests: keepLegitimateInterest
            ? idList(VENDOR_MAX)
            : [],
        PublisherRestrictions: [],
        PublisherPurposesSegmentType: 3,
        PublisherConsents: boolList([], 24),
        PublisherLegitimateInterests: boolList(purposesLi, 24),
        NumCustomPurposes: 0,
        PublisherCustomConsents: [],
        PublisherCustomLegitimateInterests: [],
        // The two optional vendor segments are not written, and the reference
        // implementation reports them empty when a string leaves them out.
        // Disclosing the list would mean inventing 1015 vendor ids.
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

    // cmp2.js registers these alongside the built-in commands. They are
    // answered rather than refused because the page calls them itself: this
    // tenant's footer has a privacy-settings button on displayConsentUi.
    const tcfApi = (command, version, callback, parameter) => {
        // No arguments hands back the stub's queue, which is how cmp2.js itself
        // finds the init call. Nothing is parked here, so the queue is empty.
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
        case 'init':
            // Already initialised, by being what answers.
            callSafely(callback, undefined, true);
            break;
        case 'getConfig':
            callSafely(callback, config, true);
            break;
        case 'displayConsentUi':
            // There is no interface to show: the decision is already made, and
            // the button that asks for one gets an honest no.
            callSafely(callback, false, true);
            break;
        case 'getNonIABVendorConsents':
            callSafely(callback, { consentedVendors: [] }, true);
            break;
        case 'setGdprApplies':
            callSafely(callback, 'set', true);
            break;
        default:
            callSafely(callback, null, false);
            break;
        }
    };

    w.__tcfapi = tcfApi;

    // Vendors inside child frames locate the CMP by this frame's name and then
    // talk to it over postMessage. The page's own stub adds the frame and the
    // bridge, but a page without one still has to be answered.
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
    };
}
