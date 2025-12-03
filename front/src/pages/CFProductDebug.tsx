import { useState } from 'react';
import { Search, AlertCircle, Info } from 'lucide-react';
import { adminApi } from '../lib/api';
import LoadingSpinner from '../components/LoadingSpinner';
import Toast from '../components/Toast';

interface CFRecommendation {
  itemid: string;
  name: string;
  ratings: number;
  discount_price: number;
  actual_price: number;
  similarity_score: number;
  explanations?: string[];
  category?: string;
  brand?: string;
}

interface CFProductResponse {
  itemid: string;
  recommendations: CFRecommendation[];
  model_stats?: {
    items_in_model?: number;
    users_in_model?: number;
    events_used?: number;
    sample_ratio?: number;
  };
  message?: string;
}

export default function CFProductDebug() {
  const [itemId, setItemId] = useState('');
  const [data, setData] = useState<CFProductResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const handleSearch = async () => {
    if (!itemId.trim()) {
      setToast({ message: 'Please enter a product ID', type: 'error' });
      return;
    }

    setLoading(true);
    try {
      const response = await adminApi.getCFProductRecommendations(itemId, 10);
      setData(response.data);
    } catch (error: any) {
      setToast({ 
        message: error.response?.data?.error || 'Failed to load CF recommendations', 
        type: 'error' 
      });
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const getSimilarityColor = (score: number) => {
    if (score >= 0.7) return 'text-green-600 bg-green-100';
    if (score >= 0.4) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  const getSimilarityLabel = (score: number) => {
    if (score >= 0.7) return 'High';
    if (score >= 0.4) return 'Medium';
    return 'Low';
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Collaborative Filtering - Product Recommendations</h1>
        <p className="text-gray-600 mt-1">Analyze collaborative filtering recommendations based on user behavior patterns</p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Product ID
            </label>
            <input
              type="text"
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
              placeholder="e.g., 1"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            />
          </div>

          <div className="flex items-end">
            <button
              onClick={handleSearch}
              disabled={loading}
              className="flex items-center space-x-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
            >
              <Search size={20} />
              <span>{loading ? 'Searching...' : 'Search'}</span>
            </button>
          </div>
        </div>
      </div>

      {loading && <LoadingSpinner />}

      {data && !loading && (
        <div className="space-y-6">
          {data.model_stats && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <Info className="text-purple-600 mt-0.5" size={20} />
                <div className="flex-1">
                  <h3 className="font-semibold text-purple-900 mb-2">Model Statistics</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-purple-700">Items in model:</span>
                      <span className="ml-2 font-semibold text-purple-900">
                        {data.model_stats.items_in_model?.toLocaleString() || 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-purple-700">Users in model:</span>
                      <span className="ml-2 font-semibold text-purple-900">
                        {data.model_stats.users_in_model?.toLocaleString() || 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-purple-700">Events used:</span>
                      <span className="ml-2 font-semibold text-purple-900">
                        {data.model_stats.events_used?.toLocaleString() || 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-purple-700">Sample ratio:</span>
                      <span className="ml-2 font-semibold text-purple-900">
                        {data.model_stats.sample_ratio ? `${(data.model_stats.sample_ratio * 100).toFixed(1)}%` : 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {data.message ? (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start space-x-3">
              <AlertCircle className="text-yellow-600 mt-0.5" size={20} />
              <div>
                <h3 className="font-semibold text-yellow-900">Notice</h3>
                <p className="text-sm text-yellow-700 mt-1">{data.message}</p>
              </div>
            </div>
          ) : (
            <>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start space-x-3">
                <AlertCircle className="text-blue-600 mt-0.5" size={20} />
                <div>
                  <h3 className="font-semibold text-blue-900">Source Product: {data.itemid}</h3>
                  <p className="text-sm text-blue-700 mt-1">
                    Showing {data.recommendations.length} recommendations based on collaborative filtering
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Product ID
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Product Name
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Similarity
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Price
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Rating
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Details
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {data.recommendations.map((item) => (
                        <tr key={item.itemid} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {item.itemid}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-900">
                            <div className="max-w-xs truncate">{item.name}</div>
                            {item.category && (
                              <div className="text-xs text-gray-500 mt-1">
                                {item.category} {item.brand && `• ${item.brand}`}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center space-x-2">
                              <div className="w-24 bg-gray-200 rounded-full h-2">
                                <div
                                  className={`h-2 rounded-full ${
                                    item.similarity_score >= 0.7
                                      ? 'bg-green-500'
                                      : item.similarity_score >= 0.4
                                      ? 'bg-yellow-500'
                                      : 'bg-red-500'
                                  }`}
                                  style={{ width: `${Math.min(item.similarity_score * 100, 100)}%` }}
                                />
                              </div>
                              <span className={`px-2 py-1 rounded text-xs font-semibold ${getSimilarityColor(item.similarity_score)}`}>
                                {(item.similarity_score * 100).toFixed(1)}%
                              </span>
                              <span className="text-xs text-gray-500">
                                ({getSimilarityLabel(item.similarity_score)})
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <div className="text-green-600 font-semibold">
                              ₹{item.discount_price.toLocaleString()}
                            </div>
                            {item.actual_price > item.discount_price && (
                              <div className="text-gray-500 text-xs line-through">
                                ₹{item.actual_price.toLocaleString()}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center space-x-1 text-sm">
                              <span className="text-yellow-500">★</span>
                              <span className="font-semibold text-gray-900">{item.ratings.toFixed(1)}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            {item.explanations && item.explanations.length > 0 && (
                              <div className="space-y-1 text-xs">
                                {item.explanations.map((explanation, idx) => (
                                  <div key={idx} className="text-gray-600">
                                    • {explanation}
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
                <h3 className="font-semibold text-gray-900 mb-4">Understanding Collaborative Filtering</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div className="bg-white p-4 rounded-lg border border-gray-200">
                    <h4 className="font-semibold text-green-600 mb-2">High Similarity (≥70%)</h4>
                    <p className="text-gray-600">Items frequently viewed/purchased together by users. Strong behavioral correlation.</p>
                  </div>
                  <div className="bg-white p-4 rounded-lg border border-gray-200">
                    <h4 className="font-semibold text-yellow-600 mb-2">Medium Similarity (40-70%)</h4>
                    <p className="text-gray-600">Moderate co-occurrence patterns. Users sometimes interact with both items together.</p>
                  </div>
                  <div className="bg-white p-4 rounded-lg border border-gray-200">
                    <h4 className="font-semibold text-red-600 mb-2">Low Similarity (&lt;40%)</h4>
                    <p className="text-gray-600">Weak behavioral correlation. Items rarely appear together in user interactions.</p>
                  </div>
                </div>
              </div>
            </>
          )}
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

