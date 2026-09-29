/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    The IAB TCF side of the Civic resource, which only goes in when the site
    asks for it. Unlike the other consent managers here, that is not a guess:
    the IAB module is a paid option, and the page declares it in the
    configuration it hands to CookieControl.load, as iabCMP: true. With it off
    their script installs no __tcfapi at all, so neither does this.

    Values are read off their file rather than from documentation:
      cmpId 259, cmpVersion 9 - their iabMetadata, where cmpVersion is the
        cookie version rather than a build number
      the string carries policy version 5, from the vendor list they fetch,
        while their own ping and getTCData answer 4. That is their
        inconsistency, reproduced rather than tidied up: a vendor branching on
        either gets what their script would have given it.
      vendor list version 178, which is what their own list carries
      publisherCC and language from the site's iabConfig, GB and en by default
      timestamps rounded to local midnight, as their encoder rounds
    A refusal turns everything off, legitimate interests included: their
    _defaultStore has every purpose consent and legitimate interest false, and
    their reject-all keeps them that way. That is unlike the OneTrust and InMobi
    resources, which keep legitimate interest because a real refusal there does.

    Their command set is update, ping, getTCData, addEventListener and
    removeEventListener - no getVendorList, no getInAppTCData - and that is the
    set answered.

*/

function consentRRCivicTcf(config) {
    const w = window;
    const doc = w.document;

    const B64 =
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const CMP_ID = 259;             // their iabMetadata.cmpID
    const CMP_VERSION = 9;          // their iabMetadata.cookieVersion
    const STRING_POLICY_VERSION = 5;    // what their encoder writes
    const API_POLICY_VERSION = 4;       // what their own API answers with
    const VENDOR_LIST_VERSION = 178;

    const iab = config.iabConfig !== null && typeof config.iabConfig === 'object'
        ? config.iabConfig
        : {};

    const twoLetters = (value, fallback) => {
        const text = typeof value === 'string' ? value.toUpperCase() : '';
        const match = /[A-Z]{2}/.exec(text);
        return match !== null ? match[0] : fallback;
    };

    const publisherCC = twoLetters(iab.publisherCC, 'GB');
    const consentLanguage = twoLetters(iab.language, 'EN');

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
        const pushFlags = width => {
            chunks.push(''.padStart(width, '0'));
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

    // Local midnight, which is what their encoder rounds to.
    const midnight = new Date();
    midnight.setHours(0);
    midnight.setMinutes(0);
    midnight.setSeconds(0);
    midnight.setMilliseconds(0);
    const deciseconds = Math.round(midnight.getTime() / 100);

    const encodeCoreString = ( ) => {
        const { push, pushLetters, pushFlags, pushNoVendors, toString } =
            bitWriter();
        push(2, 6);                     // version
        push(deciseconds, 36);          // created
        push(deciseconds, 36);          // lastUpdated
        push(CMP_ID, 12);
        push(CMP_VERSION, 12);
        push(0, 6);                     // consentScreen
        pushLetters(consentLanguage);
        push(VENDOR_LIST_VERSION, 12);
        push(STRING_POLICY_VERSION, 6);
        push(1, 1);                     // isServiceSpecific
        push(0, 1);                     // useNonStandardStacks
        pushFlags(12);                  // specialFeatureOptins: none
        pushFlags(24);                  // purpose consents: none
        pushFlags(24);                  // purpose legitimate interests: none
        push(0, 1);                     // purposeOneTreatment
        pushLetters(publisherCC);
        pushNoVendors();                // vendor consents
        pushNoVendors();                // vendor legitimate interests
        push(0, 12);                    // numPubRestrictions
        return toString();
    };

    const tcString = encodeCoreString();

    const flags = count => {
        const out = {};
        for ( let id = 1; id <= count; id++ ) { out[id] = false; }
        return out;
    };

    const nothing = flags(11);

    // The shape their own responses carry, field for field.
    const tcData = listenerId => {
        const data = {
            tcString,
            tcfPolicyVersion: API_POLICY_VERSION,
            cmpId: CMP_ID,
            cmpVersion: CMP_VERSION,
            gdprApplies: true,
            eventStatus: 'useractioncomplete',
            cmpStatus: 'loaded',
            isServiceSpecific: true,
            useNonStandardStacks: false,
            publisherCC,
            purposeOneTreatment: false,
            outOfBand: {
                allowedVendors: {},
                disclosedVendors: {},
            },
            purpose: {
                consents: nothing,
                legitimateInterests: nothing,
            },
            vendor: {
                consents: {},
                legitimateInterests: {},
            },
            specialFeatureOptins: {},
            publisher: {
                consents: {},
                legitimateInterests: {},
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
        gdprApplies: true,
        cmpLoaded: true,
        cmpStatus: 'loaded',
        // Their own displayStatus is visible only while their panel is in the
        // page. There is no panel here.
        displayStatus: 'hidden',
        apiVersion: '2.2',
        cmpVersion: CMP_VERSION,
        cmpId: CMP_ID,
        gvlVersion: VENDOR_LIST_VERSION,
        tcfPolicyVersion: API_POLICY_VERSION,
    });

    const listeners = new Map();
    let nextListenerId = 1;

    const callSafely = (callback, value, success) => {
        try {
            callback(value, success);
        } catch(ex) {
        }
    };

    const tcfApi = (command, version, callback, parameter) => {
        // Their own check, and their own warnings for both.
        if ( version !== undefined && version !== null ) {
            if ( [ 2, 0 ].indexOf(version) === -1 ) {
                if ( typeof console === 'object' ) {
                    console.warn('Invalid TCF Version: ' + version);
                }
                return;
            }
        }
        switch ( command ) {
        case 'ping':
            if ( typeof callback !== 'function' ) { return; }
            callSafely(callback, pingData(), true);
            break;
        case 'getTCData':
            if ( typeof callback !== 'function' ) { return; }
            callSafely(callback, tcData(), true);
            break;
        case 'addEventListener': {
            if ( typeof callback !== 'function' ) { return; }
            const listenerId = nextListenerId;
            nextListenerId += 1;
            listeners.set(listenerId, callback);
            callSafely(callback, tcData(listenerId), true);
            break;
        }
        case 'removeEventListener':
            listeners.delete(Number(parameter));
            if ( typeof callback !== 'function' ) { return; }
            callSafely(callback, true, undefined);
            break;
        case 'update':
            // Theirs re-announces the decision to every listener. It has not
            // changed, so they are told what they already have.
            for ( const [ listenerId, listener ] of listeners ) {
                callSafely(listener, tcData(listenerId), true);
            }
            break;
        default:
            if ( typeof console === 'object' ) {
                console.warn('Unsupported CMP command: ' + command);
            }
            break;
        }
    };

    w.__tcfapi = tcfApi;

    // Theirs adds this frame itself, checking window.frames first.
    const addLocatorFrame = ( ) => {
        try {
            if ( w.frames.__tcfapiLocator !== undefined ) { return; }
            if ( doc.body === null ) {
                w.setTimeout(addLocatorFrame, 5);
                return;
            }
            const frame = doc.createElement('iframe');
            frame.style.display = 'none';
            frame.name = '__tcfapiLocator';
            frame.setAttribute('aria-hidden', 'true');
            doc.body.appendChild(frame);
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

    return { tcString, publisherCC, consentLanguage };
}
