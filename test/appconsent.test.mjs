/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

*/

import { strict as assert } from 'node:assert';
import { before, describe, it } from 'node:test';
import { TCString } from '@iabtcf/core';
import { filtersText, loadResources, runDom, versions } from './helpers.mjs';

const URL = 'https://www.example.fr/';

const PAGE = '<!doctype html><html lang="fr"><head>' +
    '<script src="https://cdn.appconsent.io/tcf2-clear/current/' +
    'core.bundle.js"></script>' +
    '</head><body><p id="content">x</p></body></html>';

// The stub a TCF publisher leaves on the page, queue and all.
const STUB = '(function() {' +
    ' var queue = [];' +
    ' window.__tcfapi = function() {' +
    '  var args = [].slice.call(arguments);' +
    '  if ( args.length === 0 ) { return queue; }' +
    '  queue.push(args);' +
    ' };' +
    '})();';

let reject;
let accept;

before(async ( ) => {
    const resources = await loadResources();
    reject = resources.get('appconsent-reject.js');
    accept = resources.get('appconsent-accept.js');
});

const plain = value => JSON.parse(JSON.stringify(value));

const boot = (code, options = {}) => runDom(
    code, options.url || URL, options.html || PAGE,
    w => {
        if ( typeof options.before === 'function' ) { options.before(w); }
    }
);

const lines = w => {
    const out = [];
    w.console.info = line => { out.push(line); };
    return out;
};

const tcData = w => {
    let data;
    w.__tcfapi('getTCData', 2, d => { data = d; });
    return data;
};

const decode = w => TCString.decode(tcData(w).tcString);

// A real state, captured from a site after accepting with none of this in
// play. Their enum is ALLOWED 1, PENDING 0, DISALLOWED -1, and the four types
// it carries are 0 purpose, 1 feature, 2 special feature, 3 special purpose.
// legintStatus -1 is their not-applicable, and it appears against entries of
// every one of those types - not only the purposes their own [1,3,4,5,6]
// names - which is why it is never turned into a yes.
const ENTRIES = [
    // id, iab_id, type, status, legintStatus, name
    [ 1, 1, 0, 1, -1, 'Store and/or access information on a device' ],
    [ 2, 2, 0, 1, 1, 'Use limited data to select advertising' ],
    [ 3, 3, 0, 1, -1, 'Create profiles for personalised advertising' ],
    [ 7, 7, 0, 1, 1, 'Measure advertising performance' ],
    [ 11, 11, 0, 1, 1, 'Use limited data to select content' ],
    [ 12, 1, 1, 1, -1, 'Match and combine data from other data sources' ],
    [ 13, 2, 1, 1, 1, 'Link different devices' ],
    [ 15, 1, 3, 1, -1, 'Ensure security, prevent and detect fraud, and fix errors' ],
    [ 16, 2, 3, 1, 1, 'Deliver and present advertising and content' ],
    [ 18, 1, 2, 1, -1, 'Use precise geolocation data' ],
    [ 19, 2, 2, 1, 1, 'Identify devices based on information actively requested' ],
];

const THEIR_STATE = {
    consents: {
        consentables: ENTRIES.map(
            ([ id, iab_id, type, status, legintStatus, name ]) => ({
                id, iab_id, type, status, legintStatus,
                name: { values: { en: name } }, vendors_number: 100,
            })
        ),
        vendors: [
            {
                consentables: [ 1, 2, 3, 4, 7 ], legintables: [], flexibles: [ 2, 7 ],
                urls: {}, id: 1, iab_id: 1, name: '', status: 1,
                legintStatus: 1, type: 0,
            },
        ],
    },
};

// Rewriting the cmp version of a string, to stand in for one their own bundle
// wrote with a version this cannot know: the core segment's fields are fixed
// width, cmpVersion at bit 90.
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

const patchBits = (tcString, offset, bits) => {
    const parts = tcString.split('.');
    let stream = '';
    for ( const character of parts[0] ) {
        stream += B64.indexOf(character).toString(2).padStart(6, '0');
    }
    stream = stream.slice(0, offset) + bits +
        stream.slice(offset + bits.length);
    while ( stream.length % 6 !== 0 ) { stream += '0'; }
    let out = '';
    for ( let i = 0; i < stream.length; i += 6 ) {
        out += B64.charAt(parseInt(stream.slice(i, i + 6), 2));
    }
    parts[0] = out;
    return parts.join('.');
};

