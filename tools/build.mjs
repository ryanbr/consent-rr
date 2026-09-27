/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    Bundles each src/*.js into a standalone dist/<name>.js in the resources
    file format that uBlock Origin's hidden setting "userResourcesLocation"
    fetches. One file per resource, so either can be pointed at on its own;
    the setting takes several whitespace-separated URLs.

    The "/// <name>" header uBO needs is also a JavaScript comment, so each
    output file is at once a one-entry resources file and a readable script.

    That format is line-based and unforgiving (see uBO's
    RedirectEngine.resourcesFromString):
      - a blank line ENDS the current resource, so the code cannot contain one
      - a line starting with "// " or "#" is DROPPED, comments included
      - a line starting with "/// " is a directive, never code
    So every resource is stripped of blank lines and whole-line comments here,
    and the result is checked before it ships.

    User-supplied resources have no web-accessible URL, so uBO serves them as
    data:text/javascript;base64,... built with btoa() - which throws on any
    character above U+00FF. Non-ASCII is rejected for that reason.

*/

import { strict as assert } from 'node:assert';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vm from 'node:vm';

const root = path.join(import.meta.dirname, '..');
const manifest = JSON.parse(
    await fs.readFile(path.join(root, 'package.json'), 'utf8')
);
const version = manifest.version;

// Install URLs in the docs are pinned to a release, so they have to name the
// version being built - otherwise a release ships telling people to install the
// one before it.
for ( const name of [ 'README.md', 'AGENTS.md', 'CLAUDE.md' ] ) {
    const text = await fs.readFile(path.join(root, name), 'utf8');
    for ( const match of text.matchAll(/consent-rr\/v(\d+\.\d+\.\d+)\//g) ) {
        assert.equal(
            match[1], version,
            `${name} pins v${match[1]} but this is ${version}`
        );
    }
}
const srcDir = path.join(root, 'src');
const outDir = path.join(root, 'dist');

const reInclude = /^\s*\/\/\s*@include\s+(\S+)\s*$/;

/******************************************************************************/

// Drops blank lines, whole-line "//" comments and whole-line block comments.
// Line-based, so a source file may not carry a template literal: a stripped
// line inside one would change the string. Guarded against below.

const compact = text => {
    const out = [];
    let inBlock = false;
    for ( const line of text.split('\n') ) {
        const trimmed = line.trim();
        if ( inBlock ) {
            if ( trimmed.endsWith('*/') ) { inBlock = false; }
            continue;
        }
        if ( trimmed === '' ) { continue; }
        if ( trimmed.startsWith('//') ) { continue; }
        if ( trimmed.startsWith('/*') ) {
            if ( trimmed.endsWith('*/') === false ) { inBlock = true; }
            continue;
        }
        out.push(line);
    }
    return out;
};

const resolveIncludes = async (file, seen = new Set()) => {
    assert.ok(seen.has(file) === false, `include cycle at ${file}`);
    seen.add(file);
    const text = await fs.readFile(file, 'utf8');
    assert.ok(
        text.includes('`') === false,
        `${path.relative(root, file)}: template literals are not supported, ` +
        `the bundler strips lines`
    );
    const lines = [];
    for ( const line of text.split('\n') ) {
        const match = reInclude.exec(line);
        if ( match === null ) {
            lines.push(line);
            continue;
        }
        const included = path.resolve(path.dirname(file), match[1]);
        lines.push(...await resolveIncludes(included, seen));
    }
    return lines;
};

/******************************************************************************/

const build = async ( ) => {
    const names = (await fs.readdir(srcDir))
        .filter(name => name.endsWith('.js'))
        .sort();
    assert.ok(names.length !== 0, 'no resources found in src/');
    await fs.mkdir(outDir, { recursive: true });

    for ( const name of names ) {
        const lines = compact(
            (await resolveIncludes(path.join(srcDir, name))).join('\n')
        );
        const code = lines.join('\n').replaceAll('@@VERSION@@', version);
        assert.ok(
            code.includes('@@VERSION@@') === false,
            `${name}: version placeholder survived substitution`
        );

        // Everything uBO's parser would choke on, before it ships.
        for ( const line of lines ) {
            assert.ok(
                line.startsWith('/// ') === false,
                `${name}: a code line may not start with "/// "`
            );
            assert.ok(
                line.startsWith('#') === false,
                `${name}: a code line may not start with "#"`
            );
        }
        const nonAscii = /[^\x20-\x7e\t\n]/.exec(code);
        assert.ok(
            nonAscii === null,
            `${name}: non-ASCII character ${JSON.stringify(nonAscii && nonAscii[0])} ` +
            `would break uBO's btoa() encoding`
        );
        new vm.Script(code, { filename: name });

        // Both as a script and as a resources file with one entry in it.
        const header = [
            `/// ${name}`,
            `// consent-rr ${version} - cookie-consent resources for uBlock Origin`,
            '// https://github.com/ryanbr/consent-rr',
            '// Generated by tools/build.mjs - edit src/, not this file.',
            '// The "///" line above is the resource header uBO reads, and a',
            '// comment to JavaScript. uBO drops these "//" lines when it parses.',
        ].join('\n');
        const file = `${header}\n${code}\n`;
        new vm.Script(file, { filename: name });

        await fs.writeFile(path.join(outDir, name), file, 'utf8');
        console.log(
            `  dist/${name}: ${version}, ${lines.length} lines, ${file.length} bytes`
        );
    }
};

await build();
