import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ProductRecommendation } from '../../lib/userApi';
import LoadingSpinner from '../../components/LoadingSpinner';
import Toast from '../../components/Toast';
import { Star, ShoppingCart, Heart, Sparkles, TrendingUp } from 'lucide-react';
import { useUserAuthStore } from '../../store/userAuthStore';
import { useCartStore } from '../../store/cartStore';
import { selectedModelToStrategy } from '../../lib/recommendationConfig';

type EnrichedRecommendation = ProductRecommendation & {
  image?: string;
  category?: string;
  brand?: string;
};

export default function Recommendations() {
  const [personalizedRecs, setPersonalizedRecs] = useState<EnrichedRecommendation[]>([]);
  const [popularProducts, setPopularProducts] = useState<EnrichedRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [strategy, setStrategy] = useState<'content' | 'collaborative' | 'hybrid'>('content');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const { isAuthenticated } = useUserAuthStore(); // Gardé pour afficher le message si non connecté
  const { incrementItemCount } = useCartStore();

  // Charger les favoris existants
  useEffect(() => {
    if (isAuthenticated) {
      api.getFavorites()
        .then(response => {
          const favoriteIds = new Set<string>(response.data.favorites.map((p: any) => p.itemid));
          setFavorites(favoriteIds);
        })
        .catch(() => {
          // Ignorer les erreurs silencieusement
        });
    }
  }, [isAuthenticated]);

  const fetchRecommendationConfig = async () => {
    try {
      const response = await api.getRecommendationConfig();
      const model = response.data?.selected_model;
      if (model) {
        setStrategy(selectedModelToStrategy(model));
      }
    } catch (error) {
      console.warn('Impossible de récupérer la configuration de recommandation:', error);
    }
  };

  useEffect(() => {
    fetchRecommendationConfig();
  }, []);

  useEffect(() => {
    fetchRecommendations();
  }, [strategy]);

  useEffect(() => {
    fetchPopular();
  }, []);

  const fetchRecommendations = async () => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const response = await api.getUserRecommendations(strategy);
      const recommendations = response.data.recommendations || [];
      
      // Enrichir les recommandations avec les données complètes des produits
      const enrichedRecs = (await Promise.all(
        recommendations.map(async (rec: ProductRecommendation) => {
          try {
            const productResponse = await api.getProduct(rec.itemid);
            const product = productResponse.data;
            return {
              ...rec,
              image: product.image,
              category: product.category,
              brand: product.brand,
              actual_price: product.actual_price,
            };
          } catch (error) {
            // Si le produit n'existe plus, retourner la recommandation sans enrichissement
            return rec as EnrichedRecommendation;
          }
        })
      )) as EnrichedRecommendation[];
      
      setPersonalizedRecs(enrichedRecs);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching recommendations:', error);
      setLoading(false);
    }
  };

  const fetchPopular = async () => {
    try {
      const response = await api.getPopularProducts();
      const popularList = (response.data.popular_products || []) as EnrichedRecommendation[];
      setPopularProducts(popularList);
    } catch (error) {
      console.error('Error fetching popular products:', error);
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
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Recommandations</h1>
          <p className="text-gray-600 mt-1">Découvrez des produits qui pourraient vous plaire</p>
        </div>
        {isAuthenticated && (
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600">Stratégie:</span>
            <select
              value={strategy}
              onChange={(e) => setStrategy(e.target.value as 'content' | 'collaborative' | 'hybrid')}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="content">Content-Based</option>
              <option value="collaborative">Collaborative Filtering</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </div>
        )}
      </div>

      {isAuthenticated ? (
        <>
          {loading ? (
            <LoadingSpinner />
          ) : personalizedRecs.length > 0 ? (
            <div className="mb-12">
              <div className="flex items-center space-x-2 mb-6">
                <Sparkles className="text-blue-600" size={24} />
                <h2 className="text-2xl font-bold text-gray-900">Recommandations personnalisées</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {personalizedRecs.map((rec) => (
                  <div
                    key={rec.itemid}
                    className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow"
                  >
                    <Link to={`/products/${rec.itemid}`}>
                      <div className="aspect-square bg-gray-100 relative">
                        <img
                          src={rec.image || '/placeholder.png'}
                          alt={rec.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = '/placeholder.png';
                          }}
                        />
                        {rec.discount_price < (rec.actual_price || rec.discount_price) && (
                          <div className="absolute top-2 right-2 bg-red-600 text-white px-2 py-1 rounded text-sm font-semibold">
                            -{Math.round((1 - rec.discount_price / (rec.actual_price || rec.discount_price)) * 100)}%
                          </div>
                        )}
                      </div>
                    </Link>
                    <div className="p-4">
                      <Link to={`/products/${rec.itemid}`}>
                        <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2 hover:text-blue-600">
                          {rec.name}
                        </h3>
                      </Link>
                      <div className="flex items-center space-x-1 mb-2">
                        <Star className="text-yellow-400 fill-yellow-400" size={16} />
                        <span className="text-sm text-gray-600">{rec.ratings.toFixed(1)}</span>
                      </div>
                      <div className="flex items-center space-x-2 mb-4">
                        <span className="text-lg font-bold text-gray-900">
                          {rec.discount_price.toLocaleString('fr-FR')} €
                        </span>
                        {rec.actual_price && rec.discount_price < rec.actual_price && (
                          <span className="text-sm text-gray-500 line-through">
                            {rec.actual_price.toLocaleString('fr-FR')} €
                          </span>
                        )}
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleAddToCart(rec.itemid)}
                          className="flex-1 flex items-center justify-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                        >
                          <ShoppingCart size={18} />
                          <span>Ajouter</span>
                        </button>
                        <button
                          onClick={() => handleLike(rec.itemid)}
                          className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                          <Heart 
                            size={18} 
                            className={favorites.has(rec.itemid) ? "text-red-600 fill-red-600" : "text-gray-600"} 
                          />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 p-12 text-center mb-12">
              <Sparkles size={64} className="mx-auto text-gray-400 mb-4" />
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Pas encore de recommandations</h2>
              <p className="text-gray-600 mb-6">Commencez à explorer nos produits pour recevoir des recommandations personnalisées</p>
              <Link
                to="/"
                className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Découvrir les produits
              </Link>
            </div>
          )}
        </>
      ) : (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
          <p className="text-blue-800">
            <strong>Connectez-vous</strong> pour recevoir des recommandations personnalisées basées sur vos préférences et votre historique.
          </p>
        </div>
      )}

      {popularProducts.length > 0 && (
        <div>
          <div className="flex items-center space-x-2 mb-6">
            <TrendingUp className="text-green-600" size={24} />
            <h2 className="text-2xl font-bold text-gray-900">Produits populaires</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {popularProducts.map((product) => (
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
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = '/placeholder.png';
                      }}
                    />
                    {product.discount_price < (product.actual_price || product.discount_price) && (
                      <div className="absolute top-2 right-2 bg-red-600 text-white px-2 py-1 rounded text-sm font-semibold">
                        -{Math.round((1 - product.discount_price / (product.actual_price || product.discount_price)) * 100)}%
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
                    {product.actual_price && product.discount_price < product.actual_price && (
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