// The publisher country sits at bit 201, two six-bit letters.
const withPublisherCC = (tcString, country) => patchBits(
    tcString, 201,
    (country.charCodeAt(0) - 65).toString(2).padStart(6, '0') +
    (country.charCodeAt(1) - 65).toString(2).padStart(6, '0')
);

const withCmpVersion = (tcString, version) => {
    const parts = tcString.split('.');
    let bits = '';
    for ( const character of parts[0] ) {
        bits += B64.indexOf(character).toString(2).padStart(6, '0');
    }
    bits = bits.slice(0, 90) + version.toString(2).padStart(12, '0') +
        bits.slice(102);
    while ( bits.length % 6 !== 0 ) { bits += '0'; }
    let out = '';
    for ( let i = 0; i < bits.length; i += 6 ) {
        out += B64.charAt(parseInt(bits.slice(i, i + 6), 2));
    }
    parts[0] = out;
    return parts.join('.');
};

/******************************************************************************/

describe('appconsent', ( ) => {
    it('ships as two resources, in the format uBO parses', async ( ) => {
        const names = Array.from((await loadResources()).keys())
            .filter(name => name.startsWith('appconsent-'));
        assert.deepEqual(names,
            [ 'appconsent-accept.js', 'appconsent-reject.js' ]);
        for ( const code of [ reject, accept ] ) {
            assert.equal(/^[ \t]*$/m.test(code), false);
            assert.equal(/[^\x20-\x7e\t\n]/.test(code), false);
            assert.ok(code.includes("const VERSION = '" + versions.appconsent + "'"));
        }
        // One line apart: the mode, and nothing else.
        assert.ok(reject.includes('consentRRAppConsent(false)'));
        assert.ok(accept.includes('consentRRAppConsent(true)'));
    });

    it('carries their own identity, read off their builder', ( ) => {
        const d = decode(boot(reject).window);
        // cmpId 2 is hard-coded in their TC model builder, twice, and their
        // publisher country defaults to FR as their language does.
        assert.equal(d.cmpId, 2);
        assert.equal(d.policyVersion, 5);
        assert.equal(d.publisherCountryCode, 'FR');
        assert.equal(d.consentLanguage, 'FR');
        assert.equal(d.isServiceSpecific, true);
    });

    it('refuses everything in reject mode', ( ) => {
        const w = boot(reject).window;
        const d = decode(w);
        assert.equal(d.purposeConsents.size, 0);
        assert.equal(d.purposeLegitimateInterests.size, 0);
        assert.equal(d.specialFeatureOptins.size, 0);
        assert.equal(d.vendorConsents.size, 0);
        assert.equal(d.vendorLegitimateInterests.size, 0);
        assert.equal(d.publisherConsents.size, 0);
        assert.equal(tcData(w).purpose.consents[1], false);
    });

    it('grants everything in accept mode', ( ) => {
        const w = boot(accept).window;
        const d = decode(w);
        // Every purpose and legitimate interest, both special features, and
        // every vendor up to the 4000 their own cap falls back to.
        assert.equal(d.purposeConsents.size, 11);
        assert.equal(d.purposeLegitimateInterests.size, 11);
        assert.equal(d.specialFeatureOptins.size, 2);
        assert.equal(d.vendorConsents.size, 4000);
        assert.equal(d.vendorLegitimateInterests.size, 4000);
        assert.equal(d.publisherConsents.size, 24);
        assert.equal(tcData(w).purpose.consents[1], true);
        assert.equal(tcData(w).vendor.consents[755], true);
    });

    it('says GDPR applies either way', ( ) => {
        // The one field that is a claim about the law rather than an answer:
        // a vendor told otherwise may process with no consent at all.
        for ( const code of [ reject, accept ] ) {
            assert.equal(tcData(boot(code).window).gdprApplies, true);
        }
    });

    it('writes their IABTCF keys, in their encoding', ( ) => {
        const w = boot(accept).window;
        // Their lt(set, length): one character per id, "1" where it is in.
        assert.equal(
            w.localStorage.getItem('IABTCF_PurposeConsents'),
            '111111111110000000000000'
        );
        assert.equal(
            w.localStorage.getItem('IABTCF_SpecialFeaturesOptIns'),
            '110000000000'
        );
        assert.equal(w.localStorage.getItem('IABTCF_VendorConsents').length, 4000);
        assert.equal(
            w.localStorage.getItem('IABTCF_VendorConsents').indexOf('0'), -1
        );
        assert.equal(w.localStorage.getItem('IABTCF_CmpSdkID'), '2');
        assert.equal(w.localStorage.getItem('IABTCF_PolicyVersion'), '5');
        assert.equal(w.localStorage.getItem('IABTCF_PublisherCC'), 'FR');
        assert.equal(
            w.localStorage.getItem('IABTCF_TCString'), tcData(w).tcString
        );
        // Theirs calls setAllVendorsDisclosed, so this does whichever way the
        // answer goes.
        const refusing = boot(reject).window;
        assert.equal(
            refusing.localStorage.getItem('IABTCF_DisclosedVendors').indexOf('0'),
            -1
        );
        assert.equal(
            refusing.localStorage.getItem('IABTCF_PurposeConsents'),
            '000000000000000000000000'
        );
    });

    it('keeps the identity a visitor already carries', ( ) => {
        // cmpVersion comes back with the configuration a replaced bundle
        // never fetches, so a string already there is where it is read from.
        const first = boot(reject).window;
        // A version their own bundle would have carried, which is not the one
        // this falls back to - otherwise reusing and not reusing look alike.
        const theirs = withCmpVersion(
            first.localStorage.getItem('IABTCF_TCString'), 77
        );
        let out;
        const w = boot(accept, {
            before: w_ => {
                out = lines(w_);
                w_.localStorage.setItem('IABTCF_TCString', theirs);
            },
        }).window;
        assert.equal(decode(w).cmpVersion, 77);
        assert.equal(w.localStorage.getItem('IABTCF_CmpSdkVersion'), '77');
        assert.ok(out[0].includes(' cmp=2/77 '), out[0]);
        assert.equal(out[0].includes('/default'), false, out[0]);
        // And without one, their own fallback.
        assert.equal(decode(boot(reject).window).cmpVersion, 33);
    });

    it('keeps the publisher country a visitor already carries', ( ) => {
        const first = boot(reject).window;
        const theirs = withPublisherCC(
            first.localStorage.getItem('IABTCF_TCString'), 'DE'
        );
        let out;
        const w = boot(reject, {
            before: w_ => {
                out = lines(w_);
                w_.localStorage.setItem('IABTCF_TCString', theirs);
            },
        }).window;
        // It is the publisher's, not theirs, so a string already carrying one
        // is where it comes from - FR is only the fallback.
        assert.equal(decode(w).publisherCountryCode, 'DE');
        assert.equal(w.localStorage.getItem('IABTCF_PublisherCC'), 'DE');
        assert.ok(out[0].includes(' cc=DE '), out[0]);
    });

    it('answers what their stub was asked before it was replaced', ( ) => {
        const w = boot(accept, {
            before: w_ => {
                w_.eval(STUB);
                w_.eval('window.__answers = [];' +
                    'window.__tcfapi("getTCData", 2, function(d, ok) {' +
                    ' window.__answers.push([ d.purpose.consents[1], ok ]); });');
            },
        }).window;
        assert.deepEqual(plain(w.__answers), [ [ true, true ] ]);
    });

    it('adds the locator frame, and answers ping', ( ) => {
        const w = boot(reject).window;
        assert.notEqual(w.frames.__tcfapiLocator, undefined);
        let ping;
        w.__tcfapi('ping', 2, data => { ping = data; });
        assert.equal(ping.cmpId, 2);
        assert.equal(ping.cmpLoaded, true);
        assert.equal(ping.cmpStatus, 'loaded');
        let listener;
        w.__tcfapi('addEventListener', 2, data => { listener = data; });
        assert.equal(listener.eventStatus, 'tcloaded');
        let removed;
        w.__tcfapi('removeEventListener', 2, ok => { removed = ok; },
            listener.listenerId);
        assert.equal(removed, true);
        let other;
        w.__tcfapi('getInAppTCData', 2, (data, ok) => { other = [ data, ok ]; });
        assert.deepEqual(plain(other), [ null, false ]);
    });

    it('restamps the state a returning visitor carries', ( ) => {
        let out;
        const w = boot(reject, {
            before: w_ => {
                out = lines(w_);
                w_.localStorage.setItem('appconsent',
                    JSON.stringify(THEIR_STATE));
            },
        }).window;
        const state = JSON.parse(w.localStorage.getItem('appconsent'));
        // Their own status enum, every consentable and every vendor.
        assert.deepEqual(
            plain(state.consents.consentables.map(e => e.status)),
            ENTRIES.map(( ) => -1)
        );
        assert.deepEqual(plain(state.consents.vendors.map(e => e.status)),
            [ -1 ]);
        // The names and counts are theirs and are left as they were.
        assert.equal(
            state.consents.consentables[0].name.values.en,
            'Store and/or access information on a device'
        );
        assert.equal(state.consents.consentables[0].vendors_number, 100);
        // And a vendor's declared ids are its own, not something to rewrite.
        assert.deepEqual(plain(state.consents.vendors[0].consentables),
            [ 1, 2, 3, 4, 7 ]);
        assert.ok(out[0].includes(' state=denied ' + (ENTRIES.length + 1)),
            out[0]);
    });

    it('grants that state in accept mode, minus the impossible', ( ) => {
        const w = boot(accept, {
            before: w_ => {
                w_.localStorage.setItem('appconsent',
                    JSON.stringify(THEIR_STATE));
            },
        }).window;
        const state = JSON.parse(w.localStorage.getItem('appconsent'));
        assert.deepEqual(
            plain(state.consents.consentables.map(e => e.status)),
            ENTRIES.map(( ) => 1)
        );
        // The legitimate-interest pattern is theirs, field for field: a -1 is
        // their not-applicable and stays one, on features and special
        // purposes and special features as much as on a purpose. Their own
        // accepted state claims none of those, so neither does this.
        assert.deepEqual(
            plain(state.consents.consentables.map(e => e.legintStatus)),
            ENTRIES.map(entry => entry[4])
        );
        assert.deepEqual(plain(state.consents.vendors.map(e => e.status)),
            [ 1 ]);
        assert.deepEqual(plain(state.consents.vendors.map(e => e.legintStatus)),
            [ 1 ]);
    });

    it('leaves their own state alone where there is none', ( ) => {
        // Its shape comes back with a configuration this never fetches, and
        // the fields a decision would consist of are not in their bundle at
        // all - hasConsent and consentedAll appear nowhere in it. The answer
        // lives in the IABTCF_ keys and in __tcfapi instead.
        const w = boot(accept).window;
        assert.equal(w.localStorage.getItem('appconsent'), null);
        // And a state with no consentables in it is not given any: the list
        // comes back with their configuration, which is never fetched here.
        let out;
        const kept = boot(reject, {
            before: w_ => {
                out = lines(w_);
                w_.localStorage.setItem('appconsent', JSON.stringify({
                    appKey: 'abc',
                }));
            },
        }).window;
        assert.deepEqual(
            plain(JSON.parse(kept.localStorage.getItem('appconsent'))),
            { appKey: 'abc' }
        );
        // Nothing to restamp is not the same as having restamped nothing, and
        // the console says which it was.
        assert.ok(out[0].includes(' state=absent'), out[0]);
        // Their own shape but with nothing in it - a visitor part way through
        // - is the case that tells those two apart.
        let empty;
        const bare = boot(reject, {
            before: w_ => {
                empty = lines(w_);
                w_.localStorage.setItem('appconsent', JSON.stringify({
                    consents: { consentables: [], vendors: [] },
                }));
            },
        }).window;
        assert.ok(empty[0].includes(' state=absent'), empty[0]);
        assert.deepEqual(
            plain(JSON.parse(bare.localStorage.getItem('appconsent'))),
            { consents: { consentables: [], vendors: [] } }
        );
    });

    it('answers their global, under their own method names', async ( ) => {
        const w = boot(accept).window;
        assert.equal(typeof w.appconsent, 'object');
        // Read off their manager class rather than guessed: these are its
        // names.
        for ( const name of [
            'init', 'startCMP', 'initIAB', 'setConfiguration', 'update',
            'updateExtraPurpose', 'show', 'noShow', 'presentNotice',
            'retryShow', 'accept', 'deny', 'fakedeny', 'setExternalIds',
            'getExternalIds', 'getUuid', 'isFloatingNeedUpdate',
            'extraFloatingAllowed',
        ] ) {
            assert.equal(typeof w.appconsent[name], 'function', name);
        }
        // Not theirs, so not invented here.
        for ( const name of [
            'getConsents', 'getTCString', 'isGdprApplies', 'consentAll',
            'rejectAll', 'present', 'close',
        ] ) {
            assert.equal(w.appconsent[name], undefined, name);
        }
        // Theirs would show the banner or record a decision; these do
        // neither, and the answer already recorded does not move.
        assert.equal(await w.appconsent.show(), undefined);
        assert.equal(await w.appconsent.accept(), undefined);
        const refusing = boot(reject).window;
        assert.equal(await refusing.appconsent.accept(), undefined);
        assert.equal(decode(refusing).purposeConsents.size, 0);
        assert.deepEqual(plain(await refusing.appconsent.getExternalIds()), {});
    });

    it('does nothing the second time it is injected', ( ) => {
        const w = boot(reject).window;
        const before_ = w.localStorage.getItem('IABTCF_TCString');
        w.eval(accept);
        // The guard is on their API, so the second injection - of either
        // mode - leaves the first answer alone.
        assert.equal(w.localStorage.getItem('IABTCF_TCString'), before_);
        assert.equal(decode(w).purposeConsents.size, 0);
    });

    it('says on the console which way it went', ( ) => {
        let out;
        boot(reject, { before: w_ => { out = lines(w_); } });
        assert.equal(out.length, 1);
        assert.equal(
            out[0],
            '[consent-rr] appconsent-reject ' + versions.appconsent +
            ' tcf=refused cmp=2/33/default cc=FR keys=17 state=absent' +
            ' drained=0'
        );
        let granting;
        boot(accept, { before: w_ => { granting = lines(w_); } });
        assert.ok(granting[0].includes(' tcf=granted'), granting[0]);
    });

    it('refuses the same with GPC on, which they do not read', ( ) => {
        const w = boot(reject, {
            before: w_ => {
                Object.defineProperty(w_.navigator, 'globalPrivacyControl', {
                    value: true, configurable: true,
                });
            },
        }).window;
        // Nothing in their bundle reads the signal - no globalPrivacyControl
        // and no doNotTrack anywhere in it.
        assert.equal(decode(w).purposeConsents.size, 0);
    });
});

