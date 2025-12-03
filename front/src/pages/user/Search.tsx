import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { api } from '../../lib/userApi';
import LoadingSpinner from '../../components/LoadingSpinner';
import Toast from '../../components/Toast';
import { Star, ShoppingCart, Heart, Search as SearchIcon } from 'lucide-react';
import { useCartStore } from '../../store/cartStore';

export default function Search() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const { incrementItemCount } = useCartStore();

  // Charger les favoris existants
  useEffect(() => {
    const token = localStorage.getItem('userToken');
    if (token) {
      api.getFavorites()
        .then(response => {
          const favoriteIds = new Set(response.data.favorites.map((p: any) => p.itemid));
          setFavorites(favoriteIds);
        })
        .catch(() => {
          // Ignorer les erreurs silencieusement
        });
    }
  }, []);

  useEffect(() => {
    if (query) {
      performSearch();
    }
  }, [query]);

  const performSearch = async () => {
    setLoading(true);
    try {
      const response = await api.search(query);
      setResults(response.data.results || []);
    } catch (error) {
      setToast({ message: 'Erreur lors de la recherche', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleAddToCart = async (productId: string) => {
    try {
      await api.addToCart({ product_id: productId, quantity: 1 });
      incrementItemCount(1);
      setToast({ message: 'Produit ajouté au panier !', type: 'success' });
    } catch (error: any) {
      // Si c'est une erreur 401, l'intercepteur va gérer la redirection vers login
      if (error.response?.status === 401) {
        return;
      }
      const errorMessage = error.response?.data?.error || 'Erreur lors de l\'ajout au panier';
      setToast({ message: errorMessage, type: 'error' });
    }
  };

  const handleLike = async (productId: string) => {
    try {
      const isFavorite = favorites.has(productId);
      if (isFavorite) {
        // Retirer des favoris
        await api.removeFavorite(productId);
        setFavorites(prev => {
          const newSet = new Set(prev);
          newSet.delete(productId);
          return newSet;
        });
        setToast({ message: 'Produit retiré des favoris', type: 'success' });
      } else {
        // Ajouter aux favoris
        const response = await api.recordInteraction({ product_id: productId, interaction_type: 'like' });
        console.log('Like response:', response);
        setFavorites(prev => new Set(prev).add(productId));
        setToast({ message: 'Produit ajouté aux favoris !', type: 'success' });
      }
    } catch (error: any) {
      // Si c'est une erreur 401, l'intercepteur va gérer la redirection vers login
      if (error.response?.status === 401) {
        return;
      }
      const errorMessage = error.response?.data?.error || error.response?.data?.message || 'Erreur lors de la modification des favoris';
      console.error('Erreur ajout favori:', error);
      setToast({ message: errorMessage, type: 'error' });
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <div className="flex items-center space-x-2 mb-2">
          <SearchIcon className="text-blue-600" size={24} />
          <h1 className="text-3xl font-bold text-gray-900">Résultats de recherche</h1>
        </div>
        {query && (
          <p className="text-gray-600">
            Recherche pour: <span className="font-semibold">"{query}"</span>
          </p>
        )}
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : results.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <SearchIcon size={64} className="mx-auto text-gray-400 mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Aucun résultat</h2>
          <p className="text-gray-600">Essayez avec d'autres mots-clés</p>
        </div>
      ) : (
        <>
          <p className="text-gray-600 mb-6">{results.length} résultat{results.length > 1 ? 's' : ''} trouvé{results.length > 1 ? 's' : ''}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {results.map((product) => (
              <div
                key={product.itemid}
                className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow"
              >
                <Link to={`/products/${product.itemid}`}>
                  <div className="aspect-square bg-gray-100 relative">
                    <img
                      src={product.image || '/placeholder.png'}
                      alt={product.name}
                      className="w-full h-full object-cover"
                    />
                    {product.score && (
                      <div className="absolute top-2 left-2 bg-blue-600 text-white px-2 py-1 rounded text-xs font-semibold">
                        Score: {(product.score * 100).toFixed(0)}%
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
                  <div className="mb-4">
                    <span className="text-lg font-bold text-gray-900">
                      {product.discount_price.toLocaleString('fr-FR')} €
                    </span>
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
                      onClick={() => handleLike(product.itemid)}
                      className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <Heart 
                        size={18} 
                        className={favorites.has(product.itemid) ? "text-red-600 fill-red-600" : "text-gray-600"} 
                      />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
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

