/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

*/

import { strict as assert } from 'node:assert';
import { TCString } from '@iabtcf/core';
import { before, describe, it } from 'node:test';
import {
    consentParams, cookies, filtersText, fixture, loadResources, run, settle,
    version,
} from './helpers.mjs';

let accept;
let reject;

before(async ( ) => {
    const resources = await loadResources();
    accept = resources.get('onetrust-accept.js');
    reject = resources.get('onetrust-reject.js');
});

/******************************************************************************/

describe('resources file', ( ) => {
    it('holds exactly the two named resources', async ( ) => {
        const resources = await loadResources();
        assert.deepEqual(
            Array.from(resources.keys()).sort(),
            [ 'onetrust-accept.js', 'onetrust-reject.js' ]
        );
    });

    it('carries no blank line inside a resource, which would truncate it', ( ) => {
        for ( const code of [ accept, reject ] ) {
            assert.equal(/^[ \t]*$/m.test(code), false);
        }
    });

    it('stays inside ASCII, since uBO base64-encodes it with btoa()', ( ) => {
        for ( const code of [ accept, reject ] ) {
            assert.equal(/[^\x20-\x7e\t\n]/.test(code), false);
        }
    });

    it('selects its mode, and both carry the IAB layer', ( ) => {
        assert.ok(accept.includes("consentRROneTrust('accept', consentRRTcf)"));
        assert.ok(reject.includes("consentRROneTrust('reject', consentRRTcf)"));
        for ( const code of [ accept, reject ] ) {
            assert.ok(code.includes('__tcfapi'));
        }
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
        // 2 is the SDK's own "Banner - Reject All".
        assert.equal(params.get('intType'), '2');
        const groups = (params.get('groups') || '').split(',');
        assert.ok(groups.includes('C0001:1'));
        assert.ok(groups.includes('C0004:0'));
        assert.ok(groups.includes('BG123:0'));
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

    it('revives tags added after it ran', async ( ) => {
        const win = run(accept);
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
                if ( token.startsWith('onetrust-') === false ) { continue; }
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
            if ( token.startsWith('onetrust-') === false ) { continue; }
            assert.ok(token.endsWith('.js'), `${token} needs its extension`);
            assert.ok(names.has(token), `no resource named ${token}`);
        }
    });
});

/******************************************************************************/

describe('version', ( ) => {
    it('stamps the version from package.json into both resources', ( ) => {
        for ( const code of [ accept, reject ] ) {
            assert.ok(code.includes("const VERSION = '" + version + "'"));
            assert.equal(code.includes('@@VERSION@@'), false);
        }
    });

    it('reports it on the marker a console check would reach for', ( ) => {
        // Structural compare: the marker lives in the page's realm.
        const marker = code => JSON.parse(
            JSON.stringify(run(code).OneTrust.consentRR)
        );
        assert.deepEqual(marker(reject), { mode: 'reject', version });
        assert.deepEqual(marker(accept), { mode: 'accept', version });
    });

    it('announces what went in, once', ( ) => {
        const logs = [];
        run(reject, fixture, w => {
            w.console.info = (...args) => { logs.push(args.join(' ')); };
        });
        assert.deepEqual(logs, [
            '[consent-rr] onetrust-reject ' + version +
            ' groups=,C0001, tcf=refused',
        ]);
    });

    it('says accept and granted from the accept resource', ( ) => {
        const logs = [];
        run(accept, fixture, w => {
            w.console.info = (...args) => { logs.push(args.join(' ')); };
        });
        assert.equal(logs.length, 1);
        assert.ok(logs[0].startsWith('[consent-rr] onetrust-accept ' + version));
        assert.ok(logs[0].endsWith('tcf=granted'));
    });

    it('installs anyway on a page that removed the console', ( ) => {
        const win = run(reject, fixture, w => { w.console = undefined; });
        assert.equal(win.OnetrustActiveGroups, ',C0001,');
        assert.equal(win.OneTrust.consentRR.version, version);
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
        // Nothing consented, as a real reject-all writes - but legitimate
        // interest survives it, at the purpose level as well as the vendor
        // level, which is what a real "essential" click leaves behind.
        assert.deepEqual(on(decoded.purposeConsents), []);
        assert.deepEqual(on(decoded.purposeLegitimateInterests),
            [ 2, 7, 8, 9, 10, 11 ]);
        assert.deepEqual(on(decoded.specialFeatureOptins), []);
        assert.equal(decoded.vendorConsents.size, 0);
        // What OneTrust writes itself, on sites in different countries.
        assert.equal(decoded.publisherCountryCode, 'DE');
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
        assert.deepEqual(on(decoded.publisherLegitimateInterests),
            [ 2, 7, 8, 9, 10, 11 ]);
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
        assert.equal(data.purpose.legitimateInterests[7], true);
        assert.equal(data.purpose.legitimateInterests[1], false);
        assert.equal(data.specialFeatureOptins[1], false);
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
