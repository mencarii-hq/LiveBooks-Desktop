/**
 * T1 — Check-style amount in words: `Three Hundred Twelve and 45/100`.
 *
 * Dedicated to the check pipeline (not the receipt `getGrandTotalInWords`,
 * which appends currency/"only"). Integer part is spelled Title-Case; the
 * fractional part is always shown as `NN/100` (Q-AJ, 2-decimal).
 */

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];

const TENS = [
  '',
  '',
  'Twenty',
  'Thirty',
  'Forty',
  'Fifty',
  'Sixty',
  'Seventy',
  'Eighty',
  'Ninety',
];

const SCALES = ['', 'Thousand', 'Million', 'Billion', 'Trillion'];

function spellThreeDigits(num: number): string {
  const parts: string[] = [];
  const hundreds = Math.floor(num / 100);
  const rest = num % 100;

  if (hundreds > 0) {
    parts.push(`${ONES[hundreds]} Hundred`);
  }

  if (rest > 0) {
    if (rest < 20) {
      parts.push(ONES[rest]);
    } else {
      const tens = Math.floor(rest / 10);
      const ones = rest % 10;
      parts.push(ones > 0 ? `${TENS[tens]} ${ONES[ones]}` : TENS[tens]);
    }
  }

  return parts.join(' ');
}

function spellInteger(value: number): string {
  if (value === 0) {
    return 'Zero';
  }

  const groups: number[] = [];
  let remaining = value;
  while (remaining > 0) {
    groups.push(remaining % 1000);
    remaining = Math.floor(remaining / 1000);
  }

  const words: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const group = groups[i];
    if (group === 0) {
      continue;
    }
    const scale = SCALES[i] ?? '';
    words.push(
      scale ? `${spellThreeDigits(group)} ${scale}` : spellThreeDigits(group)
    );
  }

  return words.join(' ');
}

export function amountInWords(amount: number): string {
  const safe = Number.isFinite(amount) ? Math.abs(amount) : 0;
  const fixed = safe.toFixed(2);
  const [integerPart, decimalPart] = fixed.split('.');
  const integer = Number.parseInt(integerPart, 10) || 0;
  return `${spellInteger(integer)} and ${decimalPart}/100`;
}
