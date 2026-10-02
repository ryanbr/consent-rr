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

    The TCF layer for AppConsent, which is all of it: their core bundle is a
    TCF v2.2 CMP with the IAB's own cmpapi embedded, and the banner arrives in
    chunks it fetches afterwards.

    Read off core.bundle.js rather than from documentation. Their own TC model
    builder sets:

      cmpId = 2                 hard-coded, twice, in that builder
      publisherCountryCode      "FR", their default
      created, lastUpdated      midnight UTC, the same rounding this repo uses
      cmpVersion                config.CMP_VERSION, which comes back with the
                                configuration a replaced bundle never fetches
      policyVersion             vendorlist.tcf_policy_version, 5 under TCF 2.2
      setAllVendorsDisclosed()  so their strings carry every vendor as
                                disclosed, up to the 4000 their own vendor cap
                                falls back to

    They also write the IABTCF_ keys into localStorage - CmpSdkID,
    CmpSdkVersion, PolicyVersion, PublisherCC, PurposeOneTreatment,
    UseNonStandardTexts, TCString, VendorConsents, VendorLegitimateInterests,
    PurposeConsents, PurposeLegitimateInterests, SpecialFeaturesOptIns,
    PublisherConsent, PublisherLegitimateInterests, the two custom-purpose ones
    and DisclosedVendors - each a string of "0" and "1", one character per id,
    built by their lt(set, length).

    Two things a replaced bundle cannot know, and both are recovered rather
    than invented: cmpVersion and the publisher country, read back out of a
    string the visitor already carries where there is one.

*/

