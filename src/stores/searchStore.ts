import { create } from "zustand";
import type { SearchMatch } from "@/tauri/search";

export type SearchMode = "files" | "commands" | "symbols" | "fulltext" | "goto";

export type SearchResult =
  | { type: "file"; path: string; name: string; dir: string }
  | { type: "command"; id: string; label: string; category: string; action: () => void; keybinding?: string; icon?: React.ReactNode }
  | { type: "symbol"; name: string; kind: string; line: number }
  | { type: "fulltext"; match: SearchMatch }
  | { type: "goto"; line: number };

interface SearchState {
  query: string;
  results: SearchResult[];
  activeIndex: number;
  isDropdownOpen: boolean;
  isLoading: boolean;

  setQuery: (q: string) => void;
  setResults: (r: SearchResult[]) => void;
  setActiveIndex: (i: number) => void;
  setDropdownOpen: (o: boolean) => void;
  setIsLoading: (l: boolean) => void;
  focusSearch: (prefix?: string) => void;
  reset: () => void;
}

export const useSearchStore = create<SearchState>((set) => ({
  query: "",
  results: [],
  activeIndex: 0,
  isDropdownOpen: false,
  isLoading: false,

  setQuery: (query) => set({ query, activeIndex: 0 }),
  setResults: (results) => set({ results, activeIndex: 0 }),
  setActiveIndex: (activeIndex) => set({ activeIndex }),
  setDropdownOpen: (isDropdownOpen) => set({ isDropdownOpen }),
  setIsLoading: (isLoading) => set({ isLoading }),

  focusSearch: (prefix = "") => {
    set({ query: prefix, isDropdownOpen: true, activeIndex: 0 });
    setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>('[data-search-bar-input]');
      input?.focus();
    }, 0);
  },

  reset: () => set({ query: "", results: [], activeIndex: 0, isDropdownOpen: false, isLoading: false }),
}));
