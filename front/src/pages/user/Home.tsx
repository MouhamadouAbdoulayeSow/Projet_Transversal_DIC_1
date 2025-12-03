import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, Product } from '../../lib/userApi';
import LoadingSpinner from '../../components/LoadingSpinner';
import Toast from '../../components/Toast';
import { Star, ShoppingCart, Heart, Filter } from 'lucide-react';
import { useCartStore } from '../../store/cartStore';
import { useUserAuthStore } from '../../store/userAuthStore';
import { selectedModelToStrategy } from '../../lib/recommendationConfig';
import { RecommendationModel } from '../../types';

export default function Home() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [useRecommendations, setUseRecommendations] = useState(true); // Utiliser les recommandations par défaut
  const [displayMode, setDisplayMode] = useState<'recommendations' | 'popular' | 'all'>('recommendations');
  const [strategy, setStrategy] = useState<'content' | 'collaborative' | 'hybrid'>('hybrid');
  const { isAuthenticated } = useUserAuthStore();
  const [filters, setFilters] = useState({
    category: '',
    brand: '',
    min_price: '',
    max_price: '',
    ordering: '-created_at',
    search: '',
  });
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const { incrementItemCount } = useCartStore();
  const [selectedModel, setSelectedModel] = useState<RecommendationModel>('hybrid');
  const [modelRecommendations, setModelRecommendations] = useState<Product[]>([]);
  const MODEL_CHUNK_SIZE = 20;
  const [modelLimit, setModelLimit] = useState(MODEL_CHUNK_SIZE);
  const [modelRecsLoading, setModelRecsLoading] = useState(false);
  const [modelRecsError, setModelRecsError] = useState<string | null>(null);

  // Vérifier si des filtres sont appliqués (hors tri par défaut)
  const hasActiveFilters = filters.category || filters.brand || filters.min_price || filters.max_price || filters.search;

  const fetchModelRecommendations = async (
    limitOverride?: number,
    modelOverride?: RecommendationModel
  ) => {
    const limitToUse = limitOverride ?? modelLimit;
    const modelStrategy = selectedModelToStrategy(modelOverride ?? selectedModel);
    try {
      setModelRecsLoading(true);
      const response = await api.getModelRecommendations({
        model: modelStrategy,
        limit: limitToUse,
      });
      setModelLimit(limitToUse);
      setModelRecommendations(response.data.recommendations || []);
      setModelRecsError(null);
    } catch (error: any) {
      console.error('Erreur lors de la récupération des recommandations publiques:', error);
      setModelRecsError('Impossible de charger les recommandations du modèle sélectionné.');
    } finally {
      setModelRecsLoading(false);
    }
  };

  const handleLoadMoreModelRecommendations = () => {
    const nextLimit = (modelRecommendations.length || modelLimit) + MODEL_CHUNK_SIZE;
    fetchModelRecommendations(nextLimit);
  };

  const fetchRecommendationConfig = async () => {
    try {
      const response = await api.getRecommendationConfig();
      const backendModel = (response.data?.selected_model || 'hybrid') as RecommendationModel;
      setSelectedModel(backendModel);
      setStrategy(selectedModelToStrategy(backendModel));
      setModelLimit(MODEL_CHUNK_SIZE);
      fetchModelRecommendations(MODEL_CHUNK_SIZE, backendModel);
    } catch (error) {
      setToast({ message: 'Failed to load configuration', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const fetchRecommendations = async () => {
    try {
      setLoading(true);
      // Ne pas modifier products pendant l'enrichissement pour éviter les re-renders
      let recommendations: Product[] = [];

      if (isAuthenticated) {
        // Utilisateur connecté : recommandations personnalisées
        try {
          const response = await api.getUserRecommendations(strategy);
          if (response.data && response.data.recommendations && Array.isArray(response.data.recommendations)) {
            // Enrichir les recommandations avec les données complètes des produits
            // Utiliser Promise.allSettled pour ne mettre à jour qu'une fois à la fin
            const enrichedRecs = await Promise.allSettled(
              response.data.recommendations.map(async (rec: any) => {
                try {
                  // Récupérer les données complètes du produit depuis l'API
                  const productId = String(rec.itemid);
                  const productResponse = await api.getProduct(productId);
                  const product = productResponse.data;

                  // S'assurer que l'image est bien présente
                  if (!product.image) {
                    console.warn(`Produit ${productId} n'a pas d'image dans la base de données`);
                  }

                  return {
                    itemid: String(product.itemid),
                    name: product.name,
                    image: product.image || '/placeholder.png',
                    ratings: product.ratings || 0,
                    discount_price: typeof product.discount_price === 'string'
                      ? parseFloat(product.discount_price)
                      : (product.discount_price || 0),
                    actual_price: typeof product.actual_price === 'string'
                      ? parseFloat(product.actual_price)
                      : (product.actual_price || product.discount_price || 0),
                    description: product.description,
                    category: product.category,
                    brand: product.brand,
                    in_stock: product.in_stock !== undefined ? product.in_stock : true,
                    stock_quantity: product.stock_quantity || 0,
                  };
                } catch (error: any) {
                  // Si le produit n'existe plus ou erreur, logger et retourner null pour le filtrer
                  console.error(`Erreur lors de l'enrichissement du produit ${rec.itemid}:`, error);
                  // Réessayer une fois avec l'itemid tel quel (sans conversion)
                  try {
                    const productResponse = await api.getProduct(rec.itemid);
                    const product = productResponse.data;
                    return {
                      itemid: String(product.itemid),
                      name: product.name,
                      image: product.image || '/placeholder.png',
                      ratings: product.ratings || 0,
                      discount_price: typeof product.discount_price === 'string'
                        ? parseFloat(product.discount_price)
                        : (product.discount_price || 0),
                      actual_price: typeof product.actual_price === 'string'
                        ? parseFloat(product.actual_price)
                        : (product.actual_price || product.discount_price || 0),
                      description: product.description,
                      category: product.category,
                      brand: product.brand,
                      in_stock: product.in_stock !== undefined ? product.in_stock : true,
                      stock_quantity: product.stock_quantity || 0,
                    };
                  } catch (retryError: any) {
                    console.error(`Échec du réessai pour le produit ${rec.itemid}:`, retryError);
                    return null; // Filtrer ce produit
                  }
                }
              })
            );

            // Filtrer les produits qui ont échoué et extraire les valeurs réussies
            recommendations = enrichedRecs
              .filter((result): result is PromiseFulfilledResult<Product> =>
                result.status === 'fulfilled' && result.value !== null
              )
              .map(result => result.value);

            // Ne mettre à jour qu'une seule fois après l'enrichissement complet
            if (recommendations.length > 0) {
              // Utiliser une fonction de mise à jour pour éviter les re-renders multiples
              setProducts(() => recommendations);
              setHasMore(false);
              setDisplayMode('recommendations');
              setLoading(false);
              return;
            }
          }
        } catch (error: any) {
          console.warn('Erreur recommandations personnalisées, fallback vers produits populaires:', error);
        }
      }

      // Si pas de recommandations personnalisées, utiliser les produits populaires
      if (recommendations.length === 0) {
        try {
          const response = await api.getPopularProducts();
          if (response.data && response.data.popular_products && Array.isArray(response.data.popular_products)) {
            recommendations = response.data.popular_products.map((prod: any) => ({
              itemid: String(prod.itemid),
              name: prod.name,
              image: prod.image || '/placeholder.png',
              ratings: prod.ratings || 0,
              discount_price: prod.discount_price || 0,
              actual_price: prod.actual_price || prod.discount_price || 0,
              description: prod.description,
              category: prod.category,
              brand: prod.brand,
              in_stock: true,
              stock_quantity: 0,
            }));

            if (recommendations.length > 0) {
              setProducts(() => recommendations);
              setHasMore(false);
              setDisplayMode('popular');
              setLoading(false);
              return; // Sortir de la fonction
            }
          }
        } catch (error: any) {
          console.warn('Erreur produits populaires, fallback vers liste complète:', error);
        }
      }

      // Si toujours pas de résultats, utiliser la liste complète
      if (recommendations.length === 0) {
        await fetchProducts(true);
        setDisplayMode('all');
      }
    } catch (error: any) {
      // Fallback vers liste complète en cas d'erreur
      await fetchProducts(true);
      setDisplayMode('all');
    }
  };

  const fetchProducts = async (reset = false) => {
    try {
      setLoading(true);
      const currentPage = reset ? 1 : page;
      const response = await api.getProducts({
        page: currentPage,
        page_size: 20,
        ...(filters.category && { category: filters.category }),
        ...(filters.brand && { brand: filters.brand }),
        ...(filters.min_price && { min_price: parseFloat(filters.min_price) }),
        ...(filters.max_price && { max_price: parseFloat(filters.max_price) }),
        ...(filters.ordering && { ordering: filters.ordering }),
        ...(filters.search && { search: filters.search }),
      });

      // Gérer la pagination DRF qui retourne {count, next, previous, results: [...]}
      let data = [];
      if (Array.isArray(response.data)) {
        data = response.data;
      } else if (response.data && response.data.results) {
        data = response.data.results;
      } else if (response.data && Array.isArray(response.data)) {
        data = response.data;
      }

      if (reset) {
        setProducts(data);
      } else {
        setProducts([...products, ...data]);
      }

      // Vérifier s'il y a une page suivante
      const hasNext = response.data?.next !== null && response.data?.next !== undefined;
      setHasMore(hasNext || data.length === 20);
      setLoading(false);
    } catch (error: any) {
      setToast({ message: error.response?.data?.error || 'Erreur lors du chargement des produits', type: 'error' });
      setLoading(false);
    }
  };

  // Charger les favoris existants
  useEffect(() => {
    if (isAuthenticated) {
      api.getFavorites()
        .then(response => {
          const favoriteIds = new Set<string>(response.data.favorites.map((p: Product) => p.itemid));
          setFavorites(favoriteIds);
        })
        .catch(() => {
          // Ignorer les erreurs silencieusement
        });
    }
  }, [isAuthenticated]);

  useEffect(() => {
    fetchRecommendationConfig();
  }, []);

  useEffect(() => {
    setPage(1);
    // Si des filtres sont appliqués, utiliser la liste complète avec filtres
    // Sinon, utiliser les recommandations
    if (hasActiveFilters || !useRecommendations) {
      fetchProducts(true);
      setDisplayMode('all');
    } else {
      fetchRecommendations();
    }
  }, [filters, isAuthenticated, useRecommendations, strategy]);

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

  const clearFilters = () => {
    setFilters({
      category: '',
      brand: '',
      min_price: '',
      max_price: '',
      ordering: '-created_at',
      search: '',
    });
    setPage(1);
  };

  const categories = Array.from(new Set(products.map(p => p.category).filter(Boolean)));
  const brands = Array.from(new Set(products.map(p => p.brand).filter(Boolean)));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            {displayMode === 'recommendations' ? 'Recommandations pour vous' :
              displayMode === 'popular' ? 'Produits populaires' :
                'Catalogue Produits'}
          </h1>
          <p className="text-gray-600 mt-1">
            {displayMode === 'recommendations' ? 'Découvrez nos suggestions personnalisées' :
              displayMode === 'popular' ? 'Les produits les plus appréciés' :
                'Découvrez notre sélection de produits'}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          {!hasActiveFilters && (
            <button
              onClick={() => {
                setUseRecommendations(!useRecommendations);
                if (!useRecommendations) {
                  fetchRecommendations();
                } else {
                  fetchProducts(true);
                }
              }}
              className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm"
            >
              {useRecommendations ? 'Voir tout' : 'Recommandations'}
            </button>
          )}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center space-x-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Filter size={20} />
            <span>Filtres</span>
          </button>
        </div>
      </div>

      {(modelRecommendations.length > 0 || modelRecsLoading) && (
        <section className="mb-8 bg-white rounded-lg border border-gray-200 p-6">
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-gray-900">
              Recommandations ({selectedModel.replace('-', ' ')})
            </h2>
            <p className="text-sm text-gray-600">
              Produits sélectionnés automatiquement par l'administrateur en fonction du modèle actuel.
            </p>
          </div>
          {modelRecsLoading ? (
            <div className="flex justify-center py-8">
              <LoadingSpinner />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {modelRecommendations.map((product) => (
                <div
                  key={`model-${product.itemid}`}
                  className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow"
                >
                  <Link to={`/products/${product.itemid}`}>
                    <div className="aspect-square bg-white relative">
                      <img
                        src={product.image || '/placeholder.png'}
                        alt={product.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = '/placeholder.png';
                        }}
                      />
                    </div>
                  </Link>
                  <div className="p-3 space-y-1">
                    <Link to={`/products/${product.itemid}`}>
                      <h3 className="font-semibold text-gray-900 text-sm line-clamp-2 hover:text-blue-600">
                        {product.name}
                      </h3>
                    </Link>
                    <div className="flex items-center space-x-2 text-sm text-gray-600">
                      <Star className="text-yellow-400 fill-yellow-400" size={14} />
                      <span>{product.ratings.toFixed(1)}</span>
                    </div>
                    <div className="flex items-center space-x-2 text-sm">
                      <span className="font-semibold text-gray-900">
                        {product.discount_price.toLocaleString('fr-FR')} €
                      </span>
                      {product.actual_price && product.discount_price < product.actual_price && (
                        <span className="text-gray-500 line-through">
                          {product.actual_price.toLocaleString('fr-FR')} €
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {modelRecsError && (
            <p className="text-sm text-red-600 mt-4">
              {modelRecsError}
            </p>
          )}
          <div className="mt-6 flex justify-center">
            <button
              onClick={handleLoadMoreModelRecommendations}
              disabled={modelRecsLoading}
              className="inline-flex items-center justify-center px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 transition-colors text-sm font-medium"
            >
              {modelRecsLoading ? 'Chargement...' : 'Voir plus'}
            </button>
          </div>
        </section>
      )}

      {/* Filters */}
      {showFilters && (
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Filtres</h2>
            <button
              onClick={clearFilters}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              Réinitialiser
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Recherche</label>
              <input
                type="text"
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                placeholder="Rechercher..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Catégorie</label>
              <select
                value={filters.category}
                onChange={(e) => setFilters({ ...filters, category: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Toutes</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Marque</label>
              <select
                value={filters.brand}
                onChange={(e) => setFilters({ ...filters, brand: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Toutes</option>
                {brands.map((brand) => (
                  <option key={brand} value={brand}>{brand}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Tri</label>
              <select
                value={filters.ordering}
                onChange={(e) => setFilters({ ...filters, ordering: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="-created_at">Plus récent</option>
                <option value="name">Nom A-Z</option>
                <option value="-name">Nom Z-A</option>
                <option value="-ratings">Mieux notés</option>
                <option value="ratings">Moins bien notés</option>
                <option value="discount_price">Prix croissant</option>
                <option value="-discount_price">Prix décroissant</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Prix min</label>
              <input
                type="number"
                value={filters.min_price}
                onChange={(e) => setFilters({ ...filters, min_price: e.target.value })}
                placeholder="0"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Prix max</label>
              <input
                type="number"
                value={filters.max_price}
                onChange={(e) => setFilters({ ...filters, max_price: e.target.value })}
                placeholder="100000"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
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

