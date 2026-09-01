/**
 * QBD-like instrument identity for register / reconcile / write entry.
 * Never surface internal Payment doc names (Pay-___ / PAY-xxx) to the user.
 */

const INTERNAL_PAYMENT_NAME = /^(pay[-_]\d+)/i;
const INTERNAL_PAYMENT_LABEL = /^payment\s+pay[-_]/i;

export function isInternalPaymentDocName(value: string): boolean {
  const v = value.trim();
  if (!v) {
    return false;
  }
  return INTERNAL_PAYMENT_NAME.test(v) || INTERNAL_PAYMENT_LABEL.test(v);
}

export function typedConfirmMatches(
  typed: string,
  confirmText: string
): boolean {
  return typed.trim().toUpperCase() === confirmText.trim().toUpperCase();
}

export function isCheckMethodName(
  methodName: string,
  methodType?: string
): boolean {
  if ((methodName || '').trim().toLowerCase() === 'check') {
    return true;
  }
  return methodType === 'Check';
}

/** User-facing Number / CHK/Ref: check #, EFT ref, or method label — never Pay-___. */
export function userFacingInstrumentRef(opts: {
  referenceId?: string;
  paymentMethod?: string;
  paymentType?: string;
}): string {
  const ref = (opts.referenceId || '').trim();
  if (ref && !isInternalPaymentDocName(ref)) {
    return ref;
  }
  const method = (opts.paymentMethod || '').trim();
  if (method && !isInternalPaymentDocName(method)) {
    return method;
  }
  if (opts.paymentType === 'Receive') {
    return 'DEP';
  }
  return '';
}

export function instrumentTypeLabel(opts: {
  paymentMethod?: string;
  paymentType?: string;
}): string {
  const method = (opts.paymentMethod || '').trim();
  if (method && !isInternalPaymentDocName(method)) {
    return method;
  }
  if (opts.paymentType === 'Receive') {
    return 'DEP';
  }
  return '';
}

export function reconcileIdentification(opts: {
  payment?: {
    referenceId?: string;
    paymentMethod?: string;
    paymentType?: string;
    party?: string;
  } | null;
  partyLabel?: string;
  jeRemark?: string;
}): { payee: string; referenceShort: string; typeLabel: string } {
  const payment = opts.payment;
  const typeLabel = instrumentTypeLabel({
    paymentMethod: payment?.paymentMethod,
    paymentType: payment?.paymentType,
  });
  const referenceShort = userFacingInstrumentRef({
    referenceId: payment?.referenceId,
    paymentMethod: payment?.paymentMethod,
    paymentType: payment?.paymentType,
  });
  const payee = (opts.partyLabel || '').trim() || (opts.jeRemark || '').trim();
  return { payee, referenceShort, typeLabel };
}
