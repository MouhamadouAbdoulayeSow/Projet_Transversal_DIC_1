export interface Metrics {
  totals: {
    view: number;
    like: number;
    add_to_cart: number;
    purchase: number;
    rating: number;
  };
  top_products: Array<{
    itemid: string;
    name: string;
    score: number;
  }>;
  unique_users?: number;
  avg_interactions_per_user?: number;
  conversion_rates?: {
    purchase_to_view_percent: number;
    add_to_cart_to_view_percent: number;
    purchase_to_cart_percent: number;
  };
}

export type RecommendationModel = 'hybrid' | 'content-based' | 'collaborative-filtering';

export interface Config {
  popularity_weight: number;
  preference_bonus_category: number;
  preference_bonus_brand: number;
  preference_bonus_price: number;
  default_strategy: 'content' | 'collaborative' | 'hybrid';
  selected_model: RecommendationModel;
}

export interface RecoDebug {
  itemid: string;
  debug: Array<{
    itemid: string;
    name: string;
    ratings: number;
    discount_price: number;
    actual_price: number;
    similarity_score: number;
    name_overlap: number;
    same_category: number;
    same_brand: number;
    price_delta: number;
  }>;
}

export interface UserRecommendation {
  user_id: number;
  strategy: string;
  preferences: {
    liked_categories: string[];
    liked_brands: string[];
    price_min: number;
    price_max: number;
  };
  recent_interactions: Array<{
    product_id: string;
    type: string;
    quantity: number | null;
    rating: number | null;
    timestamp: string;
  }>;
  recommendations: Array<{
    itemid: string;
    name: string;
    ratings: number;
    discount_price: number;
    actual_price: number;
    similarity_score: number;
    popularity: number;
    combined_score: number;
    source_product: string;
    source_type: string;
    explanations: string[];
  }>;
}

export interface User {
  user_id: number | null;
  visitorid: string;
  source: 'registered' | 'visitor';
  email: string | null;
  username: string;
  first_name: string;
  last_name: string;
  total_interactions: number;
  views: number;
  likes: number;
  add_to_cart: number;
  purchases: number;
  ratings: number;
  last_activity: string | null;
  has_preferences: boolean;
  first_seen_at?: string | null;
  last_seen_at?: string | null;
}

export interface UsersList {
  users: User[];
  total: number;
  page: number;
  page_size: number;
}

export interface Interaction {
  user_id: number;
  product_id: string;
  product_name: string;
  interaction_type: string;
  timestamp: string;
  rating: number | null;
  quantity: number | null;
}

export interface InteractionsTimeline {
  interactions: Interaction[];
  total: number;
  page: number;
  page_size: number;
}

export interface TemporalStatsData {
  date: string;
  views: number;
  likes: number;
  add_to_cart: number;
  purchases: number;
  ratings: number;
  unique_users: number;
  recommendations_generated: number;
}

export interface TemporalStats {
  period: 'day' | 'week' | 'month';
  days: number;
  data: TemporalStatsData[];
}

// ============================================================================
// TYPES POUR DASHBOARD ENRICHI
// ============================================================================

export interface TrendData {
  value: number;
  change: number;
  change_percent: number;
  trend: 'up' | 'down' | 'neutral';
}

export interface Trends {
  day_over_day: {
    views: TrendData;
    purchases: TrendData;
    revenue: TrendData;
    conversion_rate: TrendData;
  };
  week_over_week: {
    views: TrendData;
    purchases: TrendData;
    revenue: TrendData;
    conversion_rate: TrendData;
  };
  month_over_month: {
    views: TrendData;
    purchases: TrendData;
    revenue: TrendData;
    conversion_rate: TrendData;
  };
}

export interface RecommendationMetrics {
  click_through_rate: number;
  conversion_rate: number;
  coverage: number;
  recommendations_generated: number;
  estimated_clicks: number;
  unique_products_recommended: number;
  total_products: number;
  avg_response_time_ms: number;
}

export interface SystemHealth {
  mongodb: 'healthy' | 'degraded' | 'down';
  api: 'healthy' | 'degraded' | 'down';
  ml_model: {
    status: 'trained' | 'not_trained' | 'error';
    last_trained: string | null;
    version: string;
  };
  celery: {
    status: 'running' | 'stopped' | 'unknown';
    active_tasks: number;
    queue_length: number;
  };
  products_count: number;
  active_users_24h: number;
  active_users_7d: number;
}

export interface TrainingRun {
  id: string;
  model_name: 'content_based' | 'collaborative_filtering';
  status: 'started' | 'success' | 'failed';
  started_at: string | null;
  finished_at: string | null;
  duration_sec: number | null;
  params: Record<string, any>;
  training_stats?: Record<string, any>;
  error_message?: string | null;
}

export interface Alert {
  type: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  action: string;
  timestamp: string;
}

export interface ActionableRecommendation {
  type: 'promote' | 'optimize' | 'tune';
  title: string;
  message: string;
  action: string;
  products?: string[];
  count?: number;
}

export interface TopProductEnhanced {
  itemid: string;
  name: string;
  score: number;
  revenue: number;
  conversion_rate: number;
  views: number;
  purchases: number;
  in_stock: boolean;
  stock_quantity: number;
}

export interface CategoryAnalysis {
  category: string;
  views: number;
  purchases: number;
  revenue: number;
  conversion_rate: number;
  products_count: number;
}

export interface EnhancedKPIs {
  totals: {
    view: number;
    like: number;
    add_to_cart: number;
    purchase: number;
    rating: number;
  };
  revenue: number;
  conversion_rates: {
    purchase_to_view_percent: number;
    add_to_cart_to_view_percent: number;
    purchase_to_cart_percent: number;
    cart_abandonment_percent: number;
  };
  aov: number;
  unique_users: number;
  avg_interactions_per_user: number;
  total_orders: number;
}

export interface EnhancedDashboard {
  kpis: EnhancedKPIs;
  trends: Trends;
  recommendation_metrics: RecommendationMetrics;
  system_health: SystemHealth;
  alerts: Alert[];
  actionable_recommendations: ActionableRecommendation[];
  top_products: TopProductEnhanced[];
  period: {
    start_date: string;
    end_date: string;
    days: number;
  };
}
