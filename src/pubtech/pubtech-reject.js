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

    Stands in for PubTech's pubtech-cmp-v2-esm.js. No banner, a refusal in
    their own publisher-cookie string and TC string, and __tcfapi answering
    with it instead of a stub nothing will replace.

*/

(function() {
    'use strict';
    // @include lib/pubtech-tcf.js
    // @include lib/pubtech-core.js
    consentRRPubTech();
})();
