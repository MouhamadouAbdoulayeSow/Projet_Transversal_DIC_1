import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, Cart } from '../../lib/userApi';
import LoadingSpinner from '../../components/LoadingSpinner';
import Toast from '../../components/Toast';
import { CheckCircle, ArrowLeft } from 'lucide-react';
import ProtectedUserRoute from '../../components/ProtectedUserRoute';
import { useForm } from 'react-hook-form';
import { useCartStore } from '../../store/cartStore';

interface CheckoutForm {
  name: string;
  street: string;
  city: string;
  postal_code: string;
  country: string;
  phone: string;
  shipping_cost: number;
  tax_amount: number;
}

function CheckoutPage() {
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const navigate = useNavigate();
  const { resetCart } = useCartStore();
  const { register, handleSubmit, formState: { errors } } = useForm<CheckoutForm>({
    defaultValues: {
      shipping_cost: 9.99,
      tax_amount: 0,
      country: 'France',
    },
  });

  useEffect(() => {
    fetchCart();
  }, []);

  const fetchCart = async () => {
    try {
      setLoading(true);
      const response = await api.getCart();
      setCart(response.data);
      if (!response.data || response.data.items.length === 0) {
        navigate('/cart');
      }
      setLoading(false);
    } catch (error) {
      setToast({ message: 'Erreur lors du chargement du panier', type: 'error' });
      setLoading(false);
    }
  };

  const onSubmit = async (data: CheckoutForm) => {
    setSubmitting(true);
    try {
      const response = await api.createOrder({
        shipping_address: {
          name: data.name,
          street: data.street,
          city: data.city,
          postal_code: data.postal_code,
          country: data.country,
          phone: data.phone,
        },
        shipping_cost: data.shipping_cost,
        tax_amount: data.tax_amount,
      });
      // Réinitialiser le panier après commande réussie
      resetCart();
      navigate(`/orders/${response.data.order_id}`);
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || 'Erreur lors de la création de la commande';
      setToast({ message: errorMessage, type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingSpinner />;
  if (!cart || cart.items.length === 0) return null;

  const total = cart.total_amount + 9.99 + 0;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Finaliser la commande</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <form onSubmit={handleSubmit(onSubmit)} className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Adresse de livraison</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nom complet *
              </label>
              <input
                {...register('name', { required: 'Ce champ est requis' })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
              {errors.name && <p className="text-red-600 text-sm mt-1">{errors.name.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Adresse *
              </label>
              <input
                {...register('street', { required: 'Ce champ est requis' })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
              {errors.street && <p className="text-red-600 text-sm mt-1">{errors.street.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Ville *
                </label>
                <input
                  {...register('city', { required: 'Ce champ est requis' })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                {errors.city && <p className="text-red-600 text-sm mt-1">{errors.city.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Code postal *
                </label>
                <input
                  {...register('postal_code', { required: 'Ce champ est requis' })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                {errors.postal_code && <p className="text-red-600 text-sm mt-1">{errors.postal_code.message}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Pays *
                </label>
                <input
                  {...register('country', { required: 'Ce champ est requis' })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                {errors.country && <p className="text-red-600 text-sm mt-1">{errors.country.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Téléphone *
                </label>
                <input
                  {...register('phone', { required: 'Ce champ est requis' })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                {errors.phone && <p className="text-red-600 text-sm mt-1">{errors.phone.message}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Frais de livraison (€)
                </label>
                <input
                  type="number"
                  step="0.01"
                  {...register('shipping_cost', { valueAsNumber: true })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Taxes (€)
                </label>
                <input
                  type="number"
                  step="0.01"
                  {...register('tax_amount', { valueAsNumber: true })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex space-x-4">
              <button
                type="button"
                onClick={() => navigate('/cart')}
                className="flex items-center space-x-2 px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <ArrowLeft size={20} />
                <span>Retour</span>
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
              >
                {submitting ? 'Traitement...' : 'Confirmer la commande'}
              </button>
            </div>
          </form>
        </div>

        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg border border-gray-200 p-6 sticky top-24">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Résumé</h2>
            <div className="space-y-3 mb-6">
              {cart.items.map((item) => (
                <div key={item.product_id} className="flex justify-between text-sm">
                  <span className="text-gray-600">{item.product_name} × {item.quantity}</span>
                  <span className="text-gray-900">{item.total_price.toLocaleString('fr-FR')} €</span>
                </div>
              ))}
              <div className="border-t border-gray-200 pt-3 space-y-2">
                <div className="flex justify-between text-gray-600">
                  <span>Sous-total</span>
                  <span>{cart.total_amount.toLocaleString('fr-FR')} €</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Livraison</span>
                  <span>9.99 €</span>
                </div>
                <div className="flex justify-between text-lg font-bold text-gray-900 border-t border-gray-200 pt-2">
                  <span>Total</span>
                  <span>{total.toLocaleString('fr-FR')} €</span>
                </div>
              </div>
            </div>
          </div>
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

export default function Checkout() {
  return (
    <ProtectedUserRoute>
      <CheckoutPage />
    </ProtectedUserRoute>
  );
}

