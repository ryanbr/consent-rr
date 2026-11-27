/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    Mutation testing for the hand-maintained resources under extra/. Breaks the
    resource one substitution at a time and asks whether its test file notices.
    A test that passes against broken code is pointed at something other than
    the code it names, which has happened here repeatedly - see AGENTS.md.

    The mutations live beside this file, in tools/mutations/<name>.json, so a
    sweep is reproducible from a clone. Before this, the three lists existed
    only as scratch scripts on one machine: the result was quotable and not
    repeatable, which is the weaker half of a measurement.

    Each entry is a single substitution. "from" must occur EXACTLY ONCE in the
    resource, and a pattern that occurs twice is reported rather than applied -
    one of these matched `referrer: ''`, which is in both the modern and the
    Classic visitor, and was counted as a survivor for a while.

    "expected" names the mutations that cannot be killed, with the reason. They
    are kept rather than deleted so the reason is recorded where the next person
    will look, and the exit code ignores them. Every other survivor fails the
    run.

    Two things to know about reading the suite's answer:

      - A mutation that leaks a timer would leave node alive after the tests
        have finished, so --test-force-exit is passed and the suite's own
        tally is always printed. The reading of a partial output is kept as a
        safety net, because it is the thing that was wrong first: it counted
        TAP's `not ok` while the spec reporter writes its own mark, and
        reported four kills as gaps. A hang is not a survivor.

      - The resource is edited in place and restored afterwards, including on
        ctrl-c and on an exception. Nothing else should be writing to it while
        this runs, and a sweep interrupted any other way leaves the file
        mutated - git will say so.

    Usage:
      node tools/mutate.mjs                  every resource with a list
      node tools/mutate.mjs optimizely       one of them
      node tools/mutate.mjs optimizely poll  only mutations whose name matches

    Each list's suite is run unmutated first and the sweep is refused if it
    fails: a red suite kills every mutation by the failure already in it.

    MUTATE_TEST_TIMEOUT and MUTATE_RUN_TIMEOUT raise the two timeouts on a
    slow machine, in milliseconds.

*/

import { strict as assert } from 'node:assert';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
// Synchronous, because the resource has to be put back from an exit handler
// as well as from a finally.
import { writeFileSync } from 'node:fs';

const root = path.join(import.meta.dirname, '..');
const listDir = path.join(import.meta.dirname, 'mutations');

// node --test gives up on a test after this; the process is given longer,
// because a leaked interval keeps it alive after the suite has finished.
//
// Both are raised on a slow machine through the environment, and CI does.
// Cutting a run short that was going to fail reads as a survivor, which is
// the one way this tool can lie about the code rather than about itself.
const TEST_TIMEOUT = Number(process.env.MUTATE_TEST_TIMEOUT || 5000);
const RUN_TIMEOUT = Number(process.env.MUTATE_RUN_TIMEOUT || 45000);
assert.ok(TEST_TIMEOUT > 0 && RUN_TIMEOUT > TEST_TIMEOUT,
    'MUTATE_RUN_TIMEOUT must be larger than MUTATE_TEST_TIMEOUT');

/******************************************************************************/

const [ which, only ] = process.argv.slice(2);

const lists = (await fs.readdir(listDir))
    .filter(name => name.endsWith('.json'))
    .filter(name => which === undefined || name === which + '.json')
    .sort();

if ( lists.length === 0 ) {
    console.error('  no mutation list' + (which ? ' for ' + which : '') +
        ' under ' + path.relative(root, listDir));
    process.exit(1);
}

/******************************************************************************/

// The suite's answer, from a tally when there is one and from the reporter's
// own marks when the run never got far enough to print it.
const failuresIn = (stdout, hung) => {
    let fails;
    for ( const line of stdout.split('\n') ) {
        if ( line.startsWith('# fail ') || line.startsWith('ℹ fail ') ) {
            fails = Number(line.slice(line.lastIndexOf(' ') + 1));
        }
    }
    if ( fails !== undefined ) { return fails; }
    if ( hung === false ) { return 0; }
    return stdout.split('\n').filter(line =>
        line.startsWith('  ✖ ') || line.startsWith('not ok ')
    ).length;
};

const runSuite = test => new Promise(resolve => {
    const child = spawn(process.execPath, [
        // --test-force-exit is what keeps a sweep to its arithmetic. Several
        // mutations leak an interval, and without it node stays alive after
        // the suite has finished and the run is only ended by the timeout
        // below - eight of optimizely's 144 did that, which cost more wall
        // clock than the other 136 together.
        '--test', '--test-force-exit',
        '--test-timeout=' + TEST_TIMEOUT, test,
    ], {
        cwd: root,
        stdio: [ 'ignore', 'pipe', 'pipe' ],
        // A test that compares a generated file against its source fails for
        // every mutation, so it would report a whole sweep killed and mean
        // nothing by it. Such a test opts out on this.
        env: { ...process.env, MUTATE_SWEEP: '1' },
    });
    let stdout = '';
    let hung = false;
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', ( ) => { });
    const timer = setTimeout(( ) => {
        hung = true;
        child.kill('SIGKILL');
    }, RUN_TIMEOUT);
    child.on('close', ( ) => {
        clearTimeout(timer);
        resolve({ fails: failuresIn(stdout, hung), hung });
    });
});

