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

    Stands in for Transcend's ui.js. No banner is built, and the refusal is
    recorded through airgap's own API - which leaves airgap itself in place,
    blocking by that refusal as it was built to.

    Point it at ui.js, not at airgap.js: airgap is the engine and the tenant's
    configuration, and it is the thing that enforces what this records.

*/

(function() {
    'use strict';
    // @include lib/transcend-core.js
    consentRRTranscend();
})();
