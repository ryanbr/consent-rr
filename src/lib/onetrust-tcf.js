/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    The IAB TCF side of both resources.

    otSDKStub.js installs window.__tcfapi, a __tcfapiLocator frame and a
    postMessage bridge wherever a tenant has the IAB module on, so a
    replacement that leaves them out hangs every vendor waiting on the CMP.

    This answers TCF vendors with consent while OneTrust's own state and cookies
    stay on whatever the resource decided. That split is deliberate. A refusal
    here is what stops a video player or DRM SDK from ever starting - it gates
    itself on the TCF answer, gives up, and the page is left broken with no
    banner to click. uBlock Origin is still blocking those vendors' requests at
    the network layer, which is where a refusal actually bites; a TCF "no" only
    asks them to police themselves, and costs the page dearly when they do.

    Tested on a site where an all-denied string left the player dead.

*/

function consentRRTcfGranted() {
    const w = window;
    const doc = w.document;

    const B64 =
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const CMP_ID = 28;              // OneTrust's own IAB CMP id
    const CMP_VERSION = 1;
    const POLICY_VERSION = 4;       // TCF v2.2
    const VENDOR_LIST_VERSION = 0;  // no global vendor list was used
    // Vendor ids are granted as one range. The list runs to roughly 1400, so
    // this covers every vendor in it and leaves room above.
    const VENDOR_MAX = 1500;
    const PURPOSES = [ 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11 ];
    // Purposes that may be taken on legitimate interest rather than consent.
    const PURPOSES_LI = [ 2, 7, 8, 9, 10, 11 ];
    const SPECIAL_FEATURES = [ 1, 2 ];

    const twoLetters = (value, fallback) => {
        const text = typeof value === 'string' ? value.toUpperCase() : '';
        const match = /[A-Z]{2}/.exec(text);
        return match !== null ? match[0] : fallback;
    };

    // Field order and widths are the IAB core segment layout, 6 bits per
    // base64url character.
    const encodeCoreString = ( ) => {
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
        const deciseconds = Math.floor(Date.now() / 100);
        push(2, 6);                 // TC string version
        push(deciseconds, 36);      // created
        push(deciseconds, 36);      // last updated
        push(CMP_ID, 12);
        push(CMP_VERSION, 12);
        push(0, 6);                 // consent screen
        pushLetters(twoLetters(doc.documentElement.lang, 'EN'));
        push(VENDOR_LIST_VERSION, 12);
        push(POLICY_VERSION, 6);
        push(1, 1);                 // service specific, not global
        push(0, 1);                 // standard stacks and texts
        pushFlags(SPECIAL_FEATURES, 12);
        pushFlags(PURPOSES, 24);
        pushFlags(PURPOSES_LI, 24);
        push(0, 1);                 // purpose one treatment
        pushLetters('AA');          // publisher country: none claimed
        pushVendorRange();          // vendor consents
        pushVendorRange();          // vendor legitimate interests
        push(0, 12);                // publisher restrictions: none
        let stream = chunks.join('');
        while ( stream.length % 6 !== 0 ) { stream += '0'; }
        let out = '';
        for ( let i = 0; i < stream.length; i += 6 ) {
            out += B64.charAt(parseInt(stream.slice(i, i + 6), 2));
        }
        return out;
    };

    const tcString = encodeCoreString();

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

    // Built once: a vendor object runs to a few hundred entries and every
    // getTCData answer shares it.
    const purposeConsents = flags(PURPOSES, 11);
    const purposeLegitimateInterests = flags(PURPOSES_LI, 11);
    const specialFeatureOptins = flags(SPECIAL_FEATURES, 2);
    const vendorConsents = range(VENDOR_MAX);

    const tcData = listenerId => {
        const data = {
            tcString,
            tcfPolicyVersion: POLICY_VERSION,
            cmpId: CMP_ID,
            cmpVersion: CMP_VERSION,
            gdprApplies: true,
            eventStatus: 'tcloaded',
            cmpStatus: 'loaded',
            isServiceSpecific: true,
            useNonStandardTexts: false,
            useNonStandardStacks: false,
            publisherCC: 'AA',
            purposeOneTreatment: false,
            outOfBand: {
                allowedVendors: {},
                disclosedVendors: {},
            },
            purpose: {
                consents: purposeConsents,
                legitimateInterests: purposeLegitimateInterests,
            },
            vendor: {
                consents: vendorConsents,
                legitimateInterests: vendorConsents,
            },
            specialFeatureOptins,
            publisher: {
                consents: purposeConsents,
                legitimateInterests: purposeLegitimateInterests,
                customPurpose: {
                    consents: {},
                    legitimateInterests: {},
                },
                restrictions: {},
            },
            addtlConsent: '',
        };
        if ( listenerId !== undefined ) { data.listenerId = listenerId; }
        return data;
    };

    const pingData = ( ) => ({
        gdprApplies: true,
        cmpLoaded: true,
        cmpStatus: 'loaded',
        displayStatus: 'hidden',
        apiVersion: '2.2',
        cmpVersion: CMP_VERSION,
        cmpId: CMP_ID,
        gvlVersion: VENDOR_LIST_VERSION,
        tcfPolicyVersion: POLICY_VERSION,
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
        default:
            callSafely(callback, null, false);
            break;
        }
    };

    // A stub the page installed first parks its calls on __tcfapi.a, the way
    // OneTrust's own does. Answer them once the real thing is in place.
    const previous = w.__tcfapi;
    const queued = typeof previous === 'function' && Array.isArray(previous.a)
        ? previous.a.slice()
        : [];
    w.__tcfapi = tcfApi;
    for ( const call of queued ) {
        if ( Array.isArray(call) === false ) { continue; }
        tcfApi(call[0], call[1], call[2], call[3]);
    }

    // Vendors inside child frames locate the CMP by this frame's name and then
    // talk to it over postMessage.
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

    return tcString;
}
