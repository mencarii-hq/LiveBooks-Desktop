/**
 * Normalize a bank feed description into a payee memory key.
 * Strips trailing store numbers / digit runs so "STARBUCKS #1234" and
 * "STARBUCKS #5678" share a key.
 */
export function bankPayeeKey(description: string | null | undefined): string {
  if (!description) {
    return '';
  }
  let s = description.toLowerCase().trim();
  s = s.replace(/\s+/g, ' ');
  // Drop trailing #1234 / store 99 / date-like tokens
  s = s.replace(/(?:#|store\s*)?\d{2,}(?:[\/\-]\d{2,})*$/i, '').trim();
  s = s.replace(/\b\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?\b/g, '').trim();
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}
