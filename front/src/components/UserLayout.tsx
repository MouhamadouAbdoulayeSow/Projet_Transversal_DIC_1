import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ShoppingCart, User, LogOut, Home, Package, Heart, Search, LayoutDashboard } from 'lucide-react';
import { useUserAuthStore } from '../store/userAuthStore';
import { useCartStore } from '../store/cartStore';
import { useState, useEffect } from 'react';
import { api } from '../lib/userApi';

export default function UserLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout, isAuthenticated, user } = useUserAuthStore();
  const { itemCount, setItemCount } = useCartStore();
  const [searchQuery, setSearchQuery] = useState('');

  // Charger le nombre d'articles du panier au montage et quand l'utilisateur se connecte
  useEffect(() => {
    if (isAuthenticated) {
      fetchCartCount();
    } else {
      setItemCount(0);
    }
  }, [isAuthenticated, location.pathname]);

  const fetchCartCount = async () => {
    try {
      const response = await api.getCart();
      const cart = response.data;
      if (cart && cart.items) {
        const totalItems = cart.items.reduce((sum: number, item: any) => sum + item.quantity, 0);
        setItemCount(totalItems);
      } else {
        setItemCount(0);
      }
    } catch (error) {
      // Si erreur (panier vide ou non authentifié), mettre à 0
      setItemCount(0);
    }
  };

  const handleLogout = () => {
    logout();
    setItemCount(0);
    navigate('/');
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery)}`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center space-x-2">
              <div className="bg-blue-600 p-2 rounded-lg">
                <Package className="text-white" size={24} />
              </div>
              <span className="text-xl font-bold text-gray-900">E-Commerce</span>
            </Link>

            {/* Search Bar */}
            <form onSubmit={handleSearch} className="flex-1 max-w-lg mx-8">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Rechercher des produits..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </form>

            {/* Navigation */}
            <nav className="flex items-center space-x-4">
              <Link
                to="/"
                className={`px-4 py-2 rounded-lg transition-colors ${
                  location.pathname === '/'
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Home size={20} />
              </Link>

              <Link
                to="/favorites"
                className={`px-4 py-2 rounded-lg transition-colors ${
                  location.pathname === '/favorites'
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
                title="Mes favoris"
              >
                <Heart size={20} />
              </Link>

              {isAuthenticated ? (
                <>
                  <Link
                    to="/cart"
                    className={`relative px-4 py-2 rounded-lg transition-colors ${
                      location.pathname === '/cart'
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <ShoppingCart size={20} />
                    {itemCount > 0 && (
                      <span className="absolute -top-1 -right-1 bg-red-600 text-white text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1">
                        {itemCount > 99 ? '99+' : itemCount}
                      </span>
                    )}
                  </Link>

                  <div className="relative group">
                    <button className="flex items-center space-x-2 px-4 py-2 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors">
                      <User size={20} />
                      <span className="hidden md:block">{user?.first_name || user?.username}</span>
                    </button>
                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
                      <Link
                        to="/profile"
                        className="block px-4 py-2 text-gray-700 hover:bg-gray-50 rounded-t-lg"
                      >
                        Mon Profil
                      </Link>
                      <Link
                        to="/orders"
                        className="block px-4 py-2 text-gray-700 hover:bg-gray-50"
                      >
                        Mes Commandes
                      </Link>
                      {user?.is_staff && (
                        <Link
                          to="/admin/dashboard"
                          onClick={() => {
                            // Si l'utilisateur n'est pas encore authentifié, sauvegarder la redirection
                            if (!isAuthenticated) {
                              localStorage.setItem('redirectAfterLogin', '/admin/dashboard');
                            }
                          }}
                          className="block px-4 py-2 text-blue-600 hover:bg-blue-50 border-t border-gray-200"
                        >
                          <LayoutDashboard size={16} className="inline mr-2" />
                          Dashboard Admin
                        </Link>
                      )}
                      <button
                        onClick={handleLogout}
                        className="w-full text-left px-4 py-2 text-red-600 hover:bg-red-50 rounded-b-lg"
                      >
                        <LogOut size={16} className="inline mr-2" />
                        Déconnexion
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex items-center space-x-2">
                  <Link
                    to="/login"
                    className="px-4 py-2 text-gray-700 hover:text-blue-600 transition-colors"
                  >
                    Connexion
                  </Link>
                  <Link
                    to="/register"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Inscription
                  </Link>
                </div>
              )}
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main>
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">E-Commerce</h3>
              <p className="text-gray-600 text-sm">
                Votre plateforme de shopping en ligne avec recommandations personnalisées.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Liens utiles</h3>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link to="/" className="text-gray-600 hover:text-blue-600">
                    Accueil
                  </Link>
                </li>
                <li>
                  <Link to="/recommendations" className="text-gray-600 hover:text-blue-600">
                    Recommandations
                  </Link>
                </li>
                {isAuthenticated && (
                  <>
                    <li>
                      <Link to="/orders" className="text-gray-600 hover:text-blue-600">
                        Mes Commandes
                      </Link>
                    </li>
                    <li>
                      <Link to="/profile" className="text-gray-600 hover:text-blue-600">
                        Mon Profil
                      </Link>
                    </li>
                  </>
                )}
              </ul>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Contact</h3>
              <p className="text-gray-600 text-sm">
                Pour toute question, contactez-nous à support@ecommerce.com
              </p>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-gray-200 text-center text-sm text-gray-600">
            © 2025 E-Commerce. Tous droits réservés.
          </div>
        </div>
      </footer>
    </div>
  );
}

