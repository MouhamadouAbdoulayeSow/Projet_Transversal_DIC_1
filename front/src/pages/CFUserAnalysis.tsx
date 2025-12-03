import { useState } from 'react';
import { Search, AlertCircle, User, Package } from 'lucide-react';
import { adminApi } from '../lib/api';
import LoadingSpinner from '../components/LoadingSpinner';
import Toast from '../components/Toast';

interface CFUserRecommendation {
  itemid: string;
  name: string;
  ratings: number;
  discount_price: number;
  actual_price: number;
  similarity_score: number;
}

interface UserHistory {
  itemid: string;
  event: string;
  timestamp: string | null;
}

interface CFUserResponse {
  visitorid: string;
  recommendations: CFUserRecommendation[];
  user_history: UserHistory[];
  model_stats?: {
    items_in_model?: number;
    users_in_model?: number;
    events_used?: number;
  };
}

export default function CFUserAnalysis() {
  const [visitorId, setVisitorId] = useState('');
  const [userId, setUserId] = useState('');
  const [data, setData] = useState<CFUserResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const handleSearch = async () => {
    if (!visitorId.trim() && !userId.trim()) {
      setToast({ message: 'Please enter a visitor ID or user ID', type: 'error' });
      return;
    }

    setLoading(true);
    try {
      const response = await adminApi.getCFUserRecommendations({
        visitorid: visitorId || undefined,
        user_id: userId ? parseInt(userId) : undefined,
        top_n: 10
      });
      setData(response.data);
    } catch (error: any) {
      setToast({ 
        message: error.response?.data?.error || 'Failed to load CF user recommendations', 
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

  const getEventColor = (event: string) => {
    switch (event.toLowerCase()) {
      case 'purchase':
      case 'transaction':
        return 'bg-green-100 text-green-800';
      case 'addtocart':
      case 'add_to_cart':
        return 'bg-blue-100 text-blue-800';
      case 'view':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-purple-100 text-purple-800';
    }
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Collaborative Filtering - User Analysis</h1>
        <p className="text-gray-600 mt-1">Analyze personalized recommendations based on user behavior patterns</p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Visitor ID
            </label>
            <input
              type="text"
              value={visitorId}
              onChange={(e) => setVisitorId(e.target.value)}
              placeholder="e.g., visitor123"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              User ID (alternative)
            </label>
            <input
              type="number"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="e.g., 123"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="flex justify-end">
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

      {loading && <LoadingSpinner />}

      {data && !loading && (
        <div className="space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start space-x-3">
            <User className="text-blue-600 mt-0.5" size={20} />
            <div>
              <h3 className="font-semibold text-blue-900">User: {data.visitorid}</h3>
              <p className="text-sm text-blue-700 mt-1">
                {data.recommendations.length} personalized recommendations based on collaborative filtering
              </p>
            </div>
          </div>

          {data.user_history && data.user_history.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center space-x-2">
                <Package size={20} />
                <span>User History</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {data.user_history.map((history, idx) => (
                  <div
                    key={idx}
                    className="bg-gray-50 rounded-lg p-3 border border-gray-200"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-900">{history.itemid}</span>
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${getEventColor(history.event)}`}>
                        {history.event}
                      </span>
                    </div>
                    {history.timestamp && (
                      <div className="text-xs text-gray-500">
                        {new Date(history.timestamp).toLocaleString()}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.recommendations.length > 0 ? (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Recommended Products</h3>
              </div>
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
                        Similarity Score
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Price
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Rating
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start space-x-3">
              <AlertCircle className="text-yellow-600 mt-0.5" size={20} />
              <div>
                <h3 className="font-semibold text-yellow-900">No Recommendations Available</h3>
                <p className="text-sm text-yellow-700 mt-1">
                  This user may not have enough interaction history, or the model needs to be retrained.
                </p>
              </div>
            </div>
          )}

          {data.model_stats && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <h3 className="font-semibold text-purple-900 mb-2">Model Statistics</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
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
              </div>
            </div>
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

