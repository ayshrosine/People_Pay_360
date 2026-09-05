import { create } from 'zustand';

export interface DashboardFilters {
  period: string;
  departmentId: string | null;
  employeeType: string | null;
}

interface FiltersState extends DashboardFilters {
  setFilter: <K extends keyof DashboardFilters>(key: K, value: DashboardFilters[K]) => void;
  reset: () => void;
}

const INITIAL: DashboardFilters = {
  period: 'this_year',
  departmentId: null,
  employeeType: null,
};

/**
 * Shared by every dashboard widget so the filter bar drives all of them at
 * once, rather than each chart owning a private copy of the same filters.
 */
export const useFiltersStore = create<FiltersState>()((set) => ({
  ...INITIAL,
  setFilter: (key, value) => set({ [key]: value } as Partial<FiltersState>),
  reset: () => set(INITIAL),
}));
