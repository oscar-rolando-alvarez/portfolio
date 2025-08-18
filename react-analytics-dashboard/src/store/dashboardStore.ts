import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { Dashboard, DashboardItem } from '@/types';
import { DashboardState } from './types';
import { generateId } from '@/utils/helpers';

export const useDashboardStore = create<DashboardState>()(
  devtools(
    persist(
      immer((set, get) => ({
        dashboards: [],
        activeDashboard: null,
        isLoading: false,
        error: null,
        selectedItems: [],
        draggedItem: null,
        clipboardItems: [],

        setDashboards: (dashboards) =>
          set((state) => {
            state.dashboards = dashboards;
          }),

        setActiveDashboard: (dashboard) =>
          set((state) => {
            state.activeDashboard = dashboard;
            state.selectedItems = [];
          }),

        addDashboard: (dashboard) =>
          set((state) => {
            state.dashboards.push(dashboard);
          }),

        updateDashboard: (id, updates) =>
          set((state) => {
            const index = state.dashboards.findIndex((d) => d.id === id);
            if (index !== -1) {
              Object.assign(state.dashboards[index], updates);
              state.dashboards[index].updatedAt = new Date();
            }
            
            // Update active dashboard if it's the one being updated
            if (state.activeDashboard?.id === id) {
              Object.assign(state.activeDashboard, updates);
              state.activeDashboard.updatedAt = new Date();
            }
          }),

        deleteDashboard: (id) =>
          set((state) => {
            state.dashboards = state.dashboards.filter((d) => d.id !== id);
            
            // Clear active dashboard if it's the one being deleted
            if (state.activeDashboard?.id === id) {
              state.activeDashboard = null;
            }
          }),

        duplicateDashboard: (id) =>
          set((state) => {
            const dashboard = state.dashboards.find((d) => d.id === id);
            if (dashboard) {
              const duplicate: Dashboard = {
                ...dashboard,
                id: generateId(),
                name: `${dashboard.name} (Copy)`,
                createdAt: new Date(),
                updatedAt: new Date(),
                items: dashboard.items.map((item) => ({
                  ...item,
                  id: generateId(),
                })),
              };
              state.dashboards.push(duplicate);
            }
          }),

        addDashboardItem: (dashboardId, item) =>
          set((state) => {
            const dashboard = state.dashboards.find((d) => d.id === dashboardId);
            if (dashboard) {
              dashboard.items.push({ ...item, id: generateId() });
              dashboard.updatedAt = new Date();
            }
            
            // Update active dashboard if it's the one being modified
            if (state.activeDashboard?.id === dashboardId) {
              state.activeDashboard.items.push({ ...item, id: generateId() });
              state.activeDashboard.updatedAt = new Date();
            }
          }),

        updateDashboardItem: (dashboardId, itemId, updates) =>
          set((state) => {
            const dashboard = state.dashboards.find((d) => d.id === dashboardId);
            if (dashboard) {
              const itemIndex = dashboard.items.findIndex((i) => i.id === itemId);
              if (itemIndex !== -1) {
                Object.assign(dashboard.items[itemIndex], updates);
                dashboard.updatedAt = new Date();
              }
            }
            
            // Update active dashboard if it's the one being modified
            if (state.activeDashboard?.id === dashboardId) {
              const itemIndex = state.activeDashboard.items.findIndex((i) => i.id === itemId);
              if (itemIndex !== -1) {
                Object.assign(state.activeDashboard.items[itemIndex], updates);
                state.activeDashboard.updatedAt = new Date();
              }
            }
          }),

        removeDashboardItem: (dashboardId, itemId) =>
          set((state) => {
            const dashboard = state.dashboards.find((d) => d.id === dashboardId);
            if (dashboard) {
              dashboard.items = dashboard.items.filter((i) => i.id !== itemId);
              dashboard.updatedAt = new Date();
            }
            
            // Update active dashboard if it's the one being modified
            if (state.activeDashboard?.id === dashboardId) {
              state.activeDashboard.items = state.activeDashboard.items.filter(
                (i) => i.id !== itemId
              );
              state.activeDashboard.updatedAt = new Date();
            }
            
            // Remove from selection if it was selected
            state.selectedItems = state.selectedItems.filter((id) => id !== itemId);
          }),

        reorderDashboardItems: (dashboardId, items) =>
          set((state) => {
            const dashboard = state.dashboards.find((d) => d.id === dashboardId);
            if (dashboard) {
              dashboard.items = items;
              dashboard.updatedAt = new Date();
            }
            
            // Update active dashboard if it's the one being modified
            if (state.activeDashboard?.id === dashboardId) {
              state.activeDashboard.items = items;
              state.activeDashboard.updatedAt = new Date();
            }
          }),

        setSelectedItems: (items) =>
          set((state) => {
            state.selectedItems = items;
          }),

        addSelectedItem: (itemId) =>
          set((state) => {
            if (!state.selectedItems.includes(itemId)) {
              state.selectedItems.push(itemId);
            }
          }),

        removeSelectedItem: (itemId) =>
          set((state) => {
            state.selectedItems = state.selectedItems.filter((id) => id !== itemId);
          }),

        clearSelection: () =>
          set((state) => {
            state.selectedItems = [];
          }),

        setDraggedItem: (item) =>
          set((state) => {
            state.draggedItem = item;
          }),

        copyItems: (itemIds) =>
          set((state) => {
            if (!state.activeDashboard) return;
            
            const items = state.activeDashboard.items.filter((item) =>
              itemIds.includes(item.id)
            );
            state.clipboardItems = items.map((item) => ({
              ...item,
              id: generateId(), // Generate new ID for paste operation
            }));
          }),

        pasteItems: (dashboardId) =>
          set((state) => {
            if (state.clipboardItems.length === 0) return;
            
            const dashboard = state.dashboards.find((d) => d.id === dashboardId);
            if (dashboard) {
              const newItems = state.clipboardItems.map((item) => ({
                ...item,
                id: generateId(),
                position: {
                  ...item.position,
                  x: item.position.x + 1, // Offset position slightly
                  y: item.position.y + 1,
                },
              }));
              
              dashboard.items.push(...newItems);
              dashboard.updatedAt = new Date();
            }
            
            // Update active dashboard if it's the one being modified
            if (state.activeDashboard?.id === dashboardId) {
              const newItems = state.clipboardItems.map((item) => ({
                ...item,
                id: generateId(),
                position: {
                  ...item.position,
                  x: item.position.x + 1,
                  y: item.position.y + 1,
                },
              }));
              
              state.activeDashboard.items.push(...newItems);
              state.activeDashboard.updatedAt = new Date();
            }
          }),

        setLoading: (loading) =>
          set((state) => {
            state.isLoading = loading;
          }),

        setError: (error) =>
          set((state) => {
            state.error = error;
          }),
      })),
      {
        name: 'dashboard-store',
        partialize: (state) => ({
          dashboards: state.dashboards,
          activeDashboard: state.activeDashboard,
        }),
      }
    ),
    {
      name: 'dashboard-store',
    }
  )
);