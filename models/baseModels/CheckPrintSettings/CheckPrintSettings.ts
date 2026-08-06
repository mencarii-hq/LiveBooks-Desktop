import { Doc } from 'fyo/model/doc';

/**
 * Single doc holding check-printing calibration. The `profiles` field stores a
 * JSON blob managed by the Check Printing settings tab:
 *
 * {
 *   voucher:      { pageWidthIn, pageHeightIn, offsetX, offsetY, fields: {...} },
 *   threePerPage: { ... },
 *   ledgerStub:   { ... }
 * }
 *
 * All offsets are in 1/100 inch. The renderer (src/utils/checkPrint) owns the
 * default profile shape and merges stored overrides on top of the defaults.
 */
export class CheckPrintSettings extends Doc {
  activeFormat?: string;
  profiles?: string;
}
