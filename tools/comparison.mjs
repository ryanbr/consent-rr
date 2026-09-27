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

const doc = `# The three resources compared

Measured, not described: this file is written by \`tools/comparison.mjs\`, which
runs each built resource against the same page and records what it did. \`npm run
build\` regenerates it and CI fails if the committed copy has drifted. Everything
below is from **${manifest.version}**.

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
`;

await fs.writeFile(path.join(root, 'COMPARISON.md'), doc, 'utf8');
console.log(`wrote COMPARISON.md from ${MODES.length} resources at ${manifest.version}`);
