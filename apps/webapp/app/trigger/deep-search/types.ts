export interface DeepSearchPayload {
  content: string;
  userId: string;
  stream: boolean;
  intentOverride?: string;
  metadata?: {
    source?: "chrome" | "obsidian" | "mcp";
    url?: string;
    pageTitle?: string;
  };
}

export interface DeepSearchResponse {
  synthesis: string;
  episodes?: Array<{
    content: string;
    createdAt: Date;
    spaceIds: string[];
  }>;
}
