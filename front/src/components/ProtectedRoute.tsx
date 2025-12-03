import { Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { useUserAuthStore } from '../store/userAuthStore';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const adminToken = localStorage.getItem('adminToken');
  const userToken = localStorage.getItem('userToken');
  const user = useUserAuthStore((state) => state.user);
  const login = useAuthStore((state) => state.login);
  
  // Vérifier si l'utilisateur est admin et a un token
  const isAdminWithToken = user?.is_staff && userToken;

  // Synchroniser le store admin si l'utilisateur est admin connecté
  useEffect(() => {
    if (isAdminWithToken && !isAuthenticated && !adminToken && userToken) {
      // Initialiser le store admin avec le token utilisateur
      login(userToken);
    }
  }, [isAdminWithToken, isAuthenticated, adminToken, userToken, login]);

  if (!isAuthenticated && !adminToken && !isAdminWithToken) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
