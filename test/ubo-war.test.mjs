/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    tools/ubo-war.mjs, against a tree shaped like a uBlock Origin checkout.

    Its whole purpose is the one thing Chromium will not do: serve one of
    these resources from a $redirect= rule. A resource uBO is handed at
    runtime has no warURL and can only be a data: URI, which Chromium refuses;
    a resource in src/web_accessible_resources/ and listed in
    src/js/redirect-resources.js gets one from storeWAR() and works.

*/

import { strict as assert } from 'node:assert';
import { after, before, describe, it } from 'node:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { patch } from '../tools/ubo-war.mjs';

// Their own file, trimmed to the shape the tool edits.
const THEIR_LIST = `/* uBlock Origin */

export default new Map([
    [ '1x1.gif', {
        alias: '1x1-transparent.gif',
        data: 'blob',
    } ],
    [ 'noop.js', {
        alias: [ 'noopjs', 'abp-resource:blank-js' ],
        data: 'text',
    } ],
]);
`;

let root;
let ubo;
let dist;

const tree = async ( ) => {
    const made = await fs.mkdtemp(path.join(os.tmpdir(), 'consent-rr-ubo-'));
    const uboRoot = path.join(made, 'uBlock');
    await fs.mkdir(path.join(uboRoot, 'src/js'), { recursive: true });
    await fs.mkdir(path.join(uboRoot, 'src/web_accessible_resources'), {
        recursive: true,
    });
    await fs.mkdir(path.join(uboRoot, 'platform/chromium'), {
        recursive: true,
    });
    await fs.writeFile(
        path.join(uboRoot, 'src/js/redirect-resources.js'), THEIR_LIST);
    await fs.writeFile(
        path.join(uboRoot, 'platform/chromium/manifest.json'), '{}');
    const distRoot = path.join(made, 'dist');
    await fs.mkdir(distRoot, { recursive: true });
    await fs.writeFile(path.join(distRoot, 'alpha-reject.js'), 'ALPHA');
    await fs.writeFile(path.join(distRoot, 'beta-reject.js'), 'BETA');
    await fs.writeFile(path.join(distRoot, 'notes.txt'), 'not a resource');
    return { made, uboRoot, distRoot };
};

before(async ( ) => {
    const made = await tree();
    root = made.made;
    ubo = made.uboRoot;
    dist = made.distRoot;
});

after(async ( ) => {
    await fs.rm(root, { recursive: true, force: true });
});

const listOf = ( ) =>
    fs.readFile(path.join(ubo, 'src/js/redirect-resources.js'), 'utf8');

/******************************************************************************/

describe('tools/ubo-war.mjs', ( ) => {
    it('refuses anything that is not a uBlock Origin checkout', async ( ) => {
        await assert.rejects(
            patch({ uboRoot: root, distRoot: dist }),
            /does not look like a uBlock Origin checkout/
        );
    });

    it('refuses to run with no checkout at all', async ( ) => {
        await assert.rejects(patch({ distRoot: dist }), /no uBlock Origin/);
    });

    // --check says what it would do and touches nothing, because the thing
    // it edits is somebody else's source tree.
    it('changes nothing with --check', async ( ) => {
        const held = await listOf();
        const out = await patch({ uboRoot: ubo, distRoot: dist, check: true });
        assert.deepEqual(out.names, [ 'alpha-reject.js', 'beta-reject.js' ]);
        assert.equal(await listOf(), held);
        await assert.rejects(
            fs.stat(path.join(ubo, 'src/web_accessible_resources/alpha-reject.js'))
        );
    });

    it('copies the resources and lists them where storeWAR looks', async ( ) => {
        const out = await patch({ uboRoot: ubo, distRoot: dist });
        assert.equal(out.copied, 2);
        assert.equal(out.listed, true);
        assert.equal(
            await fs.readFile(
                path.join(ubo, 'src/web_accessible_resources/alpha-reject.js'),
                'utf8'
            ),
            'ALPHA'
        );
        const list = await listOf();
        assert.match(list, /\[ 'alpha-reject\.js', \{\} \],/);
        assert.match(list, /\[ 'beta-reject\.js', \{\} \],/);
        // Their own entries are left exactly as they were.
        assert.match(list, /\[ 'noop\.js', \{/);
        assert.match(list, /alias: \[ 'noopjs', 'abp-resource:blank-js' \],/);
        // And it is still their file: one Map, still closed.
        assert.equal((list.match(/export default new Map\(\[/g) || []).length, 1);
        assert.ok(list.trimEnd().endsWith(']);'));
    });

    it('takes only the built resources, not everything in the folder', async ( ) => {
        const list = await listOf();
        assert.equal(list.includes('notes.txt'), false);
    });

    // Run again after a rebuild and the block is replaced, not stacked up.
    it('is idempotent, and replaces its own block', async ( ) => {
        const once = await listOf();
        const out = await patch({ uboRoot: ubo, distRoot: dist });
        assert.equal(out.copied, 0, 'nothing to copy the second time');
        assert.equal(out.listed, false, 'and nothing to list');
        assert.equal(await listOf(), once);
        // A resource added to dist/ afterwards joins the same block.
        await fs.writeFile(path.join(dist, 'gamma-reject.js'), 'GAMMA');
        await patch({ uboRoot: ubo, distRoot: dist });
        const list = await listOf();
        assert.equal(
            (list.match(/consent-rr resources, added by/g) || []).length, 1
        );
        assert.match(list, /\[ 'gamma-reject\.js', \{\} \],/);
    });

    it('rewrites a resource whose bytes have changed', async ( ) => {
        await fs.writeFile(path.join(dist, 'alpha-reject.js'), 'ALPHA v2');
        const out = await patch({ uboRoot: ubo, distRoot: dist });
        assert.equal(out.copied, 1);
        assert.equal(
            await fs.readFile(
                path.join(ubo, 'src/web_accessible_resources/alpha-reject.js'),
                'utf8'
            ),
            'ALPHA v2'
        );
    });

    it('can be told which resources to take', async ( ) => {
        const made = await tree();
        try {
            await patch({
                uboRoot: made.uboRoot,
                distRoot: made.distRoot,
                names: [ 'beta-reject.js' ],
            });
            const list = await fs.readFile(
                path.join(made.uboRoot, 'src/js/redirect-resources.js'), 'utf8');
            assert.match(list, /\[ 'beta-reject\.js', \{\} \],/);
            assert.equal(list.includes('alpha-reject.js'), false);
        } finally {
            await fs.rm(made.made, { recursive: true, force: true });
        }
    });

    it('says what to do next', async ( ) => {
        const said = [];
        await patch({
            uboRoot: ubo, distRoot: dist,
            log: line => { said.push(line); },
        });
        const text = said.join('\n');
        assert.match(text, /make-chromium\.sh/);
        assert.match(text, /unpacked/);
        // The one that bites: a name in both places is served twice.
        assert.match(text, /userResourcesLocation/);
    });
});
