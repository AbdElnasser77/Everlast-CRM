import type { ReactNode } from "react";
import { BookA, LifeBuoy } from "lucide-react";
import type { Permission } from "@/lib/permissions";
import type { DocPage } from "../model";
import { DocLink, H, Lead, P, Table, Ui } from "../primitives";

const GROUP = "Help";

type QA = { q: string; a: ReactNode; perm?: Permission };

const FAQ: { section: string; items: QA[] }[] = [
  {
    section: "Messaging",
    items: [
      { perm: "conversation:write", q: "I can't type in a chat — the box is greyed out.", a: <>The 24-hour window is closed. Send an approved template with <Ui>Template</Ui>. See <DocLink to="window">The 24-hour window</DocLink>.</> },
      { perm: "conversation:write", q: "The template picker is empty.", a: <>No template of the right category is approved on this line&apos;s WhatsApp account. Ask whoever manages templates to create and submit one.</> },
      { perm: "conversation:write", q: "My message shows a red “!”.", a: <>WhatsApp refused it. Hover the mark for the reason: often the patient isn&apos;t on WhatsApp, or the window closed.</> },
      { perm: "conversation:write", q: "My follow-up disappeared.", a: <>The patient wrote again, which cancels the follow-up automatically. Set a new one from the <Ui>Follow up</Ui> chip if you still need it. See <DocLink to="outcomes">Follow-ups</DocLink>.</> },
      { perm: "conversation:write", q: "I can't find a chat someone sent me a link to.", a: <>It&apos;s probably on another line. Switch line in the top-right corner, then open it again.</> },
      { perm: "conversation:write", q: "Why didn't the AI answer this patient?", a: <>It never answers assigned chats, opted-out patients, chats a flow is handling, or chats the team replied to recently. After a hand-over it waits until the chat is Resolved. See <DocLink to="ai-assistant">How the AI assistant works</DocLink>.</> },
    ],
  },
  {
    section: "Campaigns",
    items: [
      { perm: "campaign:write", q: "My template isn't in the campaign wizard.", a: <>Only <b>approved</b> templates in the <b>Campaign</b> category are listed. Check its status and category on Templates.</> },
      { perm: "campaign:read", q: "Why did my campaign pause?", a: <>The reason is on its card: quiet hours, a Meta rate limit or connection loss (all resume by themselves), or quality dropped, a template problem or a manual pause (someone must click Resume). See <DocLink to="campaign-rules">Sending rules</DocLink>.</> },
      { perm: "campaign:read", q: "Why were some recipients skipped?", a: <>They had opted out, or they got another campaign within the frequency cap. The reason is in the recipients table.</> },
      { perm: "campaign:write", q: "I can't schedule for 22:00.", a: <>That&apos;s inside quiet hours. The error suggests the earliest time allowed.</> },
      { perm: "campaign:write", q: "My test message didn't arrive.", a: <>Tests only go to the staff test numbers an admin set in Campaign safety, at most 10 per hour.</> },
    ],
  },
  {
    section: "Contacts",
    items: [
      { perm: "contact:import", q: "My import skipped people who were already in Contacts.", a: <>Contact imports never overwrite existing records. To add existing patients to a list, import into the list instead: they&apos;re linked, not skipped.</> },
      { perm: "contact:write", q: "A number is refused as a landline.", a: <>Only mobile numbers can receive WhatsApp. Check the country code.</> },
      { perm: "contact:write", q: "I deleted a contact, but they came back opted out.", a: <>Opt-outs are remembered by phone number on purpose, so a patient who said STOP is never messaged again by mistake.</> },
    ],
  },
  {
    section: "Account and access",
    items: [
      { q: "A page I used to see has gone.", a: <>Your role probably changed. Pages follow your role&apos;s permissions. See <DocLink to="roles">Roles & permissions</DocLink>.</> },
      { q: "I was signed out suddenly.", a: <>Sessions last 8 hours, and a password reset or role change signs you out everywhere. Sign in again.</> },
      { q: "How do I change my password?", a: <>See <DocLink to="account">Your account</DocLink>.</> },
      { perm: "settings:write", q: "The AI says it isn't configured.", a: <>Add the Cloudflare account ID and API token in Settings → AI model & Cloudflare (or the environment), then Test connection.</> },
      { perm: "settings:write", q: "Adding a WhatsApp number says no tokens are set.", a: <>A developer has to add <code>WHATSAPP_TOKEN_&lt;NAME&gt;</code> to the API&apos;s environment first. See <DocLink to="whatsapp-numbers">WhatsApp lines</DocLink>.</> },
    ],
  },
];

