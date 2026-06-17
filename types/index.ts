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
}

export interface Message {
  _id?: string;
  id?: string | number;
  conversationId: string;
  senderType: "CUSTOMER" | "AGENT";
  senderId: string | null;
  content: string;
  messageType: "TEXT" | "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT";
  status: "PENDING" | "SENT" | "DELIVERED" | "READ" | "FAILED" | null;
  whatsappMessageId?: string | null;
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
