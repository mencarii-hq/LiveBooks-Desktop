import { AccountsPayableAging } from './Aging/AccountsPayableAging';
import { AccountsReceivableAging } from './Aging/AccountsReceivableAging';
import { BalanceSheet } from './BalanceSheet/BalanceSheet';
import { GeneralLedger } from './GeneralLedger/GeneralLedger';
import { GSTR1 } from './GoodsAndServiceTax/GSTR1';
import { GSTR2 } from './GoodsAndServiceTax/GSTR2';
import { ProfitAndLoss } from './ProfitAndLoss/ProfitAndLoss';
import { SalesByCustomer } from './SalesByCustomer/SalesByCustomer';
import { TrialBalance } from './TrialBalance/TrialBalance';
import { StockBalance } from './inventory/StockBalance';
import { StockLedger } from './inventory/StockLedger';

export const reports = {
  GeneralLedger,
  ProfitAndLoss,
  BalanceSheet,
  TrialBalance,
  SalesByCustomer,
  AccountsReceivableAging,
  AccountsPayableAging,
  GSTR1,
  GSTR2,
  StockLedger,
  StockBalance,
} as const;
