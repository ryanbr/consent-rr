/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

*/

import { strict as assert } from 'node:assert';
import { before, describe, it } from 'node:test';
import { TCString } from '@iabtcf/core';
import {
    cookies, cookiesInJar, filtersText, loadResources, runDom, settle, versions,
} from './helpers.mjs';

const URL = 'https://www.example.co.uk/about';
const PAGE = '<html lang="en"><head></head><body>' +
    '<script id="parked" data-cc-category="analytics" ' +
    'data-src="https://tracker.example/a.js"></' + 'script>' +
    '<p id="content">x</p></body></html>';

// The configuration a site hands to CookieControl.load, written in the page's
// own realm so its callbacks close over the page's window.
const CONFIG = '{' +
    ' apiKey: "demo", product: "PRO",' +
    ' necessaryCookies: [ "session*" ],' +
    ' optionalCookies: [' +
    '  { name: "analytics", label: "Analytical Cookies",' +
    '    cookies: [ "_ga", "_gid" ],' +
    '    onAccept: function() { window.marks.push("accept:analytics"); },' +
    '    onRevoke: function() { window.marks.push("revoke:analytics"); } },' +
    '  { name: "marketing (social)", label: "Marketing",' +
    '    onAccept: function() { window.marks.push("accept:marketing"); },' +
    '    onRevoke: function() { window.marks.push("revoke:marketing"); } }' +
    ' ],' +
    ' statement: { name: "Cookie Statement", updated: "01/01/2026" },' +
    ' onLoad: function() { window.marks.push("load"); }' +
    '}';

let reject;
let unblock;

before(async ( ) => {
    const resources = await loadResources();
    reject = resources.get('civic-reject.js');
    unblock = resources.get('civic-reject-unblock.js');
});

const plain = value => JSON.parse(JSON.stringify(value));

// uBlock Origin passes a scriptlet's arguments to a resource like this one by
// substituting {{1}}, {{2}}... textually - see patchScriptlet in
// scriptlet-filtering-core.js. This is that substitution, argument for
// argument, so the tests exercise what uBO would actually inject.
const withArgs = (...args) => {
    let out = reject;
    args.forEach((value, i) => {
        out = out.replace('{{' + (i + 1) + '}}', value);
    });
    return out;
};

const open = (options = {}) => {
    const dom = runDom(options.code || reject, options.url || URL,
        options.html || PAGE, w => {
        if ( typeof options.before === 'function' ) { options.before(w); }
    });
    dom.window.eval('window.marks = [];');
    if ( options.load !== false ) {
        dom.window.eval('CookieControl.load(' + (options.config || CONFIG) + ');');
    }
    return dom;
};

const record = w => JSON.parse(decodeURIComponent(cookies(w).get('CookieControl')));

const lines = w => {
    const out = [];
    w.console.info = line => { out.push(line); };
    return out;
};

/******************************************************************************/

