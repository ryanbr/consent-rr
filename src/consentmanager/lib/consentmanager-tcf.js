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

    The IAB layer for consentmanager.net: a refusal, and the one record this
    family writes rather than only answers.

      cmpId 31                  consentmanager.net - and this one needed no
                                looking up: their own per-tenant cmp.php
                                carries "iabid":31 inside
                                window.cmp_config_data, on both tenants
                                sampled. The IAB's published list at
                                cmplist.consensu.org/v2/cmp-list.json agrees
                                that id 31 is consentmanager.net, so their own
                                data and the registry say the same thing.
      cmpVersion 1              not derivable: theirs comes down with the
                                per-tenant configuration in the file being
                                replaced. Informational in the string.
      vendor list 179           and policy version 5, the current published
                                list. Unlike CookieYes, who ship their own
                                copy of the global vendor list and declare a
                                version in it, nothing in the four files
                                consentmanager serves states one.
      publisher country AA      "not stated". Theirs is per tenant, in the
                                replaced file - which also carries their
                                server-side geo, "usr_cc":"NZ" on both
                                samples, from where this was measured.

    THE COOKIE IS WRITTEN HERE, which is the difference from the two families
    this builder shares its shape with. Their own bundle writes the standard
    one:

        r.alt = o > 0 ? (s ? "euconsent-v2" : "nc_euconsent-v2")
                      : (s ? "euconsent" : "nc_euconsent");

    A third party reads euconsent-v2 without asking any API, so leaving it
    absent would leave an acceptance from before this was installed standing.
    It is written with a string that grants nothing, in every scope a stored
    one could be in - their own writeCookie takes its domain from a
    per-tenant consentscope in the replaced file, and their
    getDomainForScope carries its own two-level suffix list to build one.

    Their own record - __cmpconsent<id>, __cmpconsentx<id> or
    __cmpconsents<id>, by consentscope - is NOT written. Nothing outside the
    493KB bundle reads it, and the name needs two values only that bundle
    has. See the core.

*/

function consentRRConsentManagerTcf() {
    const w = window;
    const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

    const CMP_ID = 31;
    const CMP_VERSION = 1;
    const VENDOR_LIST_VERSION = 179;
    const POLICY_VERSION = 5;
    const PUBLISHER_CC = 'AA';

    // The document's own language, which is the only one on offer here.
    const language = ( ) => {
        const doc = w.document;
        const named = doc.documentElement !== null
            ? doc.documentElement.getAttribute('lang')
            : '';
        const text = String(named || w.navigator.language || '').toUpperCase();
        const match = /[A-Z]{2}/.exec(text);
        return match !== null ? match[0] : 'EN';
    };

    const consentLanguage = language();

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
        pushLetters(PUBLISHER_CC);
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
        // A refusal has to say the regime applies. Answering false would tell
        // every vendor on the page it may proceed without asking, which is the
        // opposite of what the string says.
        gdprApplies: true,
        eventStatus: 'tcloaded',
        cmpStatus: 'loaded',
        isServiceSpecific: true,
        useNonStandardTexts: false,
        publisherCC: PUBLISHER_CC,
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

    // Every scope a stored acceptance could be in, for the same reason the
    // core writes its own record that way.
    const scopes = ( ) => {
        const out = [ '' ];
        const host = String(w.location.hostname || '');
        if ( /^[0-9.]+$/.test(host) || host.indexOf('.') === -1 ) { return out; }
        const labels = host.split('.');
        for ( let at = 0; at < labels.length - 1; at += 1 ) {
            out.push(labels.slice(at).join('.'));
        }
        return out;
    };

    let wrote = 0;
    const store = ( ) => {
        const https = String(w.location.protocol) === 'https:';
        const when = new Date(Date.now() + 365 * 86400000).toUTCString();
        for ( const domain of scopes() ) {
            try {
                w.document.cookie = 'euconsent-v2=' + tcString +
                    '; expires=' + when + '; path=/' +
                    (domain !== '' ? '; domain=' + domain : '') +
                    (https ? '; SameSite=None; Secure' : '; SameSite=Lax');
                wrote += 1;
            } catch ( ex ) {
            }
        }
    };

    const install = ( ) => {
        const doc = w.document;
        store();
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

        // Whatever a page's own IAB stub parked before this arrived. Theirs is
        // the standard one, which answers a call with no arguments with the
        // queue it has been keeping.
        let queued = [];
        try {
            const stub = w.__tcfapi;
            if ( typeof stub === 'function' ) {
                const parked = stub();
                if ( Array.isArray(parked) ) { queued = parked.slice(); }
            }
        } catch ( ex ) {
        }

        try {
            w.__tcfapi = api;
        } catch ( ex ) {
            return false;
        }
        if ( w.__tcfapi !== api ) { return false; }

        for ( const call of queued ) {
            if ( Array.isArray(call) === false ) { continue; }
            try {
                api(call[0], call[1], call[2], call[3]);
            } catch ( ex ) {
            }
        }

        // The frame a cross-frame caller looks for, which the IAB stub adds.
        try {
            if ( w.frames.__tcfapiLocator === undefined && doc.body !== null ) {
                const frame = doc.createElement('iframe');
                frame.style.cssText = 'display:none';
                frame.name = '__tcfapiLocator';
                doc.body.appendChild(frame);
            }
        } catch ( ex ) {
        }

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
                } catch ( ex ) {
                }
            }, call.parameter);
        });
        return true;
    };

    return {
        tcString, cmpId: CMP_ID, publisherCC: PUBLISHER_CC, install,
        written: ( ) => wrote,
    };
}
