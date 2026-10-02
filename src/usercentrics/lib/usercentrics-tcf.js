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

    The IAB layer for Usercentrics, which only a TCF tenant has. Read off their
    browser-sdk bundle and off two real tenants' settings:

      policyVersion        5, hard-coded in their TCF model
      scope                SERVICE on both tenants sampled, so the string is
                           service-specific and carries no out-of-band segment
      cmpId, cmpVersion    the tenant's own tcf2.cmpId and tcf2.cmpVersion -
                           318 and 1 on the TCF tenant sampled, null on the
                           other - falling back in their own code to
                             cmpId = tcf2.cmpId || 5
                             cmpVersion = tcf2.cmpVersion || 3
      uc_tcf               { acString, tcString, timestamp, vendors }, vendors
                           being [ id, legIntPurposes, purposes,
                           specialPurposes ] tuples
      denyAllDisclosed()   their deny-all: unsetAllVendorConsents,
                           unsetAllVendorLegitimateInterests, then purpose
                           consents and purpose legitimate interests unset too.
                           So a refusal here objects to legitimate interest as
                           well, which is their behaviour rather than a choice
                           made here - InMobi's keeps it, and that is theirs.

    The identity is the one part a replaced CMP cannot know, because it is per
    tenant and arrives from their settings API. Where the visitor already has a
    uc_tcf string, the identity is read back out of it and reused, which is
    exact. Where there is none, their own fallback is used and the string says
    so. Either way every field in it is a no.

*/

