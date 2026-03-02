import { Navigate } from 'react-router-dom';

interface ProtectedRouteProps {
  children: React.ReactNode;
  isAuthenticated: boolean;
  requireAdmin?: boolean;
  isAdmin?: boolean;
}

/**
 * ProtectedRoute - Wraps routes that require authentication
 *
 * Uses React state (not localStorage) to avoid race conditions
 */
const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  isAuthenticated,
  requireAdmin = false,
  isAdmin = false,
}) => {
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requireAdmin && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