/******************************************************************************/

describe('filters, appconsent', ( ) => {
    it('replaces the core and noops the chunks it would fetch', ( ) => {
        const active = filtersText.split('\n')
            .filter(line => line !== '' && line.startsWith('!') === false)
            .filter(line => line.includes('appconsent'));
        assert.deepEqual(active, [
            '||cdn.appconsent.io/tcf2-clear/*/core.bundle.js' +
                '$script,redirect=appconsent-reject.js',
            '||cdn.appconsent.io/tcf2-clear/*/*.bundle.js$script,redirect=noopjs',
        ]);
    });

    it('matches the urls they serve, core before chunks', ( ) => {
        const matches = (pattern, url) => {
            const body = pattern.slice(2, pattern.indexOf('$'));
            const re = new RegExp(
                '^https?://([^/]*\\.)?' +
                body.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
            );
            return re.test(url);
        };
        const rules = filtersText.split('\n')
            .filter(line => line.startsWith('||') && line.includes('appconsent'));
        const core = rules.filter(line => line.includes('appconsent-reject'));
        for ( const url of [
            'https://cdn.appconsent.io/tcf2-clear/current/core.bundle.js',
            'https://cdn.appconsent.io/tcf2-clear/33.2.0/core.bundle.js',
        ] ) {
            assert.ok(core.some(r => matches(r, url)), 'no rule matches ' + url);
        }
        // The numbered chunks are what the core lazily fetches for its banner.
        const noops = rules.filter(line => line.includes('noopjs'));
        for ( const url of [
            'https://cdn.appconsent.io/tcf2-clear/33.2.0/1284.bundle.js',
            'https://cdn.appconsent.io/tcf2-clear/33.2.0/5572.bundle.js',
            'https://cdn.appconsent.io/tcf2-clear/33.2.0/6648.bundle.js',
            'https://cdn.appconsent.io/tcf2-clear/33.2.0/807.bundle.js',
        ] ) {
            assert.ok(noops.some(r => matches(r, url)), 'no noop rule for ' + url);
        }
    });
});
