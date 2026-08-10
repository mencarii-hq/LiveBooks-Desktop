import { getCountryInfo } from 'utils/misc';
import { caProvinceMap, usStateMap } from 'utils/stateLists';

export interface ParsedAddress {
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export type SmartFillResult =
  | {
      ok: true;
      name: string;
      email?: string;
      phone?: string;
      address: ParsedAddress;
      warnings: string[];
    }
  | { ok: false; reason: 'no-name' | 'no-anchor' | 'empty' };

const US_ZIP_SUFFIX = /^(.*?)[,\s]+(\d{5}(?:-\d{4})?)$/;
const CA_POSTAL_SUFFIX = /^(.*?)[,\s]+([A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d)$/i;
const REGION_ABBREV_SUFFIX = /^(.*?)\s*,?\s*([A-Za-z]{2})\.?$/;

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const PHONE_RE = /^\+?[\d\s().-]{7,}$/;
const STREET_LIKE_NAME_RE = /^(P\.?O\.?\s+Box|\d+\s)/i;
const ZIP_LINE_RE = /^\d{5}(?:-\d{4})?$/;

/** Common shorthand → canonical region name (US + CA). */
const REGION_NAME_ALIASES: Record<string, string> = {
  calif: 'California',
  california: 'California',
  colo: 'Colorado',
  colorado: 'Colorado',
  conn: 'Connecticut',
  fla: 'Florida',
  florida: 'Florida',
  mass: 'Massachusetts',
  massachusetts: 'Massachusetts',
  mich: 'Michigan',
  minnesota: 'Minnesota',
  miss: 'Mississippi',
  missouri: 'Missouri',
  mont: 'Montana',
  nebraska: 'Nebraska',
  nev: 'Nevada',
  oklahoma: 'Oklahoma',
  oregon: 'Oregon',
  penn: 'Pennsylvania',
  penna: 'Pennsylvania',
  pennsylvania: 'Pennsylvania',
  tennessee: 'Tennessee',
  texas: 'Texas',
  wash: 'Washington',
  washington: 'Washington',
  wis: 'Wisconsin',
  wisc: 'Wisconsin',
  wisconsin: 'Wisconsin',
  // Canada
  alberta: 'Alberta',
  'british columbia': 'British Columbia',
  manitoba: 'Manitoba',
  'new brunswick': 'New Brunswick',
  newfoundland: 'Newfoundland and Labrador',
  'newfoundland and labrador': 'Newfoundland and Labrador',
  'nova scotia': 'Nova Scotia',
  ontario: 'Ontario',
  'prince edward island': 'Prince Edward Island',
  quebec: 'Quebec',
  québec: 'Quebec',
  saskatchewan: 'Saskatchewan',
  yukon: 'Yukon',
};

function regionEntriesByNameLength(
  map: Record<string, string>
): Array<[string, string]> {
  return Object.entries(map).sort((a, b) => b[1].length - a[1].length);
}

const US_REGIONS_BY_NAME = regionEntriesByNameLength(usStateMap);
const CA_REGIONS_BY_NAME = regionEntriesByNameLength(caProvinceMap);

function codeForRegionName(
  name: string,
  map: Record<string, string>
): string | undefined {
  const lowered = name.toLowerCase();
  for (const [code, regionName] of Object.entries(map)) {
    if (regionName.toLowerCase() === lowered) {
      return code;
    }
  }
  return undefined;
}

function normalizeRegionToken(token: string): string {
  return token
    .replace(/[.]/g, ' ')
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Damerau–Levenshtein (adjacent transposition = 1) with early exit.
 * Handles common typos like "Utha" → "Utah".
 */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) {
    return max + 1;
  }
  if (a === b) {
    return 0;
  }

  const rows = a.length + 1;
  const cols = b.length + 1;
  const dist: number[][] = Array.from({ length: rows }, () =>
    new Array<number>(cols).fill(0)
  );

  for (let i = 0; i < rows; i++) {
    dist[i][0] = i;
  }
  for (let j = 0; j < cols; j++) {
    dist[0][j] = j;
  }

  for (let i = 1; i < rows; i++) {
    let rowMin = dist[i][0];
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(
        dist[i - 1][j] + 1,
        dist[i][j - 1] + 1,
        dist[i - 1][j - 1] + cost
      );

      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, dist[i - 2][j - 2] + 1);
      }

      dist[i][j] = value;
      if (value < rowMin) {
        rowMin = value;
      }
    }
    if (rowMin > max) {
      return max + 1;
    }
  }

  return dist[a.length][b.length];
}

