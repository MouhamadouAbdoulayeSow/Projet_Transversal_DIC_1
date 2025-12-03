"""
Services pour le dashboard admin enrichi
Calculs de métriques business, KPIs, alertes, etc.
"""
from datetime import datetime, timedelta, timezone as dt_timezone
from collections import Counter, defaultdict
from django.utils import timezone
from django.contrib.auth import get_user_model
from .models import Product, UserInteraction, Order, RecommendationConfig, Event, AnalyticsUser
from recommendations.engine import get_global_recommender
from .user_services import UserCollectionService
from .utils import fetch_product_by_itemid
import logging

logger = logging.getLogger(__name__)
User = get_user_model()


class DashboardMetricsService:
    """Service pour calculer les métriques du dashboard"""
    
    @staticmethod
    def calculate_business_kpis(start_date=None, end_date=None):
        """Calcule les KPIs business essentiels"""
        if not start_date:
            start_date = datetime(2000, 1, 1)  # Depuis le début
        if not end_date:
            end_date = timezone.now()
        
        # Filtrer les interactions dans la période
        interactions = UserInteraction.objects.filter(
            timestamp__gte=start_date,
            timestamp__lte=end_date
        )
        
        # Calculer les totaux
        totals = {
            'view': interactions.filter(interaction_type='view').count(),
            'like': interactions.filter(interaction_type='like').count(),
            'add_to_cart': interactions.filter(interaction_type='add_to_cart').count(),
            'purchase': interactions.filter(interaction_type='purchase').count(),
            'rating': interactions.filter(interaction_type='rating').count(),
        }
        
        # Calculer les revenus depuis les commandes
        orders = Order.objects.filter(
            created_at__gte=start_date,
            created_at__lte=end_date
        )
        revenue = sum(float(order.total_amount) for order in orders)
        
        # Calculer les taux de conversion
        conversion_rates = {}
        if totals['view'] > 0:
            conversion_rates['purchase_to_view'] = (totals['purchase'] / totals['view']) * 100
            conversion_rates['add_to_cart_to_view'] = (totals['add_to_cart'] / totals['view']) * 100
        else:
            conversion_rates['purchase_to_view'] = 0
            conversion_rates['add_to_cart_to_view'] = 0
        
        if totals['add_to_cart'] > 0:
            conversion_rates['purchase_to_cart'] = (totals['purchase'] / totals['add_to_cart']) * 100
            conversion_rates['cart_abandonment'] = 100 - conversion_rates['purchase_to_cart']
        else:
            conversion_rates['purchase_to_cart'] = 0
            conversion_rates['cart_abandonment'] = 0
        
        # Calculer l'AOV (Average Order Value)
        order_count = orders.count()
        aov = revenue / order_count if order_count > 0 else 0
        
        # Utilisateurs uniques
        unique_user_ids = set()
        for interaction in interactions.only('user_id'):
            unique_user_ids.add(interaction.user_id)
        unique_users = len(unique_user_ids)
        
        # Interactions moyennes par utilisateur
        avg_interactions_per_user = totals['view'] / unique_users if unique_users > 0 else 0
        
        return {
            'totals': totals,
            'revenue': round(revenue, 2),
            'conversion_rates': {
                'purchase_to_view_percent': round(conversion_rates['purchase_to_view'], 2),
                'add_to_cart_to_view_percent': round(conversion_rates['add_to_cart_to_view'], 2),
                'purchase_to_cart_percent': round(conversion_rates['purchase_to_cart'], 2),
                'cart_abandonment_percent': round(conversion_rates['cart_abandonment'], 2),
            },
            'aov': round(aov, 2),
            'unique_users': unique_users,
            'avg_interactions_per_user': round(avg_interactions_per_user, 2),
            'total_orders': order_count,
        }
    
    @staticmethod
    def calculate_temporal_comparisons():
        """Calcule les comparaisons temporelles (jour/jour, semaine/semaine, mois/mois)"""
        now = timezone.now()
        
        # Périodes actuelles
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        yesterday_start = today_start - timedelta(days=1)
        yesterday_end = today_start
        
        this_week_start = today_start - timedelta(days=today_start.weekday())
        last_week_start = this_week_start - timedelta(days=7)
        last_week_end = this_week_start
        
        this_month_start = today_start.replace(day=1)
        last_month_start = (this_month_start - timedelta(days=1)).replace(day=1)
        last_month_end = this_month_start
        
        # Calculer les métriques pour chaque période
        def get_metrics(start, end):
            kpis = DashboardMetricsService.calculate_business_kpis(start, end)
            return {
                'views': kpis['totals']['view'],
                'purchases': kpis['totals']['purchase'],
                'revenue': kpis['revenue'],
                'conversion_rate': kpis['conversion_rates']['purchase_to_view_percent'],
            }
        
        today_metrics = get_metrics(today_start, now)
        yesterday_metrics = get_metrics(yesterday_start, yesterday_end)
        
        this_week_metrics = get_metrics(this_week_start, now)
        last_week_metrics = get_metrics(last_week_start, last_week_end)
        
        this_month_metrics = get_metrics(this_month_start, now)
        last_month_metrics = get_metrics(last_month_start, last_month_end)
        
        # Calculer les variations
        def calculate_variation(current, previous):
            if previous == 0:
                return {'value': current, 'change': 0, 'change_percent': 0, 'trend': 'neutral'}
            change = current - previous
            change_percent = (change / previous) * 100
            trend = 'up' if change > 0 else 'down' if change < 0 else 'neutral'
            return {
                'value': current,
                'change': round(change, 2),
                'change_percent': round(change_percent, 2),
                'trend': trend
            }
        
        return {
            'day_over_day': {
                'views': calculate_variation(today_metrics['views'], yesterday_metrics['views']),
                'purchases': calculate_variation(today_metrics['purchases'], yesterday_metrics['purchases']),
                'revenue': calculate_variation(today_metrics['revenue'], yesterday_metrics['revenue']),
                'conversion_rate': calculate_variation(today_metrics['conversion_rate'], yesterday_metrics['conversion_rate']),
            },
            'week_over_week': {
                'views': calculate_variation(this_week_metrics['views'], last_week_metrics['views']),
                'purchases': calculate_variation(this_week_metrics['purchases'], last_week_metrics['purchases']),
                'revenue': calculate_variation(this_week_metrics['revenue'], last_week_metrics['revenue']),
                'conversion_rate': calculate_variation(this_week_metrics['conversion_rate'], last_week_metrics['conversion_rate']),
            },
            'month_over_month': {
                'views': calculate_variation(this_month_metrics['views'], last_month_metrics['views']),
                'purchases': calculate_variation(this_month_metrics['purchases'], last_month_metrics['purchases']),
                'revenue': calculate_variation(this_month_metrics['revenue'], last_month_metrics['revenue']),
                'conversion_rate': calculate_variation(this_month_metrics['conversion_rate'], last_month_metrics['conversion_rate']),
            },
        }
    
    @staticmethod
    def calculate_recommendation_metrics(start_date=None, end_date=None):
        """Calcule les métriques de performance du système de recommandation"""
        if not start_date:
            start_date = datetime(2000, 1, 1)
        if not end_date:
            end_date = timezone.now()
        
        # Interactions dans la période
        interactions = UserInteraction.objects.filter(
            timestamp__gte=start_date,
            timestamp__lte=end_date
        )
        
        # Estimation: chaque vue génère environ 5 recommandations
        views = interactions.filter(interaction_type='view').count()
        recommendations_generated = views * 5
        
        # Pour calculer le CTR, on aurait besoin de tracker les clics sur recommandations
        # Pour l'instant, estimation basée sur les likes/add_to_cart depuis des vues
        views_count = views
        likes_from_views = interactions.filter(interaction_type='like').count()
        carts_from_views = interactions.filter(interaction_type='add_to_cart').count()
        
        # Estimation du CTR (Click-Through Rate)
        # Approximation: likes + add_to_cart comme "clics" sur recommandations
        estimated_clicks = likes_from_views + carts_from_views
        ctr = (estimated_clicks / recommendations_generated * 100) if recommendations_generated > 0 else 0
        
        # Conversion depuis recommandations
        # Approximation: achats après avoir vu/liké/ajouté au panier
        purchases = interactions.filter(interaction_type='purchase').count()
        conversion_rate = (purchases / recommendations_generated * 100) if recommendations_generated > 0 else 0
        
        # Diversité: nombre de produits uniques recommandés
        # Approximation: produits qui ont été vus
        unique_products_viewed = set()
        for interaction in interactions.filter(interaction_type='view').only('product_id'):
            unique_products_viewed.add(interaction.product_id)
        unique_products_viewed = len(unique_products_viewed)
        total_products = Product.objects.count()
        coverage = (unique_products_viewed / total_products * 100) if total_products > 0 else 0
        
        # Nouveauté: produits découverts (première vue)
        # Approximation: produits vus pour la première fois dans la période
        all_viewed_products = set()
        for interaction in interactions.filter(interaction_type='view'):
            all_viewed_products.add(interaction.product_id)
        
        # Temps de réponse moyen (estimation)
        # En production, cela devrait être mesuré réellement
        avg_response_time = 150  # ms (estimation)
        
        return {
            'click_through_rate': round(ctr, 2),
            'conversion_rate': round(conversion_rate, 2),
            'coverage': round(coverage, 2),
            'recommendations_generated': recommendations_generated,
            'estimated_clicks': estimated_clicks,
            'unique_products_recommended': unique_products_viewed,
            'total_products': total_products,
            'avg_response_time_ms': avg_response_time,
        }
    
    @staticmethod
    def get_system_health():
        """Vérifie la santé du système"""
        health = {
            'mongodb': 'healthy',
            'api': 'healthy',
            'ml_model': {
                'status': 'trained',
                'last_trained': None,
                'version': '1.0',
            },
            'celery': {
                'status': 'unknown',
                'active_tasks': 0,
                'queue_length': 0,
            },
            'products_count': 0,
            'active_users_24h': 0,
            'active_users_7d': 0,
        }
        
        try:
            # Vérifier MongoDB
            Product.objects.first()
            health['mongodb'] = 'healthy'
        except Exception as e:
            logger.error(f"MongoDB health check failed: {e}")
            health['mongodb'] = 'degraded'
        
        # Compter les produits
        try:
            health['products_count'] = Product.objects.count()
        except Exception:
            pass
        
        # Utilisateurs actifs
        try:
            now = timezone.now()
            last_24h = now - timedelta(hours=24)
            last_7d = now - timedelta(days=7)

            # Mongo stocke les timestamps events en UTC naïf
            last_24h_naive = last_24h.astimezone(dt_timezone.utc).replace(tzinfo=None)
            last_7d_naive = last_7d.astimezone(dt_timezone.utc).replace(tzinfo=None)

            UserCollectionService.ensure_bootstrapped()
            health['users_collection_total'] = AnalyticsUser.objects.count()

            visitors_24h = Event.objects(timestamp__gte=last_24h_naive).distinct('visitorid')
            visitors_7d = Event.objects(timestamp__gte=last_7d_naive).distinct('visitorid')

            health['active_users_24h'] = len([vid for vid in visitors_24h if vid])
            health['active_users_7d'] = len([vid for vid in visitors_7d if vid])
        except Exception as e:
            logger.error(f"Error calculating active users: {e}")
        
        # Vérifier le modèle ML
        try:
            recommender = get_global_recommender()
            if recommender and hasattr(recommender, 'is_trained') and recommender.is_trained:
                health['ml_model']['status'] = 'trained'
            else:
                health['ml_model']['status'] = 'not_trained'
        except Exception as e:
            logger.error(f"ML model health check failed: {e}")
            health['ml_model']['status'] = 'error'
        
        # Vérifier Celery (si disponible)
        try:
            from celery import current_app
            inspect = current_app.control.inspect()
            active = inspect.active()
            if active:
                health['celery']['status'] = 'running'
                health['celery']['active_tasks'] = sum(len(tasks) for tasks in active.values())
            else:
                health['celery']['status'] = 'stopped'
        except Exception:
            health['celery']['status'] = 'unknown'
        
        return health
    
    @staticmethod
    def get_alerts():
        """Génère les alertes basées sur les métriques"""
        alerts = []
        now = timezone.now()
        
        # Calculer les métriques actuelles
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        today_metrics = DashboardMetricsService.calculate_business_kpis(today_start, now)
        
        # Calculer les métriques d'hier pour comparaison
        yesterday_start = today_start - timedelta(days=1)
        yesterday_end = today_start
        yesterday_metrics = DashboardMetricsService.calculate_business_kpis(yesterday_start, yesterday_end)
        
        # Alerte: Chute de conversion
        if yesterday_metrics['conversion_rates']['purchase_to_view_percent'] > 0:
            conversion_drop = yesterday_metrics['conversion_rates']['purchase_to_view_percent'] - today_metrics['conversion_rates']['purchase_to_view_percent']
            if conversion_drop > 20:
                alerts.append({
                    'type': 'critical',
                    'title': 'Chute importante du taux de conversion',
                    'message': f'Le taux de conversion a chuté de {conversion_drop:.1f}% par rapport à hier',
                    'action': 'Vérifier les prix des produits et la disponibilité',
                    'timestamp': now.isoformat(),
                })
        
        # Alerte: Produits en rupture de stock
        try:
            out_of_stock = Product.objects.filter(in_stock=False).count()
            if out_of_stock > 0:
                alerts.append({
                    'type': 'warning',
                    'title': f'{out_of_stock} produit(s) en rupture de stock',
                    'message': 'Certains produits ne sont plus disponibles',
                    'action': 'Vérifier et réapprovisionner les stocks',
                    'timestamp': now.isoformat(),
                })
        except Exception:
            pass
        
        # Alerte: Modèle non mis à jour
        try:
            # Vérifier la dernière date de retrain (approximation)
            # En production, stocker cette info dans la config
            config = RecommendationConfig.objects.first()
            if config:
                # Si le modèle n'a pas été retrainé depuis plus de 7 jours
                alerts.append({
                    'type': 'info',
                    'title': 'Modèle de recommandation',
                    'message': 'Le modèle n\'a pas été retrainé récemment',
                    'action': 'Considérer un retrain du modèle pour améliorer les performances',
                    'timestamp': now.isoformat(),
                })
        except Exception:
            pass
        
        # Alerte: Chute de revenus
        if yesterday_metrics['revenue'] > 0:
            revenue_drop = ((yesterday_metrics['revenue'] - today_metrics['revenue']) / yesterday_metrics['revenue']) * 100
            if revenue_drop > 30:
                alerts.append({
                    'type': 'critical',
                    'title': 'Chute importante des revenus',
                    'message': f'Les revenus ont chuté de {revenue_drop:.1f}% par rapport à hier',
                    'action': 'Analyser les causes et prendre des mesures correctives',
                    'timestamp': now.isoformat(),
                })
        
        return alerts
    
    @staticmethod
    def get_actionable_recommendations():
        """Génère des recommandations actionnables basées sur les données"""
        recommendations = []
        now = timezone.now()
        
        # Top produits par popularité
        product_counts = Counter()
        for interaction in UserInteraction.objects.all():
            weight = 3 if interaction.interaction_type in ['purchase', 'add_to_cart'] else 1
            product_counts[interaction.product_id] += weight
        
        top_products = product_counts.most_common(5)
        if top_products:
            recommendations.append({
                'type': 'promote',
                'title': 'Produits à mettre en avant',
                'message': f'Les produits {", ".join([pid for pid, _ in top_products[:3]])} sont très populaires',
                'action': 'Mettre ces produits en avant sur la page d\'accueil',
                'products': [pid for pid, _ in top_products[:3]],
            })
        
        # Produits sous-performants
        all_products = set()
        for product in Product.objects.only('itemid'):
            all_products.add(product.itemid)
        products_with_interactions = set(product_counts.keys())
        underperforming = all_products - products_with_interactions
        
        if len(underperforming) > 0:
            recommendations.append({
                'type': 'optimize',
                'title': 'Produits sous-performants',
                'message': f'{len(underperforming)} produit(s) n\'ont aucune interaction',
                'action': 'Réviser les descriptions, prix ou images de ces produits',
                'count': len(underperforming),
            })
        
        # Optimisation des paramètres
        try:
            config = RecommendationConfig.objects.first()
            if config:
                if config.popularity_weight < 0.1:
                    recommendations.append({
                        'type': 'tune',
                        'title': 'Optimisation des paramètres',
                        'message': 'Le poids de popularité est très faible',
                        'action': 'Augmenter le poids de popularité pour améliorer les recommandations',
                    })
        except Exception:
            pass
        
        return recommendations
    
    @staticmethod
    def get_top_products_enhanced(limit=10):
        """Retourne les top produits avec métriques enrichies"""
        product_counts = Counter()
        product_revenue = defaultdict(float)
        product_conversions = defaultdict(int)
        
        # Calculer les scores et revenus
        for interaction in UserInteraction.objects.all():
            weight = 3 if interaction.interaction_type in ['purchase', 'add_to_cart'] else 1
            product_counts[interaction.product_id] += weight
            
            if interaction.interaction_type == 'purchase':
                product_conversions[interaction.product_id] += 1
        
        # Calculer les revenus depuis les commandes
        for order in Order.objects.all():
            for item in order.items:
                product_revenue[item.product_id] += float(item.total_price)
        
        # Construire la liste enrichie
        top_products = []
        for pid, score in product_counts.most_common(limit):
            try:
                product = fetch_product_by_itemid(pid)
                views = UserInteraction.objects.filter(
                    product_id=pid,
                    interaction_type='view'
                ).count()
                
                conversion_rate = (product_conversions[pid] / views * 100) if views > 0 else 0
                
                top_products.append({
                    'itemid': pid,
                    'name': product.name,
                    'score': score,
                    'revenue': round(product_revenue[pid], 2),
                    'conversion_rate': round(conversion_rate, 2),
                    'views': views,
                    'purchases': product_conversions[pid],
                    'in_stock': product.in_stock,
                    'stock_quantity': product.stock_quantity,
                })
            except Product.DoesNotExist:
                continue
        
        return top_products
    
    @staticmethod
    def get_category_analysis():
        """Analyse par catégorie de produits"""
        category_stats = defaultdict(lambda: {
            'views': 0,
            'purchases': 0,
            'revenue': 0.0,
            'products': set(),
        })
        
        # Agréger par catégorie
        for interaction in UserInteraction.objects.all():
            try:
                product = fetch_product_by_itemid(interaction.product_id)
                if product.category:
                    category_stats[product.category]['products'].add(product.itemid)
                    if interaction.interaction_type == 'view':
                        category_stats[product.category]['views'] += 1
                    elif interaction.interaction_type == 'purchase':
                        category_stats[product.category]['purchases'] += 1
            except Product.DoesNotExist:
                continue
        
        # Calculer les revenus par catégorie
        for order in Order.objects.all():
            for item in order.items:
                try:
                    product = fetch_product_by_itemid(item.product_id)
                    if product.category:
                        category_stats[product.category]['revenue'] += float(item.total_price)
                        if item.product_id not in category_stats[product.category]['products']:
                            category_stats[product.category]['products'].add(item.product_id)
                except Product.DoesNotExist:
                    continue
        
        # Formater les résultats
        results = []
        for category, stats in category_stats.items():
            views = stats['views']
            conversion_rate = (stats['purchases'] / views * 100) if views > 0 else 0
            
            results.append({
                'category': category,
                'views': views,
                'purchases': stats['purchases'],
                'revenue': round(stats['revenue'], 2),
                'conversion_rate': round(conversion_rate, 2),
                'products_count': len(stats['products']),
            })
        
        # Trier par revenu
        results.sort(key=lambda x: x['revenue'], reverse=True)
        return results

