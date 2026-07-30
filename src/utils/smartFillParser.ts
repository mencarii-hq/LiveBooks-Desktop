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

const US_ANCHOR = /^(.+?)[,\s]+([A-Za-z]{2})[,\s]+(\d{5}(?:-\d{4})?)$/;
const CA_ANCHOR =
  /^(.+?)[,\s]+([A-Za-z]{2})[,\s]+([A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d)$/;

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const PHONE_RE = /^\+?[\d\s().-]{7,}$/;
const STREET_LIKE_NAME_RE = /^(P\.?O\.?\s+Box|\d+\s)/i;
const ZIP_LINE_RE = /^\d{5}(?:-\d{4})?$/;

const COUNTRY_ALIASES: Record<string, string> = {
  usa: 'United States',
  us: 'United States',
  'united states': 'United States',
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
  index: number;
  city: string;
  regionCode: string;
  postalCode: string;
  countryHint?: 'United States' | 'Canada';
}

function findAnchor(lines: string[]): AnchorMatch | null {
  let match: AnchorMatch | null = null;

  for (let i = lines.length - 1; i >= 1; i--) {
    const line = lines[i];
    const usMatch = line.match(US_ANCHOR);
    if (usMatch) {
      const regionCode = usMatch[2].toUpperCase();
      if (usStateMap[regionCode]) {
        match = {
          index: i,
          city: usMatch[1].trim(),
          regionCode,
          postalCode: usMatch[3],
          countryHint: 'United States',
        };
      }
      continue;
    }

    const caMatch = line.match(CA_ANCHOR);
    if (caMatch) {
      const regionCode = caMatch[2].toUpperCase();
      if (caProvinceMap[regionCode]) {
        match = {
          index: i,
          city: caMatch[1].trim(),
          regionCode,
          postalCode: normalizeCaPostal(caMatch[3]),
          countryHint: 'Canada',
        };
      }
    }
  }

  return match;
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
  const lowered = line.trim().toLowerCase();
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
    warnings.push('Street line missing — fill Address Line 1');
  } else {
    address.addressLine1 = streetLines[0];
    if (streetLines.length > 1) {
      address.addressLine2 = streetLines.slice(1).join(', ');
    }
  }

  let country: string | undefined = anchor.countryHint;
  const trailingLines = lines.slice(anchor.index + 1);
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