function maxEditDistanceForName(name: string): number {
  // Allow 1 typo for short names like Utah/Ohio; 2 for longer ones.
  if (name.length >= 8) {
    return 2;
  }
  if (name.length >= 4) {
    return 1;
  }
  return 0;
}

interface ResolvedRegion {
  regionCode: string;
  /** Original token when fuzzy/alias correction applied. */
  correctedFrom?: string;
}

function resolveRegionToken(
  token: string,
  map: Record<string, string>,
  regionsByName: Array<[string, string]>
): ResolvedRegion | null {
  const cleaned = normalizeRegionToken(token);
  if (!cleaned) {
    return null;
  }

  const upper = cleaned.toUpperCase();
  if (upper.length === 2 && map[upper]) {
    return { regionCode: upper };
  }

  const lowered = cleaned.toLowerCase();

  const aliasTarget = REGION_NAME_ALIASES[lowered];
  if (aliasTarget) {
    const code = codeForRegionName(aliasTarget, map);
    if (code) {
      return {
        regionCode: code,
        correctedFrom:
          aliasTarget.toLowerCase() === lowered ? undefined : token.trim(),
      };
    }
  }

  for (const [code, name] of regionsByName) {
    if (name.toLowerCase() === lowered) {
      return { regionCode: code };
    }
  }

  let best: { regionCode: string; distance: number; name: string } | null =
    null;
  for (const [code, name] of regionsByName) {
    const maxDist = maxEditDistanceForName(name);
    if (maxDist === 0) {
      continue;
    }
    const distance = editDistance(lowered, name.toLowerCase(), maxDist);
    if (distance > maxDist) {
      continue;
    }
    if (
      !best ||
      distance < best.distance ||
      (distance === best.distance && name.length > best.name.length)
    ) {
      best = { regionCode: code, distance, name };
    }
  }

  if (best) {
    return { regionCode: best.regionCode, correctedFrom: token.trim() };
  }

  return null;
}

function cleanCity(city: string): string {
  return city
    .replace(/[,\s]+$/g, '')
    .replace(/^[,\s]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

interface RegionCityMatch {
  city: string;
  regionCode: string;
  /** Street peeled from a same-line "street, city, ST" block. */
  street?: string;
  correctedFrom?: string;
}

/**
 * When city still contains a leading street ("1188 w 1380n, Provo"), split it.
 */
function peelStreetFromCity(city: string): { street?: string; city: string } {
  if (!city.includes(',')) {
    return { city: cleanCity(city) };
  }

  const parts = city
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) {
    return { city: cleanCity(city) };
  }

  const head = parts[0];
  if (!STREET_LIKE_NAME_RE.test(head) && !/^\d/.test(head)) {
    return { city: cleanCity(city) };
  }

  return {
    street: parts.slice(0, -1).join(', '),
    city: cleanCity(parts[parts.length - 1]),
  };
}

function matchRegionBeforePostal(
  beforePostal: string,
  map: Record<string, string>,
  regionsByName: Array<[string, string]>
): RegionCityMatch | null {
  const cleaned = beforePostal.replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return null;
  }

  // Comma form: "1188 w 1380n, Provo, uta" or "Provo, Utah"
  if (cleaned.includes(',')) {
    const segments = cleaned
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);

    if (segments.length >= 2) {
      const regionToken = segments[segments.length - 1];
      const resolved = resolveRegionToken(regionToken, map, regionsByName);
      if (resolved) {
        if (segments.length === 2) {
          return {
            city: cleanCity(segments[0]),
            regionCode: resolved.regionCode,
            correctedFrom: resolved.correctedFrom,
          };
        }

        const city = cleanCity(segments[segments.length - 2]);
        const street = segments.slice(0, -2).join(', ');
        if (city && street) {
          return {
            city,
            street,
            regionCode: resolved.regionCode,
            correctedFrom: resolved.correctedFrom,
          };
        }
      }
    }
  }

  const abbrevMatch = cleaned.match(REGION_ABBREV_SUFFIX);
  if (abbrevMatch) {
    const resolved = resolveRegionToken(abbrevMatch[2], map, regionsByName);
    const peeled = peelStreetFromCity(abbrevMatch[1]);
    if (resolved && peeled.city) {
      return {
        city: peeled.city,
        street: peeled.street,
        regionCode: resolved.regionCode,
        correctedFrom: resolved.correctedFrom,
      };
    }
  }

  const words = cleaned.split(/\s+/).filter(Boolean);
  // Prefer longer region suffixes ("New Hampshire") over shorter ones.
  for (
    let wordCount = Math.min(4, words.length - 1);
    wordCount >= 1;
    wordCount--
  ) {
    const regionToken = words.slice(-wordCount).join(' ');
    const peeled = peelStreetFromCity(words.slice(0, -wordCount).join(' '));
    if (!peeled.city) {
      continue;
    }

    const resolved = resolveRegionToken(regionToken, map, regionsByName);
    if (resolved) {
      return {
        city: peeled.city,
        street: peeled.street,
        regionCode: resolved.regionCode,
        correctedFrom: resolved.correctedFrom,
      };
    }
  }

  return null;
}

