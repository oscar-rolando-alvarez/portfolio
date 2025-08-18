export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  updatedBy?: string;
  version?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: ApiError[];
  timestamp: Date;
  requestId: string;
}

export interface ApiError {
  code: string;
  message: string;
  field?: string;
  details?: Record<string, any>;
}

export interface FilterCriteria {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'nin' | 'contains' | 'startsWith' | 'endsWith';
  value: any;
}

export interface SortCriteria {
  field: string;
  direction: 'asc' | 'desc';
}

export interface SearchCriteria {
  query?: string;
  filters?: FilterCriteria[];
  sort?: SortCriteria[];
  page?: number;
  limit?: number;
}

export interface AuditLog extends BaseEntity {
  entityType: string;
  entityId: string;
  action: 'create' | 'update' | 'delete' | 'view';
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  userId: string;
  userEmail: string;
  ipAddress: string;
  userAgent: string;
  timestamp: Date;
}

export interface FileUpload {
  id: string;
  originalName: string;
  filename: string;
  mimetype: string;
  size: number;
  path: string;
  url: string;
  uploadedBy: string;
  uploadedAt: Date;
  metadata?: Record<string, any>;
}

export interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  userId?: string;
  isRead: boolean;
  createdAt: Date;
  expiresAt?: Date;
  actionUrl?: string;
  actionText?: string;
  metadata?: Record<string, any>;
}