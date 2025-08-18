import {
  Dashboard,
  DashboardItem,
  User,
  UserPreferences,
  Alert,
  ChartData,
  PerformanceMetrics,
  WebSocketMessage,
} from '@/types';

// Dashboard Store Types
export interface DashboardState {
  dashboards: Dashboard[];
  activeDashboard: Dashboard | null;
  isLoading: boolean;
  error: string | null;
  selectedItems: string[];
  draggedItem: DashboardItem | null;
  clipboardItems: DashboardItem[];
  
  // Actions
  setDashboards: (dashboards: Dashboard[]) => void;
  setActiveDashboard: (dashboard: Dashboard | null) => void;
  addDashboard: (dashboard: Dashboard) => void;
  updateDashboard: (id: string, updates: Partial<Dashboard>) => void;
  deleteDashboard: (id: string) => void;
  duplicateDashboard: (id: string) => void;
  
  addDashboardItem: (dashboardId: string, item: DashboardItem) => void;
  updateDashboardItem: (dashboardId: string, itemId: string, updates: Partial<DashboardItem>) => void;
  removeDashboardItem: (dashboardId: string, itemId: string) => void;
  reorderDashboardItems: (dashboardId: string, items: DashboardItem[]) => void;
  
  setSelectedItems: (items: string[]) => void;
  addSelectedItem: (itemId: string) => void;
  removeSelectedItem: (itemId: string) => void;
  clearSelection: () => void;
  
  setDraggedItem: (item: DashboardItem | null) => void;
  
  copyItems: (itemIds: string[]) => void;
  pasteItems: (dashboardId: string) => void;
  
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

// Theme Store Types
export interface ThemeState {
  theme: 'light' | 'dark' | 'auto';
  colorScheme: 'blue' | 'green' | 'purple' | 'orange' | 'red';
  fontSize: 'small' | 'medium' | 'large';
  density: 'compact' | 'comfortable' | 'spacious';
  animations: boolean;
  reducedMotion: boolean;
  
  // Actions
  setTheme: (theme: 'light' | 'dark' | 'auto') => void;
  setColorScheme: (scheme: 'blue' | 'green' | 'purple' | 'orange' | 'red') => void;
  setFontSize: (size: 'small' | 'medium' | 'large') => void;
  setDensity: (density: 'compact' | 'comfortable' | 'spacious') => void;
  setAnimations: (enabled: boolean) => void;
  setReducedMotion: (enabled: boolean) => void;
  toggleTheme: () => void;
}

// User Store Types
export interface UserState {
  user: User | null;
  isAuthenticated: boolean;
  preferences: UserPreferences;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  setUser: (user: User | null) => void;
  updateUser: (updates: Partial<User>) => void;
  setPreferences: (preferences: Partial<UserPreferences>) => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

// Notification Store Types
export interface NotificationState {
  alerts: Alert[];
  unreadCount: number;
  isOpen: boolean;
  
  // Actions
  addAlert: (alert: Alert) => void;
  removeAlert: (id: string) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearAlerts: () => void;
  setIsOpen: (open: boolean) => void;
}

// Realtime Store Types
export interface RealtimeState {
  isConnected: boolean;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
  lastMessage: WebSocketMessage | null;
  messageHistory: WebSocketMessage[];
  subscriptions: Set<string>;
  
  // Chart data cache
  chartDataCache: Map<string, ChartData>;
  
  // Actions
  setConnectionStatus: (status: 'connecting' | 'connected' | 'disconnected' | 'error') => void;
  addMessage: (message: WebSocketMessage) => void;
  subscribe: (channel: string) => void;
  unsubscribe: (channel: string) => void;
  updateChartData: (chartId: string, data: ChartData) => void;
  clearMessageHistory: () => void;
}

// Performance Store Types
export interface PerformanceState {
  metrics: PerformanceMetrics;
  isMonitoring: boolean;
  history: PerformanceMetrics[];
  maxHistorySize: number;
  
  // Actions
  updateMetrics: (metrics: Partial<PerformanceMetrics>) => void;
  startMonitoring: () => void;
  stopMonitoring: () => void;
  clearHistory: () => void;
  setMaxHistorySize: (size: number) => void;
}