/******************************************************************************/

let restore = null;
const putItBack = ( ) => {
    if ( restore === null ) { return; }
    const { file, text } = restore;
    restore = null;
    writeFileSync(file, text);
};
process.on('SIGINT', ( ) => { putItBack(); process.exit(130); });
process.on('SIGTERM', ( ) => { putItBack(); process.exit(143); });

/******************************************************************************/

const results = [];

for ( const name of lists ) {
    const list = JSON.parse(await fs.readFile(path.join(listDir, name), 'utf8'));
    assert.ok(Array.isArray(list.mutations) && list.mutations.length !== 0,
        name + ': no mutations');
    const file = path.join(root, list.resource);
    const pristine = await fs.readFile(file, 'utf8');
    const expected = list.expected || {};
    const chosen = list.mutations.filter(m =>
        only === undefined || m.name.includes(only));

    console.log('\n  ' + list.resource + ', ' + chosen.length + ' mutations, ' +
        list.test);

    // The suite has to pass before breaking it means anything. A sweep over
    // a red suite reports every mutation as killed, by the failure that was
    // already there - which looked like a kill for a mutation whose own
    // notes say it cannot be killed.
    const unmutated = await runSuite(list.test);
    if ( unmutated.fails !== 0 || unmutated.hung ) {
        console.error('  the suite does not pass unmutated: ' +
            unmutated.fails + ' failing' + (unmutated.hung ? ', and it hung' : '') +
            '. Nothing was swept - fix the suite first, or every mutation ' +
            'will look killed.');
        process.exit(1);
    }

    try {
        for ( const mutation of chosen ) {
            const at = pristine.split(mutation.from).length - 1;
            if ( at !== 1 ) {
                results.push({ list: name, ...mutation, verdict: 'PATTERN',
                    detail: 'occurs ' + at + ' times' });
                console.log('  PATTERN  | ' + mutation.name +
                    ' (occurs ' + at + ' times)');
                continue;
            }
            restore = { file, text: pristine };
            writeFileSync(file, pristine.replace(mutation.from, mutation.to));
            const { fails, hung } = await runSuite(list.test);
            writeFileSync(file, pristine);
            restore = null;
            const reason = expected[mutation.name];
            const verdict = fails !== 0
                ? 'KILLED'
                : (reason !== undefined ? 'EXPECTED' : 'SURVIVED');
            results.push({ list: name, ...mutation, verdict, fails, hung,
                reason });
            console.log('  ' + verdict.padEnd(8) + ' | ' + mutation.name +
                (fails !== 0 ? ' (' + fails + ')' : '') +
                (hung ? '  [the process needed killing; the verdict stands]'
                      : ''));
        }
    } finally {
        writeFileSync(file, pristine);
        restore = null;
    }
}

/******************************************************************************/

const killed = results.filter(r => r.verdict === 'KILLED');
const expected = results.filter(r => r.verdict === 'EXPECTED');
const survived = results.filter(r => r.verdict === 'SURVIVED');
const patterns = results.filter(r => r.verdict === 'PATTERN');
const hung = killed.filter(r => r.hung);

console.log('');
// One line that adds up, whatever the filter selected. "N of M killed" read
// as "0 of 0 killed" when a filter picked a single expected survivor, which
// looks exactly like a broken tool.
const parts = [ killed.length + ' killed' ];
if ( expected.length !== 0 ) {
    parts.push(expected.length + ' expected ' +
        (expected.length === 1 ? 'survivor' : 'survivors'));
}
if ( survived.length !== 0 ) { parts.push(survived.length + ' SURVIVED'); }
if ( patterns.length !== 0 ) { parts.push(patterns.length + ' PATTERN'); }
console.log('  ' + results.length + ' mutation' +
    (results.length === 1 ? '' : 's') + ': ' + parts.join(', '));
if ( hung.length !== 0 ) {
    // Not a failure, and it has been read as one. --test-force-exit should
    // mean this never prints: if it does, a mutation is hanging a test
    // rather than leaving a handle open after the suite has finished.
    console.log('  ' + hung.length + ' of the kills came from a suite that ' +
        'then had to be killed itself - check what the mutation hangs');
}
if ( expected.length !== 0 ) {
    console.log('  the ones that cannot be killed, and why:');
    for ( const r of expected ) {
        console.log('    ' + r.name + ' - ' + r.reason);
    }
}
for ( const r of survived ) {
    console.error('  SURVIVED | ' + r.list + ' | ' + r.name);
}
for ( const r of patterns ) {
    console.error('  PATTERN  | ' + r.list + ' | ' + r.name + ' - ' + r.detail);
}
if ( survived.length !== 0 || patterns.length !== 0 ) {
    console.error('\n  ' + (survived.length + patterns.length) +
        ' to answer for: a survivor is a test that is not testing what it ' +
        'names, or a mutation that changed nothing. Check which before ' +
        'writing a test.');
    process.exit(1);
}
