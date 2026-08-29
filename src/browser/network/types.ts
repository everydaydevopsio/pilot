export interface NetworkRecord {
  id: string;
  method: string;
  url: string;
  status: number;
  resourceType: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  failed: boolean;
  errorText?: string;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  mimeType: string;
  encodedDataLength: number;
  fromCache: boolean;
  complete: boolean;
}

export interface NetworkSummary {
  id: string;
  method: string;
  url: string;
  status: number;
  resourceType: string;
  duration?: number;
  mimeType: string;
  size: number;
  failed: boolean;
  fromCache: boolean;
}

export interface NetworkDetail extends NetworkRecord {
  requestBody?: string;
  responseBody?: string;
  bodyTruncated?: boolean;
}

export interface NetworkFilter {
  url?: string;
  method?: string;
  statusMin?: number;
  statusMax?: number;
  resourceType?: string;
  failed?: boolean;
  limit?: number;
}
