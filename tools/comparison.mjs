/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    Writes COMPARISON.md by running the three built resources and recording what
    each one does. Generated rather than written, because a table like this rots
    the moment a resource changes and a wrong one is worse than none. `npm run
    build` regenerates it and CI fails if the committed copy has drifted.

*/

import { TCString } from '@iabtcf/core';
import { JSDOM } from 'jsdom';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const manifest = JSON.parse(
    await fs.readFile(path.join(root, 'package.json'), 'utf8')
);
const MODES = [ 'reject', 'reject-unblock', 'accept' ];

const PAGE = '<html lang="en"><head>' +
    '<script id="c1" type="text/plain" class="optanon-category-C0001">a</' + 'script>' +
    '<script id="c2" type="text/plain" class="optanon-category-C0002" src="https://p.example/p.js"></' + 'script>' +
    '<script id="c4" type="text/plain" class="optanon-category-C0004" src="https://t.example/t.js"></' + 'script>' +
    '<script id="c5" type="text/plain" class="optanon-category-C0005" src="https://s.example/s.js"></' + 'script>' +
    '<script id="stack" type="text/plain" class="optanon-category-V2STACK42" src="https://v.example/v.js"></' + 'script>' +
    '<script id="own" type="text/plain" class="my-optanon-managed" ' +
    'data-optanon-category="C0002" data-src="//o.example/o.js"></' + 'script>' +
    '</head><body><div id="onetrust-banner-sdk">banner</div>' +
    '<iframe id="c3" class="optanon-category-C0003" data-src="https://e.example/v"></iframe>' +
    '<p id="content">x</p></body></html>';

const observe = async mode => {
    const code = await fs.readFile(
        path.join(root, 'dist', `onetrust-${mode}.js`), 'utf8'
    );
    const dom = new JSDOM(PAGE, {
        runScripts: 'outside-only',
        url: 'https://example.com/',
    });
    const w = dom.window;
    const doc = w.document;
    const logs = [];
    w.console.info = (...args) => { logs.push(args.join(' ')); };
    w.eval(code);
    let consentChanged = 0;
    let groupsUpdated = 0;
    w.OneTrust.OnConsentChanged(( ) => { consentChanged += 1; });
    w.addEventListener('OneTrustGroupsUpdated', ( ) => { groupsUpdated += 1; });
    await new Promise(resolve => { setTimeout(resolve, 150); });

    const cookies = new Map(String(doc.cookie).split(/;\s*/).map(pair => {
        const pos = pair.indexOf('=');
        return [ pair.slice(0, pos), decodeURIComponent(pair.slice(pos + 1)) ];
    }));
    const consent = new URLSearchParams(cookies.get('OptanonConsent') || '');
    let tc;
    let gpp;
    w.__tcfapi('getTCData', 2, data => { tc = data; });
    w.__gpp('ping', data => { gpp = data; });
    const decoded = TCString.decode(tc.tcString);
    const usnat = gpp.parsedSections.usnat;
    const live = id => {
        const el = doc.getElementById(id);
        if ( el === null ) { return 'removed'; }
        if ( el.tagName === 'SCRIPT' ) {
            return el.getAttribute('type') === 'text/javascript' ? 'freed' : 'parked';
        }
        return el.hasAttribute('src') ? 'freed' : 'parked';
    };
    const count = vector => {
        let n = 0;
        vector.forEach(value => { if ( value ) { n += 1; } });
        return n;
    };

    // Per category: what the cookie says, whether the page is told, whether a
    // tag gated on it is freed, and whether an InsertScript naming it goes in.
    const CATEGORIES = [
        [ 'C0001', 'c1' ], [ 'C0002', 'c2' ], [ 'C0003', 'c3' ],
        [ 'C0004', 'c4' ], [ 'C0005', 'c5' ], [ 'V2STACK42', 'stack' ],
    ];
    const categories = {};
    for ( const [ id, tagId ] of CATEGORIES ) {
        const stored = (consent.get('groups') || '').split(',')
            .find(pair => pair.split(':')[0] === id);
        const reported = String(w.OptanonActiveGroups).includes(id);
        const before = doc.querySelectorAll('body > script').length;
        w.OneTrust.InsertScript(
            'https://i.example/' + id + '.js', 'body', undefined, undefined, id
        );
        const inserted = doc.querySelectorAll('body > script').length > before;
        categories[id] = [
            stored === undefined ? '-' : stored.split(':')[1],
            reported ? 'told' : 'hidden',
            live(tagId),
            inserted ? 'inserted' : 'refused',
        ].join(' · ');
    }

    return {
        categories,
        bytes: code.length,
        console: logs[0],
        stored: {
            'cookie `groups`': '`' + (consent.get('groups') || '') + '`',
            'cookie `intType`': consent.get('intType') +
                (consent.get('intType') === '1'
                    ? ' (Banner - Allow All)'
                    : ' (Banner - Reject All)'),
            '`OptanonAlertBoxClosed`': cookies.has('OptanonAlertBoxClosed')
                ? 'written' : 'absent',
            '`OTAdditionalConsentString`':
                '`' + cookies.get('OTAdditionalConsentString') + '`',
            'localStorage `cookieChoiceMade`':
                '`' + w.localStorage.getItem('cookieChoiceMade') + '`',
        },
        sent: {
            'TCF purpose consents': count(decoded.purposeConsents) + ' of 11',
            'TCF purpose legitimate interests':
                count(decoded.purposeLegitimateInterests) + ' of 11',
            'TCF special feature opt-ins':
                count(decoded.specialFeatureOptins) + ' of 2',
            'TCF vendor consents': String(decoded.vendorConsents.size),
            'TCF vendor legitimate interests':
                String(decoded.vendorLegitimateInterests.size),
            'GPP sale / sharing / targeted': usnat.SaleOptOut === 1
                ? 'opted out' : 'not opted out',
        },
        read: {
            '`OnetrustActiveGroups`': '`' + w.OnetrustActiveGroups + '`',
            '`OptanonActiveGroups`': '`' + w.OptanonActiveGroups + '`',
            '`GetDomainData()` C0004': w.OneTrust.GetDomainData().Groups
                .find(group => group.CustomGroupId === 'C0004').Status,
            '`IsAlertBoxClosed()`': String(w.OneTrust.IsAlertBoxClosed()),
        },
        page: {
            'tag gated on C0001': live('c1'),
            'tag gated on C0002': live('c2'),
            'embed gated on C0003': live('c3'),
            'tag gated on C0004': live('c4'),
            'tag the site parked itself (C0002)': live('own'),
            'banner markup': live('onetrust-banner-sdk'),
            '`OneTrustGroupsUpdated` fired': String(groupsUpdated),
            '`consent.onetrust` fired': String(consentChanged),
        },
    };
};

