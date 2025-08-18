// Core data types
export interface DataPoint {
  id: string;
  timestamp: Date | string;
  value: number;
  label?: string;
  category?: string;
  metadata?: Record<string, any>;
}

export interface TimeSeriesData {
  id: string;
  name: string;
  data: DataPoint[];
  color?: string;
  type?: 'line' | 'area' | 'bar';
}

export interface ChartData {
  id: string;
  title: string;
  type: ChartType;
  data: TimeSeriesData[] | DataPoint[];
  config: ChartConfig;
  lastUpdated: Date;
}

export type ChartType = 
  | 'line'
  | 'area'
  | 'bar'
  | 'pie'
  | 'doughnut'
  | 'scatter'
  | 'bubble'
  | 'radar'
  | 'heatmap'
  | 'treemap'
  | 'funnel'
  | 'gauge'
  | 'candlestick';

export interface ChartConfig {
  responsive?: boolean;
  maintainAspectRatio?: boolean;
  animation?: boolean;
  legend?: {
    display: boolean;
    position: 'top' | 'bottom' | 'left' | 'right';
  };
  tooltip?: {
    enabled: boolean;
    mode: 'single' | 'multiple';
  };
  axes?: {
    x?: AxisConfig;
    y?: AxisConfig;
  };
  colors?: string[];
  theme?: 'light' | 'dark';
}

export interface AxisConfig {
  display: boolean;
  type: 'linear' | 'logarithmic' | 'time' | 'category';
  label?: string;
  min?: number;
  max?: number;
  grid?: {
    display: boolean;
    color?: string;
  };
}

// Dashboard types
export interface DashboardItem {
  id: string;
  type: 'chart' | 'metric' | 'table' | 'text' | 'image';
  title: string;
  position: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  config: Record<string, any>;
  dataSource?: string;
  refreshInterval?: number;
}

export interface Dashboard {
  id: string;
  name: string;
  description?: string;
  items: DashboardItem[];
  layout: 'grid' | 'flex' | 'masonry';
  theme: 'light' | 'dark' | 'auto';
  isPublic: boolean;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  owner: string;
}

export interface DashboardTemplate {
  id: string;
  name: string;
  description: string;
  preview?: string;
  items: Omit<DashboardItem, 'id'>[];
  category: string;
  tags: string[];
}

// Metrics types
export interface Metric {
  id: string;
  name: string;
  value: number;
  previousValue?: number;
  unit?: string;
  format?: 'number' | 'currency' | 'percentage' | 'bytes' | 'duration';
  trend: 'up' | 'down' | 'neutral';
  changePercent?: number;
  target?: number;
  description?: string;
  category: string;
  icon?: string;
  color?: string;
}

export interface KPI {
  id: string;
  name: string;
  value: number;
  target: number;
  unit: string;
  period: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  trend: number; // percentage change
  status: 'success' | 'warning' | 'danger' | 'info';
  history: DataPoint[];
}

// Filter and query types
export interface FilterOption {
  id: string;
  label: string;
  value: string | number | boolean;
  type: 'text' | 'number' | 'date' | 'select' | 'multiselect' | 'boolean';
  options?: { label: string; value: any }[];
}

export interface DateRange {
  start: Date;
  end: Date;
  preset?: 'today' | 'yesterday' | 'last7days' | 'last30days' | 'thisMonth' | 'lastMonth' | 'thisYear' | 'lastYear' | 'custom';
}

export interface QueryParams {
  dateRange?: DateRange;
  filters?: Record<string, any>;
  groupBy?: string[];
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

// Real-time data types
export interface WebSocketMessage {
  type: 'data' | 'alert' | 'system' | 'heartbeat';
  payload: any;
  timestamp: Date;
  id?: string;
}

export interface RealtimeUpdate {
  chartId: string;
  data: DataPoint[];
  operation: 'append' | 'replace' | 'update';
  timestamp: Date;
}

export interface Alert {
  id: string;
  type: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  actions?: AlertAction[];
}

export interface AlertAction {
  id: string;
  label: string;
  type: 'primary' | 'secondary' | 'danger';
  action: () => void;
}

// User and authentication types
export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  role: 'admin' | 'editor' | 'viewer';
  preferences: UserPreferences;
  lastLogin?: Date;
  createdAt: Date;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'auto';
  timezone: string;
  dateFormat: string;
  numberFormat: string;
  defaultDashboard?: string;
  notifications: {
    email: boolean;
    push: boolean;
    inApp: boolean;
  };
}

// API response types
export interface ApiResponse<T = any> {
  data: T;
  message?: string;
  status: 'success' | 'error';
  timestamp: Date;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
    hasMore?: boolean;
  };
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, any>;
  timestamp: Date;
}

// Export and import types
export interface ExportOptions {
  format: 'pdf' | 'excel' | 'csv' | 'json' | 'png' | 'svg';
  filename?: string;
  includeCharts?: boolean;
  includeTables?: boolean;
  dateRange?: DateRange;
  filters?: Record<string, any>;
}

export interface ImportConfig {
  source: 'file' | 'api' | 'database';
  format: 'csv' | 'json' | 'excel' | 'xml';
  mapping: Record<string, string>;
  validation?: ValidationRule[];
  transformation?: TransformationRule[];
}

export interface ValidationRule {
  field: string;
  type: 'required' | 'type' | 'range' | 'pattern' | 'custom';
  params?: any;
  message?: string;
}

export interface TransformationRule {
  field: string;
  operation: 'rename' | 'convert' | 'calculate' | 'format' | 'filter';
  params: any;
}

// Performance and optimization types
export interface PerformanceMetrics {
  renderTime: number;
  dataLoadTime: number;
  memoryUsage: number;
  dataPoints: number;
  componentCount: number;
  rerenderCount: number;
}

export interface CacheConfig {
  enabled: boolean;
  ttl: number; // time to live in seconds
  maxSize: number; // maximum number of entries
  strategy: 'lru' | 'fifo' | 'lfu';
}

// Component props types
export interface BaseComponentProps {
  className?: string;
  id?: string;
  'data-testid'?: string;
}

export interface ChartComponentProps extends BaseComponentProps {
  data: ChartData;
  config?: Partial<ChartConfig>;
  onDataPointClick?: (dataPoint: DataPoint) => void;
  onChartInteraction?: (event: any) => void;
  isLoading?: boolean;
  error?: string;
}

export interface DashboardComponentProps extends BaseComponentProps {
  dashboard: Dashboard;
  isEditable?: boolean;
  onItemAdd?: (item: DashboardItem) => void;
  onItemUpdate?: (id: string, updates: Partial<DashboardItem>) => void;
  onItemRemove?: (id: string) => void;
  onLayoutChange?: (layout: any) => void;
}

// Utility types
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

export type OptionalFields<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type Nullable<T> = T | null;

export type Optional<T> = T | undefined;