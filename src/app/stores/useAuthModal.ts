import { create } from "zustand";

type Mode = "login" | "signup";

type AuthModalState = {
  open: boolean;
  mode: Mode;
  openLogin: () => void;
  openSignup: () => void;
  close: () => void;
  setMode: (m: Mode) => void;
};

export const useAuthModal = create<AuthModalState>((set) => ({
  open: false,
  mode: "login",
  openLogin: () => set({ open: true, mode: "login" }),
  openSignup: () => set({ open: true, mode: "signup" }),
  close: () => set({ open: false }),
  setMode: (m) => set({ mode: m }),
}));
