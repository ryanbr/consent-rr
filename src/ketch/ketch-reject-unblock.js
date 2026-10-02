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

    Ketch, for a site that withholds content until a purpose is consented to.
    Stored and sent are the same refusal as ketch-reject.js - their record
    denied, their Google consent mode denied - while the API answers the page
    that every purpose is consented, so the content is released.

*/

(function() {
    'use strict';
    // @include lib/ketch-core.js
    consentRRKetch(true);
})();
