// front/src/pages/Configuration.tsx
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Save, RotateCcw, RefreshCw, CheckCircle, XCircle, AlertCircle, TrendingUp, Database, Users, BarChart3 } from 'lucide-react';
import { adminApi } from '../lib/api';
import { Config } from '../types';
import { recommendationModelOptions } from '../lib/recommendationConfig';
import LoadingSpinner from '../components/LoadingSpinner';
import Toast from '../components/Toast';

interface ModelStatus {
  available: boolean;
  trained: boolean;
  products_count?: number;
  items_count?: number;
  users_count?: number;
  training_stats?: any;
}

interface ModelsStatus {
  content_based?: ModelStatus;
  collaborative_filtering?: ModelStatus;
}

export default function Configuration() {
  const [currentConfig, setCurrentConfig] = useState<Config | null>(null);
  const [modelsStatus, setModelsStatus] = useState<ModelsStatus>({});
  const [cfQualityMetrics, setCfQualityMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [retraining, setRetraining] = useState(false);
  const [cfRetraining, setCfRetraining] = useState(false);
  const [retrainProgress, setRetrainProgress] = useState<string>('');
  const [cfParams, setCfParams] = useState({
    sample_ratio: 1.0,
    min_interactions: 2,
    max_events: ''
  });
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const { register, handleSubmit, reset, formState: { isDirty } } = useForm<Config>();

  const fetchConfig = async () => {
    try {
      const response = await adminApi.getConfig();
      setCurrentConfig(response.data);
      if (response.data.models_status) {
        setModelsStatus(response.data.models_status);
      }
      reset(response.data);

      // Récupérer les métriques CF si disponible
      try {
        const cfStatsResponse = await adminApi.getCFStats();
        if (cfStatsResponse.data.quality_metrics) {
          setCfQualityMetrics(cfStatsResponse.data.quality_metrics);
        }
      } catch (e) {
        // Ignorer si CF n'est pas disponible
      }
    } catch (error) {
      setToast({ message: 'Failed to load configuration', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
    // Rafraîchir les stats toutes les 30 secondes
    const interval = setInterval(fetchConfig, 30000);
    return () => clearInterval(interval);
  }, []);

  const onSubmit = async (data: Config) => {
    setSaving(true);
    try {
      await adminApi.updateConfig(data);
      setCurrentConfig(data);
      setToast({ message: 'Configuration updated successfully', type: 'success' });
      reset(data);
    } catch (error) {
      setToast({ message: 'Failed to update configuration', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (currentConfig) {
      reset(currentConfig);
    }
  };

  const handleRetrain = async () => {
    setRetraining(true);
    setRetrainProgress('Initialisation du réentraînement Content-Based...');
    try {
      const response = await adminApi.retrain();
      setRetrainProgress('Réentraînement terminé avec succès !');
      setToast({
        message: response.data?.message || 'Model retraining completed successfully',
        type: 'success'
      });
      // Rafraîchir les stats après réentraînement
      setTimeout(() => {
        fetchConfig();
        setRetrainProgress('');
      }, 1000);
    } catch (error: any) {
      setRetrainProgress('');
      setToast({
        message: error.response?.data?.error || 'Failed to retrain model',
        type: 'error'
      });
    } finally {
      setRetraining(false);
    }
  };

  const handleCFRetrain = async () => {
    setCfRetraining(true);
    setRetrainProgress('Initialisation du réentraînement Collaborative Filtering...');
    try {
      const params: any = {
        sample_ratio: cfParams.sample_ratio,
        min_interactions: cfParams.min_interactions
      };
      if (cfParams.max_events) {
        params.max_events = parseInt(cfParams.max_events);
      }
      setRetrainProgress('Chargement des événements depuis MongoDB...');
      const response = await adminApi.retrainCF(params);
      setRetrainProgress('Calcul de la matrice de similarité...');

      if (response.data?.stats) {
        const stats = response.data.stats;
        setRetrainProgress(`Modèle entraîné: ${stats.items_in_model || 0} items, ${stats.users_in_model || 0} utilisateurs`);
      }

      setToast({
        message: response.data?.message || 'Collaborative Filtering model retraining completed successfully',
        type: 'success'
      });

      // Rafraîchir les stats après réentraînement
      setTimeout(() => {
        fetchConfig();
        adminApi.getCFStats().then(res => {
          if (res.data.quality_metrics) {
            setCfQualityMetrics(res.data.quality_metrics);
          }
        });
        setRetrainProgress('');
      }, 1000);
    } catch (error: any) {
      setRetrainProgress('');
      setToast({
        message: error.response?.data?.error || 'Failed to start CF retraining',
        type: 'error'
      });
    } finally {
      setCfRetraining(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Engine Configuration</h1>
        <p className="text-gray-600 mt-1">Adjust recommendation engine parameters</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <form onSubmit={handleSubmit(onSubmit)} className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-6">Weights & Bonuses</h2>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Popularity Weight
                </label>
                <div className="flex items-center space-x-4">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    {...register('popularity_weight', { valueAsNumber: true })}
                    className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    {...register('popularity_weight', { valueAsNumber: true })}
                    className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-center"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  How much to boost popular products (0 = no boost, 1 = maximum boost)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Category Preference Bonus
                </label>
                <div className="flex items-center space-x-4">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    {...register('preference_bonus_category', { valueAsNumber: true })}
                    className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    {...register('preference_bonus_category', { valueAsNumber: true })}
                    className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-center"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Boost for products in user's preferred categories
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Brand Preference Bonus
                </label>
                <div className="flex items-center space-x-4">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    {...register('preference_bonus_brand', { valueAsNumber: true })}
                    className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    {...register('preference_bonus_brand', { valueAsNumber: true })}
                    className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-center"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Boost for products from user's preferred brands
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Price Preference Bonus
                </label>
                <div className="flex items-center space-x-4">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    {...register('preference_bonus_price', { valueAsNumber: true })}
                    className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    {...register('preference_bonus_price', { valueAsNumber: true })}
                    className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-center"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Boost for products in user's price range
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Default Strategy
                </label>
                <div className="space-y-2">
                  <label className="flex items-center space-x-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      value="content"
                      {...register('default_strategy')}
                      className="w-4 h-4 text-blue-600"
                    />
                    <div>
                      <div className="font-medium text-gray-900">Content-Based</div>
                      <div className="text-xs text-gray-500">Recommendations based purely on content similarity</div>
                    </div>
                  </label>
                  <label className="flex items-center space-x-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      value="collaborative"
                      {...register('default_strategy')}
                      className="w-4 h-4 text-blue-600"
                    />
                    <div>
                      <div className="font-medium text-gray-900">Collaborative Filtering</div>
                      <div className="text-xs text-gray-500">Recommendations based on user behavior patterns and item similarities</div>
                    </div>
                  </label>
                  <label className="flex items-center space-x-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      value="hybrid"
                      {...register('default_strategy')}
                      className="w-4 h-4 text-blue-600"
                    />
                    <div>
                      <div className="font-medium text-gray-900">Hybrid</div>
                      <div className="text-xs text-gray-500">Combines content similarity with popularity and user preferences</div>
                    </div>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Selected Model
                </label>
                <select
                  {...register('selected_model')}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  {recommendationModelOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Choose which recommendation model will drive the user-facing strategies.
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-4 mt-8 pt-6 border-t border-gray-200">
              <button
                type="submit"
                disabled={!isDirty || saving}
                className="flex items-center space-x-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
              >
                <Save size={20} />
                <span>{saving ? 'Saving...' : 'Save Configuration'}</span>
              </button>

              <button
                type="button"
                onClick={handleReset}
                disabled={!isDirty}
                className="flex items-center space-x-2 px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:bg-gray-50 disabled:text-gray-400 transition-colors"
              >
                <RotateCcw size={20} />
                <span>Reset</span>
              </button>
            </div>
          </form>
        </div>

        <div className="space-y-6">
          {/* État des modèles */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">État des Modèles</h2>
            <div className="space-y-4">
              {/* Content-Based Model Status */}
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium text-gray-900">Content-Based</h3>
                  {modelsStatus.content_based?.trained ? (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-500" />
                  )}
                </div>
                {modelsStatus.content_based?.trained ? (
                  <div className="space-y-1 text-sm text-gray-600">
                    <div className="flex items-center space-x-2">
                      <Database className="w-4 h-4" />
                      <span>{modelsStatus.content_based.products_count || 0} produits entraînés</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-red-600">Modèle non entraîné</p>
                )}
              </div>

              {/* Collaborative Filtering Model Status */}
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium text-gray-900">Collaborative Filtering</h3>
                  {modelsStatus.collaborative_filtering?.trained ? (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-500" />
                  )}
                </div>
                {modelsStatus.collaborative_filtering?.trained ? (
                  <div className="space-y-1 text-sm text-gray-600">
                    <div className="flex items-center space-x-2">
                      <Database className="w-4 h-4" />
                      <span>{modelsStatus.collaborative_filtering.items_count || 0} items</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Users className="w-4 h-4" />
                      <span>{modelsStatus.collaborative_filtering.users_count || 0} utilisateurs</span>
                    </div>
                    {modelsStatus.collaborative_filtering.training_stats?.events_used && (
                      <div className="flex items-center space-x-2">
                        <BarChart3 className="w-4 h-4" />
                        <span>{modelsStatus.collaborative_filtering.training_stats.events_used.toLocaleString()} événements utilisés</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-red-600">Modèle non entraîné</p>
                )}
              </div>
            </div>
          </div>

          {/* Métriques de qualité CF */}
          {cfQualityMetrics && (
            <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-lg border border-purple-200 p-6">
              <h2 className="text-lg font-semibold text-purple-900 mb-4 flex items-center space-x-2">
                <TrendingUp className="w-5 h-5" />
                <span>Métriques de Qualité (CF)</span>
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-purple-700 mb-1">Similarité moyenne</div>
                  <div className="text-lg font-bold text-purple-900">
                    {cfQualityMetrics.mean_similarity?.toFixed(4) || 'N/A'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-purple-700 mb-1">Médiane</div>
                  <div className="text-lg font-bold text-purple-900">
                    {cfQualityMetrics.median_similarity?.toFixed(4) || 'N/A'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-purple-700 mb-1">Similarités élevées (&gt;0.5)</div>
                  <div className="text-lg font-bold text-purple-900">
                    {(cfQualityMetrics.high_similarity_ratio * 100)?.toFixed(1) || '0'}%
                  </div>
                </div>
                <div>
                  <div className="text-xs text-purple-700 mb-1">Très élevées (&gt;0.7)</div>
                  <div className="text-lg font-bold text-purple-900">
                    {(cfQualityMetrics.very_high_similarity_ratio * 100)?.toFixed(1) || '0'}%
                  </div>
                </div>
                <div>
                  <div className="text-xs text-purple-700 mb-1">Sparsité</div>
                  <div className="text-lg font-bold text-purple-900">
                    {(cfQualityMetrics.sparsity * 100)?.toFixed(1) || '0'}%
                  </div>
                </div>
                <div>
                  <div className="text-xs text-purple-700 mb-1">Écart-type</div>
                  <div className="text-lg font-bold text-purple-900">
                    {cfQualityMetrics.std_similarity?.toFixed(4) || 'N/A'}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Current Configuration</h2>
            {currentConfig && (
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Popularity Weight</span>
                  <span className="font-semibold text-gray-900">{currentConfig.popularity_weight.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Category Bonus</span>
                  <span className="font-semibold text-gray-900">{currentConfig.preference_bonus_category.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Brand Bonus</span>
                  <span className="font-semibold text-gray-900">{currentConfig.preference_bonus_brand.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Price Bonus</span>
                  <span className="font-semibold text-gray-900">{currentConfig.preference_bonus_price.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center pt-3 border-t border-gray-200">
                  <span className="text-sm text-gray-600">Strategy</span>
                  <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-semibold uppercase">
                    {currentConfig.default_strategy}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-3">
                  <span className="text-sm text-gray-600">Selected Model</span>
                  <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-semibold uppercase">
                    {currentConfig.selected_model?.replace('-', ' ')}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
            <h3 className="font-semibold text-yellow-900 mb-3">Content-Based Model Retraining</h3>
            <p className="text-sm text-yellow-800 mb-4">
              Réentraîner le modèle basé sur le contenu des produits. Cela recalcule la matrice de similarité cosinus entre tous les produits.
            </p>
            {retrainProgress && (
              <div className="mb-4 p-3 bg-yellow-100 rounded-lg">
                <div className="flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 text-yellow-700" />
                  <span className="text-sm text-yellow-800">{retrainProgress}</span>
                </div>
              </div>
            )}
            <button
              onClick={handleRetrain}
              disabled={retraining}
              className="w-full flex items-center justify-center space-x-2 px-6 py-3 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:bg-gray-400 transition-colors"
            >
              <RefreshCw size={20} className={retraining ? 'animate-spin' : ''} />
              <span>{retraining ? 'Réentraînement en cours...' : 'Réentraîner le Modèle Content-Based'}</span>
            </button>
            {modelsStatus.content_based?.trained && (
              <div className="mt-3 text-xs text-yellow-700">
                Dernier entraînement: {modelsStatus.content_based.products_count} produits
              </div>
            )}
          </div>

          <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
            <h3 className="font-semibold text-purple-900 mb-3">Collaborative Filtering Model</h3>
            <p className="text-sm text-purple-800 mb-4">
              Réentraîner le modèle de filtrage collaboratif basé sur les patterns de comportement des utilisateurs.
              Le processus utilise un entraînement incrémental pour gérer de grandes quantités de données.
            </p>

            <div className="space-y-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-purple-900 mb-1">
                  Ratio d'échantillonnage (0.1 - 1.0)
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.1"
                    value={cfParams.sample_ratio}
                    onChange={(e) => setCfParams({ ...cfParams, sample_ratio: parseFloat(e.target.value) })}
                    className="flex-1 h-2 bg-purple-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <input
                    type="number"
                    min="0.1"
                    max="1.0"
                    step="0.1"
                    value={cfParams.sample_ratio}
                    onChange={(e) => setCfParams({ ...cfParams, sample_ratio: parseFloat(e.target.value) || 1.0 })}
                    className="w-20 px-2 py-1 border border-purple-300 rounded text-sm text-center"
                  />
                </div>
                <p className="text-xs text-purple-700 mt-1">
                  Pourcentage d'événements à utiliser (plus bas = plus rapide, plus haut = plus précis).
                  Par défaut: 1.0 (tous les événements)
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-purple-900 mb-1">
                  Interactions minimum par item
                </label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={cfParams.min_interactions}
                  onChange={(e) => setCfParams({ ...cfParams, min_interactions: parseInt(e.target.value) || 2 })}
                  className="w-full px-3 py-2 border border-purple-300 rounded text-sm"
                />
                <p className="text-xs text-purple-700 mt-1">
                  Nombre minimum d'interactions requises pour qu'un item soit inclus dans le modèle (défaut: 2)
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-purple-900 mb-1">
                  Nombre max d'événements (optionnel)
                </label>
                <input
                  type="number"
                  min="0"
                  value={cfParams.max_events}
                  onChange={(e) => setCfParams({ ...cfParams, max_events: e.target.value })}
                  placeholder="Laisser vide pour tous"
                  className="w-full px-3 py-2 border border-purple-300 rounded text-sm"
                />
                <p className="text-xs text-purple-700 mt-1">
                  Nombre maximum d'événements à utiliser (laisser vide pour utiliser tous les événements disponibles)
                </p>
              </div>
            </div>

            {retrainProgress && cfRetraining && (
              <div className="mb-4 p-3 bg-purple-100 rounded-lg">
                <div className="flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 text-purple-700" />
                  <span className="text-sm text-purple-800">{retrainProgress}</span>
                </div>
              </div>
            )}

            <button
              onClick={handleCFRetrain}
              disabled={cfRetraining}
              className="w-full flex items-center justify-center space-x-2 px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400 transition-colors"
            >
              <RefreshCw size={20} className={cfRetraining ? 'animate-spin' : ''} />
              <span>{cfRetraining ? 'Réentraînement en cours...' : 'Réentraîner le Modèle CF'}</span>
            </button>

            {modelsStatus.collaborative_filtering?.trained && (
              <div className="mt-3 text-xs text-purple-700 space-y-1">
                <div> Dernier entraînement: {modelsStatus.collaborative_filtering.items_count} items, {modelsStatus.collaborative_filtering.users_count} utilisateurs</div>
                {modelsStatus.collaborative_filtering.training_stats?.events_used && (
                  <div> Événements utilisés: {modelsStatus.collaborative_filtering.training_stats.events_used.toLocaleString()}</div>
                )}
              </div>
            )}
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h3 className="font-semibold text-blue-900 mb-3">Configuration Tips</h3>
            <ul className="text-sm text-blue-800 space-y-2">
              <li>• Higher weights = stronger influence on recommendations</li>
              <li>• Start with small changes (0.01-0.05)</li>
              <li>• Test thoroughly after retraining</li>
              <li>• Hybrid strategy typically performs best</li>
            </ul>
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
