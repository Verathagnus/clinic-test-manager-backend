// src/invoice/invoice.service.ts
import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import postgres from 'postgres';
import * as puppeteer from 'puppeteer';
import { invoiceTemplate } from 'src/templates/invoice.template';
// import { getBrowser } from 'src/utils/browser';

@Injectable()
export class InvoiceService {
  constructor(@Inject('DATABASE_CONNECTION') private sql: postgres.Sql<any>) { }

  async createInvoice(
    patientId: number,
    items: { id: number; price: number }[],
    discount: number,
    amountPaid: number,
    remarks: string
  ) {
    try {
      const result = await this.sql.begin(async (transaction) => {
        const [invoice] = await transaction`
          INSERT INTO invoices (patient_id, discount, amount_paid, remarks)
          VALUES (${patientId}, ${discount}, ${amountPaid}, ${remarks})
          RETURNING id
        `;
        const invoiceId = invoice.id;

        for (const item of items) {
          await transaction`
            INSERT INTO invoice_items (invoice_id, item_id, price)
            VALUES (${invoiceId}, ${item.id}, ${item.price})
          `;
        }

        return invoice;
      });

      return result;
    } catch (error) {
      throw new Error(`Failed to create invoice: ${error.message}`);
    }
  }

  async createInvoiceWithPatient(
    patientData: {
      name: string;
      age: number;
      address: string;
      phone: string;
    },
    items: { id: number; price: number }[],
    discount: number,
    amountPaid: number,
    remarks: string
  ) {
    try {
      return await this.sql.begin(async (transaction) => {
        // Create patient
        const [patient] = await transaction`
          INSERT INTO patients (name, age, address, phone)
          VALUES (${patientData.name}, ${patientData.age}, ${patientData.address}, ${patientData.phone})
          RETURNING *
        `;

        // Create invoice
        const [invoice] = await transaction`
          INSERT INTO invoices (patient_id, discount, amount_paid, remarks)
          VALUES (${patient.id}, ${discount}, ${amountPaid}, ${remarks})
          RETURNING *
        `;

        // Add invoice items
        for (const item of items) {
          await transaction`
            INSERT INTO invoice_items (invoice_id, item_id, price)
            VALUES (${invoice.id}, ${item.id}, ${item.price})
          `;
        }

        // Return complete invoice data
        const [completeInvoice] = await transaction`
          SELECT 
            i.*,
            p.name as patient_name,
            p.age as patient_age,
            p.address as patient_address,
            p.phone as patient_phone,
            json_agg(
              json_build_object(
                'id', it.id,
                'name', it.name,
                'price', ii.price
              )
            ) as items
          FROM invoices i
          JOIN patients p ON i.patient_id = p.id
          JOIN invoice_items ii ON i.id = ii.invoice_id
          JOIN items it ON ii.item_id = it.id
          WHERE i.id = ${invoice.id}
          GROUP BY i.id, p.id
        `;

        return completeInvoice;
      });
    } catch (error) {
      throw new Error(`Failed to create invoice: ${error.message}`);
    }
  }

  async getInvoicePrintDetails(invoiceId: number) {
    const [invoice] = await this.sql`
      SELECT 
        i.*,
        p.name as patient_name,
        p.age as patient_age,
        p.address as patient_address,
        p.phone as patient_phone,
        json_agg(
          json_build_object(
            'name', it.name,
            'description', it.description,
            'price', ii.price
          )
        ) as items
      FROM invoices i
      JOIN patients p ON i.patient_id = p.id
      JOIN invoice_items ii ON i.id = ii.invoice_id
      JOIN items it ON ii.item_id = it.id
      WHERE i.id = ${invoiceId}
      GROUP BY i.id, p.id
    `;

    // Update print count
    await this.sql`
      UPDATE invoices
      SET print_count = print_count + 1
      WHERE id = ${invoiceId}
    `;

    return invoice;
  }


