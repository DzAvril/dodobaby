import fs from "node:fs";
import { NextResponse } from "next/server";
import { chromium } from "playwright-core";
import sharp from "sharp";
import { isAuthenticated } from "@/lib/auth";
import { monthBounds } from "@/lib/dates";
import { getCurrentBaby, listMealsByMonth } from "@/lib/meals";
import { renderMonthlyHtml } from "@/lib/monthly-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function chromiumPath() {
  const configured = process.env.CHROMIUM_PATH;
  const candidates = [configured, "/usr/bin/chromium", "/usr/bin/chromium-browser", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].filter(Boolean) as string[];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

export async function GET(request: Request) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const baby = await getCurrentBaby();
  if (!baby) return NextResponse.json({ error: "请先创建宝宝资料" }, { status: 409 });

  const search = new URL(request.url).searchParams;
  const month = search.get("month") ?? "";
  const format = search.get("format") === "png" ? "png" : "pdf";
  const scope = search.get("scope") === "full" ? "full" : "plan";
  try {
    monthBounds(month);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "月份无效" }, { status: 400 });
  }

  const executablePath = chromiumPath();
  if (!executablePath) return NextResponse.json({ error: "服务器尚未安装 Chromium，使用 Docker 镜像即可启用打印导出" }, { status: 503 });

  const meals = await listMealsByMonth(baby.id, month);
  const { html, pageCount } = renderMonthlyHtml(baby, meals, month, scope);
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
    const context = await browser.newContext({ viewport: { width: 1123, height: 794 }, deviceScaleFactor: 3.125 });
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    const baseName = `${baby.name}-辅食菜单-${month}-${scope === "full" ? "计划与实际" : "计划"}`;

    if (format === "png") {
      await page.emulateMedia({ media: "screen" });
      const screenshot = await page.screenshot({
        type: "png",
        clip: { x: 0, y: 0, width: 1122.56, height: 793.6 * pageCount },
      });
      const png = await sharp(screenshot).resize(3508, 2480 * pageCount, { fit: "fill" }).png().toBuffer();
      return new Response(new Uint8Array(png), {
        headers: {
          "content-type": "image/png",
          "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${baseName}.png`)}`,
          "cache-control": "no-store",
        },
      });
    }

    await page.emulateMedia({ media: "print" });
    const pdf = await page.pdf({ width: "297mm", height: "210mm", printBackground: true, preferCSSPageSize: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
    return new Response(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${baseName}.pdf`)}`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    console.error("Monthly export failed", error);
    return NextResponse.json({ error: "打印文件生成失败，请检查容器内 Chromium 是否可用" }, { status: 503 });
  } finally {
    await browser?.close();
  }
}
