import { SchemaStub } from '../../types';
import Payment from '../us/Payment.json';
import PaymentFor from '../us/PaymentFor.json';
import PurchaseInvoice from '../us/PurchaseInvoice.json';
import PurchaseInvoiceItem from '../us/PurchaseInvoiceItem.json';
import SalesInvoice from '../us/SalesInvoice.json';
import SalesInvoiceItem from '../us/SalesInvoiceItem.json';
import SalesQuoteItem from '../us/SalesQuoteItem.json';

export default [
  SalesInvoice,
  SalesInvoiceItem,
  PurchaseInvoice,
  PurchaseInvoiceItem,
  SalesQuoteItem,
  Payment,
  PaymentFor,
] as SchemaStub[];
