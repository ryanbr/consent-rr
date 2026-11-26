/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    Checks every file under src/ on its own, which the build cannot: the build
    concatenates an entry with its includes and compiles the result, so a
    syntax error anywhere in a family is reported against the built resource
    rather than the file it is in.

    It also finds what the build has no reason to look for: a lib under a
    family's lib/ that no entry includes. An orphan is either a resource
    somebody forgot to wire up or a file left behind after one was removed,
    and it ships in neither case.

    extra/ is checked too, by the rules that apply to it rather than the ones
    that apply to src/. Those files are not built: they ship as they are, so
    what matters is what uBO's own parser does to them. A blank line ends a
    resource there and takes the rest of the file with it, and a user
    resource is base64'd with btoa(), which throws on anything outside
    ASCII. Neither is checked for src/, where the build normalises both.
    What is NOT checked there: a backtick, which only matters to the bundler
    these files do not go through, and line length, which is style. None of
    them carries a backtick today; optimizely.js carries the long lines and
    ships fine.

    NOTHING IS LISTED BY NAME IN HERE, which is the point. The script this
    replaced named three files by hand, two of which had moved; it had been
    failing for several families' worth of commits because nothing ran it.
    Discover the tree, and CI runs it now.

*/

import { strict as assert } from 'node:assert';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vm from 'node:vm';

const root = path.join(import.meta.dirname, '..');
const srcDir = path.join(root, 'src');
const extraDir = path.join(root, 'extra');
const reInclude = /^\s*\/\/\s*@include\s+(\S+)\s*$/;

const named = file => path.relative(root, file);

const walk = async dir => {
    const out = [];
    for ( const dirent of await fs.readdir(dir, { withFileTypes: true }) ) {
        const full = path.join(dir, dirent.name);
        if ( dirent.isDirectory() ) {
            out.push(...await walk(full));
            continue;
        }
        if ( dirent.name.endsWith('.js') ) { out.push(full); }
    }
    return out.sort();
};

const problems = [];
const complain = (file, line, what) => {
    problems.push(named(file) + (line !== 0 ? ':' + line : '') + ': ' + what);
};

/******************************************************************************/

const files = await walk(srcDir);
assert.ok(files.length !== 0, 'no sources found under src/');

// An entry is a .js directly inside a family directory; anything under lib/ is
// included by one.
const entries = files.filter(file => path.basename(path.dirname(file)) !== 'lib');
const libs = files.filter(file => entries.includes(file) === false);
const included = new Set();

for ( const file of files ) {
    const text = await fs.readFile(file, 'utf8');
    const lines = text.split('\n');

    // The one that breaks a resource with no error anywhere: the bundler drops
    // the line, so a backtick takes the code around it with it.
    lines.forEach((line, at) => {
        if ( line.includes('`') ) {
            complain(file, at + 1,
                'a template literal - the bundler strips the line');
        }
    });

    // What a lib declares cannot be checked in isolation against its callers,
    // but a syntax error in one can, and this names the file it is in.
    try {
        new vm.Script(text, { filename: named(file) });
    } catch ( ex ) {
        complain(file, 0, ex.message);
    }

    for ( const line of lines ) {
        const match = reInclude.exec(line);
        if ( match === null ) { continue; }
        const target = path.resolve(path.dirname(file), match[1]);
        included.add(target);
        try {
            await fs.access(target);
        } catch ( ex ) {
            complain(file, 0, 'includes a file that is not there: ' + match[1]);
        }
    }
}

for ( const lib of libs ) {
    if ( included.has(lib) ) { continue; }
    complain(lib, 0, 'no entry includes this file');
}

/******************************************************************************/

// Hand-maintained resources, shipped as they are, so uBO's parser is the
// thing to satisfy.
const extras = await walk(extraDir);
assert.ok(extras.length !== 0, 'no resources found under extra/');

for ( const file of extras ) {
    const text = await fs.readFile(file, 'utf8');
    const lines = text.split('\n');

    try {
        new vm.Script(text, { filename: named(file) });
    } catch ( ex ) {
        complain(file, 0, ex.message);
    }

    // The one that takes the rest of the file with it, with no error
    // anywhere: uBO ends a resource at a blank line.
    lines.forEach((line, at) => {
        if ( at === lines.length - 1 ) { return; }
        if ( line.trim() !== '' ) { return; }
        complain(file, at + 1, 'a blank line - uBO ends the resource here');
    });

    // btoa() throws on anything outside ASCII, and uBO base64's a user
    // resource to hand it over.
    lines.forEach((line, at) => {
        const found = /[^\x20-\x7e\t]/.exec(line);
        if ( found === null ) { return; }
        complain(file, at + 1,
            'a byte outside ASCII (' +
            JSON.stringify(found[0]) + ') - btoa() throws on it');
    });

    // The header uBO reads to name the resource, which has to be the file.
    const want = '/// ' + path.basename(file);
    if ( lines[0] !== want ) {
        complain(file, 1, 'the first line is not ' + JSON.stringify(want));
    }
}

/******************************************************************************/

if ( problems.length !== 0 ) {
    for ( const problem of problems ) { console.error('  ' + problem); }
    console.error('\n  ' + problems.length + ' problem' +
        (problems.length === 1 ? '' : 's') + ' in ' + files.length + ' files');
    process.exit(1);
}
console.log('  ' + files.length + ' files, ' + entries.length + ' resources, ' +
    libs.length + ' libs, ' + extras.length + ' in extra/, nothing to say');
