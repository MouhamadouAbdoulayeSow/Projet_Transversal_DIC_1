import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, Product } from '../../lib/userApi';
import LoadingSpinner from '../../components/LoadingSpinner';
import Toast from '../../components/Toast';
import { Star, ShoppingCart, Heart, Trash2 } from 'lucide-react';
import { useCartStore } from '../../store/cartStore';
import { useUserAuthStore } from '../../store/userAuthStore';

export default function Favorites() {
  const [favorites, setFavorites] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const { isAuthenticated } = useUserAuthStore();
  const { incrementItemCount } = useCartStore();

  useEffect(() => {
    if (isAuthenticated) {
      fetchFavorites();
    } else {
      setLoading(false);
    }
  }, [isAuthenticated]);

  const fetchFavorites = async () => {
    try {
      setLoading(true);
      const response = await api.getFavorites();
      setFavorites(response.data.favorites || []);
      setLoading(false);
    } catch (error: any) {
      setToast({ 
        message: error.response?.data?.error || 'Erreur lors du chargement des favoris', 
        type: 'error' 
      });
      setLoading(false);
    }
  };

  const handleAddToCart = async (productId: string) => {
    try {
      await api.addToCart({ product_id: productId, quantity: 1 });
      incrementItemCount(1);
      setToast({ message: 'Produit ajouté au panier !', type: 'success' });
    } catch (error: any) {
      if (error.response?.status === 401) {
        return;
      }
      const errorMessage = error.response?.data?.error || 'Erreur lors de l\'ajout au panier';
      setToast({ message: errorMessage, type: 'error' });
    }
  };

  const handleRemoveFavorite = async (productId: string) => {
    try {
      await api.removeFavorite(productId);
      setFavorites(prev => prev.filter(p => p.itemid !== productId));
      setToast({ message: 'Produit retiré des favoris', type: 'success' });
    } catch (error: any) {
      if (error.response?.status === 401) {
        return;
      }
      const errorMessage = error.response?.data?.error || error.response?.data?.message || 'Erreur lors de la suppression du favori';
      console.error('Erreur suppression favori:', error);
      setToast({ message: errorMessage, type: 'error' });
    }
  };

  const handleClearAllFavorites = async () => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer tous vos favoris ?')) {
      return;
    }
    try {
      await api.clearAllFavorites();
      setFavorites([]);
      setToast({ message: 'Tous les favoris ont été supprimés', type: 'success' });
    } catch (error: any) {
      if (error.response?.status === 401) {
        return;
      }
      const errorMessage = error.response?.data?.error || error.response?.data?.message || 'Erreur lors de la suppression des favoris';
      console.error('Erreur suppression tous favoris:', error);
      setToast({ message: errorMessage, type: 'error' });
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-8 text-center">
          <Heart size={64} className="mx-auto text-blue-400 mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Connectez-vous pour voir vos favoris</h2>
          <p className="text-gray-600 mb-6">Créez un compte ou connectez-vous pour sauvegarder vos produits favoris</p>
          <div className="flex justify-center space-x-4">
            <Link
              to="/login"
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Connexion
            </Link>
            <Link
              to="/register"
              className="px-6 py-3 bg-white text-blue-600 border border-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
            >
              Inscription
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Mes Favoris</h1>
          <p className="text-gray-600 mt-1">
            {favorites.length > 0 
              ? `${favorites.length} produit${favorites.length > 1 ? 's' : ''} dans vos favoris`
              : 'Aucun produit dans vos favoris'}
          </p>
        </div>
        {favorites.length > 0 && (
          <button
            onClick={handleClearAllFavorites}
            className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            <Trash2 size={20} />
            <span>Supprimer tout</span>
          </button>
        )}
      </div>

      {/* Products Grid */}
      {loading ? (
        <LoadingSpinner />
      ) : favorites.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <Heart size={64} className="mx-auto text-gray-400 mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Aucun favori</h2>
          <p className="text-gray-600 mb-6">Commencez à ajouter des produits à vos favoris en cliquant sur le cœur</p>
          <Link
            to="/"
            className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Découvrir les produits
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {favorites.map((product, index) => (
            <div
              key={`${product.itemid}-${index}`}
              className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow"
            >
              <Link to={`/products/${product.itemid}`}>
                <div className="aspect-square bg-gray-100 relative">
                  <img
                    src={product.image || '/placeholder.png'}
                    alt={product.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = '/placeholder.png';
                    }}
                  />
                  {product.discount_price < product.actual_price && (
                    <div className="absolute top-2 right-2 bg-red-600 text-white px-2 py-1 rounded text-sm font-semibold">
                      -{Math.round((1 - product.discount_price / product.actual_price) * 100)}%
                    </div>
                  )}
                </div>
              </Link>
              <div className="p-4">
                <Link to={`/products/${product.itemid}`}>
                  <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2 hover:text-blue-600">
                    {product.name}
                  </h3>
                </Link>
                <div className="flex items-center space-x-1 mb-2">
                  <Star className="text-yellow-400 fill-yellow-400" size={16} />
                  <span className="text-sm text-gray-600">{product.ratings.toFixed(1)}</span>
                </div>
                <div className="flex items-center space-x-2 mb-4">
                  <span className="text-lg font-bold text-gray-900">
                    {product.discount_price.toLocaleString('fr-FR')} €
                  </span>
                  {product.discount_price < product.actual_price && (
                    <span className="text-sm text-gray-500 line-through">
                      {product.actual_price.toLocaleString('fr-FR')} €
                    </span>
                  )}
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleAddToCart(product.itemid)}
                    className="flex-1 flex items-center justify-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <ShoppingCart size={18} />
                    <span>Ajouter</span>
                  </button>
                  <button
                    onClick={() => handleRemoveFavorite(product.itemid)}
                    className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    title="Retirer des favoris"
                  >
                    <Heart size={18} className="text-red-600 fill-red-600" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}

