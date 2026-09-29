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

    Stands in for Osano's osano.js. The page sees a visitor who accepted the
    essential category and refused the rest: no banner, no re-prompt, the
    consent record already stored, and Osano.cm answering as it would on a
    return visit.

    Osano blocks tags by patching the DOM at runtime rather than by parking
    them in the markup, so unlike the other resources here there is nothing to
    revive - with the CMP gone, a tag it would have held back simply runs, and
    uBlock Origin blocks what it makes of it at the network layer.

*/

(function() {
    'use strict';
    // @include lib/osano-usp.js
    // @include lib/osano-core.js
    consentRROsano(consentRROsanoUsp);
})();
