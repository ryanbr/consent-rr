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

    Stands in for InMobi Choice's cmp2.js. The page sees a visitor who refused:
    no banner, no re-prompt, a TC string that consents to nothing, and every
    vendor waiting on __tcfapi, __gpp or __uspapi answered instead of stalled.

    Point it at cmp2.js rather than choice.js. choice.js is the loader that
    hands the CMP its tenant configuration, so leaving it alone is what makes
    the answer carry the tenant's own publisher country and language.

*/

(function() {
    'use strict';
    // @include lib/inmobi-tcf.js
    // @include lib/inmobi-gpp.js
    // @include lib/inmobi-core.js
    consentRRInMobi(consentRRInMobiTcf, consentRRInMobiGpp);
})();
