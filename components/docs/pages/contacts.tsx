import { FileUp, Filter, ListChecks, Users } from "lucide-react";
import { rolesWith, type DocPage } from "../model";
import { Bullets, Callout, Code, DocLink, H, Lead, P, Shot, Steps, Table, Ui, Who } from "../primitives";

const GROUP = "Contacts";

const contacts: DocPage = {
  key: "contacts",
  label: "Contacts",
  group: GROUP,
  icon: Users,
  description: "The patient database: search, filter, edit, export",
  keywords: "customers patients contact new edit delete export filter chart number phone",
  visible: (ctx) => ctx.can("contact:read"),
  body: (ctx) => (
    <>
      <Who roles={rolesWith("contact:read")} />
      <Lead>
        <b>Contacts</b> holds every patient, whichever line they wrote to. A contact is created automatically the first time someone
        messages a clinic line. You can also add contacts by hand or import them.
      </Lead>
      <Shot name="contacts" alt="The contacts list" />
      <H>Finding people</H>
      <Bullets
        items={[
          <>Search by name, phone or email in <Ui>Search by name, phone, or email…</Ui>.</>,
          <><Ui>Filter</Ui> opens the same rule builder segments use, for example &ldquo;Department is any of Laser&rdquo;.
            {ctx.can("segment:write") && <> Click <Ui>Save as segment</Ui> to keep the rule (not the people) for campaigns.</>}</>,
          <>The columns are Patient, Gender, Age, Nationality, Top Dept, Join Date, Email and Activity.</>,
        ]}
      />
      <H>Adding a contact</H>
      <P>
        Click <Ui>New Contact</Ui>. Only <b>Mobile</b> is required. It must be a valid mobile number that can receive WhatsApp, and
        landlines are refused. The other fields are Name, Chart Number, Email, Gender, Date of Birth, Nationality, Join Date,
        Departments (in priority order; the first one shows as TOP), Tags and Notes.
      </P>
      <H>Working with a selection</H>
      <P>Tick contacts (or select all matching, up to 20,000) and use the bar that appears:</P>
      <Bullets
        items={[
          <><Ui>Export</Ui>: download them as CSV.</>,
          ...(ctx.can("campaign:write") ? [<><Ui>Create campaign</Ui>: opens the campaign wizard with them as recipients.</>] : []),
          ...(ctx.can("contact:bulk_delete") ? [<><Ui>Delete</Ui>: up to 5,000 at a time. Their chat history is deleted too.</>] : []),
        ]}
      />
      <H>One contact</H>
      <P>
        Open a contact to edit its details. The <b>Marketing</b> toggle shows <b>Subscribed to campaigns</b> or <b>Opted out of
        campaigns</b>. Anyone who can edit can opt a patient out; only an admin can turn it back on.
      </P>
      {ctx.can("contact:delete") && (
        <Callout tone="danger">
          Deleting a contact deletes their whole chat history and can&apos;t be undone. Their opt-out is kept and comes back if they
          return.
        </Callout>
      )}
    </>
  ),
};

const importing: DocPage = {
  key: "import",
  label: "Importing contacts",
  group: GROUP,
  icon: FileUp,
  description: "CSV import: upload, map, validate, import",
  keywords: "csv import upload spreadsheet excel map columns duplicates invalid country date format",
  visible: (ctx) => ctx.can("contact:import") || ctx.can("list:write"),
  body: () => (
    <>
      <Who roles={rolesWith("contact:import")} />
      <Lead>
        Import a CSV of patients in four steps: <b>Upload → Map columns → Validate → Import</b>. Nothing is saved until the last step.
      </Lead>
      <Shot name="contacts-import" alt="The Import contacts page" />
      <Steps
        items={[
          <><b>Upload</b>: drop a <Code>.csv</Code> file. Up to 5 MB and 20,000 rows. Not sure of the format? <Ui>Template</Ui> on the
            Contacts page downloads a sample with every column.</>,
          <><b>Map columns</b>: match your columns to the fields. Common names are matched automatically (&ldquo;whatsapp&rdquo; and
            &ldquo;tel&rdquo; both become Mobile). <b>Mobile is required.</b> Also choose:
            <ul className="list-disc ml-5 mt-1 space-y-0.5">
              <li><b>Mobile country</b>, used for numbers without a country code (UAE by default). Numbers with a code are detected for any country.</li>
              <li><b>Date format</b>: Auto, Day first (DD/MM/YYYY), Month first or Year first.</li>
              <li><b>Gender values</b>: map each value found (M, Mrs, ذكر…) to Male, Female or Don&apos;t import.</li>
            </ul>
          </>,
          <><b>Validate</b>: see how many rows are <b>Ready to import</b>, <b>Duplicates</b> and <b>Invalid</b>, with the reason for each.</>,
          <><b>Import</b>: creates the ready rows.</>,
        ]}
      />
      <H>Duplicates and errors</H>
      <Table
        head={["Reason", "Meaning"]}
        rows={[
          ["Mobile already exists / Chart number already exists", "Already in Contacts. The row is skipped, not updated."],
          ["Duplicate mobile in file / Duplicate chart number in file", "An earlier row in the same file has it."],
          ["Landline — can't receive WhatsApp", "Not a mobile number."],
          ["Invalid or unmessageable phone number", "Couldn't be read as a phone number."],
          ["Invalid gender (use Male or Female)", "A gender value you didn't map."],
          ["Unrecognized date of birth / join date", "Check the date format you chose."],
        ]}
      />
      <Callout tone="note">
        Departments and tags can hold several values in one cell, separated by <Code>;</Code> (or <Code>,</Code> if there&apos;s no{" "}
        <Code>;</Code>).
      </Callout>
      <H>Importing into a list</H>
      <P>
        A list&apos;s <Ui>Import CSV</Ui> works the same way, with one difference: patients who are already in Contacts are{" "}
        <b>linked into the list</b> instead of skipped. New phone numbers create new contacts.
      </P>
    </>
  ),
};

