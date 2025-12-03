"""
Configuration Celery pour les tâches asynchrones
"""
import os
from celery import Celery

# Configuration Django pour Celery
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'ecommerce_api.settings.development')

app = Celery('ecommerce_api')

# Configuration depuis les settings Django
app.config_from_object('django.conf:settings', namespace='CELERY')

# Autodécouverte des tâches dans les apps Django
app.autodiscover_tasks()

@app.task(bind=True)
def debug_task(self):
    print(f'Request: {self.request!r}')