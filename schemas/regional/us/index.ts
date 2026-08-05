import { SchemaStub } from '../../types';
import Payment from './Payment.json';
import PaymentFor from './PaymentFor.json';
import PurchaseInvoice from './PurchaseInvoice.json';
import PurchaseInvoiceItem from './PurchaseInvoiceItem.json';
import SalesInvoice from './SalesInvoice.json';
import SalesInvoiceItem from './SalesInvoiceItem.json';
import SalesQuoteItem from './SalesQuoteItem.json';

export default [
  SalesInvoice,
  SalesInvoiceItem,
  PurchaseInvoice,
  PurchaseInvoiceItem,
  SalesQuoteItem,
  Payment,
  PaymentFor,
] as SchemaStub[];