const results = {};
for ( const mode of MODES ) { results[mode] = await observe(mode); }

const table = section => {
    const keys = Object.keys(results[MODES[0]][section]);
    const out = [
        '| | ' + MODES.map(m => '`' + m + '`').join(' | ') + ' |',
        '| --- | --- | --- | --- |',
    ];
    for ( const key of keys ) {
        const cells = MODES.map(m => results[m][section][key]);
        const same = cells.every(cell => cell === cells[0]);
        out.push('| ' + (same ? key : '**' + key + '**') + ' | ' +
            cells.join(' | ') + ' |');
    }
    return out.join('\n');
};

/******************************************************************************/

// Every resource, measured the same way: boot it on a page its own consent
// manager would recognise, then record what it installed, wrote and signalled.
// Nothing here is described from memory - a cell is wrong only if the code is.

const FIXTURES = [
    {
        resource: 'onetrust-reject.js',
        cmp: 'OneTrust',
        page: '<html lang="en"><head>' +
            '<script id="nec" type="text/plain" class="optanon-category-C0001">a</' + 'script>' +
            '<script id="ads" type="text/plain" class="optanon-category-C0004" src="https://t.example/t.js"></' + 'script>' +
            '</head><body><p>x</p></body></html>',
    },
    { resource: 'onetrust-accept.js', cmp: 'OneTrust', sameAs: 'onetrust-reject.js' },
    { resource: 'onetrust-reject-unblock.js', cmp: 'OneTrust', sameAs: 'onetrust-reject.js' },
    {
        resource: 'cookieinformation-reject.js',
        cmp: 'Cookie Information',
        page: '<html lang="da"><head>' +
            '<script id="nec" data-category-consent="cookie_cat_necessary" data-consent-src="https://n.example/n.js"></' + 'script>' +
            '<script id="stat" data-category-consent="cookie_cat_statistic" data-consent-src="https://s.example/s.js"></' + 'script>' +
            '</head><body><p>x</p></body></html>',
    },
    {
        resource: 'inmobi-reject.js',
        cmp: 'InMobi Choice',
        page: '<html lang="it"><body><p>x</p></body></html>',
        drive: w => {
            w.eval('window.__tcfapi = (function(){var q=[];return function(){' +
                'var a=arguments; if(!a.length){return q;} q.push(a);};})();');
            w.eval('window.__tcfapi("init", 2, function(){}, { "coreConfig": ' +
                '{ "publisherCountryCode": "IT", "lang_": "it" } });');
        },
    },
    {
        resource: 'osano-reject.js',
        cmp: 'Osano',
        page: '<html lang="en"><body><p>x</p></body></html>',
    },
    {
        resource: 'civic-reject.js',
        cmp: 'Civic Cookie Control',
        page: '<html lang="en"><head>' +
            '<script id="stat" data-cc-category="analytics" data-src="https://s.example/s.js"></' + 'script>' +
            '</head><body>' +
            '<iframe id="content" data-cc-category="embedded" data-src="https://player.example/v"></iframe>' +
            '<p>x</p></body></html>',
        after: w => {
            w.eval('CookieControl.load({ optionalCookies: [' +
                ' { name: "analytics", label: "Analytics" },' +
                ' { name: "embedded", label: "Embedded content" } ] });');
        },
    },
    { resource: 'civic-reject-unblock.js', cmp: 'Civic Cookie Control', sameAs: 'civic-reject.js' },
    {
        resource: 'cookiebot-reject.js',
        cmp: 'Cookiebot',
        page: '<html lang="en"><head>' +
            '<script id="Cookiebot" data-cbid="uuid-1"></' + 'script>' +
            '<script id="nec" type="text/plain" data-cookieconsent="necessary" src="https://n.example/n.js"></' + 'script>' +
            '<script id="stat" type="text/plain" data-cookieconsent="statistics" src="https://s.example/s.js"></' + 'script>' +
            '</head><body><p>x</p></body></html>',
    },
    {
        resource: 'securiti-reject.js',
        cmp: 'Securiti',
        page: '<html lang="en"><head>' +
            '<script id="s" data-tenant-uuid="t-1" data-domain-uuid="d-1"></' + 'script>' +
            '</head><body><p>x</p></body></html>',
    },
    {
        resource: 'transcend-reject.js',
        cmp: 'Transcend',
        page: '<html lang="en"><body><p>x</p></body></html>',
        // Their engine, which the resource records the refusal through. Its
        // requireAuth is off, as a tenant's is when its own manager records a
        // choice nobody clicked.
        drive: w => {
            w.eval('window.airgap = { loadOptions: { requireAuth: "off" },' +
                ' readyQueue: [], ready: function(c) { c(window.airgap); },' +
                ' getConsent: function() { return { purposes: {' +
                ' Advertising: "Auto", Analytics: true, Functional: true,' +
                ' SaleOfInfo: false } }; },' +
                ' setConsent: function() { return true; } };');
        },
    },
    {
        resource: 'ketch-reject.js',
        cmp: 'Ketch',
        page: '<html lang="en"><head>' +
            '<script src="https://global.ketchcdn.com/web/v3/config/org/prop/boot.js"></' + 'script>' +
            '</head><body><p>x</p></body></html>',
        // Their boot leaves this on the page before the SDK arrives, and a
        // returning visitor's record is what carries the purpose codes.
        drive: w => {
            w.eval('window.semaphore = window.semaphore || [];' +
                'window.ketch = function() { window.semaphore.push(arguments); };' +
                'window.semaphore.unshift([ "init", { organization: { code: "x" } } ]);');
            w.localStorage.setItem('_ketch_consent_v1_',
                w.btoa(JSON.stringify({
                    analytics: { status: 'granted' },
                    behavioral_advertising: { status: 'granted' },
                })));
        },
    },
    { resource: 'ketch-reject-unblock.js', cmp: 'Ketch', sameAs: 'ketch-reject.js' },
    {
        resource: 'termly-reject.js',
        cmp: 'Termly',
        page: '<html lang="en"><head>' +
            '<script src="https://app.termly.io/resource-blocker/64bc9ee4-ef55-4cbe-b0ae-78a06a508235?autoBlock=on"></' + 'script>' +
            '</head><body>' +
            '<script id="nec" type="text/plain" data-categories="essential" data-src="https://n.example/n.js"></' + 'script>' +
            '<script id="stat" type="text/plain" data-categories="analytics" data-src="https://s.example/s.js"></' + 'script>' +
            '<p>x</p></body></html>',
    },
    {
        resource: 'pubtech-reject.js',
        cmp: 'PubTech CMP',
        page: '<html lang="it"><head>' +
            '<script type="module" src="https://cmp.pubtech.ai/312/pubtech-cmp-v2-esm.js"></' + 'script>' +
            '</head><body><p>x</p></body></html>',
    },
    {
        resource: 'usercentrics-reject.js',
        cmp: 'Usercentrics',
        page: '<html lang="de"><head>' +
            '<script id="usercentrics-cmp" data-settings-id="sROYKApBP" data-language="de" src="https://web.eu1.cmp.usercentrics.eu/ui/loader.js"></' + 'script>' +
            '<script id="stat" type="text/plain" data-usercentrics="Google Analytics" src="https://s.example/s.js"></' + 'script>' +
            '</head><body><p>x</p></body></html>',
    },
];

