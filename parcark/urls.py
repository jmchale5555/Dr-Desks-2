from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    register_view, login_view, logout_view, current_user_view, change_password_view,
    UserViewSet, RoomViewSet, DeskViewSet, BookingViewSet, LDAPSettingsViewSet, RoomLayoutViewSet, AnalyticsViewSet,
)

# Create a router and register our viewset
router = DefaultRouter()
router.register(r'users', UserViewSet, basename='user')
router.register(r'rooms', RoomViewSet, basename='room')
router.register(r'desks', DeskViewSet, basename='desk')
router.register(r'bookings', BookingViewSet, basename='booking')
router.register(r'mybookings', BookingViewSet, basename='mybooking')
router.register(r'settings/ldap', LDAPSettingsViewSet, basename='ldap-settings')
router.register(r'room-layouts', RoomLayoutViewSet, basename='room-layout')
router.register(r'analytics', AnalyticsViewSet, basename='analytics')

urlpatterns = [
    # Auth endpoints
    path('auth/register/', register_view, name='register'),
    path('auth/login/', login_view, name='login'),
    path('auth/logout/', logout_view, name='logout'),
    path('auth/me/', current_user_view, name='current-user'),
    path('auth/change-password/', change_password_view, name='change-password'),
    
    # ViewSet routes
    path('', include(router.urls)),
]
