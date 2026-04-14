import { create } from 'zustand';
import type { FeedTab, SortFilter } from '@/types';

interface FeedState {
  activeTab: FeedTab;
  searchQuery: string;
  activeFilters: SortFilter[];
  selectedCountry: string | null;
  showSortPanel: boolean;
  showCountryPicker: boolean;
  setActiveTab: (tab: FeedTab) => void;
  setSearchQuery: (query: string) => void;
  toggleFilter: (filter: SortFilter) => void;
  clearFilters: () => void;
  setSelectedCountry: (country: string | null) => void;
  setShowSortPanel: (show: boolean) => void;
  toggleSortPanel: () => void;
  setShowCountryPicker: (show: boolean) => void;
}

export const useFeedStore = create<FeedState>((set) => ({
  activeTab: 'upcoming',
  searchQuery: '',
  activeFilters: [],
  selectedCountry: null,
  showSortPanel: false,
  showCountryPicker: false,
  setActiveTab: (tab) => set({ activeTab: tab }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  toggleFilter: (filter) =>
    set((s) => {
      const has = s.activeFilters.includes(filter);
      if (has) {
        const next = s.activeFilters.filter((f) => f !== filter);
        // If removing location, also clear country
        if (filter === 'location') return { activeFilters: next, selectedCountry: null, showSortPanel: false };
        return { activeFilters: next, showSortPanel: false };
      }
      return { activeFilters: [...s.activeFilters, filter], showSortPanel: false };
    }),
  clearFilters: () => set({ activeFilters: [], selectedCountry: null }),
  setSelectedCountry: (country) =>
    set((s) => {
      if (country) {
        const filters = s.activeFilters.includes('location')
          ? s.activeFilters
          : [...s.activeFilters, 'location'];
        return { selectedCountry: country, activeFilters: filters, showCountryPicker: false };
      }
      return {
        selectedCountry: null,
        activeFilters: s.activeFilters.filter((f) => f !== 'location'),
        showCountryPicker: false,
      };
    }),
  setShowSortPanel: (show) => set({ showSortPanel: show }),
  toggleSortPanel: () => set((s) => ({ showSortPanel: !s.showSortPanel, showCountryPicker: false })),
  setShowCountryPicker: (show) => set({ showCountryPicker: show }),
}));
