import logging

from django.db.models.signals import post_save
from django.dispatch import receiver
from django.contrib.auth import get_user_model

from api.user_services import UserCollectionService
from .models import UserProfile


logger = logging.getLogger(__name__)
User = get_user_model()


@receiver(post_save, sender=User)
def create_user_profile(sender, instance, created, **kwargs):
    """Créer automatiquement un profil utilisateur lors de la création d'un utilisateur"""
    if created:
        UserProfile.objects.create(user=instance)
        try:
            UserCollectionService.ensure_from_django_user(instance)
        except Exception as exc:
            logger.warning("Sync Mongo user failed for user %s: %s", instance.id, exc)


@receiver(post_save, sender=User)
def save_user_profile(sender, instance, **kwargs):
    """Sauvegarder le profil utilisateur lors de la sauvegarde de l'utilisateur"""
    if hasattr(instance, 'profile'):
        instance.profile.save()