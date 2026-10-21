// Captures the screenshots used by the in-app documentation (/docs) into
// public/docs/screenshots/. Run against a local app that holds the demo data:
//
//   (backend)   npm run seed:demo        — creates the "Demo Clinic (docs)" line and docs_* users
//   (backend)   npm run dev
//   (frontend)  npm run dev
//   (frontend)  npm run docs:screenshots
//
// Every page is opened on the demo line, so no real patient appears in a shot.
// Pages that list data across lines (Contacts, Users) are filtered to the demo
// records first. A step that can't find what it expects is reported and
// skipped; the rest still run.
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const APP = process.env.DOCS_APP_URL || "http://localhost:3000";
const API = process.env.DOCS_API_URL || "http://localhost:8000";
const PASSWORD = process.env.DOCS_PASSWORD || "DocsDemo@1234";
const DEMO_LINE = "Demo Clinic (docs)";
const OUT = path.resolve("public/docs/screenshots");
const VIEWPORT = { width: 1440, height: 900 };

const results = { ok: [], failed: [] };

// The Next.js dev badge, the dev-only cost tracker (DevCostTracker) and
// animations would otherwise land in some shots.
const HIDE_CSS = `
  nextjs-portal, [data-nextjs-toast], [data-next-badge-root] { display: none !important; }
  div.fixed.bottom-5[class*="z-[9999]"] { display: none !important; }
  *, *::before, *::after { transition: none !important; animation-duration: 0s !important; caret-color: transparent !important; }
`;

async function settle(page, ms = 900) {
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await page.addStyleTag({ content: HIDE_CSS }).catch(() => {});
  await page.waitForTimeout(ms);
}

async function shot(page, name, run) {
  try {
    if (run) await run();
    await settle(page);
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    results.ok.push(name);
    console.log(`  ✓ ${name}`);
  } catch (err) {
    results.failed.push(`${name}: ${err.message.split("\n")[0]}`);
    console.log(`  ✗ ${name} — ${err.message.split("\n")[0]}`);
  }
}

async function demoLineId(page) {
  const body = await page.evaluate(async (api) => {
    const res = await fetch(`${api}/api/whatsapp/my-numbers`, { credentials: "include" });
    return res.json();
  }, API);
  let found = null;
  (function walk(v) {
    if (found || !v || typeof v !== "object") return;
    if (v.label === DEMO_LINE && v.id != null) found = v.id;
    else Object.values(v).forEach(walk);
  })(body);
  if (found == null) throw new Error(`"${DEMO_LINE}" not found — run \`npm run seed:demo\` in the backend first`);
  return String(found);
}

