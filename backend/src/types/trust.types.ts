// Trust & Safety types (reports, moderation, claims)

export type ReportReason = 'spam' | 'harassment' | 'inappropriate' | 'copyright' | 'other';
export type ReportStatus = 'pending' | 'reviewed' | 'actioned' | 'dismissed';
export type ContentType = 'checkin' | 'comment' | 'photo' | 'user';

export interface Report {
  id: string;
  reporterId: string;
  contentType: ContentType;
  contentId: string;
  targetUserId?: string;
  reason: ReportReason;
  description?: string;
  status: ReportStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  createdAt: string;
}

export interface CreateReportRequest {
  contentType: ContentType;
  contentId: string;
  reason: ReportReason;
  description?: string;
}

export interface ModerationItem {
  id: string;
  contentType: ContentType;
  contentId: string;
  source: 'user_report' | 'auto_safesearch';
  reportId?: string;
  safesearchResults?: Record<string, string>;
  status: string;
  reviewedBy?: string;
  reviewedAt?: string;
  actionTaken?: string;
  createdAt: string;
}

// Verification claims
export type ClaimStatus = 'pending' | 'approved' | 'denied';
export type ClaimEntityType = 'venue' | 'band';

export interface VerificationClaim {
  id: string;
  userId: string;
  entityType: ClaimEntityType;
  entityId: string;
  status: ClaimStatus;
  evidenceText?: string;
  evidenceUrl?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  createdAt: string;
  updatedAt: string;
  // Joined fields (populated in list queries)
  entityName?: string;
  userName?: string;
  userEmail?: string;
}

export interface CreateClaimRequest {
  entityType: ClaimEntityType;
  entityId: string;
  evidenceText?: string;
  evidenceUrl?: string;
}

export interface ReviewClaimRequest {
  status: 'approved' | 'denied';
  reviewNotes?: string;
}
