export interface User {
  id: string;
  username: string;
  role: string;
}

export interface Customer {
  _id?: string;
  id?: number;
  name: string | null;
  phone: string;
  email: string | null;
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
  assignedAgent: { id: number; username: string } | null;
  status: "OPEN" | "PENDING" | "RESOLVED";
  unreadCount: number;
  lastMessage: string | null;
  lastMessageAt: string | null;
  lastSenderType: "CUSTOMER" | "AGENT" | null;
  lastCustomerMessageAt?: string | null;
}

export interface QuotedMessage {
  id: number;
  content: string;
  messageType: "TEXT" | "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT" | "TEMPLATE" | "INTERACTIVE" | "STICKER";
  senderType: "CUSTOMER" | "AGENT";
  mediaUrl?: string | null;
}

export interface Message {
  _id?: string;
  id?: string | number;
  conversationId: string;
  senderType: "CUSTOMER" | "AGENT";
  senderId: string | null;
  content: string;
  messageType: "TEXT" | "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT" | "TEMPLATE" | "INTERACTIVE" | "STICKER";
  status: "PENDING" | "SENT" | "DELIVERED" | "READ" | "FAILED" | null;
  whatsappMessageId?: string | null;
  mediaUrl?: string | null;
  reactions?: Record<string, number> | null;
  quotedMessageId?: number | null;
  quotedMessage?: QuotedMessage | null;
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

export interface TemplateButton {
  id: string;
  title: string;
}

export interface Template {
  id: number;
  name: string;
  metaTemplateName: string | null;
  metaTemplateId: string | null;
  category: TemplateCategory;
  approvalStatus: TemplateStatus;
  rejectionReason: string | null;
  language: string;
  header: string | null;
  body: string;
  footer: string | null;
  buttons: TemplateButton[] | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateListResponse {
  success: boolean;
  data: Template[];
}

export interface TemplateResponse {
  success: boolean;
  data: Template;
}

export interface AgentUser {
  id: number;
  name: string | null;
  username: string;
  role: "ADMIN" | "AGENT";
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

export type CampaignStatus = "DRAFT" | "SCHEDULED" | "RUNNING" | "COMPLETED" | "CANCELLED";
export type CampaignRecipientStatus = "PENDING" | "SENT" | "FAILED" | "SKIPPED";

export interface Campaign {
  id: number;
  name: string;
  templateId: number;
  template?: Pick<Template, "id" | "name" | "category" | "body" | "header" | "footer" | "buttons">;
  status: CampaignStatus;
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
