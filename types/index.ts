export interface User {
  id: string;
  username: string;
  role: string;
  // Returned by POST /api/auth/login, so the first screen after login can be
  // chosen by what the user may actually do. Gate on this, never on `role`.
  permissions?: import("@/lib/permissions").Permission[];
}

export type Gender = "MALE" | "FEMALE";

export interface Customer {
  _id?: string;
  id?: number;
  chartNumber: string | null;
  name: string | null;
  phone: string;
  email: string | null;
  nationality: string | null;
  gender: Gender | null;
  dateOfBirth: string | null;
  joinDate: string | null;
  departments: string[]; // ordered by rank: index 0 = top department
  tags: string[];
  notes: string | null;
  optedOut?: boolean;
  createdAt: string;
}

export interface Conversation {
  _id?: string;
  id?: string | number;
  customerId?: string | number;
  customer?: Customer;
  assignedAgentId: number | null;
  assignedAgent: { id: number; name?: string | null; username: string } | null;
  status: "OPEN" | "PENDING" | "RESOLVED";
  unreadCount: number;
  lastMessage: string | null;
  lastMessageAt: string | null;
  lastSenderType: "CUSTOMER" | "AGENT" | "BOT" | null;
  lastCustomerMessageAt?: string | null;
}

export interface QuotedMessage {
  id: number;
  content: string;
  messageType: "TEXT" | "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT" | "TEMPLATE" | "INTERACTIVE" | "STICKER";
  senderType: "CUSTOMER" | "AGENT" | "BOT";
  mediaUrl?: string | null;
  deletedAt?: string | null;
}

