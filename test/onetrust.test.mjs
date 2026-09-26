/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

*/

import { strict as assert } from 'node:assert';
import { TCString } from '@iabtcf/core';
import { before, describe, it } from 'node:test';
import {
    consentParams, cookies, fixture, loadResources, run, settle,
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
        assert.ok(accept.includes("consentRROneTrust('accept', consentRRTcfGranted)"));
        assert.ok(reject.includes("consentRROneTrust('reject', consentRRTcfGranted)"));
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

describe('tcf', ( ) => {
    const getTCData = win => {
        let data;
        win.__tcfapi('getTCData', 2, d => { data = d; });
        return data;
    };

    it('encodes a TC string the IAB decoder reads as consent', ( ) => {
        const win = run(reject, '<html lang="de"><body><p id="content">x');
        const decoded = TCString.decode(getTCData(win).tcString);
        const on = vector => {
            const ids = [];
            vector.forEach((value, id) => { if ( value ) { ids.push(id); } });
            return ids;
        };
        assert.equal(decoded.version, 2);
        assert.equal(decoded.policyVersion, 4);
        assert.equal(decoded.cmpId, 28);
        assert.equal(decoded.isServiceSpecific, true);
        // Taken off the page rather than assumed.
        assert.equal(decoded.consentLanguage, 'DE');
        assert.deepEqual(on(decoded.purposeConsents),
            [ 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11 ]);
        assert.deepEqual(on(decoded.purposeLegitimateInterests),
            [ 2, 7, 8, 9, 10, 11 ]);
        assert.deepEqual(on(decoded.specialFeatureOptins), [ 1, 2 ]);
        // Granted as one range rather than a bit per vendor.
        assert.equal(decoded.vendorConsents.size, 1500);
        assert.equal(decoded.vendorConsents.has(1), true);
        assert.equal(decoded.vendorConsents.has(755), true);
        assert.equal(decoded.vendorConsents.has(1500), true);
        assert.equal(decoded.vendorConsents.has(1501), false);
        assert.equal(decoded.vendorLegitimateInterests.size, 1500);
        assert.deepEqual(decoded.publisherRestrictions.getRestrictions(), []);
    });

    it('reports the same consent in the tcData object', ( ) => {
        const data = getTCData(run(reject));
        assert.equal(data.gdprApplies, true);
        assert.equal(data.eventStatus, 'tcloaded');
        assert.equal(data.cmpStatus, 'loaded');
        assert.equal(Object.values(data.purpose.consents).includes(false), false);
        assert.equal(Object.keys(data.purpose.consents).length, 11);
        assert.equal(data.vendor.consents[755], true);
        assert.equal(data.specialFeatureOptins[1], true);
    });

    // The split is the point: a refusal here only asks vendors to police
    // themselves, and costs the page its player when they do. uBO blocks their
    // requests regardless.
    it('grants TCF while OneTrust itself stays refused', ( ) => {
        const win = run(reject);
        assert.equal(win.OnetrustActiveGroups, ',C0001,');
        assert.equal(win.OneTrust.GetDomainData().Groups
            .find(group => group.CustomGroupId === 'C0004').Status, 'inactive');
        const groups = (consentParams(win).get('groups') || '').split(',');
        assert.ok(groups.includes('C0004:0'));
        assert.equal(getTCData(win).purpose.consents[4], true);
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

    it('answers vendors from the accept resource as well', ( ) => {
        const win = run(accept);
        assert.equal(typeof win.__tcfapi, 'function');
        assert.equal(getTCData(win).purpose.consents[4], true);
        assert.ok(win.document.querySelector('iframe[name="__tcfapiLocator"]'));
    });
});
