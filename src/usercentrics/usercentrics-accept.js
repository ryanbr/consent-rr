/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see {http://www.gnu.org/licenses/}.

    Home: https://github.com/ryanbr/consent-rr

    Stands in for Usercentrics' loader.js, granting rather than refusing. The
    page sees a visitor who already agreed: no banner, no re-prompt, and the
    record their own blocker reads says every service it knows about is
    consented to - so a page that withholds content until the answer is yes
    shows it.

    This one grants, so read what it cannot do before pointing a site at it.

    It can only name services the record already carries. Their ids come from
    the settings API this resource exists to avoid calling, so a visitor
    arriving with no record of their own gets an empty services map - and their
    blocker treats an id it was never told about as blocked. A first visit
    therefore grants nothing, and behaves like the refusing resource. That is
    the opposite of the intent, and it is the reason this is for a site a
    returning visitor finds shut rather than for a default.

    It grants their services, not IAB consent. On a TCF tenant the TC string
    this still answers with refuses every purpose and vendor, because consenting
    there means naming the purposes, special features and vendors in the
    tenant's own configuration, which is in the payload this never fetches. A
    wall gated on __tcfapi stays shut; one gated on their own record opens.

    It says nothing about Global Privacy Control either way. Where the browser
    sends it - Brave does by default - that signal is the browser's and stands;
    this answers a different question, which is whether this visitor already
    got past the door.

    consentHash and the rest of their identity are not forged. Their record
    carries a hash that differs per visitor for the same consent state, so it
    is left out rather than invented, and a page reading it finds it missing.

*/

(function() {
    'use strict';
    // @include lib/usercentrics-tcf.js
    // @include lib/usercentrics-gpp.js
    // @include lib/usercentrics-core.js
    consentRRUsercentrics(true);
})();