export interface Message {
  _id?: string;
  id?: string | number;
  conversationId: string;
  senderType: "CUSTOMER" | "AGENT" | "BOT";
  senderId: string | null;
  content: string;
  messageType: "TEXT" | "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT" | "TEMPLATE" | "INTERACTIVE" | "STICKER";
  status: "PENDING" | "SENT" | "DELIVERED" | "READ" | "FAILED" | null;
  whatsappMessageId?: string | null;
  mediaUrl?: string | null;
  reactions?: Record<string, number> | null;
  quotedMessageId?: number | null;
  quotedMessage?: QuotedMessage | null;
  /** Set on an inbound message that answers a campaign — drives the "Reply to" tag. */
  campaignRecipientId?: number | null;
  campaignRecipient?: { campaign: { id: number; name: string } } | null;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface AuditLog {
  id: number;
  action: string;
  actorId: number | null;
  actorUsername: string | null;
  targetType: string;
  targetId: number;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export interface LoginResponse {
  success: boolean;
  user: User;
}

export interface ConversationListResponse {
  success: boolean;
  data: Conversation[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface MessagesResponse {
  success: boolean;
  data: Message[];
}

export interface SendMessageResponse {
  success: boolean;
  data: {
    _id?: string;
    id: number;
    senderType: string;
    content: string;
    status: "SENT" | "FAILED";
    whatsappMessageId: string;
  };
}

export interface CustomerListResponse {
  success: boolean;
  data: Customer[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface CustomerResponse {
  success: boolean;
  data: Customer;
}

export interface ContactList {
  id: number;
  name: string;
  description: string | null;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ContactListListResponse {
  success: boolean;
  data: ContactList[];
}

export interface ContactListResponse {
  success: boolean;
  data: ContactList;
}

export interface ContactListDetailResponse {
  success: boolean;
  data: ContactList & { members: (Customer & { addedAt: string })[] };
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface AuditLogResponse {
  success: boolean;
  data: AuditLog[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export type UserStatus = "ONLINE" | "OFFLINE" | "ON_BREAK";

export interface StatsOverview {
  messages: { today: number; last7Days: number };
  conversations: { open: number; pending: number; resolved: number; unassigned: number; total: number };
  customers: { total: number; newLast7Days: number };
  agents: { online: number; onBreak: number; offline: number };
  unreadMessages: number;
}

export interface MessageChartDay {
  date: string;
  incoming: number;
  outgoing: number;
}

export interface AgentStat {
  id: string;
  name: string | null;
  username: string;
  status: string;
  lastActiveAt: string | null;
  assignedConversations: number;
  openConversations: number;
  messagesSentLast7Days: number;
  avgResponseTimeMinutes: number | null;
}

export interface StatsOverviewResponse {
  success: boolean;
  data: StatsOverview;
}

export interface StatsMessagesResponse {
  success: boolean;
  data: {
    chart: MessageChartDay[];
    typeBreakdown: Record<string, number>;
    statusBreakdown: Record<string, number>;
    peakHour: number | null;
  };
}

export interface StatsAgentsResponse {
  success: boolean;
  data: {
    agents: AgentStat[];
    statusSummary: { ONLINE: number; ON_BREAK: number; OFFLINE: number };
  };
}

export type TemplateStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
export type TemplateCategory = "GENERAL" | "RE_ENGAGEMENT" | "CAMPAIGN";
export type TemplateHeaderType = "NONE" | "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";
export type TemplateButtonType = "QUICK_REPLY" | "URL" | "PHONE_NUMBER";

export interface TemplateButton {
  id: string;
  type: TemplateButtonType;
  title: string;
  url?: string;
  phoneNumber?: string;
}

export interface Template {
  id: number;
  name: string;
  metaTemplateName: string | null;
  metaTemplateId: string | null;
  category: TemplateCategory;
  approvalStatus: TemplateStatus;
  rejectionReason: string | null;
  // When Meta last approved/rejected it (null until it decides).
  statusChangedAt?: string | null;
  language: string;
  headerType: TemplateHeaderType;
  header: string | null;
  headerMediaUrl: string | null;
  body: string;
  footer: string | null;
  buttons: TemplateButton[] | null;
  // Present = a carousel template (2–10 cards); header/footer/buttons unused.
  cards?: TemplateCard[] | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateCardButton {
  id: string; // positional: b0, b1
  type: "QUICK_REPLY" | "URL";
  title: string;
  url?: string;
}

export interface TemplateCard {
  mediaType: "IMAGE" | "VIDEO";
  mediaUrl: string;
  body: string;
  buttons: TemplateCardButton[];
}

export interface TemplateListResponse {
  success: boolean;
  data: Template[];
}

export interface TemplateResponse {
  success: boolean;
  data: Template;
}

export type MediaAssetType = "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT";

export interface MediaAsset {
  id: number;
  url: string;
  publicId: string;
  mediaType: MediaAssetType;
  format: string;
  bytes: number;
  width: number | null;
  height: number | null;
  filename: string | null;
  createdAt: string;
  usageCount: number;
}

export interface MediaAssetListResponse {
  success: boolean;
  data: MediaAsset[];
}

export interface MediaAssetResponse {
  success: boolean;
  data: MediaAsset;
}

export type UserRole = "ADMIN" | "MARKETING" | "AGENT";

export interface AgentUser {
  id: number;
  name: string | null;
  username: string;
  role: UserRole;
  /**
   * Capabilities this user holds, served by GET /api/users/me straight from the
   * server's permission map. Gate UI on this rather than on `role` — the role
   * list grows, and a check against one name silently excludes the others.
   * Optional because list endpoints return other users without it; only /me
   * carries it.
   */
  permissions?: import("@/lib/permissions").Permission[];
  status: UserStatus;
  lastActiveAt: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { messages: number; assignedConversations: number };
}

export interface UserListResponse {
  success: boolean;
  data: AgentUser[];
  pagination: { total: number; page: number; limit: number; totalPages: number };
}

export interface UserResponse {
  success: boolean;
  data: AgentUser;
}

export type CampaignStatus = "DRAFT" | "SCHEDULED" | "RUNNING" | "PAUSED" | "COMPLETED" | "CANCELLED";
export type CampaignCategory = "PROMOTION" | "SEASONAL" | "EVENT" | "AWARENESS" | "FOLLOW_UP" | "ANNOUNCEMENT" | "OTHER";
export type CampaignPauseReason = "MANUAL" | "QUIET_HOURS" | "NUMBER_INACTIVE" | "SEND_ERROR";
export type CampaignRecipientStatus = "PENDING" | "SENT" | "FAILED" | "SKIPPED";

export interface Campaign {
  id: number;
  name: string;
  templateId: number;
  template?: Pick<Template, "id" | "name" | "category" | "body" | "header" | "footer" | "buttons">;
  category: CampaignCategory;
  status: CampaignStatus;
  pauseReason?: CampaignPauseReason | null;
  // Why it paused, e.g. Meta's error for SEND_ERROR.
  pauseDetail?: string | null;
  scheduledAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  sentCount: number;
  failedCount: number;
  totalRecipients: number;
  deliveredCount?: number;
  readCount?: number;
  repliedCount?: number;
  createdById: number;
  createdAt: string;
  updatedAt: string;
  recipients?: CampaignRecipient[];
  // The automation answering this campaign's template buttons.
  flowId?: number | null;
  flow?: { id: number; name: string; isActive: boolean } | null;
}

export interface CampaignRecipient {
  id: number;
  campaignId: number;
  customerId: number;
  customer?: Pick<Customer, "id" | "name" | "phone" | "tags">;
  status: CampaignRecipientStatus;
  messageId?: number | null;
  error?: string | null;
  sentAt?: string | null;
}

export interface CampaignListResponse {
  success: boolean;
  data: Campaign[];
}

export interface CampaignResponse {
  success: boolean;
  data: Campaign;
}

export type WhatsAppQualityRating = "GREEN" | "YELLOW" | "RED" | "NA" | "UNKNOWN";
export type WhatsAppPhoneNumberStatus = "CONNECTED" | "FLAGGED" | "RESTRICTED" | "BANNED" | "UNKNOWN" | string;

export interface WhatsAppPhoneStatus {
  verifiedName: string | null;
  displayPhoneNumber: string | null;
  qualityRating: WhatsAppQualityRating;
  status: WhatsAppPhoneNumberStatus;
  nameStatus: string | null;
  codeVerificationStatus: string | null;
  throughputLevel: string | null;
  messagingLimitTier: string | null;
  fetchedAt: string;
}

export interface WhatsAppPhoneStatusResponse {
  success: boolean;
  data: WhatsAppPhoneStatus;
}

export interface WhatsAppPhoneNumberSummary {
  id: string;
  verifiedName: string | null;
  displayPhoneNumber: string | null;
  qualityRating: WhatsAppQualityRating;
  status: WhatsAppPhoneNumberStatus;
  nameStatus: string | null;
  codeVerificationStatus: string | null;
  throughputLevel: string | null;
  isPrimary: boolean;
}

export interface WhatsAppNumbersListResponse {
  success: boolean;
  data: WhatsAppPhoneNumberSummary[];
  fetchedAt: string;
}

// ── Segments ────────────────────────────────────────────────────────────────
// A saved audience RULE. Unlike a ContactList — whose membership is frozen the
// moment it is built — a segment is re-evaluated every time it is used, so it
// always describes who qualifies *now*.
//
// The rule grammar is owned by the server (utils/segmentFilter.js) and served
// by GET /api/segments/fields, so the builder never hardcodes it.

export type SegmentMatch = "ALL" | "ANY";

export type SegmentField =
  | "name" | "phone" | "email" | "chartNumber"
  | "nationality" | "gender" | "department" | "tag"
  | "joinDate" | "createdAt" | "age" | "birthdayMonth"
  | "optedOut" | "hasConversation" | "lastInboundAt" | "lastCampaignAt" | "list";

export type SegmentOp =
  | "eq" | "in" | "not_in" | "contains" | "starts_with" | "exists"
  | "has_any" | "has_all" | "has_none" | "is_empty"
  | "before" | "after" | "between"
  | "gte" | "lte"
  | "in_last_days" | "older_than_days" | "never";

export type SegmentRuleValue = string | number | boolean | (string | number)[];

export interface SegmentRule {
  field: SegmentField;
  op: SegmentOp;
  value: SegmentRuleValue;
}

export interface SegmentDefinition {
  match: SegmentMatch;
  rules: SegmentRule[];
}

export interface Segment {
  id: number;
  name: string;
  description: string | null;
  definition: SegmentDefinition;
  excludeOptedOut: boolean;
  createdById: number | null;
  createdBy?: { id: number; name: string | null; username: string } | null;
  createdAt: string;
  updatedAt: string;
  /** Live count, recomputed per request — null when the rule no longer compiles. */
  reachable?: number | null;
  matched?: number;
  suppressed?: number;
  sample?: SegmentSampleContact[];
  campaignCount?: number;
  error?: string | null;
}

/** The trimmed contact shape a preview returns — enough to eyeball, not a full record. */
export interface SegmentSampleContact {
  id: number;
  name: string | null;
  phone: string;
  gender: Gender | null;
  nationality: string | null;
  departments: string[];
  tags: string[];
  joinDate: string | null;
  optedOut: boolean;
}

export interface SegmentPreview {
  /** Contacts matching the rules alone. */
  matched: number;
  /** Contacts actually messageable — matched minus opt-outs. */
  reachable: number;
  suppressed: number;
  excludeOptedOut: boolean;
  sample: SegmentSampleContact[];
  ruleCount: number;
}

/** Field catalogue from the server, so operator menus stay in sync with the compiler. */
export interface SegmentFieldSpec {
  field: SegmentField;
  label: string;
  ops: SegmentOp[];
}

/** Real distinct values behind the free-text columns, so users pick instead of typing. */
export interface SegmentOptions {
  departments: string[];
  tags: string[];
  nationalities: string[];
  lists: { id: number; name: string; memberCount: number }[];
}

export interface SegmentListResponse {
  success: boolean;
  data: Segment[];
}
export interface SegmentResponse {
  success: boolean;
  data: Segment;
}
export interface SegmentPreviewResponse {
  success: boolean;
  data: SegmentPreview;
}
export interface SegmentFieldsResponse {
  success: boolean;
  data: SegmentFieldSpec[];
}
export interface SegmentOptionsResponse {
  success: boolean;
  data: SegmentOptions;
}
export interface SegmentMemberIdsResponse {
  success: boolean;
  data: { id: number; name: string; customerIds: number[]; count: number };
}
export interface CustomerIdsResponse {
  success: boolean;
  data: { customerIds: number[]; count: number };
}

// A WhatsApp number as this app has it configured, from /api/whatsapp/my-numbers.
// Distinct from WhatsAppPhoneNumberSummary, which is what Meta reports live:
// `id` here is this app's internal row id (what X-WhatsApp-Number-Id carries),
// NOT Meta's phone_number_id. Conflating the two is a nasty class of bug.
export interface ConfiguredWhatsAppNumber {
  id: number;
  label: string;
  phoneNumberId: string;
  wabaId: string;
  // The WhatsApp account's name as it appears in WhatsApp Manager, fetched from
  // Meta. Null when Meta couldn't be reached — fall back to a label built from
  // wabaId rather than rendering nothing.
  accountName: string | null;
  displayPhoneNumber: string | null;
  isDefault: boolean;
  isActive: boolean;
}

export interface ConfiguredNumbersResponse {
  success: boolean;
  data: ConfiguredWhatsAppNumber[];
  activeNumberId: number | null;
}

// ── Inbox workflow ────────────────────────────────────────────────────────────

/** The inbox's server-side work queues. See getAllConversations on the API. */
export type ConversationView = "all" | "mine" | "unassigned" | "campaign_replies";

export interface ConversationCounts {
  mine: number;
  unassigned: number;
  campaign_replies: number;
}

/** Someone a conversation can be given to: active, and a role that can reply. */
export interface AssignableUser {
  id: number;
  name: string | null;
  username: string;
  status: "ONLINE" | "OFFLINE" | "ON_BREAK";
}

/** One row of a campaign's Replies worklist. */
export interface CampaignReply {
  recipientId: number;
  repliedAt: string;
  customer: { id: number; name: string | null; phone: string };
  reply: { id: number; content: string; messageType: string; createdAt: string } | null;
  conversation: {
    id: number;
    status: "OPEN" | "PENDING" | "RESOLVED";
    assignedAgent: { id: number; name: string | null; username: string } | null;
  } | null;
  /** The patient spoke last and the chat isn't resolved. */
  needsResponse: boolean;
}

// ─── Flows (campaign automations) ────────────────────────────────────────────
// Mirrors everlast-nodejs-crm-api/utils/flowGraph.js, which validates on save.

export type FlowNodeType = "trigger" | "message" | "list" | "carousel" | "question" | "tag" | "assign" | "end";
export type FlowMediaType = "NONE" | "IMAGE" | "VIDEO" | "DOCUMENT";
export type FlowInputType = "text" | "number" | "email" | "phone" | "date";

export interface FlowOption { id: string; title: string; description?: string }

export interface FlowNodeData {
  // trigger: the template its buttons were copied from
  templateId?: number | null;
  // trigger / message
  buttons?: FlowOption[];
  // message
  mediaType?: FlowMediaType;
  mediaUrl?: string;
  // message / list / question / assign / end
  text?: string;
  footer?: string;
  // list
  header?: string;
  buttonLabel?: string;
  rows?: FlowOption[];
  // question / message with buttons / list: the field the answer is saved in
  variable?: string;
  inputType?: FlowInputType;
  errorText?: string;
  // carousel: snapshot of the template's cards — label + quick replies
  cards?: { label: string; buttons: { id: string; title: string }[] }[];
  // tag
  tag?: string;
  // assign
  agentId?: number | null;
  [key: string]: unknown;
}

export interface FlowNode { id: string; type: FlowNodeType; position: { x: number; y: number }; data: FlowNodeData }
export interface FlowEdge { id: string; source: string; sourceHandle: string; target: string }
export interface FlowGraph { nodes: FlowNode[]; edges: FlowEdge[] }

export type FlowRunStatus = "ACTIVE" | "COMPLETED" | "HANDED_OFF" | "STOPPED" | "EXPIRED" | "FAILED";
export type FlowRunStats = { total: number } & Partial<Record<FlowRunStatus, number>>;

export interface FlowSummary {
  id: number;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: { id: number; name: string | null; username: string };
  campaignCount: number;
  runs: FlowRunStats;
}

export interface Flow extends Omit<FlowSummary, "campaignCount"> {
  graph: FlowGraph;
  variables: string[];
  campaigns?: { id: number; name: string; status: CampaignStatus }[];
}

export interface FlowRun {
  id: number;
  flowId: number;
  conversationId: number;
  status: FlowRunStatus;
  currentNodeId: string | null;
  data: {
    answers?: Record<string, string>;
    path?: { node: string; choice?: string; answer?: string; tag?: string; handedOffTo?: string; at: string }[];
  };
  lastError: string | null;
  startedAt: string;
  completedAt: string | null;
  customer: { id: number; name: string | null; phone: string };
  campaign: { id: number; name: string } | null;
}

export interface FlowValidationError { nodeId?: string; message: string }
