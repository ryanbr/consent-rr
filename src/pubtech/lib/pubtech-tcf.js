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

    The IAB layer for PubTech CMP, which every tenant has: their bundle is a
    TCF v2.2 CMP and nothing else.

    Read off two tenants' bundles, 312 and 466, which differ in configuration
    and agree on all of this:

      cmpId 352, cmpVersion 6     constants in the bundle, the same in both,
                                  so unlike Usercentrics there is no per-tenant
                                  identity to recover
      vendor list 178             pinned in the bundle as the list they fetch,
                                  cmp-assets.pubtech.ai/vendorList/v2.2/178/
      policy version 5            which is what TCF 2.2 carries
      euconsent-v2                the TC string cookie, or config.cookieName
                                  where a tenant sets one
      ac_euconsent-v2             the additional-consent string, in a cookie
                                  when useCompactACStringAsCookie is on and in
                                  localStorage either way

    Their configuration is inlined at the top of the very file this replaces -
    window.__pub_tech_cmp_config - so replacing it takes the configuration with
    it. Two fields would have been worth having, and both are recoverable or
    have a stated fallback:
      publisherCountryCode        IT on both tenants, but a tenant's own. Where
                                  the visitor already has a string, it is read
                                  back out of that; otherwise AA, which is what
                                  "not stated" looks like in a TC string.
      cookieName                  unset on both, so euconsent-v2.

*/

