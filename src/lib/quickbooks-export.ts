import { format } from "date-fns";

export interface QBLineItem {
  invoiceNo: string;
  customer: string;
  invoiceDate: string;
  dueDate: string;
  item: string;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
  serviceDate: string;
}

/**
 * QuickBooks Online IIF / CSV column headers for invoice import
 */
const QB_HEADERS = [
  "InvoiceNo",
  "Customer",
  "InvoiceDate",
  "DueDate",
  "Item",
  "Description",
  "Quantity",
  "Rate",
  "Amount",
  "ServiceDate",
];

function escapeCSV(value: string | number): string {
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function generateQuickBooksCSV(lines: QBLineItem[]): string {
  const rows = [QB_HEADERS.join(",")];
  for (const l of lines) {
    rows.push(
      [
        escapeCSV(l.invoiceNo),
        escapeCSV(l.customer),
        escapeCSV(l.invoiceDate),
        escapeCSV(l.dueDate),
        escapeCSV(l.item),
        escapeCSV(l.description),
        escapeCSV(l.quantity.toFixed(2)),
        escapeCSV(l.rate.toFixed(2)),
        escapeCSV(l.amount.toFixed(2)),
        escapeCSV(l.serviceDate),
      ].join(",")
    );
  }
  return rows.join("\n");
}

export function downloadCSV(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
