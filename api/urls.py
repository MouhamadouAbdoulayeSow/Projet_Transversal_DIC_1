from django.urls import path, include
from . import views

app_name = 'api'

urlpatterns = [
    # Authentification
    path('auth/', include('accounts.urls')),
    
    # Produits
    path('products/', views.ProductListView.as_view(), name='product-list'),
    path('products/<str:itemid>/', views.ProductDetailView.as_view(), name='product-detail'),
    path('products/<str:itemid>/recommendations/', views.product_recommendations, name='product-recommendations'),
    
    # Panier
    path('cart/', views.cart_view, name='cart'),
    path('cart/remove/<str:product_id>/', views.remove_from_cart, name='remove-from-cart'),
    
    # Commandes
    path('orders/', views.orders_view, name='orders'),
    
    # Recommandations
    path('recommendations/config/', views.recommendation_config_view, name='recommendation-config'),
    path('recommendations/user/', views.user_recommendations, name='user-recommendations'),
    path('recommendations/user/hybrid/', views.user_recommendations_hybrid, name='user-recommendations-hybrid'),
    path('recommendations/popular/', views.popular_products, name='popular-products'),
    path('recommendations/model/', views.model_recommendations_view, name='model-recommendations'),
    path('metrics/', views.metrics_view, name='metrics'),
    path('onboarding/preferences/', views.preferences_view, name='preferences'),
    path('search/', views.search_view, name='search'),
    # Admin
    path('admin/config/', views.admin_config_view, name='admin-config'),
    path('admin/retrain/', views.admin_retrain_view, name='admin-retrain'),
    path('admin/reco-debug/', views.admin_reco_debug_view, name='admin-reco-debug'),
    path('admin/metrics/', views.admin_metrics_view, name='admin-metrics'),
    path('admin/user-recommendations/', views.admin_user_recommendations_view, name='admin-user-recommendations'),
    path('admin/users/', views.admin_users_list_view, name='admin-users-list'),
    path('admin/interactions/', views.admin_interactions_timeline_view, name='admin-interactions-timeline'),
    path('admin/stats/temporal/', views.admin_temporal_stats_view, name='admin-temporal-stats'),
    # Admin - Collaborative Filtering
    path('admin/cf/product-recommendations/', views.admin_cf_product_recommendations_view, name='admin-cf-product-recommendations'),
    path('admin/cf/user-recommendations/', views.admin_cf_user_recommendations_view, name='admin-cf-user-recommendations'),
    path('admin/cf/debug/', views.admin_cf_debug_view, name='admin-cf-debug'),
    path('admin/cf/stats/', views.admin_cf_stats_view, name='admin-cf-stats'),
    path('admin/cf/retrain/', views.admin_cf_retrain_view, name='admin-cf-retrain'),
    # Dashboard enrichi
    path('admin/dashboard/enhanced/', views.admin_dashboard_enhanced_view, name='admin-dashboard-enhanced'),
    path('admin/kpis/business/', views.admin_business_kpis_view, name='admin-business-kpis'),
    path('admin/metrics/recommendation-performance/', views.admin_recommendation_performance_view, name='admin-recommendation-performance'),
    path('admin/system/health/', views.admin_system_health_view, name='admin-system-health'),
    path('admin/alerts/', views.admin_alerts_view, name='admin-alerts'),
    path('admin/recommendations/actionable/', views.admin_actionable_recommendations_view, name='admin-actionable-recommendations'),
    path('admin/products/top-enhanced/', views.admin_top_products_enhanced_view, name='admin-top-products-enhanced'),
    path('admin/analysis/category/', views.admin_category_analysis_view, name='admin-category-analysis'),
    path('admin/metrics/comparison/', views.admin_metrics_comparison_view, name='admin-metrics-comparison'),
    path('admin/models/training-history/', views.admin_training_history_view, name='admin-training-history'),
    path('admin/recommendations/products/', views.admin_recommendations_products_view, name='admin-recommendations-products'),
    
    # Interactions
    path('interactions/', views.record_interaction, name='record-interaction'),
    
    # Favoris (ordre important : routes spécifiques avant routes avec paramètres)
    path('favorites/', views.favorites_view, name='favorites'),
    path('favorites/clear/', views.clear_all_favorites, name='clear-all-favorites'),
    path('favorites/<str:product_id>/', views.remove_favorite, name='remove-favorite'),
]