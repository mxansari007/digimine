/**
 * Resume PDF rendering via headless Chromium (puppeteer-core).
 *
 * The PDF is rendered from the SAME HTML the on-screen preview uses
 * (resumePdfDocument → resumeBodyHtml), so the download is pixel-identical to
 * the preview, with real selectable (ATS-parseable) text and native pagination.
 *
 * Chromium resolution: PUPPETEER_EXECUTABLE_PATH wins; otherwise we probe the
 * usual macOS/Linux install paths. (puppeteer-core ships NO bundled browser, so
 * a deploy must have Chrome/Chromium available or set the env var.)
 */
import { existsSync } from "fs";
import type { ResumeData, ResumeTemplateSpec } from "@digimine/types";
import { resumePdfDocument, type ResumeStyleOpts } from "@/lib/resume/html";

function resolveChromePath(): string {
    if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
    const candidates = [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        "/usr/bin/google-chrome",
        "/usr/bin/google-chrome-stable",
        "/usr/bin/chromium-browser",
        "/usr/bin/chromium",
        "/snap/bin/chromium",
    ];
    for (const c of candidates) {
        try {
            if (existsSync(c)) return c;
        } catch {
            /* ignore */
        }
    }
    throw new Error(
        "No Chrome/Chromium found for PDF export. Install Chrome or set PUPPETEER_EXECUTABLE_PATH."
    );
}

export async function renderResumePdf(
    data: ResumeData,
    spec: ResumeTemplateSpec,
    opts: ResumeStyleOpts & { fontGoogle?: string | null }
): Promise<Buffer> {
    const html = resumePdfDocument(data, spec, opts);
    const puppeteer = (await import("puppeteer-core")).default;

    // On Vercel / AWS Lambda there is no system Chrome, so use the bundled
    // serverless Chromium (@sparticuz/chromium). Locally we drive the user's
    // own Chrome via resolveChromePath().
    const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
    const browser = isServerless
        ? await (async () => {
              const chromium = (await import("@sparticuz/chromium")).default;
              chromium.setGraphicsMode = false;
              return puppeteer.launch({
                  args: [...chromium.args, "--font-render-hinting=none"],
                  executablePath: await chromium.executablePath(),
                  headless: true,
              });
          })()
        : await puppeteer.launch({
              executablePath: resolveChromePath(),
              headless: true,
              args: ["--no-sandbox", "--disable-setuid-sandbox", "--font-render-hinting=none"],
          });
    try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: "load", timeout: 15_000 });
        // Wait for the webfont (Inter) so the PDF matches the preview's typeface.
        await page.evaluate(() => document.fonts?.ready?.then(() => true) ?? true).catch(() => {});
        const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true });
        return Buffer.from(pdf);
    } finally {
        await browser.close().catch(() => {});
    }
}