const bootResource = async (fixture, source, gpc) => {
    const code = await fs.readFile(
        path.join(root, 'dist', fixture.resource), 'utf8'
    );
    const dom = new JSDOM(source.page, {
        runScripts: 'outside-only',
        url: 'https://www.example.com/',
    });
    const w = dom.window;
    const doc = w.document;
    const logs = [];
    w.console.info = (...args) => { logs.push(args.join(' ')); };
    w.console.warn = ( ) => {};
    if ( gpc ) {
        Object.defineProperty(w.navigator, 'globalPrivacyControl', {
            value: true, configurable: true,
        });
    }
    // Both runs have to differ only in the signal, so the two things that
    // would differ anyway are pinned: the clock, because these records carry a
    // timestamp, and the randomness, because some of them mint a visitor id.
    w.eval('(function() {' +
        'var fixed = 1790000000000;' +
        'var Real = window.Date;' +
        'function Fixed() {' +
        ' if ( arguments.length === 0 ) { return new Real(fixed); }' +
        ' return new (Function.prototype.bind.apply(' +
        '  Real, [ null ].concat(Array.prototype.slice.call(arguments))))();' +
        '}' +
        'Fixed.now = function() { return fixed; };' +
        'Fixed.parse = Real.parse; Fixed.UTC = Real.UTC;' +
        'Fixed.prototype = Real.prototype;' +
        'window.Date = Fixed;' +
        'var n = 0;' +
        'Math.random = function() { n += 1; return (n % 97) / 97; };' +
        'try { window.crypto.randomUUID = function() {' +
        ' n += 1; return "00000000-0000-4000-8000-" + String(n).padStart(12, "0");' +
        '}; } catch (ex) {}' +
        '})();');
    // What a page with Google's tag has. Some of these call gtag and some push
    // to the layer directly; with this here the column measures the same thing
    // for all of them.
    w.eval('window.dataLayer = window.dataLayer || [];' +
        'window.gtag = function() { window.dataLayer.push(arguments); };');
    if ( typeof source.drive === 'function' ) { source.drive(w); }
    // How each tag was parked, before anything ran: these consent managers
    // park in two different ways, and freed means something different for each.
    const keysBefore = new Set();
    for ( let i = 0; i < w.localStorage.length; i += 1 ) {
        keysBefore.add(w.localStorage.key(i));
    }
    const TAG_IDS = [ 'nec', 'stat', 'ads', 'content' ];
    const parkedAs = {};
    for ( const id of TAG_IDS ) {
        const el = doc.getElementById(id);
        if ( el === null ) { continue; }
        const type = el.getAttribute('type');
        parkedAs[id] = {
            byType: type !== null && type.toLowerCase() === 'text/plain',
            url: el.getAttribute('src') ||
                el.getAttribute('data-src') ||
                el.getAttribute('data-consent-src') ||
                el.getAttribute('data-cookieblock-src') || '',
        };
    }
    const before = new Set(Object.keys(w));
    w.eval(code);
    if ( typeof source.after === 'function' ) { source.after(w); }
    await new Promise(resolve => { setTimeout(resolve, 60); });

    const installed = Object.keys(w).filter(name =>
        before.has(name) === false && /^\d+$/.test(name) === false
    );
    const cookies = String(doc.cookie).split(/;\s*/)
        .map(pair => pair.slice(0, pair.indexOf('=')))
        .filter(name => name !== '');
    const layer = Array.isArray(w.dataLayer)
        ? Array.from(w.dataLayer).map(entry =>
            Array.isArray(entry) || typeof entry.length === 'number'
                ? Array.prototype.slice.call(entry)
                : entry)
        : [];
    const consentMode = layer.find(entry =>
        Array.isArray(entry) && entry[0] === 'consent'
    );
    const iab = [];
    let tcString = '';
    if ( typeof w.__tcfapi === 'function' ) {
        iab.push('`__tcfapi`');
        w.__tcfapi('getTCData', 2, data => {
            if ( data && data.tcString ) { tcString = data.tcString; }
        });
    }
    if ( typeof w.__gpp === 'function' ) { iab.push('`__gpp`'); }
    if ( typeof w.__uspapi === 'function' ) { iab.push('`__uspapi`'); }
    // Freed means the tag's real url is now being fetched, and each of these
    // goes about that differently: some put src back on the element, some
    // insert a live copy beside it, and OneTrust revives an inline one in
    // place by changing its type. So how it was parked decides what to look at.
    const state = id => {
        const el = doc.getElementById(id);
        if ( el === null ) { return 'gone'; }
        const parked = parkedAs[id];
        if ( parked === undefined ) { return 'gone'; }
        const copy = parked.url !== '' && Array.from(
            doc.querySelectorAll('script[src], iframe[src], img[src]')
        ).some(node => node !== el && node.getAttribute('src') === parked.url);
        if ( copy ) { return 'freed'; }
        if ( parked.byType ) {
            const type = el.getAttribute('type');
            return type !== null && type.toLowerCase() === 'text/plain'
                ? 'parked'
                : 'freed';
        }
        // Parked by holding the url in an attribute of their own.
        return el.getAttribute('src') ? 'freed' : 'parked';
    };
    const freed = TAG_IDS
        .filter(id => doc.getElementById(id) !== null)
        .map(id => id + ': ' + state(id));
    const stored = [];
    const values = {};
    for ( let i = 0; i < w.localStorage.length; i += 1 ) {
        const key = w.localStorage.key(i);
        if ( keysBefore.has(key) === false ) { stored.push(key); }
        values[key] = w.localStorage.getItem(key);
    }
    stored.sort();
    return {
        bytes: code.length,
        installed,
        cookies,
        stored,
        // Everything the visitor is left carrying, values and all, which is
        // what the GPC column compares.
        record: JSON.stringify([ doc.cookie, values ]),
        consentMode: consentMode !== undefined
            ? consentMode[1] + ' ' + Object.entries(consentMode[2] || {})
                .filter(pair => pair[1] === 'granted')
                .map(pair => pair[0]).join(', ')
            : '',
        iab,
        tcString,
        tags: freed,
        console: logs[0] || '',
    };
};