const faq: DocPage = {
  key: "faq",
  label: "FAQ & troubleshooting",
  group: GROUP,
  icon: LifeBuoy,
  description: "Quick answers to common questions",
  keywords: "faq help problem error troubleshooting question why can't",
  body: (ctx) => (
    <>
      <Lead>Answers to the questions the team asks most, for your role.</Lead>
      {FAQ.map(({ section, items }) => {
        const mine = items.filter((i) => !i.perm || ctx.can(i.perm));
        if (mine.length === 0) return null;
        return (
          <div key={section}>
            <H>{section}</H>
            <div className="space-y-2 mb-4">
              {mine.map((i) => (
                <details key={i.q} className="group rounded-xl border border-gray-200 bg-white px-4 py-3 open:shadow-sm">
                  <summary className="cursor-pointer list-none text-[14px] font-semibold text-gray-900 flex items-center justify-between gap-3">
                    {i.q}
                    <span className="text-gray-400 text-[18px] leading-none transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <div className="text-[13.5px] leading-relaxed text-gray-600 mt-2">{i.a}</div>
                </details>
              ))}
            </div>
          </div>
        );
      })}
      <P>Still stuck? Ask in #ops-help, with the time and what you clicked. An admin can look it up in the audit log.</P>
    </>
  ),
};

const TERMS: [string, string, Permission?][] = [
  ["Line", "One of the clinic's WhatsApp numbers. Picked in the top-right switcher."],
  ["24-hour window", "The time after a patient's last message in which you can send free text. After that, only templates."],
  ["Template", "A message Meta has approved in advance, needed outside the window and for campaigns."],
  ["Owner / assignee", "The person a chat is assigned to."],
  ["Follow-up", "A reminder to get back to a patient at a set time. Cancelled automatically when the patient writes again."],
  ["Hand-off", "An automation (flow or AI) passing the patient to a person."],
  ["Opt-out", "A patient who doesn't want marketing on a line (or anywhere)."],
  ["Flow", "An automation that answers a campaign's buttons.", "campaign:read"],
  ["Segment", "A saved rule that picks an audience each time it's used.", "segment:read"],
  ["List", "A hand-picked group of contacts.", "list:read"],
  ["Frequency cap", "The minimum number of days between two campaigns to the same patient.", "campaign:read"],
  ["Quiet hours", "The time of day campaigns don't send (21:00–09:00 by default).", "campaign:read"],
  ["Quality rating", "Meta's GREEN / YELLOW / RED score for a line, driven by patients' blocks and reports.", "stats:read"],
  ["Messaging limit (tier)", "How many different people a line may start conversations with in any 24 hours.", "campaign:read"],
  ["Working time", "Time outside quiet hours. Waiting times and the 30-minute target count only this.", "team:supervise"],
  ["Knowledge base", "The approved articles the AI assistant answers from."],
];

const glossary: DocPage = {
  key: "glossary",
  label: "Glossary",
  group: GROUP,
  icon: BookA,
  description: "The words used in the app and this guide",
  keywords: "glossary terms definitions words meaning",
  body: (ctx) => (
    <>
      <Lead>What the words in the app mean.</Lead>
      <Table
        head={["Term", "Meaning"]}
        rows={TERMS.filter(([, , perm]) => !perm || ctx.can(perm)).map(([t, d]) => [<b key="t">{t}</b>, d])}
      />
    </>
  ),
};

export const helpPages: DocPage[] = [faq, glossary];
