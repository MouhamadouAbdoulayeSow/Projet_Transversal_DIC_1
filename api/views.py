"""
Vues API pour l'e-commerce
"""
from rest_framework import status, generics, permissions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination
from django.http import Http404
from django.utils import timezone
from typing import Optional
import logging
from .models import Product, Cart, CartItem, Order, OrderItem, UserInteraction, UserPreference, RecommendationConfig
from .utils import fetch_product_by_itemid
from .user_services import UserCollectionService

logger = logging.getLogger(__name__)


def map_selected_model_to_strategy(selected_model: Optional[str]) -> str:
    """Convertit le modèle sélectionné admin en paramètre strategy côté utilisateur."""
    mapping = {
        'content-based': 'content',
        'content': 'content',
        'collaborative-filtering': 'collaborative',
        'collaborative': 'collaborative',
        'hybrid': 'hybrid',
    }
    return mapping.get(selected_model, 'hybrid')


def _build_model_recommendations_response(
    requested_model: Optional[str],
    limit: int,
    source_itemid: Optional[str],
    override_model: Optional[str] = None
) -> Response:
    """Génére les recommandations d'après le modèle sélectionné (shared entre admin/public)."""
    from collections import Counter
    try:
        cfg = RecommendationConfig.objects(config_name='default').first()
        model = override_model or requested_model
        if not model:
            model = cfg.default_strategy if cfg else 'content'

        # Si pas de produit source, utiliser le plus populaire
        if not source_itemid:
            product_counts = Counter()
            interactions = UserInteraction.objects.filter(
                interaction_type__in=['view', 'purchase', 'like', 'add_to_cart']
            )
            for inter in interactions:
                weight = 3 if inter.interaction_type in ['purchase', 'add_to_cart'] else 1
                product_counts[inter.product_id] += weight

            if product_counts:
                source_itemid = product_counts.most_common(1)[0][0]
            else:
                first_product = Product.objects.first()
                if first_product:
                    source_itemid = str(first_product.itemid)
                else:
                    return Response({
                        'error': 'Aucun produit disponible dans la base de données',
                        'recommendations': []
                    }, status=status.HTTP_404_NOT_FOUND)

        try:
            source_product = fetch_product_by_itemid(source_itemid)
            source_itemid = str(source_product.itemid)
        except Product.DoesNotExist:
            return Response({
                'error': f'Produit source {source_itemid} introuvable',
                'recommendations': []
            }, status=status.HTTP_404_NOT_FOUND)

        recommendations: list[dict] = []

        if model == 'collaborative':
            from recommendations.engine import is_cf_initialization_in_progress
            cf_recommender = get_global_cf_recommender()

            if is_cf_initialization_in_progress():
                return Response({
                    'error': 'Modèle collaborative filtering en cours d\'initialisation',
                    'message': 'Le modèle CF est actuellement en train de s\'entraîner en arrière-plan. Veuillez réessayer dans quelques minutes.',
                    'status': 'initializing',
                    'recommendations': []
                }, status=status.HTTP_503_SERVICE_UNAVAILABLE)

            if cf_recommender is None or not cf_recommender.is_fitted:
                return Response({
                    'error': 'Système de collaborative filtering non disponible',
                    'message': 'Le modèle CF doit être initialisé. Il sera initialisé automatiquement au démarrage du serveur, ou vous pouvez utiliser: POST /api/admin/cf/retrain/',
                    'status': 'not_initialized',
                    'recommendations': []
                }, status=status.HTTP_503_SERVICE_UNAVAILABLE)

            cf_source_itemid = source_itemid
            try:
                if isinstance(source_itemid, str) and source_itemid.isdigit():
                    cf_source_itemid = int(source_itemid)
                elif isinstance(source_itemid, (int, float)):
                    cf_source_itemid = int(source_itemid)
                else:
                    product = fetch_product_by_itemid(source_itemid)
                    if isinstance(product.itemid, (int, float)):
                        cf_source_itemid = int(product.itemid)
                    elif isinstance(product.itemid, str) and product.itemid.isdigit():
                        cf_source_itemid = int(product.itemid)
                    else:
                        cf_source_itemid = cf_recommender._normalize_itemid(product.itemid)
            except (ValueError, TypeError, Product.DoesNotExist) as e:
                logger.warning(f"Impossible de normaliser source_itemid {source_itemid} pour CF: {e}")
                cf_source_itemid = cf_recommender._normalize_itemid(source_itemid)

            if cf_source_itemid is None or (cf_recommender.item_index_map and cf_source_itemid not in cf_recommender.item_index_map):
                logger.warning(f"Item {cf_source_itemid} (source: {source_itemid}) non trouvé dans le modèle CF, utilisation des items populaires")
                recommendations = cf_recommender._get_popular_items(top_n=limit)
            else:
                recs = cf_recommender.get_recommendations_by_item(cf_source_itemid, top_n=limit)
                if not recs:
                    recommendations = cf_recommender._get_popular_items(top_n=limit)
                elif len(recs) < limit:
                    existing_itemids = {r['itemid'] for r in recs}
                    popular_recs = cf_recommender._get_popular_items(top_n=limit * 2)
                    for pop_rec in popular_recs:
                        if len(recs) >= limit:
                            break
                        pop_itemid = pop_rec.get('itemid')
                        if pop_itemid and pop_itemid not in existing_itemids:
                            recs.append(pop_rec)
                            existing_itemids.add(pop_itemid)
                    recommendations = recs[:limit]
                else:
                    recommendations = recs[:limit]

        elif model == 'hybrid':
            from recommendations.engine import is_cf_initialization_in_progress
            content_recommender = get_global_recommender()
            cf_recommender = get_global_cf_recommender()

            if is_cf_initialization_in_progress():
                logger.info("CF en cours d'initialisation, utilisation de CB uniquement pour cette requête")
                recommender = get_global_recommender()
                if recommender is None:
                    return Response({
                        'error': 'Système de recommandation non disponible',
                        'recommendations': []
                    }, status=status.HTTP_503_SERVICE_UNAVAILABLE)
                recs = recommender.get_recommendations_with_scores(source_itemid, top_n=limit)
                if isinstance(recs, str):
                    return Response({
                        'message': recs,
                        'recommendations': []
                    })
                for rec in recs:
                    rec['model_source'] = 'content'
                recommendations = recs
            else:
                cb_target = limit // 2
                cf_target = limit - cb_target
                fetch_limit = max(cb_target, cf_target) * 2
                content_recs = []
                cf_recs = []

                if content_recommender:
                    content_recs = content_recommender.get_recommendations_with_scores(source_itemid, top_n=fetch_limit)
                    if isinstance(content_recs, str):
                        content_recs = []

                if cf_recommender and cf_recommender.is_fitted:
                    cf_recs = cf_recommender.get_recommendations_by_item(source_itemid, top_n=fetch_limit)
                elif cf_recommender is None or not cf_recommender.is_fitted:
                    logger.warning("CF non disponible pour hybride, utilisation de CB uniquement")
                    content_recs = content_recommender.get_recommendations_with_scores(source_itemid, top_n=limit) if content_recommender else []
                    if isinstance(content_recs, str):
                        content_recs = []
                    cf_recs = []

                content_dict = {rec['itemid']: rec for rec in content_recs}
                cf_dict = {rec['itemid']: rec for rec in cf_recs}
                selected_items = set()
                hybrid_items = []
                cb_only_items = []
                cf_only_items = []

                for itemid in content_dict.keys():
                    if itemid in cf_dict:
                        hybrid_items.append(itemid)
                    else:
                        cb_only_items.append(itemid)

                for itemid in cf_dict.keys():
                    if itemid not in content_dict:
                        cf_only_items.append(itemid)

                final_recommendations = []
                hybrid_count = 0
                for itemid in hybrid_items[:min(cb_target, cf_target)]:
                    if len(final_recommendations) >= limit:
                        break
                    cb_rec = content_dict[itemid]
                    cf_rec = cf_dict[itemid]
                    final_recommendations.append({
                        **cb_rec,
                        'content_score': cb_rec.get('similarity_score', 0),
                        'cf_score': cf_rec.get('similarity_score', 0),
                        'similarity_score': (cb_rec.get('similarity_score', 0) * 0.5 + cf_rec.get('similarity_score', 0) * 0.5),
                        'model_source': 'hybrid'
                    })
                    hybrid_count += 1
                    selected_items.add(itemid)

                cb_added = hybrid_count
                for itemid in cb_only_items:
                    if len(final_recommendations) >= limit or cb_added >= cb_target:
                        break
                    if itemid not in selected_items:
                        rec = content_dict[itemid]
                        final_recommendations.append({
                            **rec,
                            'content_score': rec.get('similarity_score', 0),
                            'cf_score': 0,
                            'similarity_score': rec.get('similarity_score', 0),
                            'model_source': 'content'
                        })
                        cb_added += 1
                        selected_items.add(itemid)

                cf_added = hybrid_count
                for itemid in cf_only_items:
                    if len(final_recommendations) >= limit or cf_added >= cf_target:
                        break
                    if itemid not in selected_items:
                        rec = cf_dict[itemid]
                        final_recommendations.append({
                            **rec,
                            'content_score': 0,
                            'cf_score': rec.get('similarity_score', 0),
                            'similarity_score': rec.get('similarity_score', 0),
                            'model_source': 'collaborative'
                        })
                        cf_added += 1
                        selected_items.add(itemid)

                recommendations = sorted(
                    final_recommendations,
                    key=lambda x: x.get('similarity_score', 0),
                    reverse=True
                )[:limit]

        else:
            recommender = get_global_recommender()
            if recommender is None:
                return Response({
                    'error': 'Système de recommandation non disponible',
                    'recommendations': []
                }, status=status.HTTP_503_SERVICE_UNAVAILABLE)

            recs = recommender.get_recommendations_with_scores(source_itemid, top_n=limit)
            if isinstance(recs, str):
                return Response({
                    'message': recs,
                    'recommendations': []
                })

            for rec in recs:
                rec['model_source'] = 'content'

            recommendations = recs

        enriched_recommendations = []
        for rec in recommendations:
            try:
                product = fetch_product_by_itemid(rec['itemid'])
                enriched_recommendations.append({
                    'itemid': product.itemid,
                    'name': product.name,
                    'image': product.image,
                    'ratings': float(product.ratings) if product.ratings else 0.0,
                    'discount_price': float(product.discount_price) if product.discount_price else 0.0,
                    'actual_price': float(product.actual_price) if product.actual_price else 0.0,
                    'category': product.category,
                    'brand': product.brand,
                    'similarity_score': rec.get('similarity_score', 0),
                    'model_source': rec.get('model_source', model),
                    'content_score': rec.get('content_score', 0) if model == 'hybrid' else None,
                    'cf_score': rec.get('cf_score', 0) if model == 'hybrid' else None,
                })
            except Product.DoesNotExist:
                continue

        return Response({
            'model': model,
            'source_itemid': source_itemid,
            'limit': limit,
            'count': len(enriched_recommendations),
            'recommendations': enriched_recommendations
        })

    except Exception as e:
        logger.error(f"Erreur admin recommendations products: {str(e)}", exc_info=True)
        return Response({
            'error': f'Erreur lors de la récupération des recommandations: {str(e)}',
            'recommendations': []
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
from .serializers import (
    ProductSerializer, CartSerializer, OrderSerializer, 
    UserInteractionSerializer, AddToCartSerializer, CreateOrderSerializer
)
from recommendations.engine import (
    get_global_recommender,
    get_global_cf_recommender
)


class StandardResultsSetPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 100


class ProductListView(generics.ListCreateAPIView):
    """Liste et création de produits"""
    serializer_class = ProductSerializer
    pagination_class = StandardResultsSetPagination
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]

    def get_queryset(self):
        queryset = Product.objects.all()
        
        # Filtres
        category = self.request.query_params.get('category', None)
        brand = self.request.query_params.get('brand', None)
        min_price = self.request.query_params.get('min_price', None)
        max_price = self.request.query_params.get('max_price', None)
        search = self.request.query_params.get('search', None)
        
        if category:
            queryset = queryset.filter(category=category)
        if brand:
            queryset = queryset.filter(brand=brand)
        if min_price:
            queryset = queryset.filter(discount_price__gte=float(min_price))
        if max_price:
            queryset = queryset.filter(discount_price__lte=float(max_price))
        if search:
            queryset = queryset.filter(name__icontains=search)
        
        # Tri
        ordering = self.request.query_params.get('ordering', '-created_at')
        if ordering in ['name', '-name', 'ratings', '-ratings', 'discount_price', '-discount_price', 'created_at', '-created_at']:
            queryset = queryset.order_by(ordering)
        
        return queryset

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        page = self.paginate_queryset(queryset)
        
        if page is not None:
            serializer = self.get_serializer([self._product_to_dict(p) for p in page], many=True)
            return self.get_paginated_response(serializer.data)
        
        serializer = self.get_serializer([self._product_to_dict(p) for p in queryset], many=True)
        return Response(serializer.data)

    def _product_to_dict(self, product):
        """Convertir un objet Product MongoDB en dictionnaire"""
        return {
            'itemid': product.itemid,
            'name': product.name,
            'image': product.image,
            'ratings': product.ratings,
            'discount_price': float(product.discount_price),
            'actual_price': float(product.actual_price),
            'description': product.description,
            'category': product.category,
            'brand': product.brand,
            'in_stock': product.in_stock,
            'stock_quantity': product.stock_quantity,
            'created_at': product.created_at,
            'updated_at': product.updated_at,
        }


class ProductDetailView(generics.RetrieveUpdateDestroyAPIView):
    """Détail, modification et suppression d'un produit"""
    serializer_class = ProductSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    lookup_field = 'itemid'

    def get_object(self):
        itemid_param = self.kwargs['itemid']
        try:
            product = fetch_product_by_itemid(itemid_param)
        except Product.DoesNotExist:
            raise Http404("Produit introuvable")
        
        # Normaliser itemid en string pour les interactions
        itemid = str(product.itemid)
        
        # Enregistrer l'interaction "vue" si utilisateur connecté
        if self.request.user.is_authenticated:
            UserInteraction.objects.create(
                user_id=self.request.user.id,
                product_id=itemid,
                interaction_type='view'
            )
        
        return product

    def retrieve(self, request, *args, **kwargs):
        product = self.get_object()
        serializer = self.get_serializer(self._product_to_dict(product))
        return Response(serializer.data)

    def _product_to_dict(self, product):
        """Convertir un objet Product MongoDB en dictionnaire"""
        return {
            'itemid': product.itemid,
            'name': product.name,
            'image': product.image,
            'ratings': product.ratings,
            'discount_price': float(product.discount_price),
            'actual_price': float(product.actual_price),
            'description': product.description,
            'category': product.category,
            'brand': product.brand,
            'in_stock': product.in_stock,
            'stock_quantity': product.stock_quantity,
            'created_at': product.created_at,
            'updated_at': product.updated_at,
        }


@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def product_recommendations(request, itemid):
    """Recommandations pour un produit spécifique"""
    # Gérer les deux types : string (depuis URL) et int (dans MongoDB)
    try:
        product = fetch_product_by_itemid(itemid)
    except Product.DoesNotExist:
        return Response({'error': 'Produit introuvable'}, status=status.HTTP_404_NOT_FOUND)
    
    # Normaliser itemid en string pour le moteur de recommandation
    itemid = str(product.itemid)

    try:
        cfg = RecommendationConfig.objects(config_name='default').first()
        requested_strategy = request.query_params.get('strategy')
        if requested_strategy:
            strategy = requested_strategy
        else:
            strategy = map_selected_model_to_strategy(cfg.selected_model if cfg else None)
        
        recs_with_scores = []
        
        # Utiliser le modèle approprié selon la stratégie
        if strategy == 'collaborative':
            cf_recommender = get_global_cf_recommender()
            if cf_recommender is None:
                return Response({
                    'error': 'Système de collaborative filtering non disponible',
                    'message': 'Le modèle CF doit être initialisé. Utilisez: POST /api/admin/cf/retrain/ ou python manage.py init_recommender --collaborative-only'
                }, status=status.HTTP_503_SERVICE_UNAVAILABLE)
            if not cf_recommender.is_fitted:
                return Response({
                    'error': 'Modèle collaborative filtering non entraîné',
                    'message': 'Le modèle CF doit être entraîné. Utilisez: POST /api/admin/cf/retrain/'
                }, status=status.HTTP_503_SERVICE_UNAVAILABLE)
            recs_with_scores = cf_recommender.get_recommendations_by_item(itemid, top_n=5)
        elif strategy == 'hybrid':
            # Combiner content-based et collaborative filtering
            content_recommender = get_global_recommender()
            cf_recommender = get_global_cf_recommender()
            
            content_recs = []
            cf_recs = []
            
            if content_recommender:
                content_recs = content_recommender.get_recommendations_with_scores(itemid, top_n=5)
                if isinstance(content_recs, str):
                    content_recs = []
            
            if cf_recommender:
                cf_recs = cf_recommender.get_recommendations_by_item(itemid, top_n=5)
            
            # Combiner les résultats
            combined_scores = {}
            for rec in content_recs:
                itemid_rec = rec['itemid']
                combined_scores[itemid_rec] = {
                    **rec,
                    'content_score': rec.get('similarity_score', 0),
                    'cf_score': 0
                }
            
            for rec in cf_recs:
                itemid_rec = rec['itemid']
                if itemid_rec in combined_scores:
                    combined_scores[itemid_rec]['cf_score'] = rec.get('similarity_score', 0)
                    combined_scores[itemid_rec]['similarity_score'] = (
                        combined_scores[itemid_rec]['content_score'] * 0.5 +
                        rec.get('similarity_score', 0) * 0.5
                    )
                else:
                    combined_scores[itemid_rec] = {
                        **rec,
                        'content_score': 0,
                        'cf_score': rec.get('similarity_score', 0),
                        'similarity_score': rec.get('similarity_score', 0)
                    }
            
            recs_with_scores = sorted(
                combined_scores.values(),
                key=lambda x: x.get('similarity_score', 0),
                reverse=True
            )[:5]
        else:
            # Par défaut: content-based
            recommender = get_global_recommender()
            if recommender is None:
                return Response({'error': 'Système de recommandation non disponible'}, 
                              status=status.HTTP_503_SERVICE_UNAVAILABLE)
            recs_with_scores = recommender.get_recommendations_with_scores(itemid, top_n=5)
            if isinstance(recs_with_scores, str):
                return Response({'message': recs_with_scores, 'recommendations': []})
        
        # Exclure le produit source des recommandations
        recs_with_scores = [r for r in recs_with_scores if r['itemid'] != itemid]
        
        if not recs_with_scores:
            return Response({'message': 'Aucune recommandation disponible', 'recommendations': []})
        
        # A/B testing: hybrid boosts with popularity
        popularity_weight = cfg.popularity_weight if cfg else 0.05
        if strategy == 'hybrid':
            from collections import Counter
            pop_counts = Counter()
            ids = [r['itemid'] for r in recs_with_scores]
            interactions = UserInteraction.objects.filter(interaction_type__in=['view','purchase','like','add_to_cart'], product_id__in=ids)
            for inter in interactions:
                pop_counts[inter.product_id] += 3 if inter.interaction_type in ['purchase','add_to_cart'] else 1
            for r in recs_with_scores:
                r['popularity'] = pop_counts.get(r['itemid'], 0)
                r['combined_score'] = r['similarity_score'] + popularity_weight * r['popularity']
            recs_with_scores = sorted(recs_with_scores, key=lambda x: x.get('combined_score', x['similarity_score']), reverse=True)
        
        # Appliquer diversité : limiter les produits par catégorie
        try:
            source_product = fetch_product_by_itemid(itemid)
            source_category = source_product.category if source_product else None
            
            # Grouper par catégorie et limiter
            category_counts = {}
            max_per_category = 2  # Max 2 produits par catégorie pour diversité
            diverse_recs = []
            
            for rec in recs_with_scores:
                try:
                    rec_product = fetch_product_by_itemid(rec['itemid'])
                    rec_category = rec_product.category or 'other'
                    
                    # Si c'est la même catégorie que le produit source, limiter encore plus
                    if rec_category == source_category:
                        max_for_this_category = 1
                    else:
                        max_for_this_category = max_per_category
                    
                    if category_counts.get(rec_category, 0) < max_for_this_category:
                        diverse_recs.append(rec)
                        category_counts[rec_category] = category_counts.get(rec_category, 0) + 1
                    elif len(diverse_recs) < 5:  # Si on n'a pas assez, prendre quand même
                        diverse_recs.append(rec)
                except Product.DoesNotExist:
                    diverse_recs.append(rec)  # Garder si produit non trouvé
            
            # Si on a moins de 5 recommandations, compléter avec les meilleurs restants
            if len(diverse_recs) < 5:
                for rec in recs_with_scores:
                    if rec not in diverse_recs and len(diverse_recs) < 5:
                        diverse_recs.append(rec)
            
            recs_with_scores = diverse_recs[:5]  # Limiter à 5 pour page produit
        except Exception as e:
            logger.warning(f"Erreur lors de l'application de la diversité: {e}")
            recs_with_scores = recs_with_scores[:5]  # Fallback : prendre les 5 meilleurs

        # Ajouter des explications simples
        explanations = []
        for rec in recs_with_scores:
            try:
                rec_product = fetch_product_by_itemid(rec['itemid'])
                same_category = int(rec_product.category == product.category) if rec_product.category and product.category else 0
                same_brand = int(rec_product.brand == product.brand) if rec_product.brand and product.brand else 0
                price_diff = abs(float(rec['discount_price']) - float(product.discount_price))
                name_overlap = len(set(str(rec['name']).lower().split()) & set(str(product.name).lower().split()))
                reasons = []
                if same_category:
                    reasons.append('même catégorie')
                if same_brand:
                    reasons.append('même marque')
                if name_overlap:
                    reasons.append(f'{name_overlap} mot(s) commun(s) dans le nom')
                reasons.append(f'proche en prix (Δ={price_diff:.2f})')
                if request.query_params.get('strategy') == 'hybrid' and rec.get('popularity'):
                    reasons.append(f'populaire (signals={rec.get("popularity")})')
                explanations.append({
                    **rec,
                    'explanations': reasons
                })
            except Product.DoesNotExist:
                explanations.append({**rec, 'explanations': []})
        
        return Response({
            'product_id': itemid,
            'recommendations': explanations
        })

    except Exception as e:
        return Response({'error': f'Erreur lors de la génération des recommandations: {str(e)}'}, 
                       status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['GET'])
@permission_classes([permissions.IsAdminUser])
def admin_metrics_view(request):
    """Métriques détaillées (admin)"""
    try:
        from collections import Counter
        totals = {}
        by_type = ['view','like','add_to_cart','purchase','rating']
        for itype in by_type:
            totals[itype] = UserInteraction.objects.filter(interaction_type=itype).count()
        
        # Top produits par popularité
        product_counts = Counter()
        for inter in UserInteraction.objects.all():
            weight = 3 if inter.interaction_type in ['purchase','add_to_cart'] else 1
            product_counts[inter.product_id] += weight
        top_products = []
        for pid, count in product_counts.most_common(10):
            try:
                p = fetch_product_by_itemid(pid)
                top_products.append({'itemid': pid, 'name': p.name, 'score': count})
            except Product.DoesNotExist:
                continue
        
        # Calculer les métriques supplémentaires
        total_interactions = sum(totals.values())
        # Pour MongoEngine, on doit itérer pour obtenir les user_id uniques
        unique_user_ids = set()
        for inter in UserInteraction.objects.only('user_id'):
            unique_user_ids.add(inter.user_id)
        unique_users = len(unique_user_ids)
        avg_interactions_per_user = total_interactions / unique_users if unique_users > 0 else 0
        
        # Conversion rates
        conversion_rates = {}
        if totals['view'] > 0:
            conversion_rates['purchase_to_view'] = (totals['purchase'] / totals['view']) * 100
            conversion_rates['add_to_cart_to_view'] = (totals['add_to_cart'] / totals['view']) * 100
        else:
            conversion_rates['purchase_to_view'] = 0
            conversion_rates['add_to_cart_to_view'] = 0
        
        if totals['add_to_cart'] > 0:
            conversion_rates['purchase_to_cart'] = (totals['purchase'] / totals['add_to_cart']) * 100
        else:
            conversion_rates['purchase_to_cart'] = 0
        
        return Response({
            'totals': totals,
            'top_products': top_products,
            'unique_users': unique_users,
            'avg_interactions_per_user': round(avg_interactions_per_user, 2),
            'conversion_rates': {
                'purchase_to_view_percent': round(conversion_rates['purchase_to_view'], 2),
                'add_to_cart_to_view_percent': round(conversion_rates['add_to_cart_to_view'], 2),
                'purchase_to_cart_percent': round(conversion_rates['purchase_to_cart'], 2)
            }
        })
    except Exception as e:
        return Response({'error': f'Erreur métriques admin: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['GET', 'POST'])
@permission_classes([permissions.IsAdminUser])
def admin_config_view(request):
    """Lire/mettre à jour la config du moteur (poids, stratégie par défaut)"""
    from recommendations.engine import get_global_recommender, get_global_cf_recommender
    
    cfg = RecommendationConfig.objects(config_name='default').first()
    if request.method == 'GET':
        if not cfg:
            cfg = RecommendationConfig(config_name='default')
            cfg.save()
        
        # Récupérer l'état des modèles
        content_recommender = get_global_recommender()
        cf_recommender = get_global_cf_recommender()
        
        content_status = {
            'available': content_recommender is not None,
            'trained': content_recommender is not None and content_recommender.cosine_sim is not None,
            'products_count': len(content_recommender.cb_df) if content_recommender and content_recommender.cb_df is not None else 0
        }
        
        cf_status = {
            'available': cf_recommender is not None,
            'trained': cf_recommender is not None and cf_recommender.is_fitted,
            'items_count': len(cf_recommender.item_index_map) if cf_recommender and cf_recommender.item_index_map else 0,
            'users_count': cf_recommender.user_item_matrix.shape[1] if cf_recommender and cf_recommender.user_item_matrix is not None else 0,
            'training_stats': cf_recommender.training_stats if cf_recommender and cf_recommender.training_stats else {}
        }
        
        return Response({
            'popularity_weight': cfg.popularity_weight,
            'preference_bonus_category': cfg.preference_bonus_category,
            'preference_bonus_brand': cfg.preference_bonus_brand,
            'preference_bonus_price': cfg.preference_bonus_price,
            'default_strategy': cfg.default_strategy,
            'selected_model': cfg.selected_model,
            'models_status': {
                'content_based': content_status,
                'collaborative_filtering': cf_status
            }
        })
    data = request.data or {}
    if not cfg:
        cfg = RecommendationConfig(config_name='default')
    for field in ['popularity_weight','preference_bonus_category','preference_bonus_brand','preference_bonus_price','default_strategy','selected_model']:
        if field in data:
            setattr(cfg, field, data[field])
    cfg.save()
    return Response({'message': 'Configuration mise à jour'})

@api_view(['POST'])
@permission_classes([permissions.IsAdminUser])
def admin_retrain_view(request):
    """Relancer l'entrainement du moteur Content-Based (avec historisation)"""
    from recommendations.engine import initialize_recommender, get_global_recommender
    from api.models import ModelTrainingHistory
    import time

    # Créer une entrée d'historique au début
    history = ModelTrainingHistory(
        model_name='content_based',
        status='started',
        params={}
    )
    history.save()

    start_time = time.time()

    try:
        # Lancer l'entraînement de manière synchrone (peut prendre du temps)
        initialize_recommender()
        duration = time.time() - start_time

        recommender = get_global_recommender()

        # Mettre à jour l'historique
        history.status = 'success'
        history.finished_at = timezone.now()
        history.duration_sec = duration
        if recommender:
            history.training_stats = {
                'products_count': len(recommender.cb_df) if getattr(recommender, 'cb_df', None) is not None else 0,
                'similarity_matrix_shape': getattr(recommender, 'cosine_sim', None).shape
                if getattr(recommender, 'cosine_sim', None) is not None
                else None,
            }
        history.save()

        if recommender:
            return Response({
                'message': 'Réentraînement Content-Based réussi',
                'status': 'completed',
                'stats': history.training_stats,
            })
        else:
            return Response(
                {'error': 'Échec du réentraînement (modèle non disponible)'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
    except Exception as e:
        duration = time.time() - start_time
        history.status = 'failed'
        history.finished_at = timezone.now()
        history.duration_sec = duration
        history.error_message = str(e)
        history.save()
        return Response(
            {'error': f'Echec réentraînement: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

@api_view(['GET'])
@permission_classes([permissions.IsAdminUser])
def admin_reco_debug_view(request):
    """Détails d’explications brutes pour un item donné (admin)"""
    itemid = request.query_params.get('itemid')
    if not itemid:
        return Response({'error': 'itemid requis'}, status=status.HTTP_400_BAD_REQUEST)
    recommender = get_global_recommender()
    if recommender is None:
        return Response({'error': 'Système de recommandation non disponible'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    try:
        recs = recommender.get_recommendations_with_scores(itemid, top_n=10)
        if isinstance(recs, str):
            return Response({'message': recs, 'recommendations': []})
        # enrichir avec signaux simples
        details = []
        try:
            src = fetch_product_by_itemid(itemid)
        except Product.DoesNotExist:
            return Response({'error': 'Produit source introuvable'}, status=status.HTTP_404_NOT_FOUND)
        for rec in recs:
            try:
                rp = fetch_product_by_itemid(rec['itemid'])
                name_overlap = len(set(str(rec['name']).lower().split()) & set(str(src.name).lower().split()))
                price_diff = abs(float(rec['discount_price']) - float(src.discount_price))
                details.append({
                    **rec,
                    'name_overlap': name_overlap,
                    'same_category': int(bool(rp.category and src.category and rp.category == src.category)),
                    'same_brand': int(bool(rp.brand and src.brand and rp.brand == src.brand)),
                    'price_delta': price_diff
                })
            except Product.DoesNotExist:
                details.append({**rec})
        return Response({'itemid': itemid, 'debug': details})
    except Exception as e:
        return Response({'error': f'Erreur reco-debug: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['GET'])
@permission_classes([permissions.IsAdminUser])
def admin_user_recommendations_view(request):
    """Voir les recommandations d'un utilisateur et les explications (admin)"""
    user_id = request.query_params.get('user_id')
    if not user_id:
        return Response({'error': 'user_id requis'}, status=status.HTTP_400_BAD_REQUEST)
    try:
        user_id = int(user_id)
    except ValueError:
        return Response({'error': 'user_id invalide'}, status=status.HTTP_400_BAD_REQUEST)
    recommender = get_global_recommender()
    if recommender is None:
        return Response({'error': 'Système de recommandation non disponible'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    try:
        # Contexte: dernières interactions
        recent_interactions = UserInteraction.objects.filter(
            user_id=user_id,
            interaction_type__in=['view', 'purchase', 'like', 'add_to_cart', 'rating']
        ).order_by('-timestamp')[:10]
        interactions_dump = [{
            'product_id': it.product_id,
            'type': it.interaction_type,
            'quantity': it.quantity,
            'rating': it.rating,
            'timestamp': it.timestamp
        } for it in recent_interactions]
        # Générer recos comme user_recommendations, avec plus de détails
        cfg = RecommendationConfig.objects(config_name='default').first()
        popularity_weight = cfg.popularity_weight if cfg else 0.05
        requested_strategy = request.query_params.get('strategy')
        if requested_strategy:
            strategy = requested_strategy
        else:
            strategy = map_selected_model_to_strategy(cfg.selected_model if cfg else None)
        prefs = UserPreference.objects(user_id=user_id).first()
        all_recs = []
        seen = set()
        for it in recent_interactions[:5]:
            recs = recommender.get_recommendations_with_scores(it.product_id, top_n=5)
            if isinstance(recs, str):
                continue
            # hybrid popularity
            if strategy == 'hybrid':
                from collections import Counter
                pop_counts = Counter()
                ids = [r['itemid'] for r in recs]
                interactions = UserInteraction.objects.filter(interaction_type__in=['view','purchase','like','add_to_cart'], product_id__in=ids)
                for inter in interactions:
                    pop_counts[inter.product_id] += 3 if inter.interaction_type in ['purchase','add_to_cart'] else 1
                for r in recs:
                    r['popularity'] = pop_counts.get(r['itemid'], 0)
                    r['combined_score'] = r['similarity_score'] + popularity_weight * r['popularity']
                recs = sorted(recs, key=lambda x: x.get('combined_score', x['similarity_score']), reverse=True)
            # preferences bonus
            for r in recs:
                if r['itemid'] in seen:
                    continue
                detail = dict(r)
                detail['source_product'] = it.product_id
                detail['source_type'] = it.interaction_type
                # simple explanations
                try:
                    src = fetch_product_by_itemid(it.product_id)
                    tgt = fetch_product_by_itemid(r['itemid'])
                    name_overlap = len(set(str(tgt.name).lower().split()) & set(str(src.name).lower().split()))
                    price_diff = abs(float(tgt.discount_price) - float(src.discount_price))
                    reasons = []
                    if tgt.category and src.category and tgt.category == src.category:
                        reasons.append('même catégorie')
                    if tgt.brand and src.brand and tgt.brand == src.brand:
                        reasons.append('même marque')
                    if name_overlap:
                        reasons.append(f'{name_overlap} mot(s) commun(s)')
                    reasons.append(f'Δ prix={price_diff:.2f}')
                    if detail.get('popularity'):
                        reasons.append(f'populaire (signals={detail.get("popularity")})')
                    detail['explanations'] = [
                        f"similaire à {it.product_id} (score={detail.get('similarity_score',0):.3f})",
                        f"source: {it.interaction_type}",
                        *reasons
                    ]
                except Product.DoesNotExist:
                    detail['explanations'] = []
                all_recs.append(detail)
                seen.add(r['itemid'])
        return Response({
            'user_id': user_id,
            'strategy': strategy,
            'preferences': {
                'liked_categories': (prefs.liked_categories if prefs else []),
                'liked_brands': (prefs.liked_brands if prefs else []),
                'price_min': (prefs.price_min if prefs else None),
                'price_max': (prefs.price_max if prefs else None)
            },
            'recent_interactions': interactions_dump,
            'recommendations': all_recs[:10]
        })
    except Exception as e:
        return Response({'error': f'Erreur user-recommendations admin: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['GET'])
@permission_classes([permissions.IsAdminUser])
def admin_users_list_view(request):
    """Liste des utilisateurs avec statistiques (admin)"""
    try:
        page = int(request.query_params.get('page', 1))
        page_size = int(request.query_params.get('page_size', 20))
        search = request.query_params.get('search', '').strip() or None

        UserCollectionService.ensure_bootstrapped()
        payload = UserCollectionService.get_users_page(
            page=page,
            page_size=page_size,
            search=search,
        )

        return Response(payload)
    except ValueError:
        return Response({'error': 'Paramètres page/page_size invalides'}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        return Response({'error': f'Erreur liste utilisateurs: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['GET'])
@permission_classes([permissions.IsAdminUser])
def admin_interactions_timeline_view(request):
    """Timeline des interactions avec filtres (admin)"""
    try:
        from datetime import datetime
        
        # Filtres
        interaction_type = request.query_params.get('type')
        user_id = request.query_params.get('user_id')
        product_id = request.query_params.get('product_id')
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        
        # Pagination
        page = int(request.query_params.get('page', 1))
        page_size = int(request.query_params.get('page_size', 50))
        
        # Construire la requête
        query = UserInteraction.objects.all()
        
        if interaction_type:
            query = query.filter(interaction_type=interaction_type)
        if user_id:
            try:
                query = query.filter(user_id=int(user_id))
            except ValueError:
                pass
        if product_id:
            query = query.filter(product_id=product_id)
        if start_date:
            try:
                start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
                query = query.filter(timestamp__gte=start_dt)
            except ValueError:
                pass
        if end_date:
            try:
                end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
                query = query.filter(timestamp__lte=end_dt)
            except ValueError:
                pass
        
        # Compter le total
        total = query.count()
        
        # Pagination
        start = (page - 1) * page_size
        end = start + page_size
        interactions = query.order_by('-timestamp')[start:end]
        
        # Enrichir avec les noms de produits
        interactions_data = []
        product_ids = set(it.product_id for it in interactions)
        products_dict = {}
        for product in Product.objects.filter(itemid__in=product_ids):
            products_dict[product.itemid] = product.name
        
        for interaction in interactions:
            interactions_data.append({
                'user_id': interaction.user_id,
                'product_id': interaction.product_id,
                'product_name': products_dict.get(interaction.product_id, 'Unknown'),
                'interaction_type': interaction.interaction_type,
                'timestamp': interaction.timestamp.isoformat(),
                'rating': float(interaction.rating) if interaction.rating else None,
                'quantity': interaction.quantity if interaction.quantity else None
            })
        
        return Response({
            'interactions': interactions_data,
            'total': total,
            'page': page,
            'page_size': page_size
        })
    except Exception as e:
        return Response({'error': f'Erreur timeline interactions: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['GET'])
@permission_classes([permissions.IsAdminUser])
def admin_temporal_stats_view(request):
    """Statistiques temporelles (admin)"""
    try:
        from datetime import datetime, timedelta
        from collections import defaultdict
        
        period = request.query_params.get('period', 'day')  # day, week, month
        days = int(request.query_params.get('days', 7))
        
        # Calculer la date de début
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=days)
        
        # Récupérer toutes les interactions dans la période
        interactions = UserInteraction.objects.filter(
            timestamp__gte=start_date,
            timestamp__lte=end_date
        )
        
        # Agréger par période
        stats_by_date = defaultdict(lambda: {
            'views': 0,
            'likes': 0,
            'add_to_cart': 0,
            'purchases': 0,
            'ratings': 0,
            'unique_users': set(),
            'recommendations_generated': 0  # Estimation basée sur les vues
        })
        
        for interaction in interactions:
            # Déterminer la clé de date selon la période
            if period == 'day':
                date_key = interaction.timestamp.date().isoformat()
            elif period == 'week':
                week_start = interaction.timestamp.date() - timedelta(days=interaction.timestamp.weekday())
                date_key = week_start.isoformat()
            else:  # month
                date_key = interaction.timestamp.date().replace(day=1).isoformat()
            
            stats_by_date[date_key][interaction.interaction_type] += 1
            stats_by_date[date_key]['unique_users'].add(interaction.user_id)
            
            # Estimation: chaque vue génère ~5 recommandations
            if interaction.interaction_type == 'view':
                stats_by_date[date_key]['recommendations_generated'] += 5
        
        # Convertir en liste triée
        data = []
        for date_key in sorted(stats_by_date.keys()):
            stats = stats_by_date[date_key]
            data.append({
                'date': date_key,
                'views': stats['views'],
                'likes': stats['likes'],
                'add_to_cart': stats['add_to_cart'],
                'purchases': stats['purchases'],
                'ratings': stats['ratings'],
                'unique_users': len(stats['unique_users']),
                'recommendations_generated': stats['recommendations_generated']
            })
        
        return Response({
            'period': period,
            'days': days,
            'data': data
        })
    except Exception as e:
        return Response({'error': f'Erreur stats temporelles: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['GET', 'POST'])
def cart_view(request):
    """Gestion du panier utilisateur"""
    if not request.user.is_authenticated:
        return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)

    user_id = request.user.id

    if request.method == 'GET':
        try:
            cart = Cart.objects(user_id=user_id).first()
            if cart is None:
                return Response({
                    'user_id': user_id,
                    'items': [],
                    'total_amount': 0,
                    'message': 'Panier vide'
                })
            cart_data = {
                'user_id': cart.user_id,
                'items': [],
                'total_amount': float(cart.total_amount),
                'created_at': cart.created_at,
                'updated_at': cart.updated_at,
            }
            
            # Enrichir les items avec les infos produit
            for item in cart.items:
                try:
                    product = fetch_product_by_itemid(item.product_id)
                    cart_data['items'].append({
                        'product_id': item.product_id,
                        'quantity': item.quantity,
                        'price': float(item.price),
                        'added_at': item.added_at,
                        'product_name': product.name,
                        'product_image': product.image,
                        'total_price': float(item.price) * item.quantity
                    })
                except Product.DoesNotExist:
                    # Produit supprimé, ignorer l'item
                    continue
            
            return Response(cart_data)
        except Cart.DoesNotExist:
            return Response({
                'user_id': user_id,
                'items': [],
                'total_amount': 0,
                'message': 'Panier vide'
            })

    elif request.method == 'POST':
        serializer = AddToCartSerializer(data=request.data)
        if serializer.is_valid():
            product_id = serializer.validated_data['product_id']
            quantity = serializer.validated_data['quantity']
            
            try:
                product = fetch_product_by_itemid(product_id)
                
                # Vérification du stock désactivée - permettre l'ajout même si stock insuffisant
                # if product.stock_quantity < quantity:
                #     return Response({'error': 'Stock insuffisant'}, status=status.HTTP_400_BAD_REQUEST)
                
                # Récupérer ou créer le panier
                cart = Cart.objects(user_id=user_id).first()
                if cart is None:
                    cart = Cart(user_id=user_id, items=[])
                
                # Vérifier si le produit est déjà dans le panier
                existing_item = None
                for item in (cart.items or []):
                    if item.product_id == product_id:
                        existing_item = item
                        break
                
                if existing_item:
                    existing_item.quantity += quantity
                else:
                    new_item = CartItem(
                        product_id=product_id,
                        quantity=quantity,
                        price=product.discount_price
                    )
                    if cart.items is None:
                        cart.items = [new_item]
                    else:
                        cart.items.append(new_item)
                
                cart.save()
                
                # Enregistrer l'interaction
                UserInteraction.objects.create(
                    user_id=user_id,
                    product_id=product_id,
                    interaction_type='add_to_cart',
                    quantity=quantity
                )
                
                return Response({'message': 'Produit ajouté au panier'}, status=status.HTTP_201_CREATED)
                
            except Product.DoesNotExist:
                return Response({'error': 'Produit introuvable'}, status=status.HTTP_404_NOT_FOUND)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['DELETE'])
def remove_from_cart(request, product_id):
    """Supprimer un produit du panier"""
    if not request.user.is_authenticated:
        return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)

    user_id = request.user.id
    
    try:
        cart = Cart.objects(user_id=user_id).first()
        if cart is None:
            return Response({'error': 'Panier introuvable'}, status=status.HTTP_404_NOT_FOUND)
        
        # Trouver et supprimer l'item
        cart.items = [item for item in cart.items if item.product_id != product_id]
        cart.save()
        
        return Response({'message': 'Produit supprimé du panier'})
    except Exception as e:
        return Response({'error': f'Erreur lors de la suppression: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET', 'POST'])
def orders_view(request):
    """Gestion des commandes"""
    if not request.user.is_authenticated:
        return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)

    user_id = request.user.id

    if request.method == 'GET':
        orders = Order.objects(user_id=user_id).order_by('-created_at')
        orders_data = []
        
        for order in orders:
            orders_data.append({
                'order_id': order.order_id,
                'user_id': order.user_id,
                'items': [
                    {
                        'product_id': item.product_id,
                        'product_name': item.product_name,
                        'quantity': item.quantity,
                        'unit_price': float(item.unit_price),
                        'total_price': float(item.total_price)
                    } for item in order.items
                ],
                'shipping_address': order.shipping_address,
                'billing_address': order.billing_address,
                'subtotal': float(order.subtotal),
                'shipping_cost': float(order.shipping_cost),
                'tax_amount': float(order.tax_amount),
                'total_amount': float(order.total_amount),
                'status': order.status,
                'created_at': order.created_at,
                'updated_at': order.updated_at,
            })
        
        return Response(orders_data)

    elif request.method == 'POST':
        serializer = CreateOrderSerializer(data=request.data)
        if serializer.is_valid():
            try:
                cart = Cart.objects(user_id=user_id).first()
                if cart is None or not cart.items:
                    return Response({'error': 'Panier vide'}, status=status.HTTP_400_BAD_REQUEST)
                
                # Créer la commande
                order_data = {
                    'user_id': user_id,
                    'items': [],
                    'shipping_address': serializer.validated_data['shipping_address'],
                    'billing_address': serializer.validated_data.get('billing_address', serializer.validated_data['shipping_address']),
                    'subtotal': cart.total_amount,
                    'shipping_cost': serializer.validated_data.get('shipping_cost', 0),
                    'tax_amount': serializer.validated_data.get('tax_amount', 0),
                    'total_amount': cart.total_amount + serializer.validated_data.get('shipping_cost', 0) + serializer.validated_data.get('tax_amount', 0)
                }
                
                # Convertir les items du panier en items de commande
                for cart_item in cart.items:
                    try:
                        product = fetch_product_by_itemid(cart_item.product_id)
                        order_data['items'].append({
                            'product_id': cart_item.product_id,
                            'product_name': product.name,
                            'quantity': cart_item.quantity,
                            'unit_price': float(cart_item.price),
                            'total_price': float(cart_item.price) * cart_item.quantity
                        })
                        
                        # Enregistrer l'interaction d'achat
                        UserInteraction.objects.create(
                            user_id=user_id,
                            product_id=cart_item.product_id,
                            interaction_type='purchase',
                            quantity=cart_item.quantity
                        )
                    except Product.DoesNotExist:
                        continue
                
                order_serializer = OrderSerializer(data=order_data)
                if order_serializer.is_valid():
                    order_serializer.save()
                    
                    # Vider le panier
                    cart.delete()
                    
                    return Response(order_serializer.data, status=status.HTTP_201_CREATED)
                else:
                    return Response(order_serializer.errors, status=status.HTTP_400_BAD_REQUEST)
                
            except Cart.DoesNotExist:
                return Response({'error': 'Panier introuvable'}, status=status.HTTP_404_NOT_FOUND)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
def record_interaction(request):
    """Enregistrer une interaction utilisateur"""
    if not request.user.is_authenticated:
        return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)

    data = request.data.copy()
    data['user_id'] = request.user.id
    
    # Normaliser le product_id en string
    if 'product_id' in data:
        data['product_id'] = str(data['product_id']).strip()
    
    serializer = UserInteractionSerializer(data=data)
    if serializer.is_valid():
        try:
            serializer.save()
            action_type = serializer.validated_data.get('interaction_type')
            product_id = serializer.validated_data.get('product_id')
            logger.info(f"Interaction enregistrée: user={request.user.id}, type={action_type}, product={product_id}")
            return Response({
                'message': f"Interaction enregistrée ({action_type})",
                'interaction_type': action_type,
                'product_id': product_id
            }, status=status.HTTP_201_CREATED)
        except Exception as e:
            logger.error(f"Erreur lors de l'enregistrement de l'interaction: {e}", exc_info=True)
            return Response({'error': f'Erreur lors de l\'enregistrement: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    logger.warning(f"Erreur validation serializer: {serializer.errors}")
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
def favorites_view(request):
    """Récupérer tous les produits favoris de l'utilisateur"""
    if not request.user.is_authenticated:
        return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)
    
    user_id = request.user.id
    try:
        # Récupérer toutes les interactions de type 'like'
        likes = UserInteraction.objects.filter(
            user_id=user_id,
            interaction_type='like'
        ).order_by('-timestamp')
        
        # Récupérer les IDs des produits favoris (dédupliquer)
        favorite_product_ids = list(set([like.product_id for like in likes]))
        
        # Récupérer les produits complets
        favorite_products = []
        seen_itemids = set()  # Pour éviter les doublons
        for product_id in favorite_product_ids:
            try:
                product = fetch_product_by_itemid(product_id)
                itemid_str = str(product.itemid)
                
                # Éviter les doublons
                if itemid_str in seen_itemids:
                    continue
                seen_itemids.add(itemid_str)
                
                favorite_products.append({
                    'itemid': itemid_str,
                    'name': product.name,
                    'image': product.image,
                    'ratings': product.ratings,
                    'discount_price': float(product.discount_price),
                    'actual_price': float(product.actual_price),
                    'description': product.description,
                    'category': product.category,
                    'brand': product.brand,
                    'in_stock': product.in_stock,
                    'stock_quantity': product.stock_quantity,
                })
            except Exception as e:
                logger.warning(f"Produit {product_id} non trouvé pour favoris: {e}")
                continue
        
        return Response({
            'favorites': favorite_products,
            'count': len(favorite_products)
        }, status=status.HTTP_200_OK)
    except Exception as e:
        logger.error(f"Erreur récupération favoris: {e}")
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['DELETE'])
def remove_favorite(request, product_id):
    """Supprimer un produit des favoris"""
    if not request.user.is_authenticated:
        return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)
    
    user_id = request.user.id
    try:
        # S'assurer que product_id est une string (normalisation)
        product_id = str(product_id).strip()
        
        # Récupérer les interactions à supprimer
        # Essayer avec différentes variantes du product_id
        interactions = UserInteraction.objects.filter(
            user_id=user_id,
            product_id=product_id,
            interaction_type='like'
        )
        
        # Si aucune interaction trouvée, essayer sans normalisation
        count_before = interactions.count()
        if count_before == 0:
            # Essayer de trouver avec d'autres variantes
            all_likes = UserInteraction.objects.filter(
                user_id=user_id,
                interaction_type='like'
            )
            # Chercher si le product_id correspond à un itemid de produit
            for like in all_likes:
                if str(like.product_id).strip() == product_id or like.product_id == product_id:
                    interactions = UserInteraction.objects.filter(
                        user_id=user_id,
                        product_id=like.product_id,  # Utiliser le product_id exact de la DB
                        interaction_type='like'
                    )
                    count_before = interactions.count()
                    break
        
        if count_before == 0:
            logger.warning(f"Produit {product_id} non trouvé dans les favoris pour user {user_id}")
            return Response({
                'message': 'Produit non trouvé dans les favoris',
                'product_id': product_id
            }, status=status.HTTP_404_NOT_FOUND)
        
        # Supprimer chaque interaction individuellement (plus fiable avec MongoEngine)
        deleted_count = 0
        for interaction in interactions:
            try:
                interaction.delete()
                deleted_count += 1
            except Exception as e:
                logger.warning(f"Erreur suppression interaction {interaction.id}: {e}")
                continue
        
        if deleted_count > 0:
            return Response({
                'message': 'Produit retiré des favoris',
                'product_id': product_id,
                'deleted_count': deleted_count
            }, status=status.HTTP_200_OK)
        else:
            return Response({
                'message': 'Erreur lors de la suppression',
                'product_id': product_id
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    except Exception as e:
        logger.error(f"Erreur suppression favori: {e}", exc_info=True)
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['DELETE'])
def clear_all_favorites(request):
    """Supprimer tous les favoris de l'utilisateur"""
    if not request.user.is_authenticated:
        return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)
    
    user_id = request.user.id
    try:
        # Récupérer toutes les interactions 'like' de l'utilisateur
        interactions = UserInteraction.objects.filter(
            user_id=user_id,
            interaction_type='like'
        )
        
        # Compter avant suppression
        count_before = interactions.count()
        
        if count_before == 0:
            return Response({
                'message': 'Aucun favori à supprimer',
                'deleted_count': 0
            }, status=status.HTTP_200_OK)
        
        # Supprimer chaque interaction individuellement (plus fiable avec MongoEngine)
        deleted_count = 0
        for interaction in interactions:
            try:
                interaction.delete()
                deleted_count += 1
            except Exception as e:
                logger.warning(f"Erreur suppression interaction {interaction.id}: {e}")
                continue
        
        return Response({
            'message': f'{deleted_count} favori(s) supprimé(s)',
            'deleted_count': deleted_count
        }, status=status.HTTP_200_OK)
    except Exception as e:
        logger.error(f"Erreur suppression tous favoris: {e}", exc_info=True)
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def popular_products(request):
    """Produits populaires basés sur les interactions"""
    try:
        # Récupérer les produits les plus vus/achetés
        from collections import Counter
        
        interactions = UserInteraction.objects.filter(
            interaction_type__in=['view', 'purchase']
        )
        
        product_counts = Counter()
        for interaction in interactions:
            weight = 3 if interaction.interaction_type == 'purchase' else 1
            product_counts[interaction.product_id] += weight
        
        # Récupérer les 10 produits les plus populaires
        popular_product_ids = [pid for pid, count in product_counts.most_common(10)]
        
        popular_products = []
        for product_id in popular_product_ids:
            try:
                product = fetch_product_by_itemid(product_id)
                popular_products.append({
                    'itemid': product.itemid,
                    'name': product.name,
                    'image': product.image,
                    'ratings': product.ratings,
                    'discount_price': float(product.discount_price),
                    'actual_price': float(product.actual_price),
                    'category': product.category,
                    'brand': product.brand,
                })
            except Product.DoesNotExist:
                continue
        
        return Response({
            'popular_products': popular_products
        })
    
    except Exception as e:
        return Response({'error': f'Erreur lors de la récupération des produits populaires: {str(e)}'}, 
                       status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['GET', 'POST'])
def preferences_view(request):
    """Créer/mettre à jour et récupérer les préférences utilisateur (onboarding)"""
    if not request.user.is_authenticated:
        return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)
    user_id = request.user.id
    if request.method == 'GET':
        prefs = UserPreference.objects(user_id=user_id).first()
        if not prefs:
            return Response({'user_id': user_id, 'liked_categories': [], 'liked_brands': [], 'price_min': None, 'price_max': None})
        return Response({
            'user_id': user_id,
            'liked_categories': prefs.liked_categories or [],
            'liked_brands': prefs.liked_brands or [],
            'price_min': prefs.price_min,
            'price_max': prefs.price_max
        })
    data = request.data or {}
    prefs = UserPreference.objects(user_id=user_id).first()
    if prefs is None:
        prefs = UserPreference(user_id=user_id)
    prefs.liked_categories = data.get('liked_categories', []) or []
    prefs.liked_brands = data.get('liked_brands', []) or []
    prefs.price_min = data.get('price_min')
    prefs.price_max = data.get('price_max')
    prefs.save()
    return Response({'message': 'Préférences enregistrées', 'user_id': user_id})

@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def search_view(request):
    """Recherche sémantique simple sur nom+description (TF-IDF + cosinus)"""
    query = request.query_params.get('q')
    if not query:
        return Response({'results': []})
    try:
        products = list(Product.objects.all())
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.metrics.pairwise import cosine_similarity
        docs = []
        for p in products:
            text = f"{p.name or ''} {p.description or ''}"
            docs.append(text)
        vectorizer = TfidfVectorizer(stop_words='english')
        matrix = vectorizer.fit_transform(docs)
        q_vec = vectorizer.transform([query])
        scores = cosine_similarity(q_vec, matrix).flatten()
        top_idx = scores.argsort()[::-1][:10]
        results = []
        for i in top_idx:
            prod = products[i]
            results.append({
                'itemid': prod.itemid,
                'name': prod.name,
                'image': prod.image,
                'ratings': prod.ratings,
                'discount_price': float(prod.discount_price),
                'actual_price': float(prod.actual_price),
                'score': float(scores[i])
            })
        return Response({'query': query, 'results': results})
    except Exception as e:
        return Response({'error': f'Recherche en erreur: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def recommendation_config_view(request):
    """Exposer la configuration de recommandation minimale aux pages publiques."""
    cfg = RecommendationConfig.objects(config_name='default').first()
    if not cfg:
        cfg = RecommendationConfig(config_name='default')
        cfg.save()

    return Response({
        'selected_model': cfg.selected_model or 'hybrid',
        'default_strategy': cfg.default_strategy,
        'popularity_weight': cfg.popularity_weight,
    })

@api_view(['GET'])
def metrics_view(request):
    """Statistiques simples sur les interactions (proxy de pertinence)"""
    # Pas besoin d'auth pour demo; restreindre si nécessaire
    try:
        # Totaux par type
        totals = {}
        for itype in ['view', 'like', 'add_to_cart', 'purchase', 'rating']:
            totals[itype] = UserInteraction.objects.filter(interaction_type=itype).count()
        # Dernières 24h
        from datetime import datetime, timedelta
        since = datetime.utcnow() - timedelta(hours=24)
        totals_24h = {}
        for itype in ['view', 'like', 'add_to_cart', 'purchase', 'rating']:
            totals_24h[itype] = UserInteraction.objects.filter(interaction_type=itype, timestamp__gte=since).count()
        return Response({
            'interactions_total': totals,
            'interactions_last_24h': totals_24h
        })
    except Exception as e:
        return Response({'error': f'Erreur métriques: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
def user_recommendations(request):
    """Recommandations personnalisées pour l'utilisateur connecté"""
    if not request.user.is_authenticated:
        return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)

    user_id = request.user.id
    
    try:
        cfg = RecommendationConfig.objects(config_name='default').first()
        strategy = request.query_params.get('strategy', (cfg.default_strategy if cfg else 'content'))
        
        # Pour le collaborative filtering, on peut utiliser visitorid directement
        # On suppose que user_id correspond à visitorid dans les événements
        visitorid = str(user_id)
        
        all_recommendations = []
        seen_products = set()
        
        if strategy == 'collaborative':
            # Le collaborative filtering Item-Based n'est pas disponible pour les recommandations utilisateur
            # Utiliser content-based à la place
            return Response({
                'error': 'Collaborative filtering non disponible pour les recommandations utilisateur',
                'message': 'Le collaborative filtering est uniquement disponible pour les recommandations par produit (Item-Based). Utilisez strategy=content ou strategy=hybrid.'
            }, status=status.HTTP_400_BAD_REQUEST)
            
        elif strategy == 'hybrid':
            # Combiner les deux approches
            content_recommender = get_global_recommender()
            cf_recommender = get_global_cf_recommender()
            
            # Récupérer les dernières interactions de l'utilisateur
            recent_interactions = UserInteraction.objects.filter(
                user_id=user_id,
                interaction_type__in=['view', 'purchase', 'like']
            ).order_by('-timestamp')[:5]
            
            # Recommandations collaborative filtering (Item-Based uniquement)
            # Pour hybrid, on utilise uniquement content-based pour les recommandations utilisateur
            cf_recs = []
            
            # Recommandations content-based basées sur les interactions
            content_recs = []
            if content_recommender and recent_interactions:
                for interaction in recent_interactions:
                    if interaction.product_id not in seen_products:
                        recs = content_recommender.get_recommendations_with_scores(
                            interaction.product_id, top_n=3
                        )
                        if not isinstance(recs, str):
                            content_recs.extend(recs)
                            seen_products.add(interaction.product_id)
            
            # Combiner les résultats
            combined_scores = {}
            for rec in content_recs:
                itemid_rec = rec['itemid']
                combined_scores[itemid_rec] = {
                    **rec,
                    'content_score': rec.get('similarity_score', 0),
                    'cf_score': 0
                }
            
            for rec in cf_recs:
                itemid_rec = rec['itemid']
                if itemid_rec in combined_scores:
                    combined_scores[itemid_rec]['cf_score'] = rec.get('similarity_score', 0)
                    combined_scores[itemid_rec]['similarity_score'] = (
                        combined_scores[itemid_rec]['content_score'] * 0.5 +
                        rec.get('similarity_score', 0) * 0.5
                    )
                else:
                    combined_scores[itemid_rec] = {
                        **rec,
                        'content_score': 0,
                        'cf_score': rec.get('similarity_score', 0),
                        'similarity_score': rec.get('similarity_score', 0)
                    }
            
            all_recommendations = sorted(
                combined_scores.values(),
                key=lambda x: x.get('similarity_score', 0),
                reverse=True
            )
        else:
            # Par défaut: content-based
            # Récupérer les dernières interactions de l'utilisateur
            recent_interactions = UserInteraction.objects.filter(
                user_id=user_id,
                interaction_type__in=['view', 'purchase', 'like']
            ).order_by('-timestamp')[:5]
            
            if not recent_interactions:
                # Si pas d'interactions, retourner les produits populaires
                return popular_products(request)
            
            recommender = get_global_recommender()
            if recommender is None:
                return Response({'error': 'Système de recommandation non disponible'}, 
                              status=status.HTTP_503_SERVICE_UNAVAILABLE)
            
            # Générer des recommandations basées sur les interactions récentes
            for interaction in recent_interactions:
                if interaction.product_id not in seen_products:
                    recs = recommender.get_recommendations_with_scores(
                        interaction.product_id, top_n=3
                    )
                    if not isinstance(recs, str):
                        cfg = RecommendationConfig.objects(config_name='default').first()
                        popularity_weight = cfg.popularity_weight if cfg else 0.05
                        strategy_local = request.query_params.get('strategy', (cfg.default_strategy if cfg else 'content'))
                        if strategy_local == 'hybrid':
                            from collections import Counter
                            pop_counts = Counter()
                            ids = [r['itemid'] for r in recs]
                            interactions = UserInteraction.objects.filter(interaction_type__in=['view','purchase','like','add_to_cart'], product_id__in=ids)
                            for inter in interactions:
                                pop_counts[inter.product_id] += 3 if inter.interaction_type in ['purchase','add_to_cart'] else 1
                            for r in recs:
                                r['popularity'] = pop_counts.get(r['itemid'], 0)
                                r['combined_score'] = r['similarity_score'] + popularity_weight * r['popularity']
                            recs = sorted(recs, key=lambda x: x.get('combined_score', x['similarity_score']), reverse=True)
                        # preferences
                        prefs = UserPreference.objects(user_id=user_id).first()
                        pref_bonus_cat = (cfg.preference_bonus_category if cfg else 0.05)
                        pref_bonus_brand = (cfg.preference_bonus_brand if cfg else 0.05)
                        pref_bonus_price = (cfg.preference_bonus_price if cfg else 0.05)
                        for rec in recs:
                            try:
                                rp = fetch_product_by_itemid(rec['itemid'])
                                bonus = 0.0
                                if prefs:
                                    if prefs.liked_categories and rp.category in prefs.liked_categories:
                                        bonus += pref_bonus_cat
                                    if prefs.liked_brands and rp.brand in prefs.liked_brands:
                                        bonus += pref_bonus_brand
                                    if prefs.price_min is not None and prefs.price_max is not None:
                                        if float(prefs.price_min) <= float(rec['discount_price']) <= float(prefs.price_max):
                                            bonus += pref_bonus_price
                                rec['similarity_score'] = float(rec['similarity_score']) + bonus
                            except Product.DoesNotExist:
                                pass
                        for rec in recs:
                            if rec['itemid'] not in seen_products:
                                # Ajouter une explication mentionnant la source
                                rec['explanations'] = [
                                    f"similaire à {interaction.product_id} (score={rec.get('similarity_score', 0):.3f})",
                                    f"source: {interaction.interaction_type}"
                                ]
                                if rec.get('popularity'):
                                    rec['explanations'].append(f"populaire (signals={rec.get('popularity')})")
                                if prefs:
                                    if prefs.liked_categories:
                                        rec['explanations'].append('préférence catégorie appliquée')
                                    if prefs.liked_brands:
                                        rec['explanations'].append('préférence marque appliquée')
                                all_recommendations.append(rec)
                                seen_products.add(rec['itemid'])
        
        # Limiter à 10 recommandations
        final_recommendations = all_recommendations[:10]
        
        return Response({
            'user_id': user_id,
            'recommendations': final_recommendations
        })
    
    except Exception as e:
        return Response({'error': f'Erreur lors de la génération des recommandations: {str(e)}'}, 
                       status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ========== COLLABORATIVE FILTERING ENDPOINTS ==========

@api_view(['GET'])
@permission_classes([permissions.IsAdminUser])
def admin_cf_product_recommendations_view(request):
    """Recommandations collaborative filtering pour un produit spécifique (admin)"""
    itemid = request.query_params.get('itemid')
    top_n = int(request.query_params.get('top_n', 10))
    
    if not itemid:
        return Response({'error': 'itemid requis'}, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        cf_recommender = get_global_cf_recommender()
        if cf_recommender is None:
            return Response({'error': 'Système de collaborative filtering non disponible'}, 
                          status=status.HTTP_503_SERVICE_UNAVAILABLE)
        
        if not cf_recommender.is_fitted:
            return Response({'error': 'Modèle collaborative filtering non entraîné'}, 
                          status=status.HTTP_503_SERVICE_UNAVAILABLE)
        
        recs = cf_recommender.get_recommendations_by_item(itemid, top_n=top_n)
        
        if not recs:
            return Response({
                'itemid': itemid,
                'message': 'Aucune recommandation disponible pour ce produit',
                'recommendations': []
            })
        
        # Enrichir avec des explications
        try:
            source_product = fetch_product_by_itemid(itemid)
            explanations = []
            for rec in recs:
                try:
                    rec_product = fetch_product_by_itemid(rec['itemid'])
                    reasons = []
                    reasons.append(f"similarité collaborative: {rec.get('similarity_score', 0):.3f}")
                    if rec_product.category and source_product.category and rec_product.category == source_product.category:
                        reasons.append('même catégorie')
                    if rec_product.brand and source_product.brand and rec_product.brand == source_product.brand:
                        reasons.append('même marque')
                    price_diff = abs(float(rec['discount_price']) - float(source_product.discount_price))
                    reasons.append(f'Δ prix: {price_diff:.2f}')
                    explanations.append({
                        **rec,
                        'explanations': reasons
                    })
                except Product.DoesNotExist:
                    explanations.append({**rec, 'explanations': []})
        except Product.DoesNotExist:
            explanations = recs
        
        return Response({
            'itemid': itemid,
            'recommendations': explanations,
            'model_stats': cf_recommender.training_stats
        })
        
    except Exception as e:
        return Response({'error': f'Erreur CF product recommendations: {str(e)}'}, 
                       status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([permissions.IsAdminUser])
def admin_cf_user_recommendations_view(request):
    """Recommandations collaborative filtering pour un utilisateur spécifique (admin)"""
    visitorid = request.query_params.get('visitorid')
    user_id = request.query_params.get('user_id')
    top_n = int(request.query_params.get('top_n', 10))
    
    # Utiliser visitorid ou user_id
    if not visitorid and not user_id:
        return Response({'error': 'visitorid ou user_id requis'}, status=status.HTTP_400_BAD_REQUEST)
    
    target_visitorid = visitorid or str(user_id)
    
    try:
        cf_recommender = get_global_cf_recommender()
        if cf_recommender is None:
            return Response({'error': 'Système de collaborative filtering non disponible'}, 
                          status=status.HTTP_503_SERVICE_UNAVAILABLE)
        
        if not cf_recommender.is_fitted:
            return Response({'error': 'Modèle collaborative filtering non entraîné'}, 
                          status=status.HTTP_503_SERVICE_UNAVAILABLE)
        
        # Le collaborative filtering Item-Based ne supporte pas les recommandations par utilisateur
        # Cette fonctionnalité a été supprimée - utiliser uniquement les recommandations par item
        return Response({
            'error': 'Recommandations utilisateur non disponibles',
            'message': 'Le collaborative filtering Item-Based ne supporte que les recommandations par produit. Utilisez /api/admin/cf/product-recommendations/ avec un itemid.'
        }, status=status.HTTP_400_BAD_REQUEST)
        
    except Exception as e:
        return Response({'error': f'Erreur CF user recommendations: {str(e)}'}, 
                       status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([permissions.IsAdminUser])
def admin_cf_debug_view(request):
    """Debug détaillé pour les recommandations collaborative filtering Item-Based (admin)"""
    itemid = request.query_params.get('itemid')
    visitorid = request.query_params.get('visitorid')
    top_n = int(request.query_params.get('top_n', 10))
    
    if visitorid:
        return Response({
            'error': 'Recommandations utilisateur non disponibles',
            'message': 'Le collaborative filtering Item-Based ne supporte que les recommandations par produit. Utilisez le paramètre itemid.'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    if not itemid:
        return Response({'error': 'itemid requis'}, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        cf_recommender = get_global_cf_recommender()
        if cf_recommender is None:
            return Response({'error': 'Système de collaborative filtering non disponible'}, 
                          status=status.HTTP_503_SERVICE_UNAVAILABLE)
        
        if not cf_recommender.is_fitted:
            return Response({'error': 'Modèle collaborative filtering non entraîné'}, 
                          status=status.HTTP_503_SERVICE_UNAVAILABLE)
        
        debug_info = {
            'model_stats': cf_recommender.training_stats,
            'is_fitted': cf_recommender.is_fitted,
            'items_in_model': len(cf_recommender.item_index_map) if cf_recommender.item_index_map else 0
        }
        
        if itemid:
            # Debug par item (Item-Based CF uniquement)
            if itemid not in cf_recommender.item_index_map:
                return Response({
                    **debug_info,
                    'itemid': itemid,
                    'message': f'Item {itemid} non présent dans le modèle',
                    'in_model': False
                })
            
            item_idx = cf_recommender.item_index_map[itemid]
            similarities = cf_recommender.item_similarity_matrix[item_idx]
            
            # Récupérer les top similar items avec détails
            similar_items = []
            for other_idx, similarity in enumerate(similarities):
                if other_idx == item_idx:
                    continue
                other_itemid = cf_recommender.index_item_map[other_idx]
                similar_items.append({
                    'itemid': other_itemid,
                    'similarity_score': float(similarity),
                    'index': other_idx
                })
            
            similar_items.sort(key=lambda x: x['similarity_score'], reverse=True)
            similar_items = similar_items[:top_n]
            
            # Enrichir avec les détails produits
            for item in similar_items:
                try:
                    product = fetch_product_by_itemid(item['itemid'])
                    item['name'] = product.name
                    item['ratings'] = float(product.ratings) if product.ratings else 0.0
                    item['discount_price'] = float(product.discount_price) if product.discount_price else 0.0
                    item['category'] = product.category
                    item['brand'] = product.brand
                except Product.DoesNotExist:
                    pass
            
            debug_info.update({
                'itemid': itemid,
                'item_index': item_idx,
                'in_model': True,
                'similar_items': similar_items
            })
        
        return Response(debug_info)
        
    except Exception as e:
        return Response({'error': f'Erreur CF debug: {str(e)}'}, 
                       status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([permissions.IsAdminUser])
def admin_cf_stats_view(request):
    """Statistiques sur le modèle collaborative filtering (admin)"""
    try:
        cf_recommender = get_global_cf_recommender()
        if cf_recommender is None:
            return Response({
                'available': False,
                'message': 'Système de collaborative filtering non initialisé'
            })
        
        if not cf_recommender.is_fitted:
            return Response({
                'available': False,
                'fitted': False,
                'message': 'Modèle non entraîné'
            })
        
        stats = cf_recommender.training_stats.copy() if cf_recommender.training_stats else {}
        
        # Ajouter des statistiques supplémentaires
        from api.models import Event, Product
        total_events = Event.objects.count()
        total_products = Product.objects.count()
        
        # Calculer des métriques de qualité du modèle
        quality_metrics = {}
        if cf_recommender.item_similarity_matrix is not None:
            import numpy as np
            # Échantillonner pour éviter la mémoire
            sample_size = min(1000, len(cf_recommender.item_similarity_matrix))
            if len(cf_recommender.item_similarity_matrix) > 1000:
                indices = np.random.choice(len(cf_recommender.item_similarity_matrix), sample_size, replace=False)
                sample_matrix = cf_recommender.item_similarity_matrix[np.ix_(indices, indices)]
            else:
                sample_matrix = cf_recommender.item_similarity_matrix
            
            # Exclure la diagonale (similarité avec soi-même = 1.0)
            mask = ~np.eye(sample_matrix.shape[0], dtype=bool)
            similarities = sample_matrix[mask]
            
            quality_metrics = {
                'mean_similarity': float(np.mean(similarities)),
                'median_similarity': float(np.median(similarities)),
                'std_similarity': float(np.std(similarities)),
                'min_similarity': float(np.min(similarities)),
                'max_similarity': float(np.max(similarities)),
                'high_similarity_ratio': float(np.sum(similarities > 0.5) / len(similarities)),
                'very_high_similarity_ratio': float(np.sum(similarities > 0.7) / len(similarities)),
                'sparsity': float(1.0 - (np.count_nonzero(sample_matrix) / sample_matrix.size))
            }
        
        return Response({
            'available': True,
            'fitted': True,
            'training_stats': stats,
            'system_stats': {
                'total_events_in_db': total_events,
                'total_products_in_db': total_products,
                'items_in_model': stats.get('items_in_model', 0),
                'users_in_model': stats.get('users_in_model', 0),
                'events_used': stats.get('events_used', 0),
                'sample_ratio': stats.get('sample_ratio', 0),
                'min_interactions': stats.get('min_interactions', 0)
            },
            'quality_metrics': quality_metrics
        })
        
    except Exception as e:
        return Response({'error': f'Erreur CF stats: {str(e)}'}, 
                       status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([permissions.IsAdminUser])
def admin_cf_retrain_view(request):
    """
    Réentraîner le modèle collaborative filtering (admin)
    
    Par défaut, utilise TOUS les événements (sample_ratio=1.0) avec entraînement incrémental
    pour gérer de grands volumes (1.2M+ lignes) sans saturer la mémoire.
    """
    try:
        from recommendations.engine import initialize_cf_recommender
        from api.models import ModelTrainingHistory
        import time

        # Paramètres optionnels
        # Par défaut, utiliser TOUS les événements (sample_ratio=1.0)
        sample_ratio = float(request.data.get('sample_ratio', 1.0))
        min_interactions = int(request.data.get('min_interactions', 2))
        max_events = request.data.get('max_events')
        if max_events:
            max_events = int(max_events)

        params = {
            'sample_ratio': sample_ratio,
            'min_interactions': min_interactions,
            'max_events': max_events,
        }

        # Historiser le lancement
        history = ModelTrainingHistory(
            model_name='collaborative_filtering',
            status='started',
            params=params,
        )
        history.save()

        start_time = time.time()

        initialize_cf_recommender(
            max_events=max_events,
            sample_ratio=sample_ratio,
            min_interactions=min_interactions,
        )

        duration = time.time() - start_time

        cf_recommender = get_global_cf_recommender()
        if cf_recommender and cf_recommender.is_fitted:
            # Mettre à jour l'historique
            history.status = 'success'
            history.finished_at = timezone.now()
            history.duration_sec = duration
            history.training_stats = cf_recommender.training_stats or {}
            history.save()

            return Response({
                'message': 'Réentraînement réussi (ITEM-BASED CF)',
                'stats': cf_recommender.training_stats,
            })
        else:
            history.status = 'failed'
            history.finished_at = timezone.now()
            history.duration_sec = duration
            history.error_message = 'Modèle non disponible après entraînement'
            history.save()

            return Response({
                'message': 'Réentraînement échoué',
                'error': 'Modèle non disponible après entraînement',
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    except Exception as e:
        # Historiser l'erreur
        try:
            from api.models import ModelTrainingHistory
            import time
            duration = 0.0
            # Si start_time n'existe pas (erreur avant définition), on ignore la durée
            try:
                duration = time.time() - start_time  # type: ignore[name-defined]
            except Exception:
                pass
            history = ModelTrainingHistory(
                model_name='collaborative_filtering',
                status='failed',
                duration_sec=duration,
                error_message=str(e),
            )
            history.save()
        except Exception:
            pass

        return Response(
            {'error': f'Erreur réentraînement CF: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


# ============================================================================
# NOUVELLES VUES DASHBOARD ENRICHI
# ============================================================================

@api_view(['GET'])
@permission_classes([permissions.IsAdminUser])
def admin_dashboard_enhanced_view(request):
    """Dashboard enrichi avec KPIs business, tendances, alertes, etc."""
    try:
        from .dashboard_services import DashboardMetricsService
        from datetime import datetime, timedelta
        
        # Récupérer les paramètres de période
        days = int(request.query_params.get('days', 30))
        end_date = timezone.now()
        start_date = end_date - timedelta(days=days)
        
        # Calculer toutes les métriques
        kpis = DashboardMetricsService.calculate_business_kpis(start_date, end_date)
        trends = DashboardMetricsService.calculate_temporal_comparisons()
        reco_metrics = DashboardMetricsService.calculate_recommendation_metrics(start_date, end_date)
        system_health = DashboardMetricsService.get_system_health()
        alerts = DashboardMetricsService.get_alerts()
        recommendations = DashboardMetricsService.get_actionable_recommendations()
        top_products = DashboardMetricsService.get_top_products_enhanced(limit=10)
        
        return Response({
            'kpis': {
                'totals': kpis['totals'],
                'revenue': kpis['revenue'],
                'conversion_rates': kpis['conversion_rates'],
                'aov': kpis['aov'],
                'unique_users': kpis['unique_users'],
                'avg_interactions_per_user': kpis['avg_interactions_per_user'],
                'total_orders': kpis['total_orders'],
            },
            'trends': trends,
            'recommendation_metrics': reco_metrics,
            'system_health': system_health,
            'alerts': alerts,
            'actionable_recommendations': recommendations,
            'top_products': top_products,
            'period': {
                'start_date': start_date.isoformat(),
                'end_date': end_date.isoformat(),
                'days': days,
            },
        })
    except Exception as e:
        import traceback
        logger.error(f"Erreur dashboard enrichi: {str(e)}\n{traceback.format_exc()}")
        return Response({'error': f'Erreur dashboard enrichi: {str(e)}'}, 
                       status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([permissions.IsAdminUser])
def admin_business_kpis_view(request):
    """KPIs business uniquement"""
    try:
        from .dashboard_services import DashboardMetricsService
        from datetime import datetime, timedelta
        
        days = int(request.query_params.get('days', 30))
        end_date = timezone.now()
        start_date = end_date - timedelta(days=days)
        
        kpis = DashboardMetricsService.calculate_business_kpis(start_date, end_date)
        trends = DashboardMetricsService.calculate_temporal_comparisons()
        
        return Response({
            'kpis': kpis,
            'trends': trends,
        })
    except Exception as e:
        return Response({'error': f'Erreur KPIs business: {str(e)}'}, 
                       status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([permissions.IsAdminUser])
def admin_recommendation_performance_view(request):
    """Métriques de performance du système de recommandation"""
    try:
        from .dashboard_services import DashboardMetricsService
        from datetime import datetime, timedelta
        
        days = int(request.query_params.get('days', 30))
        end_date = timezone.now()
        start_date = end_date - timedelta(days=days)
        
        metrics = DashboardMetricsService.calculate_recommendation_metrics(start_date, end_date)
        
        return Response(metrics)
    except Exception as e:
        return Response({'error': f'Erreur métriques recommandation: {str(e)}'}, 
                       status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([permissions.IsAdminUser])
def admin_system_health_view(request):
    """Health check du système"""
    try:
        from .dashboard_services import DashboardMetricsService
        from api.models import ModelTrainingHistory

        health = DashboardMetricsService.get_system_health()

        # Ajouter dernière date de réentraînement (Content-Based et CF) si dispo
        try:
            last_cb = ModelTrainingHistory.objects(
                model_name='content_based', status='success'
            ).order_by('-started_at').first()
            last_cf = ModelTrainingHistory.objects(
                model_name='collaborative_filtering', status='success'
            ).order_by('-started_at').first()

            # On utilise ml_model.last_trained pour le content-based (modèle principal)
            if last_cb:
                health['ml_model']['last_trained'] = last_cb.finished_at.isoformat() if last_cb.finished_at else last_cb.started_at.isoformat()  # type: ignore[index]

            # On expose aussi l'info CF à part
            health['cf_model_last_trained'] = (
                last_cf.finished_at.isoformat() if last_cf and last_cf.finished_at else (
                    last_cf.started_at.isoformat() if last_cf else None
                )
            )
        except Exception:
            pass

        return Response(health)
    except Exception as e:
        return Response({'error': f'Erreur health check: {str(e)}'}, 
                       status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([permissions.IsAdminUser])
def admin_alerts_view(request):
    """Récupérer les alertes"""
    try:
        from .dashboard_services import DashboardMetricsService
        
        alerts = DashboardMetricsService.get_alerts()
        
        return Response({
            'alerts': alerts,
            'count': len(alerts),
        })
    except Exception as e:
        return Response({'error': f'Erreur alertes: {str(e)}'}, 
                       status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([permissions.IsAdminUser])
def admin_actionable_recommendations_view(request):
    """Recommandations actionnables"""
    try:
        from .dashboard_services import DashboardMetricsService
        
        recommendations = DashboardMetricsService.get_actionable_recommendations()
        
        return Response({
            'recommendations': recommendations,
            'count': len(recommendations),
        })
    except Exception as e:
        return Response({'error': f'Erreur recommandations: {str(e)}'}, 
                       status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([permissions.IsAdminUser])
def admin_top_products_enhanced_view(request):
    """Top produits avec métriques enrichies"""
    try:
        from .dashboard_services import DashboardMetricsService
        
        limit = int(request.query_params.get('limit', 10))
        products = DashboardMetricsService.get_top_products_enhanced(limit=limit)
        
        return Response({
            'products': products,
            'count': len(products),
        })
    except Exception as e:
        return Response({'error': f'Erreur top produits: {str(e)}'}, 
                       status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([permissions.IsAdminUser])
def admin_category_analysis_view(request):
    """Analyse par catégorie"""
    try:
        from .dashboard_services import DashboardMetricsService
        
        analysis = DashboardMetricsService.get_category_analysis()
        
        return Response({
            'categories': analysis,
            'count': len(analysis),
        })
    except Exception as e:
        return Response({'error': f'Erreur analyse catégories: {str(e)}'}, 
                       status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([permissions.IsAdminUser])
def admin_training_history_view(request):
    """
    Historique des réentraînements de modèles (Content-Based & CF)
    Permet d'afficher une timeline dans le dashboard admin.
    """
    try:
        from api.models import ModelTrainingHistory

        limit = int(request.query_params.get('limit', 10))
        histories = (
            ModelTrainingHistory.objects.order_by('-started_at')[:limit]
        )

        results = []
        for h in histories:
            results.append({
                'id': str(h.id),
                'model_name': h.model_name,
                'status': h.status,
                'started_at': h.started_at.isoformat() if h.started_at else None,
                'finished_at': h.finished_at.isoformat() if h.finished_at else None,
                'duration_sec': h.duration_sec,
                'params': h.params or {},
                'training_stats': h.training_stats or {},
                'error_message': h.error_message,
            })

        return Response({
            'history': results,
            'count': len(results),
        })
    except Exception as e:
        return Response(
            {'error': f'Erreur historique entraînement: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(['GET'])
@permission_classes([permissions.IsAdminUser])
def admin_metrics_comparison_view(request):
    """Comparaison de métriques entre deux périodes"""
    try:
        from .dashboard_services import DashboardMetricsService
        from datetime import datetime, timedelta
        
        # Période 1 (par défaut: dernière semaine)
        days1 = int(request.query_params.get('days1', 7))
        end_date1 = timezone.now()
        start_date1 = end_date1 - timedelta(days=days1)
        
        # Période 2 (par défaut: semaine précédente)
        days2 = int(request.query_params.get('days2', 7))
        end_date2 = start_date1
        start_date2 = end_date2 - timedelta(days=days2)
        
        metrics1 = DashboardMetricsService.calculate_business_kpis(start_date1, end_date1)
        metrics2 = DashboardMetricsService.calculate_business_kpis(start_date2, end_date2)
        
        # Calculer les variations
        def calculate_change(current, previous):
            if previous == 0:
                return {'value': current, 'change': 0, 'change_percent': 0}
            change = current - previous
            change_percent = (change / previous) * 100
            return {
                'current': current,
                'previous': previous,
                'change': round(change, 2),
                'change_percent': round(change_percent, 2),
            }
        
        comparison = {
            'period1': {
                'start': start_date1.isoformat(),
                'end': end_date1.isoformat(),
                'metrics': metrics1,
            },
            'period2': {
                'start': start_date2.isoformat(),
                'end': end_date2.isoformat(),
                'metrics': metrics2,
            },
            'changes': {
                'revenue': calculate_change(metrics1['revenue'], metrics2['revenue']),
                'views': calculate_change(metrics1['totals']['view'], metrics2['totals']['view']),
                'purchases': calculate_change(metrics1['totals']['purchase'], metrics2['totals']['purchase']),
                'conversion_rate': calculate_change(
                    metrics1['conversion_rates']['purchase_to_view_percent'],
                    metrics2['conversion_rates']['purchase_to_view_percent']
                ),
                'aov': calculate_change(metrics1['aov'], metrics2['aov']),
            },
        }
        
        return Response(comparison)
    except Exception as e:
        return Response({'error': f'Erreur comparaison: {str(e)}'}, 
                       status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([permissions.IsAdminUser])
def admin_recommendations_products_view(request):
    limit = int(request.query_params.get('limit', 16))
    source_itemid = request.query_params.get('source_itemid', None)
    model = request.query_params.get('model', None)
    return _build_model_recommendations_response(model, limit, source_itemid)


@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def model_recommendations_view(request):
    """Recommandations publiques basées sur le modèle sélectionné par l'administration."""
    limit = int(request.query_params.get('limit', 16))
    source_itemid = request.query_params.get('source_itemid', None)
    cfg = RecommendationConfig.objects(config_name='default').first()
    selected_model_value = map_selected_model_to_strategy(cfg.selected_model if cfg else None)
    return _build_model_recommendations_response(
        None,
        limit,
        source_itemid,
        override_model=selected_model_value
    )


@api_view(['GET'])
def user_recommendations_hybrid(request):
    """
    Recommandations personnalisées pour l'utilisateur connecté utilisant les deux modèles (CB + CF)
    basées sur l'historique de l'utilisateur.
    
    Pour chaque produit de l'historique utilisateur :
    - Récupère les recommandations Content-Based
    - Récupère les recommandations Collaborative Filtering
    - Combine les deux modèles (50% CB + 50% CF)
    - Applique les préférences utilisateur (bonus)
    - Agrège et déduplique les résultats
    
    Paramètres:
    - limit: nombre de recommandations à retourner (défaut: 16)
    - strategy: 'content', 'collaborative', ou 'hybrid' (défaut: 'hybrid')
    """
    if not request.user.is_authenticated:
        return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)

    user_id = request.user.id
    
    try:
        from collections import Counter
        
        cfg = RecommendationConfig.objects(config_name='default').first()
        strategy = request.query_params.get('strategy', 'hybrid')
        limit = int(request.query_params.get('limit', 16))
        
        # Récupérer l'historique de l'utilisateur avec pondération temporelle
        from datetime import timedelta
        now = timezone.now()
        week_ago = now - timedelta(days=7)
        
        # Récupérer toutes les interactions (pas seulement les 10 dernières pour exclusion)
        all_user_interactions = UserInteraction.objects.filter(
            user_id=user_id,
            interaction_type__in=['view', 'purchase', 'like', 'add_to_cart']
        ).order_by('-timestamp')
        
        # Produits à exclure (déjà vus/achetés récemment)
        excluded_products = set([inter.product_id for inter in all_user_interactions[:50]])  # Exclure les 50 derniers
        
        # Pour la génération, utiliser les 10 dernières interactions avec pondération temporelle
        recent_interactions = list(all_user_interactions[:10])
        
        # Récupérer les préférences utilisateur
        prefs = UserPreference.objects(user_id=user_id).first()
        pref_bonus_cat = (cfg.preference_bonus_category if cfg else 0.05)
        pref_bonus_brand = (cfg.preference_bonus_brand if cfg else 0.05)
        pref_bonus_price = (cfg.preference_bonus_price if cfg else 0.05)
        popularity_weight = cfg.popularity_weight if cfg else 0.05
        
        # Si pas d'interactions mais préférences disponibles, utiliser cold start amélioré
        if not recent_interactions:
            if prefs and (prefs.liked_categories or prefs.liked_brands):
                # Cold start amélioré : utiliser préférences + produits populaires filtrés
                popular_response = popular_products(request)
                if popular_response.status_code == 200:
                    popular_data = popular_response.data.get('popular_products', [])
                    # Filtrer selon les préférences
                    filtered_popular = []
                    for product in popular_data:
                        matches_prefs = False
                        if prefs.liked_categories and product.get('category') in prefs.liked_categories:
                            matches_prefs = True
                        if prefs.liked_brands and product.get('brand') in prefs.liked_brands:
                            matches_prefs = True
                        if prefs.price_min and prefs.price_max:
                            price = product.get('discount_price', 0)
                            if prefs.price_min <= price <= prefs.price_max:
                                matches_prefs = True
                        
                        if matches_prefs:
                            product['similarity_score'] = 0.8  # Score élevé pour correspondance préférences
                            product['model_source'] = 'preferences'
                            filtered_popular.append(product)
                    
                    # Si on a assez de produits filtrés, les retourner
                    if len(filtered_popular) >= limit // 2:
                        return Response({
                            'user_id': user_id,
                            'strategy': 'cold_start_preferences',
                            'history_products': [],
                            'count': len(filtered_popular[:limit]),
                            'recommendations': filtered_popular[:limit]
                        })
            
            # Fallback : produits populaires standard
            return popular_products(request)
        
        # Récupérer les deux modèles
        content_recommender = get_global_recommender()
        cf_recommender = get_global_cf_recommender()
        
        if content_recommender is None:
            return Response({
                'error': 'Système de recommandation Content-Based non disponible',
                'recommendations': []
            }, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        
        # Dictionnaire pour agréger les recommandations avec pondération temporelle
        all_recommendations = {}  # itemid -> {rec_data, sources, temporal_weight}
        seen_products = set([inter.product_id for inter in recent_interactions])
        
        # Pour chaque produit de l'historique, générer des recommandations avec pondération temporelle
        for interaction in recent_interactions:
            product_id = interaction.product_id
            
            # Calculer le poids temporel (interactions récentes = poids x2)
            interaction_age = (now - interaction.timestamp).total_seconds() / 86400  # Age en jours
            temporal_weight = 2.0 if interaction_age <= 7 else 1.0  # Dernière semaine = x2
            
            # 1. Recommandations Content-Based
            content_recs = []
            if content_recommender:
                recs = content_recommender.get_recommendations_with_scores(product_id, top_n=8)  # Plus pour diversité
                if not isinstance(recs, str):
                    content_recs = recs
            
            # 2. Recommandations Collaborative Filtering
            cf_recs = []
            if strategy in ['collaborative', 'hybrid']:
                if cf_recommender and cf_recommender.is_fitted:
                    # Normaliser product_id pour CF (attend un integer)
                    normalized_cf_product_id = cf_recommender._normalize_itemid(product_id) if cf_recommender else None
                    if normalized_cf_product_id is not None and normalized_cf_product_id in cf_recommender.item_index_map:
                        cf_recs = cf_recommender.get_recommendations_by_item(normalized_cf_product_id, top_n=8)  # Plus pour diversité
                    else:
                        logger.debug(f"Product {product_id} not found in CF model, skipping CF recommendations for this product")
            
            # 3. Combiner les recommandations selon la stratégie
            if strategy == 'content':
                # Utiliser uniquement Content-Based
                for rec in content_recs:
                    itemid = rec['itemid']
                    # Exclure les produits déjà vus/achetés
                    if itemid in excluded_products or itemid in seen_products:
                        continue
                    
                    score_with_temporal = rec.get('similarity_score', 0) * temporal_weight
                    
                    if itemid not in all_recommendations:
                        all_recommendations[itemid] = {
                            **rec,
                            'content_score': rec.get('similarity_score', 0),
                            'cf_score': 0,
                            'similarity_score': score_with_temporal,
                            'sources': [product_id],
                            'model_source': 'content',
                            'temporal_weight': temporal_weight
                        }
                    else:
                        # Agréger : prendre le meilleur score pondéré
                        current_score = all_recommendations[itemid]['similarity_score']
                        if score_with_temporal > current_score:
                            all_recommendations[itemid]['similarity_score'] = score_with_temporal
                            all_recommendations[itemid]['temporal_weight'] = max(
                                all_recommendations[itemid].get('temporal_weight', 1.0),
                                temporal_weight
                            )
                        if product_id not in all_recommendations[itemid]['sources']:
                            all_recommendations[itemid]['sources'].append(product_id)
            
            elif strategy == 'collaborative':
                # Utiliser uniquement Collaborative Filtering
                if not cf_recommender or not cf_recommender.is_fitted:
                    return Response({
                        'error': 'Système de collaborative filtering non disponible',
                        'message': 'Le modèle CF doit être initialisé. Utilisez: POST /api/admin/cf/retrain/',
                        'recommendations': []
                    }, status=status.HTTP_503_SERVICE_UNAVAILABLE)
                
                for rec in cf_recs:
                    itemid = rec['itemid']
                    # Exclure les produits déjà vus/achetés
                    if itemid in excluded_products or itemid in seen_products:
                        continue
                    
                    score_with_temporal = rec.get('similarity_score', 0) * temporal_weight
                    
                    if itemid not in all_recommendations:
                        all_recommendations[itemid] = {
                            **rec,
                            'content_score': 0,
                            'cf_score': rec.get('similarity_score', 0),
                            'similarity_score': score_with_temporal,
                            'sources': [product_id],
                            'model_source': 'collaborative',
                            'temporal_weight': temporal_weight
                        }
                    else:
                        current_score = all_recommendations[itemid]['similarity_score']
                        if score_with_temporal > current_score:
                            all_recommendations[itemid]['similarity_score'] = score_with_temporal
                            all_recommendations[itemid]['temporal_weight'] = max(
                                all_recommendations[itemid].get('temporal_weight', 1.0),
                                temporal_weight
                            )
                        if product_id not in all_recommendations[itemid]['sources']:
                            all_recommendations[itemid]['sources'].append(product_id)
            
            else:  # strategy == 'hybrid'
                # Combiner CB et CF (50% chacun)
                # Construire les dictionnaires pour faciliter la recherche
                content_dict = {rec['itemid']: rec for rec in content_recs}
                cf_dict = {rec['itemid']: rec for rec in cf_recs}
                
                # Traiter les produits présents dans les deux modèles
                for itemid in set(content_dict.keys()) | set(cf_dict.keys()):
                    # Exclure les produits déjà vus/achetés
                    if itemid in excluded_products or itemid in seen_products:
                        continue
                    
                    cb_rec = content_dict.get(itemid)
                    cf_rec = cf_dict.get(itemid)
                    
                    # Calculer le score combiné avec pondération temporelle
                    cb_score = cb_rec.get('similarity_score', 0) if cb_rec else 0
                    cf_score = cf_rec.get('similarity_score', 0) if cf_rec else 0
                    
                    # Score hybride : 50% CB + 50% CF, puis appliquer pondération temporelle
                    combined_score = (cb_score * 0.5) + (cf_score * 0.5)
                    combined_score *= temporal_weight
                    
                    # Utiliser les données du modèle qui a le meilleur score, ou CB par défaut
                    base_rec = cb_rec if cb_rec else cf_rec
                    
                    if itemid not in all_recommendations:
                        all_recommendations[itemid] = {
                            **base_rec,
                            'content_score': cb_score,
                            'cf_score': cf_score,
                            'similarity_score': combined_score,
                            'sources': [product_id],
                            'model_source': 'hybrid' if (cb_rec and cf_rec) else ('content' if cb_rec else 'collaborative'),
                            'temporal_weight': temporal_weight
                        }
                    else:
                        # Agréger : prendre le meilleur score combiné
                        current_score = all_recommendations[itemid]['similarity_score']
                        if combined_score > current_score:
                            all_recommendations[itemid]['similarity_score'] = combined_score
                            all_recommendations[itemid]['content_score'] = max(
                                all_recommendations[itemid].get('content_score', 0),
                                cb_score
                            )
                            all_recommendations[itemid]['cf_score'] = max(
                                all_recommendations[itemid].get('cf_score', 0),
                                cf_score
                            )
                            all_recommendations[itemid]['temporal_weight'] = max(
                                all_recommendations[itemid].get('temporal_weight', 1.0),
                                temporal_weight
                            )
                        if product_id not in all_recommendations[itemid]['sources']:
                            all_recommendations[itemid]['sources'].append(product_id)
        
        # Convertir en liste et appliquer les préférences utilisateur + diversité
        recommendations_list = []
        category_counts = {}  # Pour limiter la diversité par catégorie
        max_per_category = max(2, limit // 4)  # Max 2-4 produits par catégorie selon limit
        
        for itemid, rec_data in all_recommendations.items():
            try:
                product = fetch_product_by_itemid(itemid)
                
                # Vérifier la diversité : limiter les produits par catégorie
                category = product.category or 'other'
                if category_counts.get(category, 0) >= max_per_category:
                    continue  # Skip si trop de produits de cette catégorie
                
                # Appliquer les bonus de préférences
                bonus = 0.0
                if prefs:
                    if prefs.liked_categories and product.category in prefs.liked_categories:
                        bonus += pref_bonus_cat
                    if prefs.liked_brands and product.brand in prefs.liked_brands:
                        bonus += pref_bonus_brand
                    if prefs.price_min is not None and prefs.price_max is not None:
                        if float(prefs.price_min) <= float(rec_data.get('discount_price', 0)) <= float(prefs.price_max):
                            bonus += pref_bonus_price
                
                # Appliquer le bonus de popularité si stratégie hybride
                popularity_bonus = 0.0
                if strategy == 'hybrid':
                    from collections import Counter
                    pop_counts = Counter()
                    interactions = UserInteraction.objects.filter(
                        interaction_type__in=['view', 'purchase', 'like', 'add_to_cart'],
                        product_id=itemid
                    )
                    for inter in interactions:
                        pop_counts[itemid] += 3 if inter.interaction_type in ['purchase', 'add_to_cart'] else 1
                    popularity_bonus = popularity_weight * pop_counts.get(itemid, 0)
                
                final_score = rec_data['similarity_score'] + bonus + popularity_bonus
                
                recommendations_list.append({
                    'itemid': product.itemid,
                    'name': product.name,
                    'image': product.image,
                    'ratings': float(product.ratings) if product.ratings else 0.0,
                    'discount_price': float(product.discount_price) if product.discount_price else 0.0,
                    'actual_price': float(product.actual_price) if product.actual_price else 0.0,
                    'category': product.category,
                    'brand': product.brand,
                    'similarity_score': final_score,
                    'content_score': rec_data.get('content_score', 0),
                    'cf_score': rec_data.get('cf_score', 0),
                    'model_source': rec_data.get('model_source', strategy),
                    'sources': rec_data.get('sources', []),
                    'preference_bonus': bonus,
                    'popularity_bonus': popularity_bonus,
                    'temporal_weight': rec_data.get('temporal_weight', 1.0)
                })
                
                # Incrémenter le compteur de catégorie
                category_counts[category] = category_counts.get(category, 0) + 1
                
            except Product.DoesNotExist:
                continue
        
        # Trier par score final décroissant
        recommendations_list = sorted(
            recommendations_list,
            key=lambda x: x['similarity_score'],
            reverse=True
        )
        
        # Appliquer la limite avec diversité : prendre les meilleurs tout en respectant la diversité
        final_recommendations = []
        final_category_counts = {}
        
        for rec in recommendations_list:
            if len(final_recommendations) >= limit:
                break
            
            category = rec.get('category') or 'other'
            # Si on a déjà assez de produits de cette catégorie, passer au suivant
            if final_category_counts.get(category, 0) >= max_per_category:
                continue
            
            final_recommendations.append(rec)
            final_category_counts[category] = final_category_counts.get(category, 0) + 1
        
        # Si on n'a pas assez de produits à cause de la diversité, compléter avec les meilleurs restants
        if len(final_recommendations) < limit:
            for rec in recommendations_list:
                if len(final_recommendations) >= limit:
                    break
                if rec not in final_recommendations:
                    final_recommendations.append(rec)
        
        return Response({
            'user_id': user_id,
            'strategy': strategy,
            'history_products': [inter.product_id for inter in recent_interactions],
            'excluded_products_count': len(excluded_products),
            'diversity_applied': True,
            'max_per_category': max_per_category,
            'count': len(final_recommendations),
            'recommendations': final_recommendations
        })
    
    except Exception as e:
        logger.error(f"Erreur user_recommendations_hybrid: {str(e)}", exc_info=True)
        return Response({
            'error': f'Erreur lors de la génération des recommandations: {str(e)}',
            'recommendations': []
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)