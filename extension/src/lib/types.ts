// Types partagés pour l'extension StraightToYourAI

// ============================================
// API Response types
// ============================================

export interface X10Item {
  id: string;
  url: string;
  title: string;
  type: 'youtube' | 'webpage';
  youtube_id?: string;
  channel?: string;
  duration?: number;
  content?: string;
  tokenCount?: number;
  createdAt?: string;
}

export interface X10Collection {
  id: string;
  title: string;
  videos: X10Item[];
  tokenCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ApiResponse<T = unknown> {
  success?: boolean;
  error?: string;
  data?: T;
}

// ============================================
// Extraction types
// ============================================

export interface TranscriptResult {
  transcript: string;
  title: string;
  channel: string;
  duration: number;
  language: string;
}

export interface JinaResult {
  content: string;
  title: string;
  description?: string;
  url: string;
}

// ============================================
// Add content payload (new endpoint)
// ============================================

export interface AddContentPayload {
  url: string;
  title: string;
  type: 'youtube' | 'webpage';
  content: string;
  youtube_id?: string;
  channel?: string;
  duration?: number;
  collectionId?: string;
  forceNew?: boolean;
  userCode?: string;
  useExisting?: boolean;  // Skip extraction - reuse existing item's transcript
}