const COUNTRY_ALIASES: Record<string, string> = {
  usa: 'United States',
  us: 'United States',
  'u s': 'United States',
  'u s a': 'United States',
  'united states': 'United States',
  'united states of america': 'United States',
  america: 'United States',
  canada: 'Canada',
  ca: 'Canada',
};

export function getCountryNameFromCode(code: string): string | undefined {
  const normalized = code.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  for (const [name, info] of Object.entries(getCountryInfo())) {
    if (info?.code?.toLowerCase() === normalized) {
      return name;
    }
  }

  return undefined;
}

function normalizeLines(text: string): string[] {
  let lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 1) {
    lines = lines[0]
      .split(',')
      .map((segment) => segment.trim())
      .filter(Boolean);
  }

  return lines;
}

function normalizeCaPostal(postal: string): string {
  const compact = postal.replace(/\s/g, '').toUpperCase();
  return `${compact.slice(0, 3)} ${compact.slice(3)}`;
}

interface AnchorMatch {
  /** First line index belonging to the city/region/postal block. */
  index: number;
  /** Last line index belonging to the city/region/postal block. */
  endIndex: number;
  city: string;
  regionCode: string;
  postalCode: string;
  /** Present when street shared the city/state/ZIP line. */
  street?: string;
  countryHint?: 'United States' | 'Canada';
  correctedFrom?: string;
}

function parseAnchorCandidate(
  candidate: string
): Omit<AnchorMatch, 'index' | 'endIndex'> | null {
  const normalized = candidate.replace(/\s+/g, ' ').trim();

  const usZip = normalized.match(US_ZIP_SUFFIX);
  if (usZip) {
    const beforePostal = usZip[1].replace(/,\s*$/, '').trim();
    const region = matchRegionBeforePostal(
      beforePostal,
      usStateMap,
      US_REGIONS_BY_NAME
    );
    if (region) {
      return {
        city: region.city,
        street: region.street,
        regionCode: region.regionCode,
        postalCode: usZip[2],
        countryHint: 'United States',
        correctedFrom: region.correctedFrom,
      };
    }
  }

  const caPostal = normalized.match(CA_POSTAL_SUFFIX);
  if (caPostal) {
    const beforePostal = caPostal[1].replace(/,\s*$/, '').trim();
    const region = matchRegionBeforePostal(
      beforePostal,
      caProvinceMap,
      CA_REGIONS_BY_NAME
    );
    if (region) {
      return {
        city: region.city,
        street: region.street,
        regionCode: region.regionCode,
        postalCode: normalizeCaPostal(caPostal[2]),
        countryHint: 'Canada',
        correctedFrom: region.correctedFrom,
      };
    }
  }

  return null;
}

function findAnchor(lines: string[]): AnchorMatch | null {
  for (let end = lines.length - 1; end >= 1; end--) {
    // Prefer tighter spans first, then wider (city/state/ZIP split across lines).
    for (let start = end; start >= Math.max(1, end - 2); start--) {
      const candidate = lines.slice(start, end + 1).join(' ');
      const parsed = parseAnchorCandidate(candidate);
      if (parsed) {
        return { ...parsed, index: start, endIndex: end };
      }
    }
  }

  return null;
}

function peelEmail(line: string): { email?: string; remainder: string } {
  const match = line.match(EMAIL_RE);
  if (!match) {
    return { remainder: line };
  }

  const email = match[0];
  const remainder = line.replace(email, '').replace(/[,;|]/g, ' ').trim();
  return { email, remainder: remainder.replace(/\s{2,}/g, ' ').trim() };
}

function countDigits(value: string): number {
  return (value.match(/\d/g) ?? []).length;
}

