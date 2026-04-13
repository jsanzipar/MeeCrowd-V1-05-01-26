import { create } from 'zustand';
import type { FeedTab } from '@/types';

interface FeedState {
  activeTab: FeedTab;
  searchQuery: string;
  setActiveTab: (tab: FeedTab) => void;
  setSearchQuery: (query: string) => void;
}

export const useFeedStore = create<FeedState>((set) => ({
  activeTab: 'for-you',
  searchQuery: '',
  setActiveTab: (tab) => set({ activeTab: tab }),
  setSearchQuery: (query) => set({ searchQuery: query }),
}));
