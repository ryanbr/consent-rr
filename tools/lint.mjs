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

if ( problems.length !== 0 ) {
    for ( const problem of problems ) { console.error('  ' + problem); }
    console.error('\n  ' + problems.length + ' problem' +
        (problems.length === 1 ? '' : 's') + ' in ' + files.length + ' files');
    process.exit(1);
}
console.log('  ' + files.length + ' files, ' + entries.length + ' resources, ' +
    libs.length + ' libs, nothing to say');