  // src/invoice/invoice.service.ts
  async printInvoice(invoiceId: number) {
    try {
      const browser = await puppeteer.launch();
      const page = await browser.newPage();
      const invoice = {
        id: 123,
        patient_name: 'John Doe',
        patient_address: '123 Main St, Anytown',
        patient_phone: '555-555-5555',
        created_at: new Date().toISOString(),
        items: [
          { name: 'Blood Test', description: 'Routine blood test', price: 50 },
          { name: 'X-ray', description: 'Chest X-ray', price: 100 },
          { name: 'MRI', description: 'Brain MRI', price: 200 },
        ],
        discount: 20,
        amount_paid: 150,
      };
      const htmlContent = `
      <!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Professional Invoice - A5</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    @page {
      size: A5;
      margin: 0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
      background: white;
      width: 148mm;
      height: 210mm;
      margin: 0 auto;
      color: #4f46e5;
      font-size: 8pt;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    .container {
      width: 100%;
      height: 100%;
      background: white;
      display: flex;
      flex-direction: column;
    }

    .header {
      print-color-adjust: exact;
      background: #4f46e5;
      padding: 0.75rem;
    }

    .header-content {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }

    .company-info {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .company-name {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      font-size: 14pt;
      font-weight: 700;
      letter-spacing: -0.01em;
    }

    .company-name svg {
      width: 16px;
      height: 16px;
    }

    .company-details {
      display: flex;
      flex-direction: column;
      gap: 0.125rem;
      color: #27beff;
      font-size: 7pt;
    }

    .detail-item {
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }

    .detail-item svg {
      width: 10px;
      height: 10px;
      flex-shrink: 0;
    }

    .invoice-info {
      text-align: right;
    }

    .invoice-title {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 0.25rem;
      font-size: 12pt;
      font-weight: 700;
      letter-spacing: -0.01em;
    }

    .invoice-title svg {
      width: 16px;
      height: 16px;
    }

    .invoice-details {
      margin-top: 0.5rem;
      display: flex;
      flex-direction: column;
      gap: 0.125rem;
      color: #27beff;
      font-size: 7pt;
    }

    .main-content {
      padding: 0.75rem;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      flex-grow: 1;
    }

    .top-section {
      margin-bottom: 1rem;
    }

    .customer-section {
      margin-bottom: 0.75rem;
    }

    .section-title {
      font-size: 9pt;
      font-weight: 600;
      color: #4b5563;
      padding-bottom: 0.25rem;
      border-bottom: 1px solid #e5e7eb;
      margin-bottom: 0.5rem;
      letter-spacing: -0.01em;
    }

    .customer-details {
      display: grid;
      gap: 0.25rem;
      color: #6b7280;
      font-size: 7pt;
    }

    .label {
      font-weight: 600;
      color: #4b5563;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 0.75rem;
      font-size: 7pt;
    }

    th {
      background: #111;
      padding: 0.375rem 0.75rem;
      text-align: left;
      font-weight: 600;
      color: #4b5563;
      border-bottom: 1px solid #e5e7eb;
    }

    td {
      padding: 0.375rem 0.75rem;
      color: #4b5563;
      border-bottom: 1px solid #e5e7eb;
    }

    tr:hover {
      background: #f9fafb;
    }

    .text-right {
      text-align: right;
    }

    .summary-section {
      border-top: 1px solid #e5e7eb;
      padding-top: 0.75rem;
      margin-bottom: 0.75rem;
    }

    .summary-content {
      width: 100%;
      max-width: 50%;
      margin-left: auto;
      font-size: 7pt;
    }

    .summary-item {
      display: flex;
      justify-content: space-between;
      margin-bottom: 0.25rem;
      color: #6b7280;
    }

    .total-item {
      font-size: 8pt;
      font-weight: 600;
      color: #4b5563;
      padding-top: 0.25rem;
      border-top: 1px solid #e5e7eb;
    }

    .balance-item {
      font-size: 8pt;
      font-weight: 600;
      color: #4f46e5;
    }

    .remarks-section {
      margin-bottom: 0.75rem;
    }

    .remarks-content {
      color: #6b7280;
      font-size: 7pt;
    }

    .footer {
      text-align: center;
      border-top: 1px solid #e5e7eb;
      padding-top: 0.75rem;
      color: #6b7280;
      font-size: 7pt;
    }

    .footer-icon {
      color: #4f46e5;
      margin-bottom: 0.25rem;
    }

    .footer-icon svg {
      width: 14px;
      height: 14px;
    }

    .footer-title {
      font-weight: 500;
      margin-bottom: 0.125rem;
    }

    .footer-subtitle {
      font-size: 6pt;
    }

    @media print {
      body {
        margin: 0;
        padding: 0;
        width: 148mm;
        height: 210mm;
      }
      
      .container {
        width: 148mm;
        height: 210mm;
      }

      @page {
        size: A5;
        margin: 0;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="header-content">
        <div class="company-info">
          <div class="company-name">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>
            Shreebhumi Diagnostics
          </div>
          <div class="company-details">
            <div class="detail-item">
              <svg width="5px" height="5px" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
              ASdas das, AWSDasd asdasdas
            </div>
            <div class="detail-item">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              1111111111
            </div>
          </div>
        </div>
        <div class="invoice-info">
          <div class="invoice-title">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
            Invoice:  #123
          </div>
          <div class="invoice-details">
            <div class="detail-item" style="font-size: 10pt;">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              18/2/2025
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="main-content">
      <div class="top-section">
        <div class="customer-section">
          <h3 class="section-title">Customer Details</h3>
          <div class="customer-details">
            <p><span class="label">Name:</span> John Doe</p>
            <p><span class="label">Address:</span> 123 Main St, Anytown</p>
            <p><span class="label">Contact:</span> 555-555-5555</p>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Test Name</th>
              <th>Description</th>
              <th class="text-right">Price</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Blood Test</td>
              <td>Test sets sest</td>
              <td class="text-right">₹50</td>
            </tr>
            <tr>
              <td>X-ray</td>
              <td>Test sets sest</td>
              <td class="text-right">₹100</td>
            </tr>
            <tr>
              <td>MRI</td>
              <td>Test sets sest</td>
              <td class="text-right">₹200</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="bottom-section">
        <div class="summary-section">
          <div class="summary-content">
            <div class="summary-item">
              <span>Subtotal:</span>
              <span>₹350</span>
            </div>
            <div class="summary-item">
              <span>Discount:</span>
              <span>₹20</span>
            </div>
            <div class="summary-item total-item">
              <span>Grand Total:</span>
              <span>₹330</span>
            </div>
            <div class="summary-item">
              <span>Amount Paid:</span>
              <span>₹150</span>
            </div>
            <div class="summary-item balance-item">
              <span>Balance:</span>
              <span>₹180</span>
            </div>
          </div>
        </div>

        <div class="remarks-section">
          <h3 class="section-title">Remarks</h3>
          <p class="remarks-content">Please follow up in two weeks.</p>
        </div>

        <div class="footer">
          <div class="footer-icon">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
        </div>
        <p class="footer-title">Thank you for your business!</p>
        <p class="footer-subtitle">Please visit us again.</p>
      </div>
    </div>
  </div>
</body>
</html>
      `;

      await page.setContent(htmlContent);
      const pdfBuffer = await page.pdf({ format: 'A5' });

      await browser.close();
      return pdfBuffer;
    }
    catch (e) {
      // logger.error("ERROR in printInvoice: ", e);
      // if (e instanceof BaseError) throw e;
      // logger.error("Error in printInvoice", e);
      throw new Error("Error in printInvoice");//, e);
    }
  }


