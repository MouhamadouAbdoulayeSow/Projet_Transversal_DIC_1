import { Navigate } from 'react-router-dom';
import { useUserAuthStore } from '../store/userAuthStore';

interface ProtectedUserRouteProps {
  children: React.ReactNode;
}

export default function ProtectedUserRoute({ children }: ProtectedUserRouteProps) {
  const { isAuthenticated } = useUserAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