function consentRRUsercentricsTcf(language, previous) {
    const w = window;
    const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

    // Their own fallbacks, for a tenant whose settings this never sees.
    const CMP_ID_FALLBACK = 5;
    const CMP_VERSION_FALLBACK = 3;
    const POLICY_VERSION = 5;
    // Pinned rather than observed: the list version comes back with the GVL,
    // which a replaced CMP never fetches. It says which list the decisions
    // were made against, and every decision here is no.
    const VENDOR_LIST_VERSION_FALLBACK = 230;

    const twoLetters = (value, fallback) => {
        const text = typeof value === 'string' ? value.toUpperCase() : '';
        const match = /[A-Z]{2}/.exec(text);
        return match !== null ? match[0] : fallback;
    };

    // Reading a string back: the core segment's first fields are fixed width,
    // so the identity of whoever wrote it can be lifted out without a library.
    const decodeIdentity = tcString => {
        try {
            if ( typeof tcString !== 'string' ) { return null; }
            const core = tcString.split('.')[0];
            if ( core.length < 24 ) { return null; }
            let bits = '';
            for ( const character of core ) {
                const index = B64.indexOf(character);
                if ( index === -1 ) { return null; }
                bits += index.toString(2).padStart(6, '0');
            }
            const at = (offset, width) => parseInt(bits.substr(offset, width), 2);
            const letters = offset => String.fromCharCode(
                65 + at(offset, 6), 65 + at(offset + 6, 6)
            );
            if ( at(0, 6) !== 2 ) { return null; }
            const identity = {
                cmpId: at(78, 12),
                cmpVersion: at(90, 12),
                consentLanguage: letters(108),
                vendorListVersion: at(120, 12),
                isServiceSpecific: at(138, 1) === 1,
                // 140 special features, 152 purpose consents, 176 purpose
                // legitimate interests, 200 purpose one treatment, so 201.
                publisherCC: letters(201),
            };
            if ( identity.cmpId < 1 || identity.cmpId > 4095 ) { return null; }
            return identity;
        } catch(ex) {
        }
        return null;
    };

    const theirs = decodeIdentity(
        previous !== null && typeof previous === 'object'
            ? previous.tcString
            : undefined
    );

    const CMP_ID = theirs !== null ? theirs.cmpId : CMP_ID_FALLBACK;
    const CMP_VERSION = theirs !== null
        ? theirs.cmpVersion
        : CMP_VERSION_FALLBACK;
    const VENDOR_LIST_VERSION = theirs !== null
        ? theirs.vendorListVersion
        : VENDOR_LIST_VERSION_FALLBACK;
    const publisherCC = theirs !== null ? theirs.publisherCC : 'AA';
    // Both tenants sampled are SERVICE scope, and a reused string says which.
    const serviceSpecific = theirs !== null ? theirs.isServiceSpecific : true;
    const consentLanguage = twoLetters(language, 'EN');

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
        // Nothing consented, and no vendor section to walk.
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

    // Midnight UTC: stable for the day, so a reload does not mint a new string.
    const now = new Date();
    const midnight = Date.UTC(
        now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()
    );

    // Field order and widths are the IAB core segment layout.
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
        push(serviceSpecific ? 1 : 0, 1);
        push(0, 1);                     // standard stacks and texts
        pushFlags([], 12);              // special features: none opted into
        pushFlags([], 24);              // purpose consents: none
        pushFlags([], 24);              // purpose legitimate interests: none,
                                        // which is their own deny-all
        push(0, 1);                     // purpose one treatment, false on both
                                        // tenants sampled
        pushLetters(publisherCC);
        pushNoVendors();                // vendor consents: none
        pushNoVendors();                // vendor legitimate interests: none
        push(0, 12);                    // publisher restrictions: none
        return toString();
    };

    // Segment type 3, which a real string carries alongside the core: the same
    // answer again, for the publisher's own purposes.
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

    // What a vendor asking __tcfapi is handed. Nothing in it is granted.
    const tcData = ( ) => ({
        tcString,
        tcfPolicyVersion: POLICY_VERSION,
        cmpId: CMP_ID,
        cmpVersion: CMP_VERSION,
        gdprApplies: true,
        eventStatus: 'tcloaded',
        cmpStatus: 'loaded',
        isServiceSpecific: serviceSpecific,
        useNonStandardTexts: false,
        publisherCC,
        purposeOneTreatment: false,
        outOfBand: {
            allowedVendors: {},
            disclosedVendors: {},
        },
        purpose: {
            consents: flags(11),
            legitimateInterests: flags(11),
        },
        vendor: {
            consents: {},
            legitimateInterests: {},
        },
        specialFeatureOptins: flags(12),
        publisher: {
            consents: flags(24),
            legitimateInterests: flags(24),
            customPurpose: { consents: {}, legitimateInterests: {} },
            restrictions: {},
        },
    });

    // A TCF publisher's stub parks calls until a CMP arrives, and their own
    // CmpApi drains them. Both common shapes: a call with no arguments hands
    // the queue back, and the other kind parks it on a property.
    const drainQueue = previousApi => {
        if ( typeof previousApi !== 'function' ) { return []; }
        let calls = [];
        try {
            const queue = previousApi();
            if ( queue !== null && typeof queue === 'object' ) {
                calls = Array.prototype.slice.call(queue);
            }
        } catch(ex) {
        }
        if ( Array.isArray(previousApi.a) ) {
            calls = calls.concat(previousApi.a);
        }
        return calls;
    };

    // Their CmpApi answers these; the rest of the surface is not invented.
    const install = ( ) => {
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
        const queued = drainQueue(w.__tcfapi);
        try {
            w.__tcfapi = api;
        } catch(ex) {
            return false;
        }
        if ( w.__tcfapi !== api ) { return false; }
        // Whatever the page asked before this arrived is answered now, rather
        // than left in a queue nothing will ever read.
        for ( const call of queued ) {
            if ( call === null || typeof call !== 'object' ) { continue; }
            try {
                api(call[0], call[1], call[2], call[3]);
            } catch(ex) {
            }
        }
        return true;
    };

    return {
        tcString,
        cmpId: CMP_ID,
        reusedIdentity: theirs !== null,
        install,
        // The record their own storage service keeps. The AC string is left
        // empty rather than invented: it lists Google's additional-consent
        // vendors, and a refusal consents to none of them - their own
        // resurface check reads an empty one as nothing to compare.
        record: ( ) => ({
            acString: '',
            tcString,
            timestamp: Date.now(),
            vendors: [],
        }),
    };
}