const crossRows = [];
for ( const fixture of FIXTURES ) {
    const source = fixture.sameAs
        ? FIXTURES.find(entry => entry.resource === fixture.sameAs)
        : fixture;
    const plain = await bootResource(fixture, source, false);
    const withGpc = await bootResource(fixture, source, true);
    // What it stored and what it sent - not what it said. A resource whose
    // console line mentions the signal has not thereby changed its answer.
    const same = JSON.stringify([ plain.record, plain.tcString ]) ===
        JSON.stringify([ withGpc.record, withGpc.tcString ]);
    crossRows.push({ fixture, plain, gpcChanges: same === false });
}

const doc = `# Resources compared

Measured, not described: this file is written by \`tools/comparison.mjs\`, which
boots each built resource on a page its own consent manager would recognise and
records what it did. \`npm run build\` regenerates it and CI fails if the
committed copy has drifted.

Two parts: the three OneTrust modes row by row, because they are the same CMP
answered three ways and worth comparing closely, then every resource in the
repo side by side.

# The three OneTrust modes

From the OneTrust resources at **${manifest.resourceVersions.onetrust}**.
A row in bold is one where the three differ.

## What is stored

Written to the visitor's own browser, and read back by the site on the next page.

${table('stored')}

## What is sent

The IAB strings, which is what a vendor is handed and may act on.

${table('sent')}

## What the page can read

Variables and API answers, local to the page. Nothing here leaves the browser.

${table('read')}

## What happens on the page

${table('page')}

## By category

Each cell reads: the value in the cookie \`groups\` field · whether the page is
told the category is on · what happens to a tag gated on it · whether an
\`InsertScript()\` call naming it goes in.

${table('categories')}

\`C0001\` is strictly necessary and is never refused. \`V2STACK42\` is the IAB
stack group, which every IAB-enabled tenant sampled carries. A tag naming more
than one category needs all of them, so one marked \`C0001,C0004\` stays parked
wherever \`C0004\` does.

## Choosing

\`reject\` refuses, and nothing gated on a category other than \`C0001\` runs.

\`reject-unblock\` is **reject's record with accept's page surface**: every row
under *stored* and *sent* matches \`reject\` exactly, every row under *read* and
*page* matches \`accept\`. It is for a site that withholds content until you
agree - it satisfies the site's own check and frees its parked tags, while no
vendor or server is ever told you consented. The cost is precisely that those
tags execute; uBlock Origin still filters what they request.

\`accept\` grants: the cookie, every TCF vendor and the GPP string all say yes,
and a vendor receiving that string is entitled to act on it.

Keep \`reject\` global and escalate per site. The console line names which one ran:

\`\`\`
${MODES.map(m => results[m].console).join('\n')}
\`\`\`

Sizes: ${MODES.map(m => '`' + m + '` ' +
    (results[m].bytes / 1024).toFixed(1) + ' KB').join(', ')}.

# Every resource, side by side

${new Set(crossRows.map(row => row.fixture.cmp)).size} consent managers, ${crossRows.length} resources. Each one was booted on a page its own
consent manager would recognise, and the rows below are what it did there - the
globals it defined, the cookies it wrote, the signals it sent. A resource that
shares a page with another (the OneTrust three, the Civic two) was measured on
the same fixture as its sibling.

| Resource | Size | What it defines |
| --- | --- | --- |
${crossRows.map(row =>
    '| `' + row.fixture.resource.replace('.js', '') + '` | ' +
    (row.plain.bytes / 1024).toFixed(1) + ' KB | ' +
    (row.plain.installed.length !== 0
        ? row.plain.installed.slice(0, 6).map(n => '`' + n + '`').join(', ') +
            (row.plain.installed.length > 6
                ? ' +' + (row.plain.installed.length - 6) + ' more'
                : '')
        : '-') +
    ' |'
).join('\n')}

## What each one stores and sends

| Resource | Cookies written | In localStorage | Google consent mode | IAB APIs | GPC changes it |
| --- | --- | --- | --- | --- | --- |
${crossRows.map(row =>
    '| `' + row.fixture.resource.replace('.js', '') + '` | ' +
    (row.plain.cookies.length !== 0
        ? row.plain.cookies.map(n => '`' + n + '`').join(', ')
        : '-') + ' | ' +
    (row.plain.stored.length !== 0
        ? row.plain.stored.map(n => '`' + n + '`').join(', ')
        : '-') + ' | ' +
    (row.plain.consentMode !== ''
        ? row.plain.consentMode.replace(/^(default|update) ?/, '$1: granted ') +
            (row.plain.consentMode.trim().split(' ').length === 1
                ? 'nothing' : '')
        : '-') + ' | ' +
    (row.plain.iab.length !== 0 ? row.plain.iab.join(', ') : '-') + ' | ' +
    (row.gpcChanges ? 'yes' : 'no') +
    ' |'
).join('\n')}

Every one of them refuses; what differs is what each consent manager gives a
page to read, and therefore what a refusal has to answer.

The last column is measured by booting each one twice, with the clock and the
randomness pinned so the two runs differ in nothing but the signal, and then
comparing what the visitor is left carrying. The ${crossRows.filter(row => row.gpcChanges).length} it changes carry a
field for it to change - OneTrust's own \`browserGpcFlag\`, InMobi's
legitimate interest, Osano's opt-out. The ${crossRows.filter(row => row.gpcChanges === false).length} it does not have nowhere to
put it: every category is refused with or without the signal either way.

## What each one does to a parked tag

A tag the site parked behind a category, and one it parked behind nothing but
its necessary category, on the fixtures that have them.

| Resource | Parked tags after it ran |
| --- | --- |
${crossRows.filter(row => row.plain.tags.length !== 0).map(row =>
    '| `' + row.fixture.resource.replace('.js', '') + '` | ' +
    row.plain.tags.map(t => '`' + t + '`').join(', ') + ' |'
).join('\n')}

Where a consent manager parks tags in the markup, a refusal leaves them parked -
except the ones gated on nothing but a necessary category, which its own script
would run too. Osano and Securiti do not park tags in the markup at all: they
patch the DOM at runtime, so with them replaced there is nothing parked and
uBlock Origin does the blocking.

## What each one says

\`\`\`
${crossRows.map(row => row.plain.console).filter(line => line !== '').join('\n')}
\`\`\`
`;

await fs.writeFile(path.join(root, 'COMPARISON.md'), doc, 'utf8');
console.log(`wrote COMPARISON.md from ${MODES.length} resources at ${manifest.version}`);