  async getInvoices(page: number, limit: number, startDate?: string, endDate?: string) {
    const offset = (page - 1) * limit;
    let dateFilter = this.sql``;

    if (startDate && endDate) {
      dateFilter = this.sql`AND i.created_at BETWEEN ${startDate} AND ${endDate}`;
    } else if (startDate) {
      dateFilter = this.sql`AND i.created_at >= ${startDate}`;
    } else if (endDate) {
      dateFilter = this.sql`AND i.created_at <= ${endDate}`;
    }

    const totalInvoices = await this.sql`
      SELECT COUNT(*) FROM invoices i
      WHERE i.deleted_at IS NULL ${dateFilter}
    `;

    const totalPages = Math.ceil(totalInvoices[0].count / limit);

    const invoices = await this.sql`
      SELECT i.id, i.patient_id, i.discount, i.amount_paid, i.remarks, i.created_at, i.deleted_at,
             p.name AS patient_name, p.age, p.address, p.phone,
             json_agg(json_build_object('name', it.name, 'price', ii.price)) AS items
      FROM invoices i
      JOIN patients p ON i.patient_id = p.id
      LEFT JOIN invoice_items ii ON i.id = ii.invoice_id
      LEFT JOIN items it ON ii.item_id = it.id
      WHERE i.deleted_at IS NULL ${dateFilter}
      GROUP BY i.id, p.id
      ORDER BY i.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    return {
      currentPage: page,
      totalPages,
      totalInvoices: totalInvoices[0].count,
      invoices,
    };
  }

  async payBalance(invoiceId: number, amount: number) {
    // First, get the current invoice
    const [invoice] = await this.sql`
      SELECT * FROM invoices
      WHERE id = ${invoiceId} AND deleted_at IS NULL
    `;

    if (!invoice) {
      throw new NotFoundException(`Invoice with ID ${invoiceId} not found`);
    }

    // Store the before state
    const beforeState = { ...invoice };

    // Update the amount paid
    const [updatedInvoice] = await this.sql`
      UPDATE invoices
      SET amount_paid = amount_paid + ${amount}
      WHERE id = ${invoiceId}
      RETURNING *
    `;

    // Log the edit
    await this.sql`
      INSERT INTO edits (entity_name, entity_id, before, after)
      VALUES ('invoices', ${invoiceId}, ${this.sql.json(beforeState)}, ${this.sql.json(updatedInvoice)})
    `;

    return updatedInvoice;
  }

  async updateDiscount(invoiceId: number, discount: number) {
    // First, get the current invoice
    const [invoice] = await this.sql`
      SELECT * FROM invoices
      WHERE id = ${invoiceId} AND deleted_at IS NULL
    `;

    if (!invoice) {
      throw new NotFoundException(`Invoice with ID ${invoiceId} not found`);
    }

    // Store the before state
    const beforeState = { ...invoice };

    // Update the discount
    const [updatedInvoice] = await this.sql`
      UPDATE invoices
      SET discount = ${discount}
      WHERE id = ${invoiceId}
      RETURNING *
    `;

    // Log the edit
    await this.sql`
      INSERT INTO edits (entity_name, entity_id, before, after)
      VALUES ('invoices', ${invoiceId}, ${this.sql.json(beforeState)}, ${this.sql.json(updatedInvoice)})
    `;

    return updatedInvoice;
  }

}