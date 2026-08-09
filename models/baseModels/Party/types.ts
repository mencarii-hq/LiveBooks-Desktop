export type PartyRole =
  | 'Both'
  | 'Supplier'
  | 'Customer'
  | 'Employee'
  | 'Contractor';

export enum PartyRoleEnum {
  'Both' = 'Both',
  'Supplier' = 'Supplier',
  'Customer' = 'Customer',
  'Employee' = 'Employee',
  'Contractor' = 'Contractor',
}

/** W-2 employees and 1099 contractors (workforce / payroll parties). */
export function isWorkforcePartyRole(role?: string | null): boolean {
  return role === PartyRoleEnum.Employee || role === PartyRoleEnum.Contractor;
}