function consentRRPubTechTcf(language, previousString) {
    const w = window;
    const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

    const CMP_ID = 352;
    const CMP_VERSION = 6;
    const VENDOR_LIST_VERSION = 178;
    const POLICY_VERSION = 5;

    const twoLetters = (value, fallback) => {
        const text = typeof value === 'string' ? value.toUpperCase() : '';
        const match = /[A-Z]{2}/.exec(text);
        return match !== null ? match[0] : fallback;
    };

    // The publisher country is the tenant's, and it goes into the string. A
    // visitor who already has one carries it, so it is read back rather than
    // guessed: the core segment's first fields are fixed width.
    const decodePublisherCC = tcString => {
        try {
            if ( typeof tcString !== 'string' ) { return ''; }
            const core = tcString.split('.')[0];
            if ( core.length < 40 ) { return ''; }
            let bits = '';
            for ( const character of core ) {
                const index = B64.indexOf(character);
                if ( index === -1 ) { return ''; }
                bits += index.toString(2).padStart(6, '0');
            }
            if ( parseInt(bits.substr(0, 6), 2) !== 2 ) { return ''; }
            // 201 is the publisher country code: 140 special features, 152
            // purpose consents, 176 purpose legitimate interests, 200 purpose
            // one treatment.
            const letter = offset => String.fromCharCode(
                65 + parseInt(bits.substr(offset, 6), 2)
            );
            const country = letter(201) + letter(207);
            return /^[A-Z]{2}$/.test(country) ? country : '';
        } catch(ex) {
        }
        return '';
    };

    const reused = decodePublisherCC(previousString);
    const publisherCC = reused !== '' ? reused : 'AA';
    const consentLanguage = twoLetters(language, 'EN');

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
            push(0, 16);                // max vendor id, so nothing follows
            push(0, 1);                 // bit field encoding, of width zero
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

    // Midnight UTC: stable for the day, so a reload does not mint a new one.
    const now = new Date();
    const midnight = Date.UTC(
        now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()
    );

    const encodeCoreString = ( ) => {
        const {
            push, pushLetters, pushFlags, pushNoVendors, toString,
        } = bitWriter();
        push(2, 6);                     // TC string version
        push(midnight / 100, 36);       // created
        push(midnight / 100, 36);       // last updated
        push(CMP_ID, 12);
        push(CMP_VERSION, 12);
        push(0, 6);                     // consent screen
        pushLetters(consentLanguage);
        push(VENDOR_LIST_VERSION, 12);
        push(POLICY_VERSION, 6);
        push(1, 1);                     // service specific
        push(0, 1);                     // standard stacks and texts
        pushFlags([], 12);              // special features: none opted into
        pushFlags([], 24);              // purpose consents: none
        pushFlags([], 24);              // purpose legitimate interests: none
        push(0, 1);                     // purpose one treatment
        pushLetters(publisherCC);
        pushNoVendors();                // vendor consents: none
        pushNoVendors();                // vendor legitimate interests: none
        push(0, 12);                    // publisher restrictions: none
        return toString();
    };

    const encodePublisherSegment = ( ) => {
        const { push, pushFlags, toString } = bitWriter();
        push(3, 3);                     // segment type
        pushFlags([], 24);              // publisher consents: none
        pushFlags([], 24);              // publisher legitimate interests: none
        push(0, 6);                     // no custom purposes
        return toString();
    };

    const tcString = encodeCoreString() + '.' + encodePublisherSegment();

    const flags = count => {
        const out = {};
        for ( let id = 1; id <= count; id++ ) { out[id] = false; }
        return out;
    };

    const tcData = ( ) => ({
        tcString,
        tcfPolicyVersion: POLICY_VERSION,
        cmpId: CMP_ID,
        cmpVersion: CMP_VERSION,
        gdprApplies: true,
        eventStatus: 'tcloaded',
        cmpStatus: 'loaded',
        isServiceSpecific: true,
        useNonStandardTexts: false,
        publisherCC,
        purposeOneTreatment: false,
        outOfBand: { allowedVendors: {}, disclosedVendors: {} },
        purpose: { consents: flags(11), legitimateInterests: flags(11) },
        vendor: { consents: {}, legitimateInterests: {} },
        specialFeatureOptins: flags(12),
        publisher: {
            consents: flags(24),
            legitimateInterests: flags(24),
            customPurpose: { consents: {}, legitimateInterests: {} },
            restrictions: {},
        },
    });

    // Their bundle ships the IAB stub, locator frame and all, and the loaded
    // API replaces it. Both are put back here, because a page that asked
    // before this arrived is waiting on the queue the stub kept.
    const install = ( ) => {
        const doc = w.document;
        const listeners = new Map();
        let nextId = 0;
        const api = (command, version, callback, parameter) => {
            if ( typeof callback !== 'function' ) { return; }
            if ( command === 'ping' ) {
                callback({
                    gdprApplies: true,
                    cmpLoaded: true,
                    cmpStatus: 'loaded',
                    displayStatus: 'hidden',
                    apiVersion: '2',
                    cmpVersion: CMP_VERSION,
                    cmpId: CMP_ID,
                    gvlVersion: VENDOR_LIST_VERSION,
                    tcfPolicyVersion: POLICY_VERSION,
                }, true);
                return;
            }
            if ( command === 'getTCData' ) {
                callback(tcData(), true);
                return;
            }
            if ( command === 'addEventListener' ) {
                nextId += 1;
                listeners.set(nextId, callback);
                const data = tcData();
                data.listenerId = nextId;
                callback(data, true);
                return;
            }
            if ( command === 'removeEventListener' ) {
                const existed = listeners.delete(parameter);
                callback(existed, existed);
                return;
            }
            callback(null, false);
        };

        let queued = [];
        try {
            const stub = w.__tcfapi;
            if ( typeof stub === 'function' ) {
                const parked = stub();
                if ( Array.isArray(parked) ) { queued = parked.slice(); }
            }
        } catch(ex) {
        }

        try {
            w.__tcfapi = api;
        } catch(ex) {
            return false;
        }
        if ( w.__tcfapi !== api ) { return false; }

        for ( const call of queued ) {
            if ( Array.isArray(call) === false ) { continue; }
            try {
                api(call[0], call[1], call[2], call[3]);
            } catch(ex) {
            }
        }

        // The frame a cross-frame caller looks for, which their stub adds.
        try {
            if ( w.frames.__tcfapiLocator === undefined && doc.body !== null ) {
                const frame = doc.createElement('iframe');
                frame.style.cssText = 'display:none';
                frame.name = '__tcfapiLocator';
                doc.body.appendChild(frame);
            }
        } catch(ex) {
        }

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
            api(call.command, call.version, (returnValue, success) => {
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
        return true;
    };

    return {
        tcString,
        cmpId: CMP_ID,
        publisherCC,
        reusedCountry: reused !== '',
        install,
    };
}
