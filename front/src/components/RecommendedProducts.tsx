import { useEffect, useState } from 'react';
import { ChevronRight, Package, TrendingUp, Sparkles } from 'lucide-react';
import { adminApi } from '../lib/api';
import LoadingSpinner from './LoadingSpinner';

interface RecommendedProduct {
  itemid: string;
  name: string;
  image: string;
  ratings: number;
  discount_price: number;
  actual_price: number;
  category: string;
  brand: string;
  similarity_score: number;
  model_source: 'content' | 'collaborative' | 'hybrid';
  content_score?: number;
  cf_score?: number;
}

interface RecommendedProductsProps {
  model?: 'content' | 'collaborative' | 'hybrid';
  initialLimit?: number;
}

export default function RecommendedProducts({ 
  model, 
  initialLimit = 16 
}: RecommendedProductsProps) {
  const [products, setProducts] = useState<RecommendedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentLimit, setCurrentLimit] = useState(initialLimit);
  const [sourceItemId, setSourceItemId] = useState<string | null>(null);
  const [currentModel, setCurrentModel] = useState<string>('');

  const fetchProducts = async (limit: number, selectedModel?: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await adminApi.getRecommendedProducts({
        model: selectedModel as 'content' | 'collaborative' | 'hybrid' | undefined,
        limit: limit,
        source_itemid: sourceItemId || undefined,
      });
      
      if (response.data.recommendations) {
        setProducts(response.data.recommendations);
        setSourceItemId(response.data.source_itemid);
        setCurrentModel(response.data.model);
      } else {
        setError('Aucune recommandation disponible');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erreur lors du chargement des recommandations');
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts(currentLimit, model);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, currentLimit]);

  const handleLoadMore = () => {
    setCurrentLimit(prev => prev + 16);
  };

  const getModelBadgeColor = (modelSource: string) => {
    switch (modelSource) {
      case 'content':
        return 'bg-blue-100 text-blue-800';
      case 'collaborative':
        return 'bg-purple-100 text-purple-800';
      case 'hybrid':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getModelLabel = (modelSource: string) => {
    switch (modelSource) {
      case 'content':
        return 'CB';
      case 'collaborative':
        return 'CF';
      case 'hybrid':
        return 'Hybrid';
      default:
        return modelSource;
    }
  };

  if (loading && products.length === 0) {
    return <LoadingSpinner />;
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center space-x-2">
            <Package className="w-6 h-6" />
            <span>Produits Recommandés</span>
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Modèle: <span className="font-semibold capitalize">{currentModel || 'Par défaut'}</span>
            {sourceItemId && (
              <span className="ml-2 text-gray-500">
                • Source: {sourceItemId}
              </span>
            )}
          </p>
        </div>
        {products.length > 0 && (
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <TrendingUp className="w-4 h-4" />
            <span>{products.length} produit(s)</span>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}

      {products.length === 0 && !loading && !error && (
        <div className="text-center py-12">
          <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">Aucun produit recommandé disponible</p>
        </div>
      )}

      {products.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
            {products.map((product) => (
              <div
                key={product.itemid}
                className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
              >
                <div className="aspect-square bg-gray-100 relative">
                  <img
                    src={product.image || '/placeholder.png'}
                    alt={product.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = '/placeholder.png';
                    }}
                  />
                  <div className="absolute top-2 right-2">
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${getModelBadgeColor(product.model_source)}`}>
                      {getModelLabel(product.model_source)}
                    </span>
                  </div>
                  {product.discount_price < product.actual_price && (
                    <div className="absolute top-2 left-2 bg-red-600 text-white px-2 py-1 rounded text-xs font-semibold">
                      -{Math.round((1 - product.discount_price / product.actual_price) * 100)}%
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <h3 className="font-semibold text-gray-900 text-sm mb-1 line-clamp-2">
                    {product.name}
                  </h3>
                  <div className="flex items-center space-x-1 mb-2">
                    <span className="text-yellow-500 text-xs">★</span>
                    <span className="text-xs text-gray-600">{product.ratings.toFixed(1)}</span>
                  </div>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="text-lg font-bold text-gray-900">
                        €{product.discount_price.toFixed(2)}
                      </span>
                      {product.discount_price < product.actual_price && (
                        <span className="text-xs text-gray-500 line-through ml-2">
                          €{product.actual_price.toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>
                  {product.category && (
                    <p className="text-xs text-gray-500 mb-1">{product.category}</p>
                  )}
                  {product.brand && (
                    <p className="text-xs text-gray-500 mb-2">{product.brand}</p>
                  )}
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>Score: {product.similarity_score.toFixed(3)}</span>
                    {product.model_source === 'hybrid' && (
                      <div className="flex items-center space-x-2">
                        {product.content_score !== undefined && (
                          <span className="text-blue-600">CB: {product.content_score.toFixed(2)}</span>
                        )}
                        {product.cf_score !== undefined && (
                          <span className="text-purple-600">CF: {product.cf_score.toFixed(2)}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-center">
            <button
              onClick={handleLoadMore}
              disabled={loading}
              className="flex items-center space-x-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Chargement...</span>
                </>
              ) : (
                <>
                  <span>Voir plus de recommandations</span>
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

