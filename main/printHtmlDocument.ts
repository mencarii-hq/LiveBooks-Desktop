import { App } from 'electron';
import path from 'path';
import fs from 'fs-extra';
import { getInitializedPrintWindow } from './saveHtmlAsPdf';

let printJobCounter = 0;

/**
 * Print an HTML document through the system print dialog.
 *
 * Q-C: pass an explicit `pageSize` and zero margins so the printed output
 * matches `saveHtmlAsPdf` (which already zeroes margins + sizes the page).
 * Electron's `webContents.print` expects page/margin dimensions in microns,
 * whereas `printToPDF` uses inches — hence the cm→micron conversion here.
 *
 * Y1: each job writes to a unique temp filename and unlinks it in a
 * try/finally so concurrent jobs (e.g. a calibration sample fired while a
 * batch is printing) never clobber one another and no temp file is leaked
 * even if printing throws.
 */
export async function printHtmlDocument(
  html: string,
  app: App,
  width: number, // centimeters
  height: number // centimeters
): Promise<boolean> {
  const tempRoot = app.getPath('temp');
  const unique = `${Date.now()}-${process.pid}-${++printJobCounter}`;
  const tempFile = path.join(tempRoot, `lb-check-print-${unique}.html`);
  await fs.writeFile(tempFile, html, { encoding: 'utf-8' });

  let printWindow: Awaited<
    ReturnType<typeof getInitializedPrintWindow>
  > | null = null;
  try {
    printWindow = await getInitializedPrintWindow(tempFile, width, height);

    const micronsPerCm = 10000; // 1 cm = 10000 microns
    const success = await new Promise<boolean>((resolve) => {
      printWindow!.webContents.print(
        {
          silent: false,
          printBackground: true,
          margins: { marginType: 'none' },
          pageSize: {
            width: Math.round(width * micronsPerCm),
            height: Math.round(height * micronsPerCm),
          },
        },
        (ok) => resolve(ok)
      );
    });

    return success;
  } finally {
    if (printWindow) {
      printWindow.close();
    }
    await fs.unlink(tempFile).catch(() => undefined);
  }
}
