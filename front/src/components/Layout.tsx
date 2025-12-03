import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, Package, Settings, LogOut, Activity, List, Clock, Network, UserSearch } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const logout = useAuthStore((state) => state.logout);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { path: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/admin/users/list', icon: List, label: 'Users List' },
    { path: '/admin/users', icon: Users, label: 'User Analysis' },
    { path: '/admin/users/cf', icon: UserSearch, label: 'CF User Analysis' },
    { path: '/admin/interactions', icon: Clock, label: 'Interactions' },
    { path: '/admin/products', icon: Package, label: 'Product Debug' },
    { path: '/admin/products/cf', icon: Network, label: 'CF Product Debug' },
    { path: '/admin/metrics', icon: Activity, label: 'Metrics Detail' },
    { path: '/admin/config', icon: Settings, label: 'Configuration' },
  ];

  return (
    <div className="flex h-screen bg-gray-50">
      <aside className="w-64 bg-white border-r border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-xl font-bold text-gray-900">Reco Admin</h1>
          <p className="text-sm text-gray-500 mt-1">Recommendation System</p>
        </div>

        <nav className="p-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path || 
              (item.path === '/admin/users' && location.pathname.startsWith('/admin/users/') && !location.pathname.startsWith('/admin/users/list') && !location.pathname.startsWith('/admin/users/cf')) ||
              (item.path === '/admin/products' && location.pathname.startsWith('/admin/products') && !location.pathname.startsWith('/admin/products/cf'));

            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Icon size={20} />
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="absolute bottom-0 w-64 p-4 border-t border-gray-200">
          <button
            onClick={handleLogout}
            className="flex items-center space-x-3 px-4 py-3 w-full text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <LogOut size={20} />
            <span className="font-medium">Logout</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