describe('civic-reject', ( ) => {
    it('ships as one resource, in the format uBO parses', async ( ) => {
        const names = Array.from((await loadResources()).keys())
            .filter(name => name.startsWith('civic-'));
        assert.deepEqual(names, [
            'civic-reject-unblock.js', 'civic-reject.js',
        ]);
        for ( const code of [ reject, unblock ] ) {
            assert.equal(/^[ \t]*$/m.test(code), false);
            assert.equal(/[^\x20-\x7e\t\n]/.test(code), false);
            assert.ok(code.includes("const VERSION = '" + versions.civic + "'"));
        }
        // The two differ by the one argument that tells them apart.
        assert.equal(
            reject.replace(
                'consentRRCivic(consentRRCivicTcf);',
                'consentRRCivic(consentRRCivicTcf, true);'
            ),
            unblock
        );
    });

    it('is there before the page calls load, with their method set', ( ) => {
        const w = open({ load: false }).window;
        assert.equal(typeof w.CookieControl, 'object');
        for ( const name of [
            'load', 'update', 'open', 'hide', 'notify', 'acceptAll',
            'rejectAll', 'changeCategory', 'toggleCategory',
            'getCategoryConsent', 'getCookie', 'getAllCookies', 'saveCookie',
            'delete', 'deleteAll', 'config', 'info', 'geoInfo', 'geoTest',
        ] ) {
            assert.equal(typeof w.CookieControl[name], 'function', name);
        }
        assert.equal(w.CookieControl.geo, null);
        assert.equal(w.CookieControl.info(), 'Cookie Control Version: 9.11.1');
    });

    it('records every optional category as revoked, by their own key', ( ) => {
        const w = open().window;
        const saved = record(w);
        // Their _validCookieName strips the separators a cookie name may not
        // carry, so "marketing (social)" is stored as marketingsocial.
        assert.deepEqual(saved.optionalCookies, {
            analytics: 'revoked',
            marketingsocial: 'revoked',
        });
        assert.deepEqual(saved.necessaryCookies, [ 'session*' ]);
        assert.equal(w.CookieControl.getCategoryConsent(0), false);
        assert.equal(w.CookieControl.getCategoryConsent(1), false);
        // An index that is not a category at all, as theirs answers.
        assert.equal(w.CookieControl.getCategoryConsent(9), null);
    });

    it('marks the decision as made, which is what stops the banner', ( ) => {
        const saved = record(open().window);
        // Their finaliseSetup only builds a notification when this is false.
        assert.equal(saved.interactedWith, true);
        assert.equal(saved.consentExpiry, 90);
        assert.ok(saved.consentDate > 0);
        assert.ok(/^[0-9A-Za-z-]{36}$/.test(saved.user));
        // A statement the site declares is recorded as seen, so a site that
        // re-prompts on a newer statement date does not re-prompt now.
        assert.deepEqual(saved.statement, {
            shown: true,
            updated: '01/01/2026',
        });
    });

    it('writes plain JSON, because the readers on these sites do not decode',
        ( ) => {
            const w = open().window;
            const raw = cookies(w).get('CookieControl');
            // Their saveConsent passes configuration.encodeCookie as the encode
            // flag and it is false by default, so the real cookie carries the
            // record as written, quotes and all.
            assert.ok(raw.startsWith('{'), raw.slice(0, 40));
            assert.equal(raw.includes('%22'), false);
            // Goldsmiths reads it with JSON.parse over the raw value and no
            // decodeURIComponent, then asks whether a category is accepted. A
            // percent-encoded value throws there, and the site decides nothing
            // was consented to.
            const theirs = JSON.parse(raw);
            assert.equal(theirs.optionalCookies.analytics, 'revoked');
            // A site that does set it gets what theirs would write.
            const encoded = open({
                config: '{ encodeCookie: true, optionalCookies:' +
                    ' [ { name: "analytics" } ] }',
            }).window;
            const rawEncoded = cookies(encoded).get('CookieControl');
            assert.ok(rawEncoded.startsWith('%7B'), rawEncoded.slice(0, 40));
            assert.equal(
                JSON.parse(decodeURIComponent(rawEncoded))
                    .optionalCookies.analytics,
                'revoked'
            );
        }
    );

    it('is read by the check a site gates its content on', ( ) => {
        // Goldsmiths, verbatim in behaviour: read the cookie once, and show the
        // content when the category it gates on is accepted - no event needed.
        const gate = w => {
            const raw = cookies(w).get('CookieControl');
            let parsed;
            try {
                parsed = JSON.parse(raw);
            } catch(ex) {
                return false;
            }
            return Boolean(
                parsed.optionalCookies &&
                parsed.optionalCookies.embedded === 'accepted'
            );
        };
        const config = '{ optionalCookies: [ { name: "analytics" },' +
            ' { name: "embedded" } ] }';
        assert.equal(gate(open({ config }).window), false);
        assert.equal(gate(open({ config, code: unblock }).window), true);
        assert.equal(
            gate(open({ config, code: withArgs('embedded') }).window),
            true
        );
    });

    it('scopes the cookie the way their own writer does', ( ) => {
        const dom = open();
        const found = cookiesInJar(dom, URL, 'CookieControl');
        assert.equal(found.length, 1);
        // Theirs walks out from the registered domain until one sticks.
        assert.equal(found[0].domain, 'example.co.uk');
        assert.equal(Boolean(found[0].hostOnly), false);
        assert.equal(found[0].path, '/');
        const days = (found[0].expires.getTime() - Date.now()) / 86400000;
        assert.ok(days > 89 && days < 91, 'expiry is ' + days + ' days');
        assert.equal(found[0].sameSite, 'lax');
    });

    it('takes the cookie life the site configured', ( ) => {
        const dom = open({
            config: '{ consentCookieExpiry: 30, optionalCookies: [] }',
        });
        assert.equal(record(dom.window).consentExpiry, 30);
        const found = cookiesInJar(dom, URL, 'CookieControl');
        const days = (found[0].expires.getTime() - Date.now()) / 86400000;
        assert.ok(days > 29 && days < 31, 'expiry is ' + days + ' days');
    });

    it('keeps the visitor a previous decision recorded', ( ) => {
        const w = open({
            before: w_ => {
                w_.document.cookie = 'CookieControl=' + encodeURIComponent(
                    JSON.stringify({
                        optionalCookies: {},
                        consentDate: 1700000000000,
                        user: 'kept-across-visits',
                    })
                ) + '; path=/';
            },
        }).window;
        const saved = record(w);
        assert.equal(saved.user, 'kept-across-visits');
        assert.equal(saved.consentDate, 1700000000000);
    });

    it('calls onLoad and neither of the category callbacks', async ( ) => {
        const w = open().window;
        // Theirs calls onAccept only for accepted categories, and onRevoke only
        // when somebody changes one. Nothing is accepted and nobody changed
        // anything, so neither fires.
        assert.deepEqual(plain(w.marks), []);
        // Theirs waits a second before calling it, so it is not there yet.
        await settle(300);
        assert.deepEqual(plain(w.marks), []);
        await settle(1000);
        assert.deepEqual(plain(w.marks), [ 'load' ]);
    });

    it('leaves a parked tag parked', ( ) => {
        const w = open().window;
        const tag = w.document.getElementById('parked');
        // Theirs frees one by copying data-src into src when its category is
        // accepted. None is.
        assert.equal(tag.getAttribute('src'), null);
        assert.equal(tag.getAttribute('data-src'), 'https://tracker.example/a.js');
    });

    it('refuses to change the decision it just recorded', ( ) => {
        const w = open().window;
        assert.equal(w.CookieControl.changeCategory(0, true), false);
        assert.equal(w.CookieControl.toggleCategory(0), false);
        // There is no interface to open, and nothing to delete on a visitor's
        // behalf - uBlock Origin is doing the blocking half.
        assert.equal(w.CookieControl.deleteAll(), false);
        for ( const name of [
            'open', 'hide', 'notify', 'acceptAll', 'rejectAll',
            'notifyAccept', 'notifyReject', 'notifyDismiss',
        ] ) {
            w.CookieControl[name]();
        }
        assert.deepEqual(record(w).optionalCookies, {
            analytics: 'revoked',
            marketingsocial: 'revoked',
        });
        assert.equal(w.CookieControl.getCategoryConsent(0), false);
    });

    it('answers the cookie helpers a page may be using', ( ) => {
        const w = open().window;
        assert.equal(w.CookieControl.saveCookie('ccTest', 'value', 1), true);
        assert.equal(w.CookieControl.getCookie('ccTest'), 'value');
        assert.ok(w.CookieControl.getAllCookies().ccTest !== undefined);
        assert.equal(w.CookieControl.delete('ccTest'), true);
        assert.equal(w.CookieControl.getCookie('ccTest'), null);
        assert.equal(w.CookieControl.getCookie('nothing-here'), null);
    });

    it('claims no location, where theirs gets one with its key check', ( ) => {
        const w = open().window;
        assert.equal(w.CookieControl.geoInfo(), false);
        let answered;
        assert.equal(
            w.CookieControl.geoTest('PRO', 'demo', value => { answered = value; }),
            false
        );
        assert.equal(answered, false);
    });

    it('records a CCPA notice as shown in their ccpa mode', ( ) => {
        const w = open({
            config: '{ mode: "ccpa", ccpaConfig: { updated: "02/02/2026" },' +
                ' optionalCookies: [ { name: "sale" } ] }',
        }).window;
        const saved = record(w);
        assert.deepEqual(saved.ccpa, { shown: true, updated: '02/02/2026' });
        assert.deepEqual(saved.optionalCookies, { sale: 'revoked' });
    });

    it('takes its arguments the way uBO hands them to a resource', ( ) => {
        // uBO calls a resource that opens with "function name(" by name, and
        // substitutes {{1}} into anything else. This one has to stay the
        // second kind: were it the first, the placeholders would ship as
        // written and a filter naming a category would do nothing at all,
        // silently - uBO wraps scriptlets in an empty catch.
        assert.equal(/^function\s+([^(\s]+)\s*\(/.test(reject), false);
        // And served as a redirect, which takes no arguments, they stay as
        // they are and nothing is accepted.
        assert.ok(reject.includes("'{{1}}', '{{2}}', '{{3}}'"));
        const w = open().window;
        assert.deepEqual(record(w).optionalCookies, {
            analytics: 'revoked',
            marketingsocial: 'revoked',
        });
    });

    it('accepts a category the filter names, and runs their onAccept', ( ) => {
        let out;
        const w = open({
            code: withArgs('analytics'),
            before: w_ => { out = lines(w_); },
        }).window;
        // A site that withholds content behind a category gates it on this
        // callback, which is what their own accept path calls.
        assert.deepEqual(plain(w.marks), [ 'accept:analytics' ]);
        assert.deepEqual(record(w).optionalCookies, {
            analytics: 'accepted',
            marketingsocial: 'revoked',
        });
        assert.equal(w.CookieControl.getCategoryConsent(0), true);
        assert.equal(w.CookieControl.getCategoryConsent(1), false);
        // The tag parked for it gets its real url back, as theirs does.
        assert.equal(
            w.document.getElementById('parked').getAttribute('src'),
            'https://tracker.example/a.js'
        );
        assert.equal(out[0],
            '[consent-rr] civic-reject ' + versions.civic +
            ' mode=gdpr revoked=marketing (social) accepted=analytics' +
            ' iab=off cookie=written'
        );
    });

    it('matches a category by its stored key as well as its name', ( ) => {
        const w = open({ code: withArgs('marketingsocial') }).window;
        assert.deepEqual(record(w).optionalCookies, {
            analytics: 'revoked',
            marketingsocial: 'accepted',
        });
        assert.deepEqual(plain(w.marks), [ 'accept:marketing' ]);
    });

    it('accepts every category on a star, and none on a name that is not one',
        ( ) => {
            const all = open({ code: withArgs('*') }).window;
            assert.deepEqual(record(all).optionalCookies, {
                analytics: 'accepted',
                marketingsocial: 'accepted',
            });
            const none = open({ code: withArgs('nothing-called-this') }).window;
            assert.deepEqual(record(none).optionalCookies, {
                analytics: 'revoked',
                marketingsocial: 'revoked',
            });
            assert.deepEqual(plain(none.marks), []);
        }
    );

    it('takes more than one name, as uBO passes more than one argument', ( ) => {
        const w = open({ code: withArgs('analytics', 'marketing (social)') }).window;
        assert.deepEqual(record(w).optionalCookies, {
            analytics: 'accepted',
            marketingsocial: 'accepted',
        });
        assert.deepEqual(plain(w.marks).sort(),
            [ 'accept:analytics', 'accept:marketing' ]);
    });

    it('frees every category from the unblock resource, for a redirect', ( ) => {
        // A redirect carries no arguments, so the resource that has to work
        // without one accepts the lot.
        let out;
        const w = open({ code: unblock, before: w_ => { out = lines(w_); } }).window;
        assert.deepEqual(record(w).optionalCookies, {
            analytics: 'accepted',
            marketingsocial: 'accepted',
        });
        assert.deepEqual(plain(w.marks).sort(),
            [ 'accept:analytics', 'accept:marketing' ]);
        assert.equal(w.CookieControl.getCategoryConsent(0), true);
        assert.equal(w.CookieControl.getCategoryConsent(1), true);
        assert.equal(
            w.document.getElementById('parked').getAttribute('src'),
            'https://tracker.example/a.js'
        );
        assert.equal(w.CookieControl.consentRR.mode, 'reject-unblock');
        assert.equal(out[0],
            '[consent-rr] civic-reject-unblock ' + versions.civic +
            ' mode=gdpr revoked=(none)' +
            ' accepted=analytics,marketing (social) iab=off cookie=written'
        );
    });

    it('still refuses the IAB layer from the unblock resource', ( ) => {
        // Categories are one thing; consenting for a vendor list is another,
        // and unblocking a site's own content is no reason to do it.
        const w = open({
            code: unblock,
            config: '{ iabCMP: true, optionalCookies: [ { name: "ads" } ] }',
        }).window;
        let data;
        w.__tcfapi('getTCData', 2, value => { data = value; });
        const decoded = TCString.decode(data.tcString);
        const anyOn = model => {
            let found = false;
            model.forEach(value => { if ( value ) { found = true; } });
            return found;
        };
        assert.equal(anyOn(decoded.purposeConsents), false);
        assert.equal(anyOn(decoded.purposeLegitimateInterests), false);
        assert.equal(decoded.vendorConsents.size, 0);
    });

    it('refuses explicitly, which is what defeats their CCPA auto-accept', ( ) => {
        // Their one Global Privacy Control check is here, in ccpa mode: with
        // the signal off they accept every category that is not explicitly
        // revoked, and with it on they accept only what already was. Naming
        // each category as revoked answers both branches the same way, so the
        // signal changes nothing - which is the whole of GPC in their file.
        const config = '{ mode: "ccpa", ccpaConfig: { updated: "02/02/2026" },' +
            ' optionalCookies: [ { name: "sale" }, { name: "analytics" } ] }';
        const withSignal = open({
            config,
            before: w_ => {
                Object.defineProperty(w_.navigator, 'globalPrivacyControl', {
                    value: true,
                    configurable: true,
                });
            },
        }).window;
        const without = open({ config }).window;
        for ( const w of [ withSignal, without ] ) {
            const saved = record(w);
            // Present and revoked, not merely absent: absent is what their
            // auto-accept turns into an acceptance.
            assert.deepEqual(saved.optionalCookies, {
                sale: 'revoked',
                analytics: 'revoked',
            });
        }
        const strip = w => {
            const saved = record(w);
            delete saved.consentDate;
            delete saved.user;
            return JSON.stringify(saved);
        };
        assert.equal(strip(withSignal), strip(without));
    });

    it('installs no TCF API where the site has not asked for one', ( ) => {
        const w = open().window;
        // Their own script installs it only when iabCMP is true, which is a
        // paid option and off by default.
        assert.equal(typeof w.__tcfapi, 'undefined');
        assert.equal(w.CookieControl.config().iabCMP, false);
        assert.equal(record(w).iabConsent, undefined);
    });

    it('installs one where the site does ask, refusing everything', ( ) => {
        const w = open({
            config: '{ iabCMP: true, iabConfig: { publisherCC: "IE",' +
                ' language: "en" }, optionalCookies: [ { name: "ads" } ] }',
        }).window;
        assert.equal(typeof w.__tcfapi, 'function');
        let data;
        w.__tcfapi('getTCData', 2, value => { data = value; });
        const decoded = TCString.decode(data.tcString);
        assert.equal(decoded.cmpId, 259);
        assert.equal(decoded.cmpVersion, 9);
        assert.equal(decoded.vendorListVersion, 178);
        assert.equal(decoded.publisherCountryCode, 'IE');
        // Their reject-all turns legitimate interest off too, unlike the other
        // consent managers here.
        const anyOn = model => {
            let found = false;
            model.forEach(value => { if ( value ) { found = true; } });
            return found;
        };
        assert.equal(anyOn(decoded.purposeConsents), false);
        assert.equal(anyOn(decoded.purposeLegitimateInterests), false);
        assert.equal(anyOn(decoded.specialFeatureOptins), false);
        assert.equal(decoded.vendorConsents.size, 0);
        assert.equal(decoded.vendorLegitimateInterests.size, 0);
        // Local midnight, as their encoder rounds.
        const midnight = new Date();
        midnight.setHours(0, 0, 0, 0);
        assert.equal(decoded.created.getTime(), midnight.getTime());
        assert.equal(
            w.document.querySelectorAll('iframe[name="__tcfapiLocator"]').length,
            1
        );
    });

    it('answers ping with their field set, policy version and all', ( ) => {
        const w = open({ config: '{ iabCMP: true, optionalCookies: [] }' }).window;
        let pinged;
        w.__tcfapi('ping', 2, value => { pinged = value; });
        assert.deepEqual(plain(pinged), {
            gdprApplies: true,
            cmpLoaded: true,
            cmpStatus: 'loaded',
            displayStatus: 'hidden',
            apiVersion: '2.2',
            cmpVersion: 9,
            cmpId: 259,
            gvlVersion: 178,
            // Theirs answers 4 here while encoding 5 into the string. That is
            // their inconsistency, kept rather than tidied up.
            tcfPolicyVersion: 4,
        });
        let data;
        w.__tcfapi('getTCData', 2, value => { data = value; });
        assert.equal(data.tcfPolicyVersion, 4);
        assert.equal(TCString.decode(data.tcString).policyVersion, 5);
    });

    it('keeps the TC string where theirs keeps it', ( ) => {
        const w = open({
            config: '{ iabCMP: true, setCookieControlTC: true,' +
                ' optionalCookies: [ { name: "ads" } ] }',
        }).window;
        let data;
        w.__tcfapi('getTCData', 2, value => { data = value; });
        const saved = record(w);
        // In IAB mode their own record drops the categories and carries the
        // string, which their reader takes verbatim when no compressed
        // addtlConsent sits beside it.
        assert.equal(saved.optionalCookies, undefined);
        assert.equal(saved.iabConsent, data.tcString);
        assert.equal(saved.addtlConsent, undefined);
        // And the separate cookie, which is off unless the site asks for it.
        assert.equal(cookies(w).get('CookieControlTC'), data.tcString);
        const without = open({
            config: '{ iabCMP: true, optionalCookies: [] }',
        }).window;
        assert.equal(cookies(without).has('CookieControlTC'), false);
    });

    it('answers the TCF commands theirs answers, and warns on the rest', ( ) => {
        const w = open({ config: '{ iabCMP: true, optionalCookies: [] }' }).window;
        const warned = [];
        w.console.warn = line => { warned.push(line); };
        const seen = [];
        let listenerId;
        w.__tcfapi('addEventListener', 2, (data, success) => {
            listenerId = data.listenerId;
            seen.push([ data.eventStatus, success ]);
        });
        assert.deepEqual(plain(seen), [ [ 'useractioncomplete', true ] ]);
        // Their update re-announces to every listener.
        w.__tcfapi('update', 2, '_', 'ignored');
        assert.equal(seen.length, 2);
        let removed;
        w.__tcfapi('removeEventListener', 2, ok => { removed = ok; }, listenerId);
        assert.equal(removed, true);
        w.__tcfapi('update', 2, '_', 'ignored');
        assert.equal(seen.length, 2);
        // Their own two warnings.
        w.__tcfapi('getVendorList', 2, ( ) => {});
        w.__tcfapi('ping', 3, ( ) => {});
        assert.deepEqual(warned, [
            'Unsupported CMP command: getVendorList',
            'Invalid TCF Version: 3',
        ]);
    });

    it('answers a framed vendor over postMessage', ( ) => {
        const w = open({ config: '{ iabCMP: true, optionalCookies: [] }' }).window;
        const replies = [];
        const source = { postMessage(response) { replies.push(response); } };
        const post = data => {
            const event = new w.MessageEvent('message', {
                data,
                origin: 'https://vendor.example',
            });
            Object.defineProperty(event, 'source', { value: source });
            w.dispatchEvent(event);
        };
        post({ __tcfapiCall: { command: 'ping', version: 2, callId: 'a' } });
        assert.equal(replies[0].__tcfapiReturn.callId, 'a');
        assert.equal(replies[0].__tcfapiReturn.returnValue.cmpId, 259);
        post(JSON.stringify({
            __tcfapiCall: { command: 'getTCData', version: 2, callId: 2 },
        }));
        assert.equal(typeof replies[1], 'string');
        assert.equal(JSON.parse(replies[1]).__tcfapiReturn.success, true);
    });

    it('says on the console what went in', ( ) => {
        let out;
        const w = open({ before: w_ => { out = lines(w_); } }).window;
        assert.equal(out.length, 1);
        assert.equal(out[0],
            '[consent-rr] civic-reject ' + versions.civic +
            ' mode=gdpr revoked=analytics,marketing (social)' +
            ' iab=off cookie=written'
        );
        assert.equal(w.CookieControl.consentRR.mode, 'reject');
        assert.equal(w.CookieControl.consentRR.version, versions.civic);
    });

    it('does nothing the second time it is injected', ( ) => {
        const dom = open();
        const w = dom.window;
        const before_ = cookies(w).get('CookieControl');
        w.eval(reject);
        // The second copy returns before replacing anything. A fresh one would
        // throw away the configuration the page already handed over, and answer
        // config() with defaults it never asked for.
        assert.equal(w.CookieControl.config().optionalCookies.length, 2);
        assert.equal(w.CookieControl.getCategoryConsent(0), false);
        assert.equal(cookies(w).get('CookieControl'), before_);
    });
});

/******************************************************************************/

describe('filters, civic', ( ) => {
    const active = filtersText.split('\n')
        .filter(line => line.startsWith('!') === false)
        .join('\n');

    it('replaces version 9, and leaves version 8 alone', ( ) => {
        const ours = active.split('\n').filter(line => line.includes('civic-reject'));
        assert.ok(ours.length !== 0);
        for ( const line of ours ) {
            assert.ok(/cc\.cdn\.civiccomputing\.com|\+js\(/.test(line), line);
        }
        assert.ok(active.includes('/9/cookieControl-9*.js'));
        // This was read against 9; 8 is a different build.
        assert.equal(active.includes('cookieControl-8'), false);
    });
});
