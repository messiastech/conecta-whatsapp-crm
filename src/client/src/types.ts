export interface DashboardMetrics {
  totalPersons: number;
  totalEvents: number;
  totalCampaigns: number;
  totalPresent: number;
  totalAbsent: number;
  totalMessagesSent: number;
  totalMessagesReceived: number;
  totalOptOuts: number;
  pendingAttentionCount: number;
  responseRate: number;
  categoryBreakdown: Array<{
    category: string;
    count: number;
  }>;
}

export interface EventItem {
  id: string;
  name: string;
  description?: string;
  eventDate: string;
  location?: string;
  totalAttendees: number;
  totalAbsentees: number;
  status: string;
  createdAt: string;
  presentCount?: number;
  absentCount?: number;
  attendees?: PersonItem[];
  absentees?: PersonItem[];
}

export interface PersonItem {
  id: string;
  name: string;
  phone: string;
  normalizedPhone: string;
  email?: string;
  notes?: string;
  optOut: boolean;
  optOutAt?: string;
  createdAt: string;
  attendances?: Array<{
    id: string;
    eventId: string;
    attended: boolean;
    event?: { name: string; eventDate: string };
  }>;
  conversations?: Array<{
    id: string;
    status: string;
    category?: string;
    requiresHumanAttention: boolean;
    lastMessageAt: string;
  }>;
}

export interface MessageItem {
  id: string;
  conversationId: string;
  personId: string;
  direction: 'OUTBOUND' | 'INBOUND';
  content: string;
  status: string;
  sentAt?: string;
  deliveredAt?: string;
  readAt?: string;
  createdAt: string;
  aiAnalyses?: AIAnalysisItem[];
}

export interface AIAnalysisItem {
  id: string;
  category: string;
  confidence: number;
  sentiment: string;
  summary: string;
  requiresHumanAttention: boolean;
  suggestedReply?: string;
  modelUsed: string;
  createdAt: string;
}

export interface ConversationItem {
  id: string;
  personId: string;
  status: string;
  requiresHumanAttention: boolean;
  category?: string;
  lastMessageAt: string;
  person: PersonItem;
  messages: MessageItem[];
  aiAnalyses?: AIAnalysisItem[];
}

export interface CampaignItem {
  id: string;
  eventId: string;
  name: string;
  type: string;
  templateName?: string;
  messageBody: string;
  status: string;
  totalRecipients: number;
  totalSent: number;
  totalDelivered: number;
  totalFailed: number;
  createdAt: string;
  event?: EventItem;
  messages?: Array<{
    id: string;
    content: string;
    status: string;
    person: PersonItem;
  }>;
}