function consentRRAppConsentTcf(grantAll, previousString, language) {
    const w = window;
    const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

    const CMP_ID = 2;
    const CMP_VERSION_FALLBACK = 33;    // the bundle series seen, 33.2.0
    const POLICY_VERSION = 5;
    const VENDOR_MAX = 4000;            // their own fallback cap
    const PURPOSES = 11;
    const SPECIAL_FEATURES = 2;
    const PUBLISHER_PURPOSES = 24;
    // Pinned rather than observed: the list version arrives with the
    // configuration a replaced bundle never fetches.
    const VENDOR_LIST_VERSION = 178;

    const decodeIdentity = tcString => {
        try {
            if ( typeof tcString !== 'string' ) { return null; }
            const core = tcString.split('.')[0];
            if ( core.length < 40 ) { return null; }
            let bits = '';
            for ( const character of core ) {
                const index = B64.indexOf(character);
                if ( index === -1 ) { return null; }
                bits += index.toString(2).padStart(6, '0');
            }
            const at = (offset, width) => parseInt(bits.substr(offset, width), 2);
            if ( at(0, 6) !== 2 ) { return null; }
            const letters = offset => String.fromCharCode(
                65 + at(offset, 6), 65 + at(offset + 6, 6)
            );
            const version = at(90, 12);
            const country = letters(201);
            return {
                cmpVersion: version > 0 ? version : CMP_VERSION_FALLBACK,
                publisherCC: /^[A-Z]{2}$/.test(country) ? country : 'FR',
            };
        } catch(ex) {
        }
        return null;
    };

    // Their own default language is FR, as their publisher country is.
    const twoLetters = (value, fallback) => {
        const text = typeof value === 'string' ? value.toUpperCase() : '';
        const match = /[A-Z]{2}/.exec(text);
        return match !== null ? match[0] : fallback;
    };
    const consentLanguage = twoLetters(language, 'FR');

    const theirs = decodeIdentity(previousString);
    const CMP_VERSION = theirs !== null
        ? theirs.cmpVersion
        : CMP_VERSION_FALLBACK;
    const publisherCC = theirs !== null ? theirs.publisherCC : 'FR';

    const ids = count => {
        const out = [];
        for ( let id = 1; id <= count; id++ ) { out.push(id); }
        return out;
    };

    const granted = grantAll === true;
    const purposeIds = granted ? ids(PURPOSES) : [];
    const specialFeatureIds = granted ? ids(SPECIAL_FEATURES) : [];
    const publisherIds = granted ? ids(PUBLISHER_PURPOSES) : [];

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
        const pushFlags = (list, width) => {
            let text = '';
            for ( let position = 1; position <= width; position++ ) {
                text += list.indexOf(position) !== -1 ? '1' : '0';
            }
            chunks.push(text);
        };
        // One range covering every vendor, which is how a string says all of
        // them rather than a bit each.
        const pushVendorRange = ( ) => {
            push(VENDOR_MAX, 16);
            push(1, 1);
            push(1, 12);
            push(1, 1);
            push(1, 16);
            push(VENDOR_MAX, 16);
        };
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
        return {
            push, pushLetters, pushFlags, pushVendorRange, pushNoVendors,
            toString,
        };
    };

    const now = new Date();
    const midnight = Date.UTC(
        now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()
    );

    const encodeCoreString = ( ) => {
        const {
            push, pushLetters, pushFlags, pushVendorRange, pushNoVendors,
            toString,
        } = bitWriter();
        push(2, 6);
        push(midnight / 100, 36);
        push(midnight / 100, 36);
        push(CMP_ID, 12);
        push(CMP_VERSION, 12);
        push(0, 6);
        pushLetters(consentLanguage);
        push(VENDOR_LIST_VERSION, 12);
        push(POLICY_VERSION, 6);
        push(1, 1);                     // service specific
        push(0, 1);
        pushFlags(specialFeatureIds, 12);
        pushFlags(purposeIds, 24);
        pushFlags(purposeIds, 24);      // legitimate interests follow consent
        push(0, 1);
        pushLetters(publisherCC);
        if ( granted ) {
            pushVendorRange();          // vendor consents: all of them
            pushVendorRange();          // vendor legitimate interests
        } else {
            pushNoVendors();
            pushNoVendors();
        }
        push(0, 12);
        return toString();
    };

    const encodePublisherSegment = ( ) => {
        const { push, pushFlags, toString } = bitWriter();
        push(3, 3);
        pushFlags(publisherIds, 24);
        pushFlags(publisherIds, 24);
        push(0, 6);
        return toString();
    };

    const tcString = encodeCoreString() + '.' + encodePublisherSegment();

    const flags = (list, count) => {
        const out = {};
        for ( let id = 1; id <= count; id++ ) {
            out[id] = list.indexOf(id) !== -1;
        }
        return out;
    };

    const everyVendor = ( ) => {
        const out = {};
        if ( granted === false ) { return out; }
        for ( let id = 1; id <= VENDOR_MAX; id++ ) { out[id] = true; }
        return out;
    };

    // Their lt(): one character per id, "1" where it is in the set.
    const bits = (list, count) => {
        let text = '';
        for ( let id = 1; id <= count; id++ ) {
            text += list.indexOf(id) !== -1 ? '1' : '0';
        }
        return text;
    };

    const allBits = count => {
        let text = '';
        for ( let id = 1; id <= count; id++ ) { text += granted ? '1' : '0'; }
        return text;
    };

    // The keys they put in localStorage, with their names and their encoding.
    const storageEntries = ( ) => ({
        IABTCF_CmpSdkID: CMP_ID,
        IABTCF_CmpSdkVersion: CMP_VERSION,
        IABTCF_PolicyVersion: POLICY_VERSION,
        IABTCF_PublisherCC: publisherCC,
        IABTCF_PurposeOneTreatment: 0,
        IABTCF_UseNonStandardTexts: 0,
        IABTCF_TCString: tcString,
        IABTCF_VendorConsents: allBits(VENDOR_MAX),
        IABTCF_VendorLegitimateInterests: allBits(VENDOR_MAX),
        IABTCF_PurposeConsents: bits(purposeIds, 24),
        IABTCF_PurposeLegitimateInterests: bits(purposeIds, 24),
        IABTCF_SpecialFeaturesOptIns: bits(specialFeatureIds, 12),
        IABTCF_PublisherConsent: bits(publisherIds, 24),
        IABTCF_PublisherLegitimateInterests: bits(publisherIds, 24),
        IABTCF_PublisherCustomPurposesConsents: '',
        IABTCF_PublisherCustomPurposesLegitimateInterests: '',
        // Theirs calls setAllVendorsDisclosed, so every vendor is disclosed
        // whichever way the answer goes.
        IABTCF_DisclosedVendors: (( ) => {
            let text = '';
            for ( let id = 1; id <= VENDOR_MAX; id++ ) { text += '1'; }
            return text;
        })(),
    });

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
        outOfBand: { allowedVendors: {}, disclosedVendors: everyVendor() },
        purpose: {
            consents: flags(purposeIds, PURPOSES),
            legitimateInterests: flags(purposeIds, PURPOSES),
        },
        vendor: {
            consents: everyVendor(),
            legitimateInterests: everyVendor(),
        },
        specialFeatureOptins: flags(specialFeatureIds, 12),
        publisher: {
            consents: flags(publisherIds, PUBLISHER_PURPOSES),
            legitimateInterests: flags(publisherIds, PUBLISHER_PURPOSES),
            customPurpose: { consents: {}, legitimateInterests: {} },
            restrictions: {},
        },
    });

    return { tcString, cmpId: CMP_ID, cmpVersion: CMP_VERSION, publisherCC,
        reusedIdentity: theirs !== null, storageEntries, tcData, granted };
}
