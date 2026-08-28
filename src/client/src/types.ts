export interface DashboardMetrics {
  totalPersons: number;
  totalEvents: number;
  totalCampaigns: number;
  totalPresent: number;
  totalAbsent: number;
  presenceRate: number;
  totalMessagesSent: number;
  totalMessagesDelivered: number;
  totalMessagesReceived: number;
  uniqueRecipientsCount: number;
  uniqueRespondersCount: number;
  totalOptOuts: number;
  pendingAttentionCount: number;
  pendingFollowUpsCount: number;
  responseRate: number;
  categoryBreakdown: Array<{
    category: string;
    count: number;
  }>;
  priorityBreakdown: Array<{
    priority: string;
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
  presentCount?: number;
  absentCount?: number;
  status: string;
  createdAt: string;
  _count?: {
    attendances: number;
    campaigns: number;
  };
  attendees?: PersonItem[];
  absentees?: PersonItem[];
}

export interface AttendanceItem {
  id: string;
  personId: string;
  eventId: string;
  attended: boolean;
  status: 'INVITED' | 'CONFIRMED' | 'ATTENDED' | 'ABSENT' | 'UNREGISTERED_ATTENDEE';
  notes?: string;
  createdAt: string;
  event?: EventItem;
  person?: PersonItem;
}

export interface CampaignItem {
  id: string;
  eventId: string;
  name: string;
  type: 'PRESENTE_FOLLOWUP' | 'AUSENTE_FOLLOWUP';
  templateName?: string;
  messageBody: string;
  status: string;
  totalRecipients: number;
  totalSent: number;
  totalDelivered: number;
  totalFailed: number;
  createdAt: string;
  event?: EventItem;
  messages?: MessageItem[];
}

export interface MessageItem {
  id: string;
  conversationId: string;
  personId: string;
  campaignId?: string;
  direction: 'OUTBOUND' | 'INBOUND';
  content: string;
  status: 'QUEUED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
  errorMessage?: string;
  sentAt?: string;
  deliveredAt?: string;
  readAt?: string;
  createdAt: string;
  aiAnalyses?: AIAnalysisItem[];
  person?: PersonItem;
}

export interface AIAnalysisItem {
  id: string;
  messageId: string;
  conversationId: string;
  category: string;
  reason?: string;
  intent: string;
  confidence: number;
  sentiment: string;
  urgency: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  summary: string;
  requiresHumanAttention: boolean;
  suggestedReply?: string;
  nextAction: string;
  modelUsed: string;
  createdAt: string;
}

export interface ConversationItem {
  id: string;
  personId: string;
  lastMessageAt: string;
  status: 'OPEN' | 'WAITING_REPLY' | 'REPLIED' | 'CLOSED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  requiresHumanAttention: boolean;
  category?: string;
  person?: PersonItem;
  messages?: MessageItem[];
  aiAnalyses?: AIAnalysisItem[];
  followUpTasks?: FollowUpTaskItem[];
}

export interface FollowUpTaskItem {
  id: string;
  personId: string;
  conversationId?: string;
  title: string;
  description?: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
  assignedTo?: string;
  dueDate?: string;
  completedAt?: string;
  createdAt: string;
  person?: PersonItem;
}

export interface ConsentHistoryItem {
  id: string;
  personId: string;
  status: 'OPTED_IN' | 'OPTED_OUT';
  reason?: string;
  source: string;
  createdAt: string;
}

export interface RelationshipTimelineItem {
  id: string;
  date: string;
  type: 'ATTENDANCE' | 'OUTBOUND_MESSAGE' | 'INBOUND_MESSAGE' | 'AI_ANALYSIS' | 'FOLLOW_UP_TASK' | 'CONSENT_CHANGE';
  title: string;
  description: string;
  badge?: string;
  badgeColor?: string;
  metadata?: any;
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
  optOutReason?: string;
  consentStatus: 'OPTED_IN' | 'OPTED_OUT';
  createdAt: string;
  attendances?: AttendanceItem[];
  conversations?: ConversationItem[];
  followUpTasks?: FollowUpTaskItem[];
  consentHistory?: ConsentHistoryItem[];
}
