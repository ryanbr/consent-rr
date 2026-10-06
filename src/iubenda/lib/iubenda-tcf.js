/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    Home: https://github.com/ryanbr/consent-rr

    The IAB layer for iubenda, which follows the resource: reject refuses,
    accept grants. Their own tenants switch it on with "enableTcf": true in
    _iub.csConfiguration, and the core only installs this where they do.

    Every constant below is read from something of theirs:

      cmpId 123         iubenda, from the IAB's published list at
                        cmplist.consensu.org/v2/cmp-list.json - their own
                        bundle does not state it: the core reads
                        _iub.IUBENDA_CMP_ID, which arrives with the per-tenant
                        configuration, and carries a migration that rewrites a
                        cmpId of 31 to it.
      cmpVersion 1      not derivable: theirs is cmpVersion.tcf in the
                        per-tenant configuration and undefined by default.
                        Informational in the string.
      vendor list 179   their own loader sets _iub.GVL3 = 179, which agrees
                        with the current published list.
      policy version 5  their own TCF module sets B.tcfPolicyVersion = 5.
      vendors 1223      their own loader sets _iub.vendorsCountGVL3 = 1223, so
                        the grant case does not need a guessed ceiling.
      publisher CC AA   "not stated": theirs is tcfPublisherCC, null by
                        default and per tenant where it is set.

    The cookie is written by the core, under the name their own configuration
    gives it - preferenceCookie.tcfV2Name, "euconsent-v2" by default - because
    a third party reads that without asking any API, and leaving an acceptance
    from before this was installed standing would undo the refusal.

    An additional-consent string is carried in the refusal only. Theirs comes
    from googleAdditionalConsentMode with the tenant's own Google vendor list
    behind it, so there is nothing to build a granting one out of; a refusing
    one is the shape the spec gives for consenting to nothing.

*/

function consentRRIubendaTcf(grant) {
    const w = window;
    const doc = w.document;

    const B64 =
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const CMP_ID = 123;             // iubenda, from the IAB's published list
    const CMP_VERSION = 1;
    const POLICY_VERSION = 5;       // their own TCF module sets this
    const VENDOR_LIST_VERSION = 179; // their loader: _iub.GVL3
    // Vendor ids are granted as one range, and the ceiling is theirs rather
    // than a guess: their loader sets _iub.vendorsCountGVL3 = 1223.
    const VENDOR_MAX = 1223;
    // tcfPublisherCC is null by default and per tenant where it is set, so
    // nothing is claimed: AA is the user-assigned code, not a country.
    const PUBLISHER_CC = 'AA';
    const PURPOSES = [ 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11 ];
    // Purposes that may be taken on legitimate interest rather than consent.
    const PURPOSES_LI = [ 2, 7, 8, 9, 10, 11 ];
    const SPECIAL_FEATURES = [ 1, 2 ];
    // A refusal here refuses legitimate interest as well, which is not the
    // choice the OneTrust layer in this repo makes: there, a measured
    // reject-all left vendor legitimate interests standing. Nothing of
    // iubenda's says that, and the one thing theirs does say points the other
    // way - their setTcfOptions leaves LIRestricted true for a tenant that has
    // not singled a purpose out. So the refusal grants nothing at all, which
    // is also the shape the consentmanager layer here writes.
    const keepLegitimateInterest = grant;

    const twoLetters = (value, fallback) => {
        const text = typeof value === 'string' ? value.toUpperCase() : '';
        const match = /[A-Z]{2}/.exec(text);
        return match !== null ? match[0] : fallback;
    };

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
        const toString = ( ) => {
            let stream = chunks.join('');
            while ( stream.length % 6 !== 0 ) { stream += '0'; }
            let out = '';
            for ( let i = 0; i < stream.length; i += 6 ) {
                out += B64.charAt(parseInt(stream.slice(i, i + 6), 2));
            }
            return out;
        };
        return { push, pushBits, pushLetters, pushFlags, pushVendorRange, toString };
    };

    // Field order and widths are the IAB core segment layout.
    const encodeCoreString = ( ) => {
        const { push, pushLetters, pushFlags, pushVendorRange, toString } =
            bitWriter();
        const now = new Date();
        const deciseconds = Math.floor(Date.UTC(
            now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12
        ) / 100);
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
        pushFlags(grant ? SPECIAL_FEATURES : [], 12);
        pushFlags(grant ? PURPOSES : [], 24);
        pushFlags(grant ? PURPOSES_LI : [], 24);
        push(0, 1);                 // purpose one treatment
        pushLetters(PUBLISHER_CC);
        if ( grant ) {
            pushVendorRange();      // vendor consents
        } else {
            push(0, 16);            // no vendor consents at all
            push(0, 1);
        }
        if ( keepLegitimateInterest ) {
            pushVendorRange();      // vendor legitimate interests, left intact
        } else {
            push(0, 16);            // objected to, by Global Privacy Control
            push(0, 1);
        }
        push(0, 12);                // publisher restrictions: none
        return toString();
    };

    // Segment type 3, which a real string carries alongside the core: the same
    // answer again, for the publisher's own purposes.
    const encodePublisherSegment = ( ) => {
        const { push, pushFlags, toString } = bitWriter();
        push(3, 3);                             // segment type
        pushFlags(grant ? PURPOSES : [], 24);   // publisher consents
        pushFlags(grant ? PURPOSES_LI : [], 24); // publisher legitimate interests
        push(0, 6);                             // no custom purposes
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

    // Built once: a vendor object runs to a few hundred entries and every
    // getTCData answer shares it.
    const purposeConsents = flags(grant ? PURPOSES : [], 11);
    const purposeLegitimateInterests = flags(grant ? PURPOSES_LI : [], 11);
    const specialFeatureOptins = flags(grant ? SPECIAL_FEATURES : [], 2);
    const vendorConsents = grant ? range(VENDOR_MAX) : {};
    const vendorLegitimateInterests = keepLegitimateInterest
        ? range(VENDOR_MAX)
        : {};

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
            publisherCC: PUBLISHER_CC,
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
                legitimateInterests: vendorLegitimateInterests,
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
        };
        // Their gacVersion is 2, and this is that version's shape for
        // consenting to nothing. A granting one would need the tenant's own
        // Google vendor list, which is not on the page.
        if ( grant === false ) {
            data.addtlConsent = '2~~dv';
        }
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

    // Their own stub, which the page loads separately from cs/tcf/stub-v2.js,
    // parks its calls in a closure array and hands it back when __tcfapi is
    // called with no arguments at all:
    //
    //   __tcfapi = function(...e) { if ( !e.length ) return a; ... a.push(e) }
    //
    // so that is how the queue is drained here - not off __tcfapi.a, which is
    // the shape OneTrust's stub uses. A stub of either shape is answered.
    const previous = w.__tcfapi;
    let queued = [];
    if ( typeof previous === 'function' ) {
        try {
            const parked = previous();
            if ( Array.isArray(parked) ) { queued = parked.slice(); }
        } catch ( ex ) {
        }
        if ( queued.length === 0 && Array.isArray(previous.a) ) {
            queued = previous.a.slice();
        }
    }
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
