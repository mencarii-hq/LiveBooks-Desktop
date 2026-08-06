import {
  CheckFieldName,
  CheckFormat,
  CheckProfile,
  CheckProfiles,
  CHECK_FORMATS,
  FieldOffset,
} from './types';
import { getFormatLayout } from './formats';

/** Zeroed, page-sized default profile for a format. */
export function getDefaultProfile(format: CheckFormat): CheckProfile {
  const layout = getFormatLayout(format);
  return {
    pageWidthIn: layout.pageWidthIn,
    pageHeightIn: layout.pageHeightIn,
    offsetX: 0,
    offsetY: 0,
    fields: {},
  };
}

export function getDefaultProfiles(): CheckProfiles {
  return {
    voucher: getDefaultProfile('voucher'),
    threePerPage: getDefaultProfile('threePerPage'),
    ledgerStub: getDefaultProfile('ledgerStub'),
  };
}

function toNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function mergeFieldOffsets(
  raw: unknown
): Partial<Record<CheckFieldName, FieldOffset>> {
  const out: Partial<Record<CheckFieldName, FieldOffset>> = {};
  if (!raw || typeof raw !== 'object') {
    return out;
  }
  const obj = raw as Record<string, unknown>;
  for (const [key, value] of Object.entries(obj)) {
    if (!value || typeof value !== 'object') {
      continue;
    }
    const v = value as { x?: unknown; y?: unknown };
    out[key as CheckFieldName] = {
      x: toNumber(v.x, 0),
      y: toNumber(v.y, 0),
    };
  }
  return out;
}

/** Merge a stored profile (partial / untrusted) onto the format default. */
export function mergeProfile(format: CheckFormat, raw: unknown): CheckProfile {
  const base = getDefaultProfile(format);
  if (!raw || typeof raw !== 'object') {
    return base;
  }
  const obj = raw as Record<string, unknown>;
  return {
    pageWidthIn: toNumber(obj.pageWidthIn, base.pageWidthIn),
    pageHeightIn: toNumber(obj.pageHeightIn, base.pageHeightIn),
    offsetX: toNumber(obj.offsetX, 0),
    offsetY: toNumber(obj.offsetY, 0),
    fields: mergeFieldOffsets(obj.fields),
  };
}

/** Parse the CheckPrintSettings.profiles JSON into a full, safe profile map. */
export function parseProfiles(json: string | undefined | null): CheckProfiles {
  const profiles = getDefaultProfiles();
  if (!json) {
    return profiles;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return profiles;
  }
  if (!parsed || typeof parsed !== 'object') {
    return profiles;
  }
  const obj = parsed as Record<string, unknown>;
  for (const format of CHECK_FORMATS) {
    profiles[format] = mergeProfile(format, obj[format]);
  }
  return profiles;
}

export function serializeProfiles(profiles: CheckProfiles): string {
  return JSON.stringify(profiles);
}

/** Resolved field position (inches) after applying global + per-field offsets. */
export function resolveFieldPosition(
  profile: CheckProfile,
  fieldname: CheckFieldName,
  baseTopIn: number,
  baseLeftIn: number
): { topIn: number; leftIn: number } {
  const centiToIn = (v: number) => v / 100;
  const field = profile.fields[fieldname] ?? { x: 0, y: 0 };
  return {
    topIn: baseTopIn + centiToIn(profile.offsetY + field.y),
    leftIn: baseLeftIn + centiToIn(profile.offsetX + field.x),
  };
}
