import { useState } from 'react';
import { Search, TrendingUp, Tag } from 'lucide-react';
import { adminApi } from '../lib/api';
import { UserRecommendation } from '../types';
import LoadingSpinner from '../components/LoadingSpinner';
import Toast from '../components/Toast';
import { format } from 'date-fns';

export default function UserAnalysis() {
  const [userId, setUserId] = useState('');
  const [strategy, setStrategy] = useState<'content' | 'collaborative' | 'hybrid'>('hybrid');
  const [data, setData] = useState<UserRecommendation | null>(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const handleSearch = async () => {
    if (!userId.trim()) {
      setToast({ message: 'Please enter a user ID', type: 'error' });
      return;
    }

    setLoading(true);
    try {
      const response = await adminApi.getUserRecommendations(parseInt(userId), strategy);
      setData(response.data);
    } catch (error) {
      setToast({ message: 'Failed to load user data', type: 'error' });
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const getInteractionColor = (type: string) => {
    switch (type) {
      case 'view': return 'bg-blue-100 text-blue-800';
      case 'like': return 'bg-red-100 text-red-800';
      case 'add_to_cart': return 'bg-yellow-100 text-yellow-800';
      case 'purchase': return 'bg-green-100 text-green-800';
      case 'rating': return 'bg-pink-100 text-pink-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">User Analysis</h1>
        <p className="text-gray-600 mt-1">Analyze user behavior and recommendations</p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              User ID
            </label>
            <input
              type="number"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="Enter user ID"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="md:col-span-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Strategy
            </label>
            <select
              value={strategy}
              onChange={(e) => setStrategy(e.target.value as 'content' | 'collaborative' | 'hybrid')}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="content">Content-Based</option>
              <option value="collaborative">Collaborative Filtering</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </div>

          <div className="md:col-span-1 flex items-end">
            <button
              onClick={handleSearch}
              disabled={loading}
              className="w-full flex items-center justify-center space-x-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-sm font-medium text-gray-600 mb-3">Liked Categories</h3>
              <div className="flex flex-wrap gap-2">
                {data.preferences.liked_categories.map((cat, idx) => (
                  <span key={idx} className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                    {cat}
                  </span>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-sm font-medium text-gray-600 mb-3">Liked Brands</h3>
              <div className="flex flex-wrap gap-2">
                {data.preferences.liked_brands.map((brand, idx) => (
                  <span key={idx} className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
                    {brand}
                  </span>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-sm font-medium text-gray-600 mb-3">Price Range</h3>
              <div className="flex items-center space-x-2">
                <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm font-medium">
                  ₹{data.preferences.price_min.toLocaleString()}
                </span>
                <span className="text-gray-400">-</span>
                <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm font-medium">
                  ₹{data.preferences.price_max.toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Interactions</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Product ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Quantity
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Rating
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Timestamp
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {data.recent_interactions.map((interaction, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {interaction.product_id}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-semibold rounded ${getInteractionColor(interaction.type)}`}>
                          {interaction.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {interaction.quantity || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {interaction.rating || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {format(new Date(interaction.timestamp), 'MMM dd, yyyy HH:mm')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Recommendations ({strategy})
              </h2>
              <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-semibold">
                {data.recommendations.length} products
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {data.recommendations.map((reco) => (
                <div key={reco.itemid} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 mb-1">{reco.name}</h3>
                      <p className="text-sm text-gray-500">{reco.itemid}</p>
                    </div>
                    <div className="flex items-center space-x-1 bg-yellow-50 px-2 py-1 rounded">
                      <span className="text-yellow-600 text-sm font-semibold">★</span>
                      <span className="text-sm font-semibold text-gray-900">{reco.ratings.toFixed(1)}</span>
                    </div>
                  </div>

                  <div className="flex items-baseline space-x-2 mb-3">
                    <span className="text-xl font-bold text-green-600">
                      ₹{reco.discount_price.toLocaleString()}
                    </span>
                    {reco.actual_price > reco.discount_price && (
                      <span className="text-sm text-gray-500 line-through">
                        ₹{reco.actual_price.toLocaleString()}
                      </span>
                    )}
                  </div>

                  <div className="space-y-2 mb-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Similarity</span>
                      <div className="flex items-center space-x-2">
                        <div className="w-24 bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full"
                            style={{ width: `${reco.similarity_score * 100}%` }}
                          />
                        </div>
                        <span className="font-semibold text-gray-900">{(reco.similarity_score * 100).toFixed(1)}%</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Combined Score</span>
                      <span className="font-semibold text-gray-900">{reco.combined_score.toFixed(3)}</span>
                    </div>

                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Popularity</span>
                      <span className="font-semibold text-gray-900">{reco.popularity}</span>
                    </div>
                  </div>

                  <div className="border-t border-gray-200 pt-3">
                    <div className="flex items-center space-x-2 text-sm text-gray-600 mb-2">
                      <TrendingUp size={14} />
                      <span>Source: <span className="font-medium text-gray-900">{reco.source_product}</span> ({reco.source_type})</span>
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {reco.explanations.map((exp, idx) => (
                        <span key={idx} className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">
                          <Tag size={12} className="inline mr-1" />
                          {exp}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
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
