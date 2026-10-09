/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    Put this repo's resources into a uBlock Origin checkout, so $redirect=
    works on Chromium.

    A resource uBO is handed at runtime through userResourcesLocation has no
    warURL, so toURL() can only return a data: URI - and Chromium refuses to
    redirect a request to data:, which is ERR_UNSAFE_REDIRECT and no script
    at all. A resource uBO ships gets served from the extension instead:

        const entry = RedirectEntry.fromDetails({
            mime: mimeFromName(name),
            data,
            warURL: `/web_accessible_resources/${name}`,
            ...

    and web_accessible_resources is declared in the manifest, which no api
    can add to at runtime. So the way to have both is to put the file in the
    extension, which is two edits and a build:

        node tools/ubo-war.mjs <path to a uBlock Origin checkout>
        cd <that checkout> && ./tools/make-chromium.sh
        # load dist/build/uBlock0.chromium unpacked, developer mode on

    Then drop these resources from userResourcesLocation: they are in the
    extension now, and a name that is in both would be served twice.

    The cost is an unpacked build that does not auto-update. That is fine for
    testing a filter and no use for shipping to anyone, which is why a list
    still ships the scriptlet form.

*/

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const MARKER = '// consent-rr resources, added by tools/ubo-war.mjs';
const END = '// end consent-rr resources';

// What makes a directory a uBlock Origin checkout rather than something else.
const LANDMARKS = [
    'src/js/redirect-resources.js',
    'src/web_accessible_resources',
    'platform/chromium/manifest.json',
];

export const patch = async (options = {}) => {
    const uboRoot = options.uboRoot;
    const distRoot = options.distRoot || 'dist';
    const check = options.check === true;
    const log = typeof options.log === 'function' ? options.log : ( ) => {};

    if ( typeof uboRoot !== 'string' || uboRoot === '' ) {
        throw new Error('no uBlock Origin checkout given');
    }
    for ( const landmark of LANDMARKS ) {
        try {
            await fs.stat(path.join(uboRoot, landmark));
        } catch ( ex ) {
            throw new Error(
                uboRoot + ' does not look like a uBlock Origin checkout: ' +
                landmark + ' is not there'
            );
        }
    }

    let names = options.names;
    if ( Array.isArray(names) === false || names.length === 0 ) {
        names = (await fs.readdir(distRoot))
            .filter(name => name.endsWith('.js'))
            .sort();
    }
    if ( names.length === 0 ) {
        throw new Error('no resources in ' + distRoot + ' - run npm run build');
    }

    // Their own list, which storeWAR() walks. One entry each, no alias and no
    // data property: data is for a resource uBO wants in memory as well, and
    // these only ever answer a redirect or a scriptlet by name.
    const listPath = path.join(uboRoot, 'src/js/redirect-resources.js');
    const before = await fs.readFile(listPath, 'utf8');
    const anchor = 'export default new Map([';
    if ( before.includes(anchor) === false ) {
        throw new Error(listPath + ' has no "' + anchor + '" to add to');
    }
    const block = [
        '    ' + MARKER,
        ...names.map(name => "    [ '" + name + "', {} ],"),
        '    ' + END,
    ].join('\n');
    // Idempotent: a block from an earlier run is replaced rather than added
    // to, so running this after a rebuild of dist/ is the whole job.
    const held = new RegExp(
        '[ \\t]*' + MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
        '[\\s\\S]*?' + END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\n',
        ''
    );
    const stripped = before.replace(held, '');
    const after = stripped.replace(anchor, anchor + '\n' + block);
    const already = before === after;

    const copied = [];
    for ( const name of names ) {
        const from = path.join(distRoot, name);
        const to = path.join(uboRoot, 'src/web_accessible_resources', name);
        const data = await fs.readFile(from, 'utf8');
        let same = false;
        try {
            same = await fs.readFile(to, 'utf8') === data;
        } catch ( ex ) {
        }
        if ( check === false && same === false ) {
            await fs.writeFile(to, data);
        }
        copied.push({ name, same });
    }
    if ( check === false && already === false ) {
        await fs.writeFile(listPath, after);
    }

    const fresh = copied.filter(entry => entry.same === false).length;
    log((check ? 'would copy' : 'copied') + ' ' + fresh + ' of ' +
        names.length + ' resources into src/web_accessible_resources/');
    log((already
        ? 'src/js/redirect-resources.js already lists them'
        : (check ? 'would list' : 'listed') + ' ' + names.length +
            ' in src/js/redirect-resources.js'));
    if ( check === false ) {
        log('');
        log('next: cd ' + uboRoot + ' && ./tools/make-chromium.sh');
        log('      then load dist/build/uBlock0.chromium unpacked');
        log('      and drop these names from userResourcesLocation');
    }
    return { names, copied: fresh, listed: already === false, listPath };
};

const main = async ( ) => {
    const args = process.argv.slice(2);
    const check = args.includes('--check');
    const rest = args.filter(arg => arg.startsWith('--') === false);
    if ( rest.length === 0 ) {
        process.stdout.write(
            'usage: node tools/ubo-war.mjs <uBlock Origin checkout> ' +
            '[resource.js ...] [--check]\n'
        );
        process.exit(1);
    }
    await patch({
        uboRoot: rest[0],
        names: rest.slice(1),
        check,
        log: line => { process.stdout.write(line + '\n'); },
    });
};

if ( process.argv[1] && process.argv[1].endsWith('ubo-war.mjs') ) {
    main().catch(reason => {
        process.stderr.write(String(reason.message || reason) + '\n');
        process.exit(1);
    });
}
