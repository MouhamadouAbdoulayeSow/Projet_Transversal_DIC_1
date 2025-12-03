import { useEffect, useState } from 'react';
import { api, UserPreferences } from '../../lib/userApi';
import LoadingSpinner from '../../components/LoadingSpinner';
import Toast from '../../components/Toast';
import { User, Save, Sparkles } from 'lucide-react';
import ProtectedUserRoute from '../../components/ProtectedUserRoute';
import { useUserAuthStore } from '../../store/userAuthStore';
import { useForm } from 'react-hook-form';

interface ProfileForm {
  first_name: string;
  last_name: string;
}

function ProfilePage() {
  const { user, setUser } = useUserAuthStore();
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const { register, handleSubmit, formState: { errors } } = useForm<ProfileForm>({
    defaultValues: {
      first_name: user?.first_name || '',
      last_name: user?.last_name || '',
    },
  });

  useEffect(() => {
    fetchProfile();
    fetchPreferences();
  }, []);

  const fetchProfile = async () => {
    try {
      const response = await api.getProfile();
      setUser(response.data);
    } catch (error) {
      setToast({ message: 'Erreur lors du chargement du profil', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const fetchPreferences = async () => {
    try {
      const response = await api.getPreferences();
      setPreferences(response.data);
    } catch (error) {
      console.error('Error fetching preferences:', error);
    }
  };

  const onSubmitProfile = async (data: ProfileForm) => {
    setSaving(true);
    try {
      const response = await api.updateProfile(data);
      setUser(response.data);
      setToast({ message: 'Profil mis à jour avec succès', type: 'success' });
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || 'Erreur lors de la mise à jour';
      setToast({ message: errorMessage, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const onSubmitPreferences = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    const formData = new FormData(e.currentTarget);
    const data: any = {
      liked_categories: formData.getAll('categories') as string[],
      liked_brands: formData.getAll('brands') as string[],
    };
    const priceMin = formData.get('price_min');
    const priceMax = formData.get('price_max');
    if (priceMin) data.price_min = parseFloat(priceMin as string);
    if (priceMax) data.price_max = parseFloat(priceMax as string);

    try {
      await api.updatePreferences(data);
      setToast({ message: 'Préférences enregistrées avec succès', type: 'success' });
      fetchPreferences();
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || 'Erreur lors de l\'enregistrement';
      setToast({ message: errorMessage, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  const categories = ['Smartphones', 'Laptops', 'Audio', 'Wearables', 'Accessories'];
  const brands = ['Samsung', 'Apple', 'Sony', 'Xiaomi', 'OnePlus', 'Dell', 'HP', 'Lenovo'];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Mon Profil</h1>

      <div className="space-y-6">
        {/* Profile Info */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center space-x-3 mb-6">
            <div className="bg-blue-100 p-3 rounded-full">
              <User className="text-blue-600" size={24} />
            </div>
            <h2 className="text-xl font-semibold text-gray-900">Informations personnelles</h2>
          </div>

          <form onSubmit={handleSubmit(onSubmitProfile)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Prénom</label>
                <input
                  {...register('first_name', { required: 'Ce champ est requis' })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                {errors.first_name && <p className="text-red-600 text-sm mt-1">{errors.first_name.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Nom</label>
                <input
                  {...register('last_name', { required: 'Ce champ est requis' })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                {errors.last_name && <p className="text-red-600 text-sm mt-1">{errors.last_name.message}</p>}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
              <input
                type="email"
                value={user?.email || ''}
                disabled
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Nom d'utilisateur</label>
              <input
                type="text"
                value={user?.username || ''}
                disabled
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="flex items-center space-x-2 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
            >
              <Save size={18} />
              <span>{saving ? 'Enregistrement...' : 'Enregistrer'}</span>
            </button>
          </form>
        </div>

        {/* Preferences */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center space-x-3 mb-6">
            <div className="bg-purple-100 p-3 rounded-full">
              <Sparkles className="text-purple-600" size={24} />
            </div>
            <h2 className="text-xl font-semibold text-gray-900">Préférences de recommandation</h2>
          </div>

          <form onSubmit={onSubmitPreferences} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">Catégories préférées</label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {categories.map((cat) => (
                  <label key={cat} className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      name="categories"
                      value={cat}
                      defaultChecked={preferences?.liked_categories?.includes(cat)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">{cat}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">Marques préférées</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {brands.map((brand) => (
                  <label key={brand} className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      name="brands"
                      value={brand}
                      defaultChecked={preferences?.liked_brands?.includes(brand)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">{brand}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Prix minimum (€)</label>
                <input
                  type="number"
                  name="price_min"
                  defaultValue={preferences?.price_min || ''}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Prix maximum (€)</label>
                <input
                  type="number"
                  name="price_max"
                  defaultValue={preferences?.price_max || ''}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="flex items-center space-x-2 bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 disabled:bg-gray-400 transition-colors"
            >
              <Save size={18} />
              <span>{saving ? 'Enregistrement...' : 'Enregistrer les préférences'}</span>
            </button>
          </form>
        </div>
      </div>

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

export default function Profile() {
  return (
    <ProtectedUserRoute>
      <ProfilePage />
    </ProtectedUserRoute>
  );
}

