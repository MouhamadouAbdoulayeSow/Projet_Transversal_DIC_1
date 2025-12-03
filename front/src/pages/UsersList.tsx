import { useEffect, useState } from 'react';
import { Search, User, Eye, Heart, ShoppingCart, DollarSign, Star, Calendar, Settings } from 'lucide-react';
import { adminApi } from '../lib/api';
import { UsersList as UsersListType, User as UserType } from '../types';
import LoadingSpinner from '../components/LoadingSpinner';
import Toast from '../components/Toast';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';

export default function UsersList() {
  const [data, setData] = useState<UsersListType | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(20);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const navigate = useNavigate();

  const fetchUsers = async (page: number = 1, search: string = '') => {
    setLoading(true);
    try {
      const response = await adminApi.getUsersList({
        page,
        page_size: pageSize,
        search: search || undefined,
      });
      setData(response.data);
    } catch (error) {
      setToast({ message: 'Failed to load users', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers(currentPage, searchTerm);
  }, [currentPage]);

  const handleSearch = () => {
    setCurrentPage(1);
    fetchUsers(1, searchTerm);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const totalPages = data ? Math.ceil(data.total / pageSize) : 0;

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

  if (loading && !data) return <LoadingSpinner />;

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Users Management</h1>
        <p className="text-gray-600 mt-1">View and analyze user activity</p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Search Users
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Search by email, username or visitor ID..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          <button
            onClick={handleSearch}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Search
          </button>
        </div>
      </div>

      {data && (
        <>
          <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Users ({data.total} total)
              </h2>
              <div className="text-sm text-gray-600">
                Page {data.page} of {totalPages}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      User
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total Interactions
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Breakdown
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Last Activity
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Preferences
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {data.users.map((user) => {
                    const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
                    const canAnalyze = Boolean(user.user_id);
                    return (
                      <tr key={user.visitorid} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                            <User size={20} className="text-blue-600" />
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">
                              {fullName || user.username}{' '}
                              <span className="text-gray-400 text-xs">
                                ({user.source === 'registered' ? 'Registered' : 'Visitor'})
                              </span>
                            </div>
                            <div className="text-sm text-gray-500">
                              {user.email || `Visitor ID: ${user.visitorid}`}
                            </div>
                            <div className="text-xs text-gray-400">
                              ID: {user.user_id ?? user.visitorid}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-semibold text-gray-900">
                          {user.total_interactions}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-2">
                          <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-semibold">
                            <Eye size={12} className="inline mr-1" />
                            {user.views}
                          </span>
                          <span className="px-2 py-1 bg-red-100 text-red-800 rounded text-xs font-semibold">
                            <Heart size={12} className="inline mr-1" />
                            {user.likes}
                          </span>
                          <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs font-semibold">
                            <ShoppingCart size={12} className="inline mr-1" />
                            {user.add_to_cart}
                          </span>
                          <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-semibold">
                            <DollarSign size={12} className="inline mr-1" />
                            {user.purchases}
                          </span>
                          <span className="px-2 py-1 bg-pink-100 text-pink-800 rounded text-xs font-semibold">
                            <Star size={12} className="inline mr-1" />
                            {user.ratings}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {user.last_activity ? (
                          <div className="flex items-center">
                            <Calendar size={14} className="mr-1" />
                            {format(new Date(user.last_activity), 'MMM dd, yyyy HH:mm')}
                          </div>
                        ) : (
                          <span className="text-gray-400">Never</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {user.has_preferences ? (
                          <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-semibold">
                            Yes
                          </span>
                        ) : (
                          <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs font-semibold">
                            No
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <button
                          onClick={() => user.user_id && navigate(`/admin/users/${user.user_id}`)}
                          disabled={!canAnalyze}
                          className={`flex items-center space-x-1 px-3 py-1 rounded transition-colors ${
                            canAnalyze
                              ? 'bg-blue-600 text-white hover:bg-blue-700'
                              : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                          }`}
                        >
                          <Settings size={14} />
                          <span>{canAnalyze ? 'Analyze' : 'Visitor only'}</span>
                        </button>
                      </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="mt-6 flex justify-center items-center space-x-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400 transition-colors"
                >
                  Previous
                </button>
                <span className="px-4 py-2 text-sm text-gray-700">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400 transition-colors"
                >
                  Next
                </button>
              </div>
            )}
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

