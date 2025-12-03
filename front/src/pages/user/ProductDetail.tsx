import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, Product, ProductRecommendation } from '../../lib/userApi';
import LoadingSpinner from '../../components/LoadingSpinner';
import Toast from '../../components/Toast';
import { Star, ShoppingCart, Heart, ArrowLeft } from 'lucide-react';
import { useCartStore } from '../../store/cartStore';

export default function ProductDetail() {
  const { itemid } = useParams<{ itemid: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [recommendations, setRecommendations] = useState<ProductRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [strategy, setStrategy] = useState<'content' | 'collaborative' | 'hybrid'>('content');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const { incrementItemCount } = useCartStore();

  // Charger les favoris existants
  useEffect(() => {
    const token = localStorage.getItem('userToken');
    if (token) {
      api.getFavorites()
        .then(response => {
          const favoriteIds = new Set(response.data.favorites.map((p: Product) => p.itemid));
          setFavorites(favoriteIds);
        })
        .catch(() => {
          // Ignorer les erreurs silencieusement
        });
    }
  }, []);

  useEffect(() => {
    if (itemid) {
      fetchProduct();
      fetchRecommendations();
    }
  }, [itemid, strategy]);

  const fetchProduct = async () => {
    try {
      setLoading(true);
      const response = await api.getProduct(itemid!);
      setProduct(response.data);
      setLoading(false);
    } catch (error) {
      setToast({ message: 'Erreur lors du chargement du produit', type: 'error' });
      setLoading(false);
    }
  };

  const fetchRecommendations = async () => {
    try {
      const response = await api.getProductRecommendations(itemid!, strategy);
      const recommendations = response.data.recommendations || [];
      
      if (recommendations.length === 0) {
        setRecommendations([]);
        return;
      }
      
      // Enrichir les recommandations avec les données complètes des produits
      const enrichedRecs = await Promise.all(
        recommendations.map(async (rec: ProductRecommendation) => {
          try {
            // Convertir itemid en string pour l'API
            const productId = String(rec.itemid);
            const productResponse = await api.getProduct(productId);
            const product = productResponse.data;
            return {
              ...rec,
              itemid: String(rec.itemid), // S'assurer que itemid est une string
              image: product.image,
              category: product.category,
              brand: product.brand,
              actual_price: product.actual_price,
            };
          } catch (error: any) {
            // Si le produit n'existe plus, retourner la recommandation sans enrichissement
            console.warn(`Produit ${rec.itemid} non trouvé pour enrichissement:`, error.response?.data || error.message);
            return {
              ...rec,
              itemid: String(rec.itemid), // S'assurer que itemid est une string
            };
          }
        })
      );
      
      setRecommendations(enrichedRecs);
    } catch (error: any) {
      console.error('Error fetching recommendations:', error);
      setToast({ 
        message: error.response?.data?.error || 'Erreur lors du chargement des recommandations', 
        type: 'error' 
      });
      setRecommendations([]);
    }
  };

  const handleAddToCart = async () => {
    try {
      await api.addToCart({ product_id: itemid!, quantity });
      incrementItemCount(quantity);
      setToast({ message: `Produit ajouté au panier (${quantity}) !`, type: 'success' });
    } catch (error: any) {
      // Si c'est une erreur 401, l'intercepteur va gérer la redirection vers login
      if (error.response?.status === 401) {
        return;
      }
      const errorMessage = error.response?.data?.error || 'Erreur lors de l\'ajout au panier';
      setToast({ message: errorMessage, type: 'error' });
    }
  };

  const handleLike = async () => {
    try {
      const isFavorite = favorites.has(itemid!);
      if (isFavorite) {
        // Retirer des favoris
        await api.removeFavorite(itemid!);
        setFavorites(prev => {
          const newSet = new Set(prev);
          newSet.delete(itemid!);
          return newSet;
        });
        setToast({ message: 'Produit retiré des favoris', type: 'success' });
      } else {
        // Ajouter aux favoris
        const response = await api.recordInteraction({ product_id: itemid!, interaction_type: 'like' });
        console.log('Like response:', response);
        setFavorites(prev => new Set(prev).add(itemid!));
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

  const handleRecAddToCart = async (productId: string) => {
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

  const handleRecLike = async (productId: string) => {
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
        await api.recordInteraction({ product_id: productId, interaction_type: 'like' });
        setFavorites(prev => new Set(prev).add(productId));
        setToast({ message: 'Produit ajouté aux favoris !', type: 'success' });
      }
    } catch (error: any) {
      // Si c'est une erreur 401, l'intercepteur va gérer la redirection vers login
      if (error.response?.status === 401) {
        return;
      }
      setToast({ message: 'Erreur lors de la modification des favoris', type: 'error' });
    }
  };

  if (loading) return <LoadingSpinner />;
  if (!product) return <div className="text-center py-16">Produit introuvable</div>;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link
        to="/"
        className="inline-flex items-center space-x-2 text-gray-600 hover:text-blue-600 mb-6"
      >
        <ArrowLeft size={20} />
        <span>Retour au catalogue</span>
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
        {/* Product Image */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
            <img
              src={product.image || '/placeholder.png'}
              alt={product.name}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).src = '/placeholder.png';
              }}
            />
          </div>
        </div>

        {/* Product Info */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="mb-4">
            {product.category && (
              <span className="inline-block px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium mb-2">
                {product.category}
              </span>
            )}
            {product.brand && (
              <span className="inline-block px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm font-medium mb-2 ml-2">
                {product.brand}
              </span>
            )}
          </div>

          <h1 className="text-3xl font-bold text-gray-900 mb-4">{product.name}</h1>

          <div className="flex items-center space-x-2 mb-6">
            <div className="flex items-center">
              {[...Array(5)].map((_, i) => (
                <Star
                  key={i}
                  className={`${i < Math.floor(product.ratings) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}`}
                  size={20}
                />
              ))}
            </div>
            <span className="text-gray-600">({product.ratings.toFixed(1)})</span>
          </div>

          <div className="mb-6">
            <div className="flex items-center space-x-4 mb-2">
              <span className="text-3xl font-bold text-gray-900">
                {product.discount_price.toLocaleString('fr-FR')} €
              </span>
              {product.discount_price < product.actual_price && (
                <span className="text-xl text-gray-500 line-through">
                  {product.actual_price.toLocaleString('fr-FR')} €
                </span>
              )}
            </div>
            {product.discount_price < product.actual_price && (
              <p className="text-green-600 font-medium">
                Économisez {((product.actual_price - product.discount_price).toLocaleString('fr-FR'))} €
              </p>
            )}
          </div>

          {product.description && (
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Description</h2>
              <p className="text-gray-600">{product.description}</p>
            </div>
          )}

          <div className="mb-6">
            <div className="flex items-center space-x-4 mb-4">
              <label className="text-sm font-medium text-gray-700">Quantité</label>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  -
                </button>
                <span className="px-4 py-1 border border-gray-300 rounded-lg min-w-[60px] text-center">
                  {quantity}
                </span>
                <button
                  onClick={() => setQuantity(Math.min(product.stock_quantity, quantity + 1))}
                  className="px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  +
                </button>
              </div>
              <span className="text-sm text-gray-600">
                {product.stock_quantity} en stock
              </span>
            </div>
          </div>

          <div className="flex space-x-4">
            <button
              onClick={handleAddToCart}
              className="flex-1 flex items-center justify-center space-x-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <ShoppingCart size={20} />
              <span>Ajouter au panier</span>
            </button>
            <button
              onClick={handleLike}
              className="p-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Heart 
                size={20} 
                className={favorites.has(itemid!) ? "text-red-600 fill-red-600" : "text-gray-600"} 
              />
            </button>
          </div>
        </div>
      </div>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-8">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Produits similaires</h2>
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
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {recommendations.map((rec) => (
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
                      onClick={(e) => {
                        e.preventDefault();
                        handleRecAddToCart(rec.itemid);
                      }}
                      className="flex-1 flex items-center justify-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <ShoppingCart size={18} />
                      <span>Ajouter</span>
                    </button>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        handleRecLike(rec.itemid);
                      }}
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

