/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

*/

import { strict as assert } from 'node:assert';
import { before, describe, it } from 'node:test';
import { TCString } from '@iabtcf/core';
import { cookies, filtersText, loadResources, runDom, versions } from './helpers.mjs';

const URL = 'https://www.example.it/';

// Their own entry, which is a module and carries the tenant configuration
// inlined at the top of it.
const PAGE = '<!doctype html><html lang="it"><head>' +
    '<script type="module"' +
    ' src="https://cmp.pubtech.ai/312/pubtech-cmp-v2-esm.js"></script>' +
    '</head><body><p id="content">x</p></body></html>';

// The IAB stub their bundle ships, queue and all.
const STUB = '(function() {' +
    ' var queue = [];' +
    ' window.__tcfapi = function() {' +
    '  var args = [].slice.call(arguments);' +
    '  if ( args.length === 0 ) { return queue; }' +
    '  if ( args[0] === "ping" ) { args[2]({ cmpStatus: "stub" }); return; }' +
    '  queue.push(args);' +
    ' };' +
    '})();';

let reject;

before(async ( ) => {
    reject = (await loadResources()).get('pubtech-reject.js');
});

const plain = value => JSON.parse(JSON.stringify(value));

const boot = (options = {}) => runDom(
    reject, options.url || URL, options.html || PAGE,
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

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

// Rewriting the publisher country of a string, to stand in for one a tenant
// wrote: the core segment's fields are fixed width.
const withCountry = (tcString, country) => {
    const parts = tcString.split('.');
    let bits = '';
    for ( const character of parts[0] ) {
        bits += B64.indexOf(character).toString(2).padStart(6, '0');
    }
    const put = (offset, value) => {
        bits = bits.slice(0, offset) +
            value.toString(2).padStart(6, '0') + bits.slice(offset + 6);
    };
    put(201, country.charCodeAt(0) - 65);
    put(207, country.charCodeAt(1) - 65);
    let out = '';
    while ( bits.length % 6 !== 0 ) { bits += '0'; }
    for ( let i = 0; i < bits.length; i += 6 ) {
        out += B64.charAt(parseInt(bits.slice(i, i + 6), 2));
    }
    parts[0] = out;
    return parts.join('.');
};

/******************************************************************************/

describe('pubtech-reject', ( ) => {
    it('ships as one resource, in the format uBO parses', async ( ) => {
        const names = Array.from((await loadResources()).keys())
            .filter(name => name.startsWith('pubtech-'));
        assert.deepEqual(names, [ 'pubtech-reject.js' ]);
        assert.equal(/^[ \t]*$/m.test(reject), false);
        assert.equal(/[^\x20-\x7e\t\n]/.test(reject), false);
        assert.ok(reject.includes("const VERSION = '" + versions.pubtech + "'"));
    });

    it('writes their publisher-cookie string with every choice off', ( ) => {
        const w = boot().window;
        // Their codec: version, separator, then one character each for
        // feature, user-experience and measurement cookies.
        assert.equal(cookies(w).get('pubtech-cmp-pcstring'), '0-000');
    });

    it('keeps the publisher-cookie version the visitor already has', ( ) => {
        // The version is the tenant's publisherCookieVersion - 3 on one
        // tenant sampled and 22 on the other - and it went away with the file
        // this replaces, so an existing one is kept rather than overwritten
        // with a number that would not match.
        const w = boot({
            before: w_ => {
                w_.document.cookie = 'pubtech-cmp-pcstring=22-111';
            },
        }).window;
        assert.equal(cookies(w).get('pubtech-cmp-pcstring'), '22-000');
    });

    it('answers __tcfapi with a string the IAB library agrees is a refusal',
        ( ) => {
            const w = boot().window;
            const data = tcData(w);
            // The claim about the law, not a refusal: a vendor told GDPR does
            // not apply may process with no consent at all.
            assert.equal(data.gdprApplies, true);
            assert.equal(data.cmpStatus, 'loaded');
            assert.equal(data.eventStatus, 'tcloaded');
            const decoded = TCString.decode(data.tcString);
            // Constants in their bundle, the same on both tenants sampled.
            assert.equal(decoded.cmpId, 352);
            assert.equal(decoded.cmpVersion, 6);
            assert.equal(decoded.vendorListVersion, 178);
            assert.equal(decoded.policyVersion, 5);
            assert.equal(decoded.isServiceSpecific, true);
            assert.equal(decoded.consentLanguage, 'IT');
            assert.equal(decoded.purposeConsents.size, 0);
            assert.equal(decoded.purposeLegitimateInterests.size, 0);
            assert.equal(decoded.vendorConsents.size, 0);
            assert.equal(decoded.vendorLegitimateInterests.size, 0);
            assert.equal(decoded.specialFeatureOptins.size, 0);
            assert.equal(decoded.publisherConsents.size, 0);
        }
    );

    it('cookies the string under their own name', ( ) => {
        const w = boot().window;
        const stored = cookies(w).get('euconsent-v2');
        assert.equal(stored, tcData(w).tcString);
    });

    it('reads the publisher country back off a string the visitor carries',
        ( ) => {
            // It is the tenant's, and inlined in the file this replaces, so a
            // first visit cannot know it - AA is what not stated looks like.
            let out;
            const first = boot({ before: w_ => { out = lines(w_); } }).window;
            assert.equal(TCString.decode(tcData(first).tcString)
                .publisherCountryCode, 'AA');
            assert.ok(out[0].includes(' cc=AA/default'), out[0]);

            const theirs = withCountry(tcData(first).tcString, 'IT');
            let second;
            const w = boot({
                before: w_ => {
                    second = lines(w_);
                    w_.document.cookie = 'euconsent-v2=' + theirs;
                },
            }).window;
            assert.equal(TCString.decode(tcData(w).tcString)
                .publisherCountryCode, 'IT');
            assert.ok(second[0].includes(' cc=IT'), second[0]);
            assert.equal(second[0].includes('/default'), false, second[0]);
        }
    );

    it('leaves the additional-consent string empty, in both places', ( ) => {
        const w = boot().window;
        // It lists the Google vendors a visitor consented to, and this one
        // consented to none. Their writer uses a cookie or localStorage
        // depending on a tenant setting this cannot read, so both say so.
        assert.equal(cookies(w).get('ac_euconsent-v2'), '');
        assert.equal(w.localStorage.getItem('ac_euconsent-v2'), '');
    });

    it('answers what their stub was asked before it was replaced', ( ) => {
        const w = boot({
            before: w_ => {
                w_.eval(STUB);
                w_.eval('window.__answers = [];' +
                    'window.__tcfapi("getTCData", 2, function(d, ok) {' +
                    ' window.__answers.push([ d && d.tcString !== "", ok ]); });');
            },
        }).window;
        assert.deepEqual(plain(w.__answers), [ [ true, true ] ]);
    });

    it('adds the locator frame a cross-frame caller looks for', ( ) => {
        const w = boot().window;
        assert.notEqual(w.frames.__tcfapiLocator, undefined);
    });

    it('calls the consent queue a page registers on', ( ) => {
        const seen = [];
        const w = boot({
            before: w_ => {
                w_.__seen = seen;
                w_.eval('window.__pub_tech_cmp_on_consent_queue = [' +
                    ' function(consent, tcModel, pcMap, google) {' +
                    '  window.__seen.push([ consent.pcString,' +
                    '   consent.tcString !== "", pcMap.measurementCookiesChoice,' +
                    '   google.googleConsents.length ]); } ];');
            },
        }).window;
        // Page code gated on consent is waiting on exactly this.
        assert.deepEqual(plain(seen), [ [ '0-000', true, false, 1 ] ]);
        assert.equal(w.__pub_tech_cmp_on_consent_queue.proxyEnabled, true);
    });

    it('fires a callback registered after the fact, as their drainer does',
        ( ) => {
            const w = boot().window;
            // Their lt() records the arguments and replaces push, so a
            // callback arriving later runs at once rather than waiting for a
            // consent event that has already happened.
            w.eval('window.__late = [];' +
                'window.__pub_tech_cmp_on_consent_queue.push(' +
                ' function(consent) { window.__late.push(consent.pcString); });');
            assert.deepEqual(plain(w.__late), [ '0-000' ]);
            // And it is still in the array afterwards.
            assert.equal(w.__pub_tech_cmp_on_consent_queue.length, 1);
        }
    );

    it('drains their pre-queue as well', ( ) => {
        const w = boot({
            before: w_ => {
                w_.eval('window.__pre = [];' +
                    'window.__pub_tech_cmp_on_consent_queue__pre = [' +
                    ' function(consent) { window.__pre.push(consent.pcString); } ];');
            },
        }).window;
        assert.deepEqual(plain(w.__pre), [ '0-000' ]);
    });

    it('pushes their two GTM events, in their order', ( ) => {
        const w = boot().window;
        assert.deepEqual(plain(w.dataLayer), [
            { event: '__pub_tech_cmp_on_consent_queue' },
            { event: '__pubtech_queue_on_consent' },
        ]);
    });

    it('keeps a data layer the page already has', ( ) => {
        const w = boot({
            before: w_ => { w_.eval('window.dataLayer = [ "theirs" ];'); },
        }).window;
        assert.equal(w.dataLayer[0], 'theirs');
        assert.equal(w.dataLayer.length, 3);
    });

    it('does nothing the second time it is injected', ( ) => {
        const w = boot().window;
        const before_ = w.document.cookie;
        const pushes = w.dataLayer.length;
        w.eval(reject);
        assert.equal(w.document.cookie, before_);
        assert.equal(w.dataLayer.length, pushes);
    });

    it('says on the console what it did', ( ) => {
        let out;
        boot({ before: w_ => { out = lines(w_); } });
        assert.equal(out.length, 1);
        assert.equal(
            out[0],
            '[consent-rr] pubtech-reject ' + versions.pubtech +
            ' pc=0-000 tcf=refused cc=AA/default ac=empty queues=drained' +
            ' gtm=sent'
        );
    });

    it('refuses the same with GPC on, which they do not read', ( ) => {
        const w = boot({
            before: w_ => {
                Object.defineProperty(w_.navigator, 'globalPrivacyControl', {
                    value: true, configurable: true,
                });
            },
        }).window;
        // Nothing in their bundle reads the signal, and every field here is
        // already a no, so there is nothing for it to change.
        assert.equal(cookies(w).get('pubtech-cmp-pcstring'), '0-000');
        assert.equal(TCString.decode(tcData(w).tcString).purposeConsents.size, 0);
    });
});

/******************************************************************************/

describe('filters, pubtech', ( ) => {
    it('replaces the CMP and names nothing else', ( ) => {
        const active = filtersText.split('\n')
            .filter(line => line !== '' && line.startsWith('!') === false)
            .filter(line => line.includes('pubtech'));
        const ours = active.filter(line => line.includes('pubtech-reject'));
        assert.deepEqual(ours, [
            '||cmp.pubtech.ai/*/pubtech-cmp-*.js' +
                '$script,redirect=pubtech-reject.js',
        ]);
    });

    it('matches the urls their tenants serve, and not their asset host', ( ) => {
        const matches = (pattern, url) => {
            const body = pattern.slice(2, pattern.indexOf('$'));
            const re = new RegExp(
                '^https?://([^/]*\\.)?' +
                body.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
            );
            return re.test(url);
        };
        const rules = filtersText.split('\n')
            .filter(line => line.startsWith('||') && line.includes('pubtech'));
        for ( const url of [
            'https://cmp.pubtech.ai/312/pubtech-cmp-v2-esm.js',
            'https://cmp.pubtech.ai/466/pubtech-cmp-v2-esm.js',
        ] ) {
            assert.ok(rules.some(r => matches(r, url)), 'no rule matches ' + url);
        }
        // The vendor lists and the publisher-cookie declarations are fetched by
        // the CMP this replaces, so nothing asks for them - and a rule for
        // them would break a tenant whose CMP is still running.
        for ( const url of [
            'https://cmp-assets.pubtech.ai/vendorList/v2.2/178/vendor-list.json',
            'https://cmp-assets.pubtech.ai/vendorList/v2.2/178/google-vendor-list.json',
            'https://cmp-assets.pubtech.ai/312/fallback/en/cookie/3/publisher-cookie.json',
        ] ) {
            for ( const rule of rules ) {
                assert.equal(matches(rule, url), false, rule + ' matches ' + url);
            }
        }
    });
});