async function signIn(browser, username) {
  const context = await browser.newContext({ viewport: VIEWPORT, colorScheme: "light", locale: "en-GB", timezoneId: "Asia/Dubai" });
  const page = await context.newPage();
  await page.goto(`${APP}/login`);
  await page.locator('input[autocomplete="username"]').fill(username);
  await page.locator('input[autocomplete="current-password"]').fill(PASSWORD);
  await page.locator('[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20_000 });
  // Pin the demo line before any page reads it, then reload onto it.
  const lineId = await demoLineId(page);
  await context.addInitScript((id) => localStorage.setItem("activeWhatsAppNumberId", id), lineId);
  await page.evaluate((id) => localStorage.setItem("activeWhatsAppNumberId", id), lineId);
  return { context, page };
}

const go = (page, route) => page.goto(`${APP}${route}`, { waitUntil: "domcontentloaded" });

async function openChat(page, name) {
  await go(page, "/chats");
  await page.getByText(name, { exact: true }).first().click({ timeout: 10_000 });
  await page.waitForURL(/\/chats\/\d+/, { timeout: 10_000 });
  await settle(page, 1200);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();

  // ── signed out ──
  {
    const context = await browser.newContext({ viewport: VIEWPORT, colorScheme: "light" });
    const page = await context.newPage();
    console.log("signed out");
    await shot(page, "login", () => go(page, "/login"));
    await context.close();
  }

  // ── admin: sees everything ──
  {
    console.log("admin");
    const { context, page } = await signIn(browser, "docs_admin");

    await shot(page, "inbox", () => go(page, "/chats"));
    await shot(page, "chat", () => openChat(page, "Fatima Al Mansoori"));
    await shot(page, "chat-contact-panel", async () => {
      await page.getByText("Click for contact info").first().click();
    });
    await shot(page, "chat-outcome-menu", async () => {
      await openChat(page, "Fatima Al Mansoori");
      // The header chip: "Follow up" (none set) or "Follow up · <date>" / "Follow up overdue".
      await page.getByRole("button", { name: /^Follow up/ }).first().click();
    });
    await shot(page, "chat-window-closed", () => openChat(page, "Hassan Youssef"));
    await shot(page, "chat-template-picker", async () => {
      await page.getByRole("button", { name: /Template/ }).first().click();
      await page.getByText("Welcome back", { exact: true }).first().click();
    });
    await shot(page, "chat-opted-out", () => openChat(page, "Daniel Okafor"));
    await shot(page, "chat-arabic", () => openChat(page, "نورة الكعبي"));

    await shot(page, "contacts", async () => {
      await go(page, "/customers");
      await settle(page);
      await page.getByPlaceholder(/Search by name, phone, or email/).fill("99900");
    });
    await shot(page, "contacts-import", () => go(page, "/customers/import"));
    await shot(page, "lists", () => go(page, "/customers/lists"));
    await shot(page, "segments", () => go(page, "/customers/segments"));
    await shot(page, "segment-builder", async () => {
      await go(page, "/customers/segments");
      await page.getByText("[Demo] Women 25–40").first().click();
      await page.waitForURL(/\/customers\/segments\/\d+/, { timeout: 10_000 });
    });

    await shot(page, "campaigns", () => go(page, "/campaigns"));
    await shot(page, "campaign-detail", async () => {
      await go(page, "/campaigns");
      await page.getByText("Summer Glow – HydraFacial").first().click();
      await page.waitForURL(/\/campaigns\/\d+/, { timeout: 10_000 });
    });
    await shot(page, "campaign-approve", async () => {
      await go(page, "/campaigns");
      await page.getByRole("button", { name: /^Approve$/ }).first().click();
    });
    await shot(page, "campaign-new", () => go(page, "/campaigns/new"));
    await shot(page, "flows", () => go(page, "/campaigns/flows"));
    await shot(page, "flow-builder", () => go(page, "/campaigns/flows/new"));

    await shot(page, "templates", () => go(page, "/templates"));
    await shot(page, "template-editor", () => go(page, "/templates/new"));
    await shot(page, "media-library", () => go(page, "/media-library"));


    await shot(page, "supervision", () => go(page, "/supervision"));
    await shot(page, "supervision-live", () => go(page, "/supervision/live"));
    await shot(page, "reports", () => go(page, "/supervision/reports"));
    await shot(page, "report-team", () => go(page, "/supervision/reports/team"));
    await shot(page, "dashboard", () => go(page, "/dashboard"));

    await shot(page, "settings-users", async () => {
      await go(page, "/settings?tab=users");
      await settle(page);
      await page.getByPlaceholder(/Search team by name or username/).fill("docs_");
    });
    await shot(page, "settings-quiet-hours", () => go(page, "/settings?tab=quiet-hours"));
    await shot(page, "settings-account", () => go(page, "/settings?tab=account"));
    await shot(page, "docs", () => go(page, "/docs"));
    await context.close();
  }

  // ── agent: the inbox-only view ──
  {
    console.log("agent");
    const { context, page } = await signIn(browser, "docs_agent");
    await shot(page, "agent-inbox", () => go(page, "/chats"));
    await shot(page, "agent-status-menu", async () => {
      await go(page, "/chats");
      await settle(page);
      await page.getByText(/· ● (Online|On break)|Online$/).last().click();
    });
    await context.close();
  }

  // ── marketing: builds campaigns, an admin approves ──
  {
    console.log("marketing");
    const { context, page } = await signIn(browser, "docs_marketing");
    await shot(page, "marketing-campaigns", () => go(page, "/campaigns"));
    await context.close();
  }

  // ── supervisor ──
  {
    console.log("supervisor");
    const { context, page } = await signIn(browser, "docs_supervisor");
    await shot(page, "supervisor-supervision", () => go(page, "/supervision"));
    await context.close();
  }

  await browser.close();
  console.log(`\n${results.ok.length} captured, ${results.failed.length} failed → ${OUT}`);
  if (results.failed.length) {
    console.log(results.failed.map((f) => `  - ${f}`).join("\n"));
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
