"use client";

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";

interface AgendaItemForExport {
  id: number;
  serialNum: number;
  description: string;
  dateAdded: Date | null;
  discussionSummary: string | null;
  decisionResolution: string | null;
  sadhguruComments: string | null;
}

interface ExportAgendaPdfOptions {
  meetingTitle: string;
  meetingDate?: Date | null;
  agendaItems: AgendaItemForExport[];
}

/**
 * Export agenda items to a PDF document for printing.
 * Includes columns: Description, Date Added, Discussion Summary, Decision Resolution, Sadhguru Comments
 */
export function exportAgendaToPdf({
  meetingTitle,
  meetingDate,
  agendaItems,
}: ExportAgendaPdfOptions): void {
  // Create PDF in landscape for better table readability
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();

  // Add title
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Meeting Agenda Items", pageWidth / 2, 15, { align: "center" });

  // Add meeting info
  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text(`Meeting: ${meetingTitle}`, 14, 25);
  
  if (meetingDate) {
    doc.text(`Date: ${format(new Date(meetingDate), "MMMM d, yyyy")}`, 14, 32);
  }
  
  doc.text(`Generated: ${format(new Date(), "MMMM d, yyyy 'at' h:mm a")}`, 14, meetingDate ? 39 : 32);

  // Prepare table data
  const tableData = agendaItems.map((item) => [
    item.serialNum.toString(),
    item.description,
    item.dateAdded ? format(new Date(item.dateAdded), "MMM d, yyyy") : "-",
    item.discussionSummary ?? "-",
    item.decisionResolution ?? "-",
    item.sadhguruComments ?? "", // Empty for manual writing
  ]);

  // Generate table
  autoTable(doc, {
    startY: meetingDate ? 45 : 38,
    head: [
      [
        "#",
        "Description",
        "Date Added",
        "Discussion Summary",
        "Decision / Resolution",
        "Sadhguru Comments",
      ],
    ],
    body: tableData,
    styles: {
      fontSize: 9,
      cellPadding: 3,
      lineWidth: 0.1,
      lineColor: [0, 0, 0],
    },
    headStyles: {
      fillColor: [66, 66, 66],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      halign: "center",
    },
    columnStyles: {
      0: { cellWidth: 10, halign: "center" }, // #
      1: { cellWidth: 50 }, // Description
      2: { cellWidth: 22, halign: "center" }, // Date Added
      3: { cellWidth: 55 }, // Discussion Summary
      4: { cellWidth: 55 }, // Decision Resolution
      5: { cellWidth: 55, minCellHeight: 20 }, // Sadhguru Comments - extra height for writing
    },
    alternateRowStyles: {
      fillColor: [245, 245, 245],
    },
    // Ensure the Sadhguru Comments column has enough space for handwriting
    didParseCell: function (data) {
      // Make the Sadhguru Comments cells taller for manual writing
      if (data.column.index === 5 && data.section === "body") {
        data.cell.styles.minCellHeight = 25;
      }
    },
  });

  // Add footer with page numbers
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(
      `Page ${i} of ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: "center" }
    );
  }

  // Generate filename
  const sanitizedTitle = meetingTitle
    .replace(/[^a-z0-9]/gi, "_")
    .replace(/_+/g, "_")
    .substring(0, 50);
  const dateStr = meetingDate
    ? format(new Date(meetingDate), "yyyy-MM-dd")
    : format(new Date(), "yyyy-MM-dd");
  const filename = `Agenda_${sanitizedTitle}_${dateStr}.pdf`;

  // Download the PDF
  doc.save(filename);
}
