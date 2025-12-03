import logging
from collections import defaultdict
from datetime import datetime, timezone as dt_timezone
from threading import Lock
from typing import Dict, List, Optional

from django.contrib.auth import get_user_model
from django.utils import timezone
from mongoengine.queryset.visitor import Q

from .models import AnalyticsUser, Event, UserInteraction, UserPreference

logger = logging.getLogger(__name__)


def _ensure_aware(value: Optional[datetime]) -> Optional[datetime]:
    """S'assure que les datetimes sont timezone-aware."""
    if value is None:
        return None
    if timezone.is_naive(value):
        try:
            return timezone.make_aware(value, dt_timezone.utc)
        except Exception:
            # Fallback: utiliser la timezone par défaut Django
            return timezone.make_aware(value)
    return value


def _stats_factory():
    return {
        'total': 0,
        'views': 0,
        'likes': 0,
        'add_to_cart': 0,
        'purchases': 0,
        'ratings': 0,
        'last_activity': None,
    }


class UserCollectionService:
    """Gestion centralisée de la collection Mongo 'users'."""

    _last_sync: Optional[datetime] = None
    _sync_lock: Lock = Lock()
    _SYNC_INTERVAL_SECONDS = 300

    @classmethod
    def ensure_bootstrapped(cls, force: bool = False) -> None:
        """Synchronise périodiquement les utilisateurs Django et les visiteurs."""
        now = timezone.now()
        needs_sync = (
            force
            or cls._last_sync is None
            or (now - cls._last_sync).total_seconds() > cls._SYNC_INTERVAL_SECONDS
        )
        if not needs_sync:
            return

        with cls._sync_lock:
            # Double-check après verrou pour éviter les sync concurrentes
            if (
                not force
                and cls._last_sync
                and (now - cls._last_sync).total_seconds() <= cls._SYNC_INTERVAL_SECONDS
            ):
                return
            cls.sync_registered_users()
            cls.sync_event_visitors()
            cls._last_sync = timezone.now()

    @staticmethod
    def sync_registered_users() -> None:
        """Crée/MAJ les entrées Mongo pour les utilisateurs Django."""
        User = get_user_model()
        queryset = User.objects.all().only(
            'id',
            'email',
            'username',
            'first_name',
            'last_name',
            'date_joined',
            'last_login',
        )
        for user in queryset:
            visitorid = str(user.id)
            first_seen = _ensure_aware(getattr(user, 'date_joined', None)) or timezone.now()
            last_seen = _ensure_aware(getattr(user, 'last_login', None)) or first_seen
            doc = AnalyticsUser.objects(visitorid=visitorid).first()
            if doc:
                updated = False
                if doc.user_id != user.id:
                    doc.user_id = user.id
                    updated = True
                if user.email and doc.email != user.email:
                    doc.email = user.email
                    updated = True
                if user.username and doc.username != user.username:
                    doc.username = user.username
                    updated = True
                if doc.first_name != (user.first_name or None):
                    doc.first_name = user.first_name or None
                    updated = True
                if doc.last_name != (user.last_name or None):
                    doc.last_name = user.last_name or None
                    updated = True
                if doc.source != 'registered':
                    doc.source = 'registered'
                    updated = True
                if doc.first_seen_at is None or first_seen < doc.first_seen_at:
                    doc.first_seen_at = first_seen
                    updated = True
                if doc.last_seen_at is None or last_seen > doc.last_seen_at:
                    doc.last_seen_at = last_seen
                    updated = True
                if updated:
                    doc.save()
            else:
                AnalyticsUser(
                    visitorid=visitorid,
                    user_id=user.id,
                    source='registered',
                    email=user.email or None,
                    username=user.username or None,
                    first_name=user.first_name or None,
                    last_name=user.last_name or None,
                    first_seen_at=first_seen,
                    last_seen_at=last_seen,
                ).save()

    @staticmethod
    def sync_event_visitors() -> None:
        """Crée/MAJ les entrées Mongo pour les visitorid présents dans la collection events."""
        pipeline = [
            {
                '$group': {
                    '_id': '$visitorid',
                    'first_seen': {'$min': '$timestamp'},
                    'last_seen': {'$max': '$timestamp'},
                }
            }
        ]
        try:
            for entry in Event.objects.aggregate(*pipeline):
                visitorid = entry.get('_id')
                if not visitorid:
                    continue
                first_seen = _ensure_aware(entry.get('first_seen')) or timezone.now()
                last_seen = _ensure_aware(entry.get('last_seen')) or first_seen
                doc = AnalyticsUser.objects(visitorid=str(visitorid)).first()
                if doc:
                    updated = False
                    if doc.first_seen_at is None or first_seen < doc.first_seen_at:
                        doc.first_seen_at = first_seen
                        updated = True
                    if doc.last_seen_at is None or last_seen > doc.last_seen_at:
                        doc.last_seen_at = last_seen
                        updated = True
                    if doc.source != 'registered':
                        if doc.source != 'visitor':
                            doc.source = 'visitor'
                            updated = True
                    if updated:
                        doc.save()
                else:
                    AnalyticsUser(
                        visitorid=str(visitorid),
                        source='visitor',
                        first_seen_at=first_seen,
                        last_seen_at=last_seen,
                    ).save()
        except Exception as exc:
            logger.warning("Échec de la synchronisation des visitors depuis events: %s", exc)

    @staticmethod
    def ensure_from_django_user(user) -> None:
        """Garantit qu'un utilisateur Django spécifique possède une entrée Mongo."""
        if not user:
            return
        visitorid = str(user.id)
        doc = AnalyticsUser.objects(visitorid=visitorid).first()
        first_seen = _ensure_aware(getattr(user, 'date_joined', None)) or timezone.now()
        last_seen = _ensure_aware(getattr(user, 'last_login', None)) or first_seen
        if doc:
            updated = False
            if doc.user_id != user.id:
                doc.user_id = user.id
                updated = True
            if user.email and doc.email != user.email:
                doc.email = user.email
                updated = True
            if user.username and doc.username != user.username:
                doc.username = user.username
                updated = True
            if doc.first_name != (user.first_name or None):
                doc.first_name = user.first_name or None
                updated = True
            if doc.last_name != (user.last_name or None):
                doc.last_name = user.last_name or None
                updated = True
            if doc.source != 'registered':
                doc.source = 'registered'
                updated = True
            if doc.first_seen_at is None or first_seen < doc.first_seen_at:
                doc.first_seen_at = first_seen
                updated = True
            if doc.last_seen_at is None or last_seen > doc.last_seen_at:
                doc.last_seen_at = last_seen
                updated = True
            if updated:
                doc.save()
        else:
            AnalyticsUser(
                visitorid=visitorid,
                user_id=user.id,
                source='registered',
                email=user.email or None,
                username=user.username or None,
                first_name=user.first_name or None,
                last_name=user.last_name or None,
                first_seen_at=first_seen,
                last_seen_at=last_seen,
            ).save()

    @classmethod
    def get_users_page(cls, page: int, page_size: int, search: Optional[str] = None) -> Dict:
        """Retourne la liste paginée des utilisateurs enrichie avec les statistiques."""
        query = AnalyticsUser.objects
        if search:
            query = query.filter(
                Q(username__icontains=search)
                | Q(email__icontains=search)
                | Q(visitorid__icontains=search)
                | Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
            )

        total = query.count()
        page = max(page, 1)
        page_size = max(1, min(page_size, 200))
        skip = (page - 1) * page_size
        users_docs = list(query.order_by('-last_seen_at', '-updated_at').skip(skip).limit(page_size))

        registered_ids = [doc.user_id for doc in users_docs if doc.user_id is not None]
        visitor_only_ids = [doc.visitorid for doc in users_docs if doc.user_id is None or doc.source != 'registered']

        interaction_stats = defaultdict(_stats_factory)
        if registered_ids:
            for interaction in UserInteraction.objects.filter(user_id__in=registered_ids):
                stats = interaction_stats[interaction.user_id]
                stats['total'] += 1
                stats['views'] += int(interaction.interaction_type == 'view')
                stats['likes'] += int(interaction.interaction_type == 'like')
                stats['add_to_cart'] += int(interaction.interaction_type == 'add_to_cart')
                stats['purchases'] += int(interaction.interaction_type == 'purchase')
                stats['ratings'] += int(interaction.interaction_type == 'rating')
                ts = _ensure_aware(interaction.timestamp)
                if ts and (stats['last_activity'] is None or ts > stats['last_activity']):
                    stats['last_activity'] = ts

        event_stats = defaultdict(_stats_factory)
        if visitor_only_ids:
            for event in Event.objects(visitorid__in=visitor_only_ids):
                stats = event_stats[event.visitorid]
                stats['total'] += 1
                normalized = event.event.lower() if event.event else ''
                if normalized == 'view':
                    stats['views'] += 1
                elif normalized == 'addtocart':
                    stats['add_to_cart'] += 1
                elif normalized == 'transaction':
                    stats['purchases'] += 1
                ts = _ensure_aware(getattr(event, 'timestamp', None))
                if ts and (stats['last_activity'] is None or ts > stats['last_activity']):
                    stats['last_activity'] = ts

        prefs_map = {}
        if registered_ids:
            prefs_map = {
                pref.user_id: True
                for pref in UserPreference.objects(user_id__in=registered_ids).only('user_id')
            }

        users_payload: List[Dict] = []
        for doc in users_docs:
            if doc.source == 'registered' and doc.user_id is not None:
                stats = interaction_stats.get(doc.user_id, _stats_factory())
                has_prefs = prefs_map.get(doc.user_id, False)
            else:
                stats = event_stats.get(doc.visitorid, _stats_factory())
                has_prefs = False

            last_activity = stats.get('last_activity') or doc.last_seen_at
            users_payload.append({
                'user_id': doc.user_id,
                'visitorid': doc.visitorid,
                'source': doc.source,
                'email': doc.email,
                'username': doc.username or f'Visiteur {doc.visitorid}',
                'first_name': doc.first_name or '',
                'last_name': doc.last_name or '',
                'total_interactions': stats.get('total', 0),
                'views': stats.get('views', 0),
                'likes': stats.get('likes', 0),
                'add_to_cart': stats.get('add_to_cart', 0),
                'purchases': stats.get('purchases', 0),
                'ratings': stats.get('ratings', 0),
                'last_activity': last_activity.isoformat() if last_activity else None,
                'has_preferences': has_prefs,
                'first_seen_at': doc.first_seen_at.isoformat() if doc.first_seen_at else None,
                'last_seen_at': doc.last_seen_at.isoformat() if doc.last_seen_at else None,
            })

        return {
            'users': users_payload,
            'total': total,
            'page': page,
            'page_size': page_size,
        }


