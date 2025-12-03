import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  is_staff?: boolean;
}

interface UserAuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  setUser: (user: User) => void;
}

export const useUserAuthStore = create<UserAuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      isAuthenticated: false,
      login: (token: string, user: User) => {
        localStorage.setItem('userToken', token);
        // Si l'utilisateur est admin, créer aussi un adminToken
        if (user.is_staff) {
          localStorage.setItem('adminToken', token);
        }
        set({ token, user, isAuthenticated: true });
      },
      logout: () => {
        localStorage.removeItem('userToken');
        // Supprimer aussi l'adminToken si présent
        localStorage.removeItem('adminToken');
        set({ token: null, user: null, isAuthenticated: false });
      },
      setUser: (user: User) => {
        set({ user });
      },
    }),
    {
      name: 'user-auth',
    }
  )
);