function peelPhone(line: string): { phone?: string; remainder: string } {
  if (!PHONE_RE.test(line) || ZIP_LINE_RE.test(line)) {
    return { remainder: line };
  }

  const digits = countDigits(line);
  if (digits < 10) {
    return { remainder: line };
  }

  const phone = line.trim();
  return { phone, remainder: '' };
}

function resolveCountryLine(
  line: string,
  countryHint?: 'United States' | 'Canada'
): { country?: string; isCountry: boolean } {
  const lowered = normalizeRegionToken(line).toLowerCase();
  if (COUNTRY_ALIASES[lowered]) {
    return { country: COUNTRY_ALIASES[lowered], isCountry: true };
  }

  const countryInfo = getCountryInfo();
  if (countryInfo[line.trim()]) {
    return { country: line.trim(), isCountry: true };
  }

  for (const name of Object.keys(countryInfo)) {
    if (name.toLowerCase() === lowered) {
      return { country: name, isCountry: true };
    }
  }

  if (
    countryHint &&
    (lowered === countryHint.toLowerCase() ||
      COUNTRY_ALIASES[lowered] === countryHint)
  ) {
    return { country: countryHint, isCountry: true };
  }

  return { isCountry: false };
}

function mapRegion(code: string, country?: string): string | undefined {
  const upper = code.toUpperCase();
  if (country === 'Canada') {
    return caProvinceMap[upper];
  }
  if (country === 'United States') {
    return usStateMap[upper];
  }

  return usStateMap[upper] ?? caProvinceMap[upper];
}

export function parseSmartFill(
  text: string,
  defaultCountry?: string
): SmartFillResult {
  const lines = normalizeLines(text);
  if (lines.length < 2) {
    return { ok: false, reason: lines.length === 0 ? 'empty' : 'no-anchor' };
  }

  const anchor = findAnchor(lines);
  if (!anchor) {
    return { ok: false, reason: 'no-anchor' };
  }

  const name = lines[0];
  if (/^\d/.test(name) || STREET_LIKE_NAME_RE.test(name)) {
    return { ok: false, reason: 'no-name' };
  }

  const warnings: string[] = [];
  let email: string | undefined;
  let phone: string | undefined;

  const streetLines: string[] = [];
  for (const line of lines.slice(1, anchor.index)) {
    let remainder = line;

    if (!email) {
      const emailPeel = peelEmail(remainder);
      email = emailPeel.email ?? email;
      remainder = emailPeel.remainder;
    }

    if (!phone && remainder) {
      const phonePeel = peelPhone(remainder);
      phone = phonePeel.phone ?? phone;
      remainder = phonePeel.remainder;
    }

    if (remainder) {
      streetLines.push(remainder);
    }
  }

  const address: ParsedAddress = {
    city: anchor.city,
    postalCode: anchor.postalCode,
  };

  if (streetLines.length === 0) {
    if (anchor.street) {
      address.addressLine1 = anchor.street;
    } else {
      warnings.push('Street line missing — fill Address Line 1');
    }
  } else {
    address.addressLine1 = streetLines[0];
    if (streetLines.length > 1) {
      address.addressLine2 = streetLines.slice(1).join(', ');
    } else if (anchor.street) {
      // Rare: street both above and inline — keep inline as line 2.
      address.addressLine2 = anchor.street;
    }
  }

  let country: string | undefined = anchor.countryHint;
  const trailingLines = lines.slice(anchor.endIndex + 1);
  const trailingExtras: string[] = [];

  for (const line of trailingLines) {
    const { country: resolvedCountry, isCountry } = resolveCountryLine(
      line,
      anchor.countryHint
    );
    if (isCountry && resolvedCountry) {
      country = resolvedCountry;
      continue;
    }

    trailingExtras.push(line);
  }

  if (!country && defaultCountry) {
    country = defaultCountry;
  }

  if (country) {
    address.country = country;
  }

  const mappedState = mapRegion(anchor.regionCode, country);
  if (mappedState) {
    address.state = mappedState;
  } else {
    warnings.push(`Unknown state or province code "${anchor.regionCode}"`);
  }

  if (anchor.correctedFrom) {
    warnings.push(
      `Interpreted "${anchor.correctedFrom}" as ${
        mappedState ?? anchor.regionCode
      }`
    );
  }

  if (trailingExtras.length) {
    const extra = trailingExtras.join(', ');
    address.addressLine2 = address.addressLine2
      ? `${address.addressLine2}, ${extra}`
      : extra;
    warnings.push('Extra line(s) after country were added to Address Line 2');
  }

  return {
    ok: true,
    name,
    email,
    phone,
    address,
    warnings,
  };
}
