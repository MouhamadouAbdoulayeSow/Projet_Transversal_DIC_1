import { create } from 'zustand';

interface CartState {
  itemCount: number;
  setItemCount: (count: number) => void;
  incrementItemCount: (amount?: number) => void;
  decrementItemCount: (amount?: number) => void;
  resetCart: () => void;
}

export const useCartStore = create<CartState>((set) => ({
  itemCount: 0,
  setItemCount: (count: number) => set({ itemCount: count }),
  incrementItemCount: (amount: number = 1) => set((state) => ({ itemCount: state.itemCount + amount })),
  decrementItemCount: (amount: number = 1) => set((state) => ({ itemCount: Math.max(0, state.itemCount - amount) })),
  resetCart: () => set({ itemCount: 0 }),
}));