const lists: DocPage = {
  key: "lists",
  label: "Lists",
  group: GROUP,
  icon: ListChecks,
  description: "Hand-picked groups of contacts",
  keywords: "list static group add contacts members create campaign",
  visible: (ctx) => ctx.can("list:read"),
  body: (ctx) => (
    <>
      <Lead>
        A <b>list</b> holds exactly the contacts you put in it, for example &ldquo;VIP patients&rdquo;. It doesn&apos;t change by itself.
        For an audience that updates itself, use a <DocLink to="segments">segment</DocLink>.
      </Lead>
      <Shot name="lists" alt="The Lists page" />
      {ctx.can("list:write") ? (
        <Steps
          items={[
            <>On <b>Contacts → Lists</b>, click <Ui>Create List</Ui>, enter a <Ui>List name</Ui> and an optional description, then click <Ui>Next →</Ui>.</>,
            <>Fill it with <Ui>Select from Contacts</Ui> (pick people) or <Ui>Import CSV</Ui>.</>,
            <>Open the list any time to search it, <Ui>Add contacts</Ui> (up to 5,000 at a time), <Ui>Import CSV</Ui>, <Ui>Edit list</Ui> or <Ui>Delete list</Ui>.
              Deleting a list doesn&apos;t delete the contacts.</>,
          ]}
        />
      ) : (
        <P>Your role can view lists but not change them.</P>
      )}
      {ctx.can("campaign:write") && (
        <P>
          <Ui>Create Campaign</Ui> on a list opens the campaign wizard with the list as the audience.
        </P>
      )}
    </>
  ),
};

const segments: DocPage = {
  key: "segments",
  label: "Segments",
  group: GROUP,
  icon: Filter,
  description: "Saved rules that pick an audience automatically",
  keywords: "segment rules audience filter builder age gender department tag last message consent",
  visible: (ctx) => ctx.can("segment:read"),
  body: (ctx) => (
    <>
      <Lead>
        A <b>segment</b> saves a <i>rule</i>, not a set of people, for example &ldquo;women aged 25–40 in Aesthetics&rdquo;. Every time
        you use it, it checks again who qualifies, so someone who qualifies next month is included next month.
      </Lead>
      <Shot name="segments" alt="The Segments page" />
      <P>
        Each card shows how many contacts match right now, a <b>Consent-safe</b> badge when opted-out people are excluded, and{" "}
        <b>Rule needs fixing</b> if a rule broke. Click <Ui>Recount</Ui> to refresh the numbers.
      </P>
      {ctx.can("segment:write") && (
        <>
          <H>Building a segment</H>
          <Shot name="segment-builder" alt="The segment builder" />
          <Steps
            items={[
              <>Click <Ui>Create Segment</Ui>. Give it a name and say what it&apos;s for.</>,
              <>Choose <b>Include contacts matching all rules / any rule</b>, then <Ui>Add rule</Ui> (up to 25).</>,
              <>Watch the <b>In plain words</b> summary, the <b>Audience right now</b> count and the <b>Sample</b> update as you go.</>,
              <>Click <Ui>Create segment</Ui>.</>,
            ]}
          />
        </>
      )}
      <H>What you can filter on</H>
      <Table
        head={["Group", "Fields"]}
        rows={[
          ["Who they are", "Gender · Age · Nationality · Birthday month · Name · Mobile (e.g. starts with +971) · Email · Chart number"],
          ["Their care", "Department · Tag · Join date · Added to CRM"],
          ["Their engagement", "Last message from patient · Last campaign received · Has chatted before · Contact list · Opted out"],
        ]}
      />
      <Callout tone="note" title="Consent always wins">
        <b>Campaigns always skip opted-out contacts</b>, whatever the segment says. The <Ui>Exclude opted-out contacts</Ui> box only
        changes what the segment <i>counts</i>.
      </Callout>
      <Callout tone="warn">
        When a campaign is created from a segment, its recipients are <b>frozen</b> at that moment. Editing the segment later
        doesn&apos;t change a campaign that&apos;s already built.
      </Callout>
    </>
  ),
};

export const contactPages: DocPage[] = [contacts, importing, lists, segments];
