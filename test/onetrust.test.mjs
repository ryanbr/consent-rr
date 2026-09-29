/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

*/

import { strict as assert } from 'node:assert';
import { TCString } from '@iabtcf/core';
import { GppModel } from '@iabgpp/cmpapi';
import { before, describe, it } from 'node:test';
import {
    consentParams, cookies, cookiesInJar, filtersText, fixture, loadResources,
    run, runDom, settle, versions,
} from './helpers.mjs';

let accept;
let reject;
let unblock;

before(async ( ) => {
    const resources = await loadResources();
    accept = resources.get('onetrust-accept.js');
    reject = resources.get('onetrust-reject.js');
    unblock = resources.get('onetrust-reject-unblock.js');
});

/******************************************************************************/

describe('resources file', ( ) => {
    it('holds exactly the named resources', async ( ) => {
        const resources = await loadResources();
        assert.deepEqual(
            Array.from(resources.keys()).sort(),
            [
                'civic-reject-unblock.js',
                'civic-reject.js',
                'cookieinformation-reject.js',
                'inmobi-reject.js',
                'onetrust-accept.js',
                'onetrust-reject-unblock.js',
                'onetrust-reject.js',
                'osano-reject.js',
            ]
        );
    });

    it('carries no blank line inside a resource, which would truncate it', ( ) => {
        for ( const code of [ accept, reject, unblock ] ) {
            assert.equal(/^[ \t]*$/m.test(code), false);
        }
    });

    it('stays inside ASCII, since uBO base64-encodes it with btoa()', ( ) => {
        for ( const code of [ accept, reject, unblock ] ) {
            assert.equal(/[^\x20-\x7e\t\n]/.test(code), false);
        }
    });

    // One line apart, all three of them: anything that lands in one and not the
    // others is a bug rather than a mode.
    it('differs only in the mode it selects', ( ) => {
        for ( const mode of [ 'accept', 'reject', 'reject-unblock' ] ) {
            const code = { accept, reject, 'reject-unblock': unblock }[mode];
            assert.ok(code.includes(
                "consentRROneTrust('" + mode + "', consentRRTcf, consentRRGpp)"),
                mode);
            assert.ok(code.includes('__tcfapi'));
            assert.ok(code.includes('__gpp'));
        }
        const strip = code =>
            code.replace(/consentRROneTrust\('[a-z-]+'/, 'consentRROneTrust(');
        assert.equal(strip(accept), strip(reject));
        assert.equal(strip(reject), strip(unblock));
    });
});

/******************************************************************************/

describe('reject', ( ) => {
    it('reports C0001 only', ( ) => {
        const win = run(reject);
        assert.equal(win.OnetrustActiveGroups, ',C0001,');
        assert.equal(win.OptanonActiveGroups, ',C0001,');
    });

    it('stores a rejected decision the site will not re-prompt on', ( ) => {
        const win = run(reject);
        const params = consentParams(win);
        assert.ok(cookies(win).has('OptanonAlertBoxClosed'));
        assert.equal(params.get('interactionCount'), '1');
        assert.equal(params.get('isAnonUser'), '1');
        assert.equal(params.get('prevHadToken'), '0');
        assert.equal(params.get('AwaitingReconsent'), 'false');
        // The SDK's LAST_CONSENT_RECEIPT, last in the cookie as it writes it.
        const crTime = Number(params.get('crTime'));
        assert.ok(Math.abs(Date.now() - crTime) < 60000, String(crTime));
        const raw = cookies(win).get('OptanonConsent') || '';
        assert.ok(/&crTime=\d+$/.test(raw), raw.slice(-40));
        // 2 is the SDK's own "Banner - Reject All".
        assert.equal(params.get('intType'), '2');
        const groups = (params.get('groups') || '').split(',');
        assert.ok(groups.includes('C0001:1'));
        assert.ok(groups.includes('C0004:0'));
        assert.ok(groups.includes('BG123:0'));
        // The IAB stack group, which sites read by name.
        assert.ok(groups.includes('V2STACK42:0'));
    });

    // The SDK scopes its cookies to the registered domain, so a host-only copy
    // would shadow rather than replace one - two cookies of the same name, and
    // a site taking the first match reads whichever is older.
    it('scopes its cookies the way the SDK does', ( ) => {
        for ( const [ url, domain ] of [
            [ 'https://www.rugby365.com/', 'rugby365.com' ],
            // Not co.uk: a cookie on a public suffix is refused.
            [ 'https://shop.example.co.uk/', 'example.co.uk' ],
        ] ) {
            const dom = runDom(reject, url, fixture, w => {
                w.document.cookie = 'OptanonConsent=stale; path=/';
            });
            const found = cookiesInJar(dom, url, 'OptanonConsent');
            assert.equal(found.length, 1, url);
            assert.equal(found[0].domain, domain);
            assert.equal(Boolean(found[0].hostOnly), false);
            assert.ok(found[0].value.includes('groups='));
            // The probe used to find that domain does not linger.
            assert.equal(/consentRRProbe/.test(dom.window.document.cookie), false);
        }
    });

    // Version, then the consented ids, then the disclosed ones. Both lists are
    // empty: a real refusal consents to no AC vendor either, and the ids a real
    // string carries are Google's global list rather than anything derivable.
    it('writes an AC string that consents to nothing, either way', ( ) => {
        for ( const code of [ reject, accept ] ) {
            const win = run(code);
            assert.equal(cookies(win).get('OTAdditionalConsentString'), '2~~dv');
            let data;
            win.__tcfapi('getTCData', 2, d => { data = d; });
            // The cookie and the TCF answer say the same thing.
            assert.equal(data.addtlConsent, '2~~dv');
        }
    });

    it('leaves the parentheses in the datestamp alone, as the SDK does', ( ) => {
        // The raw cookie, not the decoded value: %28 and ( are the same once
        // URLSearchParams has been through it.
        const raw = cookies(run(reject)).get('OptanonConsent') || '';
        assert.equal(raw.includes('%28'), false);
        assert.ok(/datestamp=[^&]*\(/.test(raw), raw.slice(0, 120));
    });

    it('removes banner markup that was server-rendered', ( ) => {
        const doc = run(reject).document;
        assert.equal(doc.querySelector('#onetrust-consent-sdk'), null);
        assert.equal(doc.querySelector('#onetrust-banner-sdk'), null);
        assert.equal(doc.querySelector('.onetrust-pc-dark-filter'), null);
        assert.equal(doc.querySelector('#content').textContent, 'hello');
    });

    it('leaves gated tags parked', ( ) => {
        const doc = run(reject).document;
        assert.equal(doc.getElementById('gated-src').type, 'text/plain');
        assert.equal(doc.getElementById('gated-inline').type, 'text/plain');
        assert.equal(doc.getElementById('gated-frame').hasAttribute('src'), false);
        assert.ok(doc.getElementById('gated-frame').hasAttribute('data-src'));
        assert.equal(doc.getElementById('gated-img').hasAttribute('src'), false);
    });

    it('revives a tag gated on nothing but C0001', ( ) => {
        const doc = run(reject, '<html><head>' +
            '<script id="necessary" type="text/plain" class="optanon-category-C0001">window.ok = 1;</script>' +
            '<script id="targeting" type="text/plain" class="optanon-category-C0004" src="https://t.example/t.js"></script>' +
            '<script id="mixed" type="text/plain" class="optanon-category-C0001-C0004" src="https://m.example/m.js"></script>' +
            '</head><body><iframe id="player" class="optanon-category-C0001" data-src="https://player.example/e"></iframe>' +
            '</body></html>').document;
        // Consented, so the SDK would bring these back even on a reject-all.
        assert.equal(doc.getElementById('necessary').getAttribute('type'), 'text/javascript');
        assert.equal(doc.getElementById('player').getAttribute('src'), 'https://player.example/e');
        // Not consented: parked, and a tag naming both stays parked.
        assert.equal(doc.getElementById('targeting').getAttribute('type'), 'text/plain');
        assert.equal(doc.getElementById('mixed').getAttribute('type'), 'text/plain');
    });

    it('answers the questions a page asks before showing its own notice', ( ) => {
        const win = run(reject);
        assert.equal(win.OneTrust.IsAlertBoxClosed(), true);
        assert.equal(win.OneTrust.IsAlertBoxClosedAndValid(), true);
        assert.equal(win.OneTrust.IsVendorServiceEnabled(), false);
        assert.equal(win.Optanon, win.OneTrust);
    });

    it('still inserts a script the page asks for under C0001', ( ) => {
        const win = run(reject);
        const insert = (url, group, options) => win.OneTrust.InsertScript(
            url, 'body', undefined, options, group
        );
        insert('https://cdn.example/necessary.js', 'C0001');
        insert('https://cdn.example/tracker.js', 'C0004');
        insert('https://cdn.example/both.js', 'C0001,C0004');
        insert('https://cdn.example/forced.js', 'C0004', { ignoreGroupCheck: true });
        assert.deepEqual(
            Array.from(win.document.querySelectorAll('body script'), el => el.src),
            [ 'https://cdn.example/necessary.js', 'https://cdn.example/forced.js' ]
        );
    });

    it('inserts the markup it is handed, not an element named by it', ( ) => {
        const win = run(reject);
        let called = 0;
        win.OneTrust.InsertHtml(
            '<b id="inserted">notice</b>',
            '#content',
            ( ) => { called += 1; },
            { deleteSelectorContent: true },
            'C0001'
        );
        const target = win.document.querySelector('#content');
        assert.equal(target.textContent, 'notice');
        assert.ok(target.querySelector('#inserted'));
        assert.equal(called, 1);
    });

    it('describes the categories as inactive in GetDomainData()', ( ) => {
        const data = run(reject).OneTrust.GetDomainData();
        assert.equal(data.ShowAlertNotice, false);
        const byId = new Map(data.Groups.map(g => [ g.CustomGroupId, g.Status ]));
        assert.equal(byId.get('C0001'), 'always active');
        assert.equal(byId.get('C0004'), 'inactive');
    });
});

/******************************************************************************/

describe('accept', ( ) => {
    it('reports every category it found, discovered ones included', ( ) => {
        const win = run(accept);
        const groups = String(win.OnetrustActiveGroups).split(',');
        for ( const id of [ 'C0001', 'C0002', 'C0003', 'C0004', 'C0005', 'BG123', 'V2' ] ) {
            assert.ok(groups.includes(id), `missing ${id}`);
        }
    });

    it('stores an accepted decision', ( ) => {
        const params = consentParams(run(accept));
        // 1 is the SDK's own "Banner - Allow All".
        assert.equal(params.get('intType'), '1');
        for ( const pair of (params.get('groups') || '').split(',') ) {
            assert.equal(pair.endsWith(':1'), true, `${pair} not granted`);
        }
    });

    it('revives a parked script in place of the original node', ( ) => {
        const doc = run(accept).document;
        assert.equal(doc.querySelectorAll('script[type="text/plain"]').length, 0);
        const revived = doc.getElementById('gated-src');
        assert.equal(revived.getAttribute('type'), 'text/javascript');
        assert.equal(revived.src, 'https://tracker.example/t.js');
        // The SDK appends each copy to the parent, so the parked tags end up
        // last, in the order they were parked in.
        assert.deepEqual(
            Array.from(doc.head.children).map(el => el.id),
            [ 'gated-inline', 'gated-src' ]
        );
        assert.equal(
            doc.getElementById('gated-inline').textContent,
            'window.inlineRan = true;'
        );
    });

    it('gives data-src tags their src back', ( ) => {
        const doc = run(accept).document;
        const frame = doc.getElementById('gated-frame');
        assert.equal(frame.getAttribute('src'), 'https://player.example/embed');
        assert.equal(frame.hasAttribute('data-src'), false);
        const img = doc.getElementById('gated-img');
        assert.equal(img.getAttribute('src'), 'https://pixel.example/p.gif');
        assert.equal(img.hasAttribute('data-src'), false);
    });

    // The observer scans what was added rather than the whole document, so a
    // gated tag nested inside an added wrapper has to be found through it, and
    // an added node that is itself the match has to be found too.
    it('revives a tag nested inside something added later', async ( ) => {
        const win = run(accept);
        // Let the document-ready pass finish, so what follows can only have
        // been done by the observer.
        await settle(60);
        const wrapper = win.document.createElement('div');
        wrapper.innerHTML =
            '<section><script id="deep" type="text/plain" ' +
            'class="optanon-category-C0004" src="https://d.example/d.js">' +
            '</' + 'script></section>';
        win.document.body.append(wrapper);
        await settle(200);
        assert.equal(
            win.document.getElementById('deep').getAttribute('type'),
            'text/javascript'
        );
    });

    it('removes a banner that is itself the added node', async ( ) => {
        const win = run(reject);
        await settle(60);
        const banner = win.document.createElement('div');
        banner.id = 'onetrust-banner-sdk';
        win.document.body.append(banner);
        await settle(200);
        assert.equal(win.document.querySelector('#onetrust-banner-sdk'), null);
    });

    it('revives tags added after it ran', async ( ) => {
        const win = run(accept);
        await settle(60);
        const script = win.document.createElement('script');
        script.type = 'text/plain';
        script.className = 'optanon-category-C0004';
        script.src = 'https://late.example/late.js';
        script.id = 'late';
        win.document.body.append(script);
        await settle(200);
        assert.equal(
            win.document.getElementById('late').getAttribute('type'),
            'text/javascript'
        );
    });
});

/******************************************************************************/

describe('page integration', ( ) => {
    it('calls an OptanonWrapper declared before the SDK tag', async ( ) => {
        const win = run(reject, fixture, w => {
            w.wrapperSaw = null;
            w.OptanonWrapper = function() {
                w.wrapperSaw = w.OnetrustActiveGroups;
            };
        });
        await settle();
        assert.equal(win.wrapperSaw, ',C0001,');
    });

    it('waits for an OptanonWrapper declared later', async ( ) => {
        const win = run(reject);
        win.calls = 0;
        await settle(80);
        win.OptanonWrapper = function() { win.calls += 1; };
        await settle(500);
        assert.equal(win.calls, 1);
    });

    it('calls OptanonWrapper once only', async ( ) => {
        const win = run(reject, fixture, w => {
            w.calls = 0;
            w.OptanonWrapper = function() { w.calls += 1; };
        });
        await settle(700);
        assert.equal(win.calls, 1);
    });

    it('dispatches OneTrustGroupsUpdated on window', async ( ) => {
        const win = run(accept);
        let detail;
        win.addEventListener('OneTrustGroupsUpdated', ev => { detail = ev.detail; });
        await settle();
        assert.ok(Array.isArray(detail));
        assert.ok(detail.includes('C0004'));
    });

    it('seeds a missing data layer with the SDK load events', ( ) => {
        const win = run(reject);
        // Structural compare: the array lives in the page's realm.
        assert.deepEqual(JSON.parse(JSON.stringify(win.dataLayer)), [
            { event: 'OneTrustLoaded', OnetrustActiveGroups: ',C0001,' },
            { event: 'OptanonLoaded', OptanonActiveGroups: ',C0001,' },
        ]);
    });

    it('pushes onto a data layer the page already made', ( ) => {
        const win = run(reject, fixture, w => {
            w.dataLayer = [ { event: 'gtm.js' } ];
        });
        assert.equal(win.dataLayer.length, 3);
        assert.equal(win.dataLayer[1].event, 'OneTrustLoaded');
    });

    it('adds the banner SDK\'s data layer entry once consent is announced', async ( ) => {
        const win = run(reject);
        await settle();
        assert.deepEqual(
            JSON.parse(JSON.stringify(win.dataLayer)).map(e => e.event),
            [ 'OneTrustLoaded', 'OptanonLoaded', 'OneTrustGroupsUpdated' ]
        );
        assert.equal(win.dataLayer[2].OnetrustActiveGroups, ',C0001,');
    });

    it('records that a choice was made where the site keeps its own key', ( ) => {
        for ( const code of [ reject, accept ] ) {
            const win = run(code);
            assert.equal(win.localStorage.getItem('cookieChoiceMade'), 'true');
        }
    });

    it('installs anyway when storage is blocked', ( ) => {
        const win = run(reject, fixture, w => {
            Object.defineProperty(w, 'localStorage', {
                configurable: true,
                get( ) { throw new Error('blocked'); },
            });
        });
        // Everything that does not depend on storage still has to be in place.
        assert.equal(win.OnetrustActiveGroups, ',C0001,');
        assert.equal(win.OneTrust.IsAlertBoxClosed(), true);
        assert.ok(cookies(win).has('OptanonAlertBoxClosed'));
    });

    it('puts the key back when the page clears it while booting', async ( ) => {
        const win = run(reject);
        assert.equal(win.localStorage.getItem('cookieChoiceMade'), 'true');
        // A site that wipes storage on boot, or writes its own value over ours.
        win.localStorage.removeItem('cookieChoiceMade');
        win.localStorage.setItem('cookieChoiceMade', 'false');
        await settle(60);
        assert.equal(win.localStorage.getItem('cookieChoiceMade'), 'true');
    });

    it('records the choice even when cookies throw', ( ) => {
        const win = run(reject, fixture, w => {
            Object.defineProperty(w.document, 'cookie', {
                configurable: true,
                get( ) { throw new Error('no'); },
                set( ) { throw new Error('no'); },
            });
        });
        // The writes do not depend on each other.
        assert.equal(win.localStorage.getItem('cookieChoiceMade'), 'true');
        assert.equal(win.OnetrustActiveGroups, ',C0001,');
        assert.equal(typeof win.__tcfapi, 'function');
    });

    it('records the choice even when the document fights back', ( ) => {
        const win = run(reject, fixture, w => {
            w.document.querySelectorAll = ( ) => {
                throw new Error('no');
            };
        });
        // The state a page reads does not depend on the DOM work succeeding.
        assert.equal(win.localStorage.getItem('cookieChoiceMade'), 'true');
        assert.equal(win.OnetrustActiveGroups, ',C0001,');
        assert.ok(cookies(win).has('OptanonAlertBoxClosed'));
        assert.equal(consentParams(win).get('intType'), '2');
        assert.equal(typeof win.__tcfapi, 'function');
    });

    it('keeps properties the page preset on window.OneTrust', ( ) => {
        const win = run(reject, fixture, w => {
            w.OneTrust = { geolocationResponse: { countryCode: 'GB' } };
        });
        assert.equal(win.OneTrust.geolocationResponse.countryCode, 'GB');
        assert.equal(typeof win.OneTrust.IsAlertBoxClosed, 'function');
    });

    it('does nothing the second time it is injected', ( ) => {
        const win = run(reject);
        win.eval(reject);
        assert.equal(win.dataLayer.length, 2);
        assert.equal(win.OneTrust.consentRR.mode, 'reject');
    });

    it('registers OnConsentChanged without firing it, as a return visit does', async ( ) => {
        const win = run(reject);
        let fired = 0;
        win.OneTrust.OnConsentChanged(( ) => { fired += 1; });
        await settle(100);
        assert.equal(fired, 0);
        win.dispatchEvent(new win.CustomEvent('consent.onetrust', { detail: [] }));
        assert.equal(fired, 1);
    });
});

/******************************************************************************/

describe('filters', ( ) => {
    const shipped = async ( ) => new Set(
        Array.from((await loadResources()).keys())
    );

    // Comment lines included the wrong form on purpose, to warn about it.
    const active = filtersText.split('\n')
        .filter(line => line.startsWith('!') === false)
        .join('\n');

    // Every consent manager in the repo, so a list added for a new one is held
    // to the same rule rather than skipped by it. uBO's own tokens - noopjs and
    // the rest - are not ours to check.
    const ours = token => Object.keys(versions)
        .some(family => token.startsWith(`${family}-`));

    // uBO appends .js itself when resolving a scriptlet token, so a token
    // carrying it resolves to <name>.js.js, matches nothing, and is silently
    // dropped - no error, no injection.
    it('writes scriptlet tokens without .js, and names real resources',
        async ( ) => {
            const names = await shipped();
            const tokens = Array.from(
                active.matchAll(/\+js\(([^,)]+)/g), m => m[1].trim()
            );
            assert.ok(tokens.length !== 0);
            for ( const token of tokens ) {
                assert.equal(token.endsWith('.js'), false,
                    `+js(${token}) must not carry .js`);
                if ( ours(token) === false ) { continue; }
                assert.ok(names.has(`${token}.js`), `no resource named ${token}`);
            }
        }
    );

    // A redirect token is the resource name verbatim, .js and all.
    it('writes redirect names in full, and names real resources', async ( ) => {
        const names = await shipped();
        const tokens = Array.from(
            active.matchAll(/redirect(?:-rule)?=([^,\s]+)/g),
            m => m[1].replace(/:-?\d+$/, '')
        );
        assert.ok(tokens.length !== 0);
        for ( const token of tokens ) {
            if ( ours(token) === false ) { continue; }
            assert.ok(token.endsWith('.js'), `${token} needs its extension`);
            assert.ok(names.has(token), `no resource named ${token}`);
        }
    });
});

/******************************************************************************/

describe('resource version', ( ) => {
    // Its own consent manager's version, not the repo's: adding another
    // consent manager must not restamp these.
    it('stamps its own version into both resources', ( ) => {
        for ( const code of [ accept, reject ] ) {
            assert.ok(code.includes("const VERSION = '" + versions.onetrust + "'"));
            assert.equal(code.includes('@@VERSION@@'), false);
        }
    });

    it('reports it on the marker a console check would reach for', ( ) => {
        // Structural compare: the marker lives in the page's realm.
        const marker = code => JSON.parse(
            JSON.stringify(run(code).OneTrust.consentRR)
        );
        const version = versions.onetrust;
        assert.deepEqual(marker(reject), { mode: 'reject', version });
        assert.deepEqual(marker(accept), { mode: 'accept', version });
    });

    it('announces what went in, once', ( ) => {
        const logs = [];
        run(reject, fixture, w => {
            w.console.info = (...args) => { logs.push(args.join(' ')); };
        });
        assert.deepEqual(logs, [
            '[consent-rr] onetrust-reject ' + versions.onetrust +
            ' groups=,C0001, tcf=refused gpp=refused',
        ]);
    });

    it('says accept and granted from the accept resource', ( ) => {
        const logs = [];
        run(accept, fixture, w => {
            w.console.info = (...args) => { logs.push(args.join(' ')); };
        });
        assert.equal(logs.length, 1);
        assert.ok(logs[0].startsWith(
            '[consent-rr] onetrust-accept ' + versions.onetrust));
        assert.ok(logs[0].endsWith('tcf=granted gpp=granted'));
    });

    it('installs anyway on a page that removed the console', ( ) => {
        const win = run(reject, fixture, w => { w.console = undefined; });
        assert.equal(win.OnetrustActiveGroups, ',C0001,');
        assert.equal(win.OneTrust.consentRR.version, versions.onetrust);
    });
});

/******************************************************************************/

describe('tcf', ( ) => {
    const getTCData = win => {
        let data;
        win.__tcfapi('getTCData', 2, d => { data = d; });
        return data;
    };

    it('encodes a TC string the IAB decoder reads as a refusal', ( ) => {
        const win = run(reject, '<html lang="de"><body><p id="content">x');
        const decoded = TCString.decode(getTCData(win).tcString);
        const on = vector => {
            const ids = [];
            vector.forEach((value, id) => { if ( value ) { ids.push(id); } });
            return ids;
        };
        assert.equal(decoded.version, 2);
        assert.equal(decoded.policyVersion, 5);
        assert.equal(decoded.cmpId, 28);
        assert.equal(decoded.isServiceSpecific, true);
        // Taken off the page rather than assumed.
        assert.equal(decoded.consentLanguage, 'DE');
        // Nothing consented, and nothing kept at the purpose level either:
        // two of three real refusals sampled looked exactly like this.
        assert.deepEqual(on(decoded.purposeConsents), []);
        assert.deepEqual(on(decoded.purposeLegitimateInterests), []);
        assert.deepEqual(on(decoded.specialFeatureOptins), []);
        assert.equal(decoded.vendorConsents.size, 0);
        // Tenant-specific in every sample (DE, DE, US), so nothing is claimed.
        assert.equal(decoded.publisherCountryCode, 'AA');
        // Legitimate interest is left alone: refusing does not object to it.
        assert.equal(decoded.vendorLegitimateInterests.has(755), true);
        // A real string carried vendor ids up to 1650.
        assert.equal(decoded.vendorLegitimateInterests.has(1650), true);
        assert.equal(decoded.vendorLegitimateInterests.has(2001), false);
        assert.deepEqual(decoded.publisherRestrictions.getRestrictions(), []);
        // The publisher segment a real string carries beside the core, saying
        // the same thing again for the publisher's own purposes.
        assert.equal(getTCData(win).tcString.split('.').length, 2);
        assert.deepEqual(on(decoded.publisherConsents), []);
        assert.deepEqual(on(decoded.publisherLegitimateInterests), []);
    });

    it('reports the same refusal in the tcData object', ( ) => {
        const data = getTCData(run(reject));
        assert.equal(data.gdprApplies, true);
        assert.equal(data.eventStatus, 'tcloaded');
        assert.equal(data.cmpStatus, 'loaded');
        assert.equal(Object.values(data.purpose.consents).includes(true), false);
        assert.equal(Object.keys(data.purpose.consents).length, 11);
        assert.equal(Object.keys(data.vendor.consents).length, 0);
        assert.equal(data.vendor.legitimateInterests[755], true);
        assert.equal(data.purpose.legitimateInterests[7], false);
        // Vendors keep theirs, which every real refusal sampled did.
        assert.equal(data.vendor.legitimateInterests[1650], true);
        assert.equal(data.specialFeatureOptins[1], false);
    });

    // Refusing is not objecting to legitimate interest, so vendors keep it - but
    // Global Privacy Control is that objection, and a real refusal on a GPC
    // browser carries none at all.
    it('drops vendor legitimate interest when GPC objects for you', ( ) => {
        const signalGpc = w => {
            Object.defineProperty(w.navigator, 'globalPrivacyControl', {
                configurable: true,
                value: true,
            });
        };
        const refused = getTCData(run(reject, fixture, signalGpc));
        assert.equal(Object.keys(refused.vendor.legitimateInterests).length, 0);
        assert.equal(
            TCString.decode(refused.tcString).vendorLegitimateInterests.size, 0
        );
        // Without the signal they keep it.
        assert.ok(Object.keys(getTCData(run(reject)).vendor.legitimateInterests)
            .length !== 0);
        // And consent overrides the signal rather than being overridden by it.
        const granted = getTCData(run(accept, fixture, signalGpc));
        assert.equal(granted.vendor.legitimateInterests[755], true);
        assert.equal(granted.vendor.consents[755], true);
    });

    it('is stable for the day rather than unique per page load', ( ) => {
        const decoded = TCString.decode(getTCData(run(reject)).tcString);
        // Rounded to midday UTC, as real CMPs write it.
        assert.ok(decoded.created.toISOString().endsWith('T12:00:00.000Z'));
        assert.equal(
            decoded.created.toISOString(),
            decoded.lastUpdated.toISOString()
        );
        assert.equal(
            getTCData(run(reject)).tcString,
            getTCData(run(reject)).tcString
        );
    });

    it('answers ping as a loaded CMP', ( ) => {
        let ping;
        run(reject).__tcfapi('ping', 2, data => { ping = data; });
        assert.equal(ping.cmpLoaded, true);
        assert.equal(ping.cmpStatus, 'loaded');
        assert.equal(ping.displayStatus, 'hidden');
        assert.equal(ping.apiVersion, '2.2');
        assert.equal(ping.cmpId, 28);
    });

    it('serves and drops event listeners', ( ) => {
        const win = run(reject);
        const seen = [];
        win.__tcfapi('addEventListener', 2, data => { seen.push(data); });
        assert.equal(seen.length, 1);
        assert.equal(seen[0].eventStatus, 'tcloaded');
        const listenerId = seen[0].listenerId;
        assert.equal(typeof listenerId, 'number');
        let removed;
        win.__tcfapi('removeEventListener', 2, ok => { removed = ok; }, listenerId);
        assert.equal(removed, true);
        win.__tcfapi('removeEventListener', 2, ok => { removed = ok; }, listenerId);
        assert.equal(removed, false);
    });

    it('refuses a command or version it does not implement', ( ) => {
        const win = run(reject);
        const answers = [];
        const collect = (value, success) => { answers.push([ value, success ]); };
        win.__tcfapi('getVendorList', 2, collect);
        win.__tcfapi('ping', 1, collect);
        assert.deepEqual(answers, [ [ null, false ], [ null, false ] ]);
    });

    it('answers calls a stub parked on __tcfapi.a before it loaded', ( ) => {
        let answered;
        run(reject, fixture, w => {
            const stub = function() {};
            stub.a = [ [ 'ping', 2, data => { answered = data; } ] ];
            w.__tcfapi = stub;
        });
        assert.equal(answered.cmpStatus, 'loaded');
    });

    it('answers a framed vendor over postMessage', ( ) => {
        const win = run(reject);
        const replies = [];
        const source = { postMessage(response) { replies.push(response); } };
        const post = data => {
            const event = new win.MessageEvent('message', {
                data,
                origin: 'https://vendor.example',
            });
            // jsdom will not take a stand-in window as the event source.
            Object.defineProperty(event, 'source', { value: source });
            win.dispatchEvent(event);
        };
        post({ __tcfapiCall: { command: 'ping', version: 2, callId: 'call-1' } });
        assert.equal(replies.length, 1);
        assert.equal(replies[0].__tcfapiReturn.callId, 'call-1');
        assert.equal(replies[0].__tcfapiReturn.success, true);
        assert.equal(replies[0].__tcfapiReturn.returnValue.cmpStatus, 'loaded');
        // A vendor that sends JSON gets JSON back.
        post(JSON.stringify({
            __tcfapiCall: { command: 'getTCData', version: 2, callId: 2 },
        }));
        assert.equal(typeof replies[1], 'string');
        assert.equal(JSON.parse(replies[1]).__tcfapiReturn.callId, 2);
    });

    it('puts the TC string in eupubconsent-v2 and a locator frame in the page',
        ( ) => {
            const win = run(reject);
            assert.equal(
                cookies(win).get('eupubconsent-v2'),
                getTCData(win).tcString
            );
            assert.ok(
                win.document.querySelector('iframe[name="__tcfapiLocator"]')
            );
        }
    );

    it('grants from the accept resource, where consent is the decision', ( ) => {
        const win = run(accept);
        assert.equal(typeof win.__tcfapi, 'function');
        const data = getTCData(win);
        assert.equal(data.purpose.consents[4], true);
        assert.equal(data.vendor.consents[755], true);
        const decoded = TCString.decode(data.tcString);
        assert.equal(decoded.vendorConsents.has(1650), true);
        assert.equal(decoded.publisherConsents.has(4), true);
        assert.equal(decoded.publisherLegitimateInterests.has(7), true);
        assert.ok(win.document.querySelector('iframe[name="__tcfapiLocator"]'));
    });
});

/******************************************************************************/

describe('gpp', ( ) => {
    const ping = win => {
        let data;
        win.__gpp('ping', d => { data = d; });
        return data;
    };
    const withGpc = w => {
        Object.defineProperty(w.navigator, 'globalPrivacyControl', {
            configurable: true,
            value: true,
        });
    };

    // The strings in the resource are constants, so prove them rather than
    // trust them: rebuild one from the fields the resource itself reports,
    // using the IAB's own library, and it has to come out identical.
    const SETTABLE = [
        'Version',
        'SharingNotice', 'SaleOptOutNotice', 'SharingOptOutNotice',
        'TargetedAdvertisingOptOutNotice', 'SensitiveDataProcessingOptOutNotice',
        'SensitiveDataLimitUseNotice',
        'SaleOptOut', 'SharingOptOut', 'TargetedAdvertisingOptOut',
        'SensitiveDataProcessing', 'KnownChildSensitiveDataConsents',
        'PersonalDataConsents', 'MspaCoveredTransaction',
        'MspaOptOutOptionMode', 'MspaServiceProviderMode', 'Gpc',
    ];
    const reencode = section => {
        const model = new GppModel();
        for ( const field of SETTABLE ) {
            model.setFieldValue('usnat', field, section[field]);
        }
        return model.encode();
    };

    it('encodes what it reports, in all four combinations', ( ) => {
        for ( const code of [ reject, accept ] ) {
            for ( const before of [ undefined, withGpc ] ) {
                const data = ping(run(code, fixture, before));
                assert.equal(data.gppString, reencode(data.parsedSections.usnat));
            }
        }
    });

    it('asserts the opt-outs on a refusal and declines them on consent', ( ) => {
        const refused = ping(run(reject)).parsedSections.usnat;
        const granted = ping(run(accept)).parsedSections.usnat;
        for ( const field of [ 'SaleOptOut', 'SharingOptOut', 'TargetedAdvertisingOptOut' ] ) {
            assert.equal(refused[field], 1, field);   // 1 is opted out
            assert.equal(granted[field], 2, field);   // 2 is did not opt out
        }
        assert.deepEqual(
            JSON.parse(JSON.stringify(refused.SensitiveDataProcessing)),
            new Array(12).fill(1)
        );
    });

    it('carries the browser GPC signal either way', ( ) => {
        for ( const code of [ reject, accept ] ) {
            assert.equal(ping(run(code)).parsedSections.usnat.Gpc, false);
            const signalled = ping(run(code, fixture, withGpc));
            assert.equal(signalled.parsedSections.usnat.Gpc, true);
            assert.ok(signalled.gppString.endsWith('YA'));
        }
    });

    it('answers ping as a loaded CMP with usnat applicable', ( ) => {
        const data = ping(run(reject));
        assert.equal(data.gppVersion, '1.1');
        assert.equal(data.cmpStatus, 'loaded');
        assert.equal(data.cmpDisplayStatus, 'hidden');
        assert.equal(data.signalStatus, 'ready');
        assert.equal(data.cmpId, 28);
        assert.deepEqual(Array.from(data.supportedAPIs), [ '7:usnat' ]);
        assert.deepEqual(Array.from(data.sectionList), [ 7 ]);
        assert.deepEqual(Array.from(data.applicableSections), [ 7 ]);
    });

    it('serves hasSection, getSection and getField', ( ) => {
        const win = run(reject);
        const answers = [];
        const collect = (value, success) => { answers.push([ value, success ]); };
        win.__gpp('hasSection', collect, 'usnat');
        win.__gpp('hasSection', collect, 'usca');
        win.__gpp('getField', collect, 'usnat.SaleOptOut');
        win.__gpp('getField', collect, 'usnat.NoSuchField');
        win.__gpp('getField', collect, 'usca.SaleOptOut');
        assert.deepEqual(answers, [
            [ true, true ], [ false, true ],
            [ 1, true ], [ null, false ], [ null, false ],
        ]);
        let section;
        win.__gpp('getSection', d => { section = d; }, 'usnat');
        assert.equal(section.MspaCoveredTransaction, 2);
    });

    it('refuses a command it does not implement, getGPPData included', ( ) => {
        const win = run(reject);
        const answers = [];
        const collect = (value, success) => { answers.push([ value, success ]); };
        // Not a command in GPP 1.1; the reference implementation refuses it too.
        win.__gpp('getGPPData', collect);
        win.__gpp('nonsense', collect);
        assert.deepEqual(answers, [ [ null, false ], [ null, false ] ]);
    });

    it('serves and drops event listeners', ( ) => {
        const win = run(reject);
        const seen = [];
        win.__gpp('addEventListener', d => { seen.push(d); });
        assert.equal(seen.length, 1);
        assert.equal(seen[0].eventName, 'listenerRegistered');
        assert.equal(seen[0].data, true);
        assert.equal(seen[0].pingData.signalStatus, 'ready');
        const listenerId = seen[0].listenerId;
        const removals = [];
        const collect = (value, success) => { removals.push([ value.data, success ]); };
        win.__gpp('removeEventListener', collect, listenerId);
        win.__gpp('removeEventListener', collect, listenerId);
        assert.deepEqual(removals, [ [ true, true ], [ false, false ] ]);
    });

    it('hands back the queue and events arrays the stub keeps', ( ) => {
        const win = run(reject);
        assert.deepEqual(Array.from(win.__gpp()), []);
        assert.deepEqual(Array.from(win.__gpp('queue')), []);
        win.__gpp('addEventListener', ( ) => {});
        assert.equal(win.__gpp('events').length, 1);
    });

    it('answers calls a stub parked before it loaded', ( ) => {
        let answered;
        run(reject, fixture, w => {
            const stub = function() {};
            stub.queue = [ [ 'ping', d => { answered = d; }, undefined ] ];
            stub.events = [];
            w.__gpp = stub;
        });
        assert.equal(answered.cmpStatus, 'loaded');
    });

    it('answers a framed vendor over postMessage', ( ) => {
        const win = run(reject);
        const replies = [];
        const source = { postMessage(response) { replies.push(response); } };
        const post = data => {
            const event = new win.MessageEvent('message', {
                data,
                origin: 'https://vendor.example',
            });
            Object.defineProperty(event, 'source', { value: source });
            win.dispatchEvent(event);
        };
        post({ __gppCall: { command: 'ping', callId: 'c1' } });
        assert.equal(replies[0].__gppReturn.callId, 'c1');
        assert.equal(replies[0].__gppReturn.success, true);
        assert.equal(replies[0].__gppReturn.returnValue.cmpStatus, 'loaded');
        post(JSON.stringify({
            __gppCall: { command: 'getField', callId: 2, parameter: 'usnat.SaleOptOut' },
        }));
        assert.equal(typeof replies[1], 'string');
        assert.equal(JSON.parse(replies[1]).__gppReturn.returnValue, 1);
    });

    it('puts a locator frame in the page', ( ) => {
        for ( const code of [ reject, accept ] ) {
            const win = run(code);
            assert.ok(win.document.querySelector('iframe[name="__gppLocator"]'));
        }
    });
});

/******************************************************************************/

// Refuses exactly as reject does, and lets every parked tag go anyway: un-parking
// one claims no consent, and uBO still blocks whatever it asks for.
describe('reject-unblock', ( ) => {
    const gated = '<html><head>' +
        '<script id="nec" type="text/plain" class="optanon-category-C0001">a</' + 'script>' +
        '<script id="tgt" type="text/plain" class="optanon-category-C0004" src="https://t.example/t.js"></' + 'script>' +
        '<script id="vs" type="text/plain" class="ot-vscat-V2">c</' + 'script>' +
        '</head><body>' +
        '<iframe id="emb" class="optanon-category-C0003" data-src="https://e.example/v"></iframe>' +
        '<p id="content">x</p></body></html>';

    // Stored and sent: the refusal, exactly as reject writes it.
    it('stores and sends the same refusal as reject', ( ) => {
        const win = run(unblock);
        assert.equal(consentParams(win).get('intType'), '2');
        const groups = (consentParams(win).get('groups') || '').split(',');
        assert.ok(groups.includes('C0004:0'));
        assert.ok(groups.includes('C0002:0'));
        let tc;
        win.__tcfapi('getTCData', 2, d => { tc = d; });
        assert.equal(Object.values(tc.purpose.consents).includes(true), false);
        let gpp;
        win.__gpp('ping', d => { gpp = d; });
        assert.equal(gpp.parsedSections.usnat.SaleOptOut, 1);
        assert.equal(win.OneTrust.consentRR.mode, 'reject-unblock');
    });

    // Read locally: every category, because that is what a site's own gate asks.
    // This is the check automobiles.honda.com makes before it will play a video.
    it('tells the page what its own gate asks for', ( ) => {
        const gate = win => win.OptanonActiveGroups !== undefined &&
            win.OptanonActiveGroups !== null &&
            win.OptanonActiveGroups.includes('C0004');
        assert.equal(gate(run(unblock)), true);
        assert.equal(gate(run(reject)), false);
        assert.equal(gate(run(accept)), true);
        const win = run(unblock);
        assert.equal(win.OnetrustActiveGroups, win.OptanonActiveGroups);
        assert.ok(win.OnetrustActiveGroups.includes('V2STACK42'));
        assert.equal(win.OneTrust.GetDomainData().Groups
            .find(group => group.CustomGroupId === 'C0004').Status, 'active');
    });

    // A page that drew its placeholder before this ran re-checks from here.
    it('tells listeners to look again, where reject stays silent', async ( ) => {
        const fired = [];
        for ( const code of [ reject, unblock, accept ] ) {
            const win = run(code);
            let seen = 0;
            win.OneTrust.OnConsentChanged(( ) => { seen += 1; });
            await settle(80);
            fired.push(seen);
        }
        assert.deepEqual(fired, [ 0, 1, 0 ]);
    });

    it('lets every parked tag go, whatever its category', ( ) => {
        const doc = run(unblock, gated).document;
        for ( const id of [ 'nec', 'tgt', 'vs' ] ) {
            assert.equal(doc.getElementById(id).getAttribute('type'),
                'text/javascript', id);
        }
        assert.equal(doc.getElementById('emb').getAttribute('src'),
            'https://e.example/v');
        // Which is the whole difference from reject.
        const rejected = run(reject, gated).document;
        assert.equal(rejected.getElementById('tgt').getAttribute('type'),
            'text/plain');
        assert.equal(rejected.getElementById('emb').hasAttribute('src'), false);
    });

    it('honours an InsertScript call for any category', ( ) => {
        const win = run(unblock);
        win.OneTrust.InsertScript('https://i.example/t.js', 'body', undefined,
            undefined, 'C0004');
        assert.equal(
            Array.from(win.document.querySelectorAll('body script'), s => s.src)
                .join(','),
            'https://i.example/t.js'
        );
    });
});

/******************************************************************************/

// Sites park tags themselves rather than letting OtAutoBlock.js do it, with the
// categories in an attribute and the source in data-src or base64 in
// data-obfuscated-src. automobiles.honda.com is one.
describe('tags a site parked itself', ( ) => {
    const HIDDEN = 'aHR0cHM6Ly9jZG4uZXhhbXBsZS9tb25pdG9yaW5nLmpz';
    const page = '<html><head>' +
        '<script id="many" type="text/plain" class="my-optanon-managed" ' +
        'data-optanon-category="C0002,C0003,C0004" data-src="//dtm.example/l.js"></' + 'script>' +
        '<script id="obf" type="text/plain" class="my-optanon-managed" ' +
        'data-optanon-category="C0002" data-obfuscated-src="' + HIDDEN + '"></' + 'script>' +
        '<script id="nec" type="text/plain" class="my-optanon-managed" ' +
        'data-optanon-category="C0001">x</' + 'script>' +
        '<script id="mixed" type="text/plain" class="my-optanon-managed" ' +
        'data-optanon-category="C0001, C0004" data-src="//mixed.example/m.js"></' + 'script>' +
        '<script id="ot" type="text/plain" class="optanon-category-C0004" ' +
        'data-src="//ot.example/o.js"></' + 'script>' +
        '</head><body><p id="content">x</p></body></html>';
    const state = (win, id) => {
        const el = win.document.getElementById(id);
        if ( el.getAttribute('type') !== 'text/javascript' ) { return 'parked'; }
        return el.getAttribute('src') || 'inline';
    };

    it('frees them, moving the source across as their loader would', ( ) => {
        const win = run(unblock, page);
        assert.equal(state(win, 'many'), '//dtm.example/l.js');
        // base64, decoded the way their own loader decodes it
        assert.equal(state(win, 'obf'),
            'https://cdn.example/monitoring.js');
    });

    it('leaves them parked on a plain refusal, except a necessary one', ( ) => {
        const win = run(reject, page);
        assert.equal(state(win, 'many'), 'parked');
        assert.equal(state(win, 'obf'), 'parked');
        assert.equal(state(win, 'nec'), 'inline');
        // Every category named has to be consented: C0001 alone does not carry
        // a tag that also names C0004, however loose a site's own loader is.
        assert.equal(state(win, 'mixed'), 'parked');
    });

    it('reads the categories out of the attribute', ( ) => {
        const groups = (consentParams(run(reject, page)).get('groups') || '')
            .split(',');
        for ( const pair of [ 'C0002:0', 'C0003:0', 'C0004:0', 'C0001:1' ] ) {
            assert.ok(groups.includes(pair), pair);
        }
    });

    it('leaves a OneTrust-parked tag exactly where the SDK leaves it',
        ( ) => {
            const win = run(unblock, page);
            const el = win.document.getElementById('ot');
            assert.equal(el.getAttribute('type'), 'text/javascript');
            assert.equal(el.hasAttribute('src'), false);
            assert.equal(el.getAttribute('data-src'), '//ot.example/o.js');
        }
    );
});
