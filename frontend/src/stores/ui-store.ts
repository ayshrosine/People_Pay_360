import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type Theme = 'dark' | 'light' | 'system';
export type EmployeeView = 'kanban' | 'list';

interface UiState {
  theme: Theme;
  employeeView: EmployeeView;
  attendanceWidgetOpen: boolean;
  setTheme: (theme: Theme) => void;
  setEmployeeView: (view: EmployeeView) => void;
  setAttendanceWidgetOpen: (open: boolean) => void;
}

/** Per-viewer conveniences only - nothing here is authoritative state. */
export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      theme: 'dark',
      employeeView: 'kanban',
      attendanceWidgetOpen: false,
      setTheme: (theme) => set({ theme }),
      setEmployeeView: (employeeView) => set({ employeeView }),
      setAttendanceWidgetOpen: (attendanceWidgetOpen) => set({ attendanceWidgetOpen }),
    }),
    { name: 'peoplepay360.ui', storage: createJSONStorage(() => localStorage) },
  ),
);
