from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django.shortcuts import get_object_or_404
from django.contrib.auth import login, logout, get_user_model, update_session_auth_hash
from django.db.models import Q, Count
from django.db.models.functions import ExtractWeekDay
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.pagination import PageNumberPagination
from datetime import date, timedelta, datetime
from collections import defaultdict
import os
import logging
from .models import Room, Desk, Booking, RoomLayout, LDAPSettings
from .serializers import (
    UserSerializer, UserCreateSerializer, UserUpdateSerializer, UserPasswordResetSerializer,
    ChangePasswordSerializer, RegisterSerializer, LoginSerializer, RoomSerializer, DeskSerializer, BookingSerializer, RoomLayoutSerializer, LDAPSettingsSerializer,
)
from django.core.cache import cache

User = get_user_model()

logger = logging.getLogger(__name__)

class IsAdminUser(permissions.BasePermission):
    """Custom permission - only admin users can access"""
    def has_permission(self, request, view):
        return request.user and request.user.is_authenticated and request.user.is_staff


@api_view(['POST'])
@permission_classes([AllowAny])
def register_view(request):
    """
    Register a new local user
    POST /api/auth/register/
    Body: {
        "username": "john",
        "email": "john@example.com",
        "password": "password123",
        "password_confirm": "password123",
        "first_name": "John",
        "last_name": "Doe"
    }
    """
    serializer = RegisterSerializer(data=request.data)
    if serializer.is_valid():
        user = serializer.save()
        return Response(
            {
                'message': 'User registered successfully',
                'user': UserSerializer(user).data
            },
            status=status.HTTP_201_CREATED
        )
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([AllowAny])
def login_view(request):
    """
    Login user (local or LDAP)
    POST /api/auth/login/
    Body: {"username": "john", "password": "password123"}
    """
    serializer = LoginSerializer(data=request.data, context={'request': request})
    serializer.is_valid(raise_exception=True)
    user = serializer.validated_data['user']
    login(request, user)
    return Response({
        'message': 'Login successful',
        'user': UserSerializer(user).data
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout_view(request):
    """
    Logout current user
    POST /api/auth/logout/
    """
    logout(request)
    return Response({'message': 'Logout successful'})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def current_user_view(request):
    """
    Get current logged-in user
    GET /api/auth/me/
    """
    serializer = UserSerializer(request.user)
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def change_password_view(request):
    """
    Change current user's password
    POST /api/auth/change-password/
    """
    user = request.user

    if user.is_ldap_user:
        return Response(
            {'error': 'Password reset is not available for LDAP users.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    serializer = ChangePasswordSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    old_password = serializer.validated_data['old_password']
    new_password = serializer.validated_data['new_password']

    if not user.check_password(old_password):
        return Response(
            {'old_password': ['Current password is incorrect']},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user.set_password(new_password)
    user.save(update_fields=['password'])
    update_session_auth_hash(request, user)

    return Response({'message': 'Password updated successfully'})


class UserViewSet(viewsets.ModelViewSet):
    """
    ViewSet for User management (admin only)
    """
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated, IsAdminUser]

    def _active_admin_count(self):
        return User.objects.filter(is_staff=True, is_active=True).count()

    def _is_last_active_admin(self, user):
        return user.is_staff and user.is_active and self._active_admin_count() == 1

    def _validate_admin_safety_for_update(self, user, validated_data):
        if not self._is_last_active_admin(user):
            return

        next_is_staff = validated_data.get('is_staff', user.is_staff)
        next_is_active = validated_data.get('is_active', user.is_active)

        if not next_is_staff or not next_is_active:
            raise DRFValidationError({'error': 'Cannot remove or deactivate the last active admin user.'})

    def get_serializer_class(self):
        if self.action == 'create':
            return UserCreateSerializer
        if self.action in ['update', 'partial_update']:
            return UserUpdateSerializer
        return UserSerializer

    def get_queryset(self):
        queryset = User.objects.all().order_by('username')
        search = self.request.query_params.get('search', None)
        if search:
            queryset = queryset.filter(
                Q(username__icontains=search) |
                Q(email__icontains=search) |
                Q(first_name__icontains=search) |
                Q(last_name__icontains=search)
            )
        return queryset

    def perform_update(self, serializer):
        self._validate_admin_safety_for_update(serializer.instance, serializer.validated_data)
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()

        if self._is_last_active_admin(instance):
            return Response(
                {'error': 'Cannot delete the last active admin user.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if instance.is_ldap_user:
            if instance.is_active:
                instance.is_active = False
                instance.save(update_fields=['is_active'])
            return Response(status=status.HTTP_204_NO_CONTENT)

        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['post'], url_path='set-password')
    def set_password(self, request, pk=None):
        user = self.get_object()

        if user.is_ldap_user:
            return Response(
                {'error': 'Password reset is not allowed for LDAP users.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = UserPasswordResetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user.set_password(serializer.validated_data['password'])
        user.save(update_fields=['password'])

        return Response({'message': 'Password updated successfully'})


class RoomViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Room CRUD operations
    
    Provides:
    - list: GET /api/rooms/
    - create: POST /api/rooms/
    - retrieve: GET /api/rooms/{id}/
    - update: PUT /api/rooms/{id}/
    - partial_update: PATCH /api/rooms/{id}/
    - destroy: DELETE /api/rooms/{id}/
    """
    queryset = Room.objects.all()
    serializer_class = RoomSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    
    def get_queryset(self):
        """
        Optionally filter rooms by search query
        """
        queryset = Room.objects.all()
        
        # Optional search parameter
        search = self.request.query_params.get('search', None)
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search)
            )
        
        return queryset

    def get_permissions(self):
        """Only admins can create/update/delete rooms"""
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAuthenticated(), IsAdminUser()]
        return [IsAuthenticated()]

    def get_serializer_context(self):
        """Add request to serializer context for image URLs"""
        context = super().get_serializer_context()
        context['request'] = self.request
        return context

    @action(detail=True, methods=['delete'], url_path='remove-image')
    def remove_image(self, request, pk=None):
        """
        Remove room image
        DELETE /api/rooms/{id}/remove-image/
        """
        room = self.get_object()
        
        if not room.image:
            return Response(
                {'error': 'Room has no image'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Delete the image file
        if os.path.isfile(room.image.path):
            os.remove(room.image.path)
        
        # Clear the image field
        room.image = None
        room.save()
        
        serializer = self.get_serializer(room)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def count(self, request):
        count = self.get_queryset().count()
        return Response({'count': count})


    def list(self, request, *args, **kwargs):
        """
        List all rooms
        GET /api/rooms/
        """
        queryset = self.get_queryset()
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    def create(self, request, *args, **kwargs):
        """
        Create a new room
        POST /api/rooms/
        Body: {"name": "...", "number_of_desks": 20}
        """
        serializer = self.get_serializer(data=request.data)
        
        if serializer.is_valid():
            self.perform_create(serializer)
            return Response(
                serializer.data,
                status=status.HTTP_201_CREATED
            )
        
        return Response(
            serializer.errors,
            status=status.HTTP_400_BAD_REQUEST
        )

    def retrieve(self, request, *args, **kwargs):
        """
        Get a single room by ID
        GET /api/rooms/{id}/
        """
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    def update(self, request, *args, **kwargs):
        """
        Update a room (full update)
        PUT /api/rooms/{id}/
        Body: {"name": "...", "number_of_desks": 20}
        """
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(
            instance,
            data=request.data,
            partial=partial
        )
        
        if serializer.is_valid():
            self.perform_update(serializer)
            return Response(serializer.data)
        
        return Response(
            serializer.errors,
            status=status.HTTP_400_BAD_REQUEST
        )

    def partial_update(self, request, *args, **kwargs):
        """
        Partial update a room
        PATCH /api/rooms/{id}/
        Body: {"name": "..."} or {"number_of_desks": 20}
        """
        kwargs['partial'] = True
        return self.update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        """
        Delete a room
        DELETE /api/rooms/{id}/
        """
        instance = self.get_object()
        
        # Optional: Check if room has any bookings before deleting
        # if instance.bookings.exists():
        #     return Response(
        #         {"error": "Cannot delete room with existing bookings"},
        #         status=status.HTTP_400_BAD_REQUEST
        #     )
        
        self.perform_destroy(instance)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=['get'])
    def count(self, request):
        """
        Get total count of rooms
        GET /api/rooms/count/
        """
        count = self.get_queryset().count()
        return Response({'count': count})

class DeskViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for Desk (read-only for regular users)
    Admins can manage desks through Django admin
    """
    queryset = Desk.objects.filter(is_active=True)
    serializer_class = DeskSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        queryset = Desk.objects.filter(is_active=True)
        
        # Filter by room if provided
        room_id = self.request.query_params.get('room', None)
        if room_id:
            queryset = queryset.filter(room_id=room_id)
        
        return queryset


class BookingPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = 'page_size'
    max_page_size = 100


class BookingViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Booking CRUD operations
    """
    serializer_class = BookingSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = BookingPagination
    
    def get_queryset(self):
        """Filter bookings based on query params"""
        queryset = Booking.objects.select_related('user', 'desk', 'desk__room').all()
        
        # Filter by room
        room_id = self.request.query_params.get('room', None)
        if room_id:
            queryset = queryset.filter(desk__room_id=room_id)
        
        # Filter by desk
        desk_id = self.request.query_params.get('desk', None)
        if desk_id:
            queryset = queryset.filter(desk_id=desk_id)
        
        # Filter by date range
        start_date = self.request.query_params.get('start_date', None)
        end_date = self.request.query_params.get('end_date', None)
        
        if start_date:
            queryset = queryset.filter(date__gte=start_date)
        if end_date:
            queryset = queryset.filter(date__lte=end_date)
        
        # Filter by current user's bookings
        my_bookings = self.request.query_params.get('my_bookings', None)
        if my_bookings:
            queryset = queryset.filter(user=self.request.user)
        
        return queryset
    
    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['request'] = self.request
        return context
    
    def destroy(self, request, *args, **kwargs):
        """Delete/cancel a booking"""
        instance = self.get_object()
        
        # Only booking owner or admin can delete
        if instance.user != request.user and not request.user.is_staff:
            return Response(
                {'error': 'You can only cancel your own bookings'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Don't allow cancelling past bookings
        if instance.date < date.today():
            return Response(
                {'error': 'Cannot cancel past bookings'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        self.perform_destroy(instance)
        return Response(
            {'message': 'Booking cancelled successfully'},
            status=status.HTTP_200_OK
        )
    
    @action(detail=False, methods=['get'], url_path='my-bookings')
    def my_bookings(self, request):
        """
        Get current user's bookings with pagination support
        GET /api/bookings/my-bookings/?page=1&page_size=10
        
        Returns paginated list of user's upcoming bookings ordered by date
        """
        bookings = Booking.objects.filter(
            user=request.user,
            date__gte=date.today()
        ).select_related('desk', 'desk__room').order_by('date', 'period')
        
        # Apply pagination
        page = self.paginate_queryset(bookings)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        
        # If pagination is not applied (shouldn't happen with our setup)
        serializer = self.get_serializer(bookings, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='my-past-bookings')
    def my_past_bookings(self, request):
        """
        Get current user's past bookings with pagination support
        GET /api/bookings/my-past-bookings/?page=1&page_size=10
        """
        bookings = Booking.objects.filter(
            user=request.user,
            date__lt=date.today()
        ).select_related('desk', 'desk__room').order_by('-date', '-period')
        
        # Apply pagination
        page = self.paginate_queryset(bookings)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        
        serializer = self.get_serializer(bookings, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='my-bookings-count')
    def my_bookings_count(self, request):
        """
        Get count of current user's bookings
        GET /api/bookings/my-bookings-count/
        """
        upcoming = Booking.objects.filter(
            user=request.user,
            date__gte=date.today()
        ).count()
        
        past = Booking.objects.filter(
            user=request.user,
            date__lt=date.today()
        ).count()
        
        today = Booking.objects.filter(
            user=request.user,
            date=date.today()
        ).count()
        
        return Response({
            'upcoming': upcoming,
            'past': past,
            'today': today,
            'total': upcoming + past
        })

    def create(self, request, *args, **kwargs):
        """
        Create a single booking
        POST /api/bookings/
        Body: {"desk": 1, "date": "2025-11-10", "period": "am"}
        """
        serializer = self.get_serializer(data=request.data)
        
        if serializer.is_valid():
            try:
                self.perform_create(serializer)
                return Response(
                    {
                        'message': 'Booking created successfully',
                        'booking': serializer.data
                    },
                    status=status.HTTP_201_CREATED
                )
            except DjangoValidationError as e:
                # Handle Django model validation errors
                error_dict = e.message_dict if hasattr(e, 'message_dict') else {'error': str(e)}
                return Response(
                    error_dict,
                    status=status.HTTP_400_BAD_REQUEST
                )
            except Exception as e:
                return Response(
                    {'error': str(e)},
                    status=status.HTTP_400_BAD_REQUEST
                )
        
        # Serializer validation failed - format the error nicely
        error_response = serializer.errors
        
        # Extract human-readable error message
        if isinstance(error_response, dict):
            if 'date' in error_response:
                error_msg = error_response['date'][0] if isinstance(error_response['date'], list) else error_response['date']
                return Response({'error': error_msg}, status=status.HTTP_400_BAD_REQUEST)
            elif 'period' in error_response:
                error_msg = error_response['period'][0] if isinstance(error_response['period'], list) else error_response['period']
                return Response({'error': error_msg}, status=status.HTTP_400_BAD_REQUEST)
        
        return Response(error_response, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=False, methods=['post'], url_path='bulk-create')
    def bulk_create(self, request):
        """
        Create multiple bookings at once
        POST /api/bookings/bulk-create/
        """
        bookings_data = request.data.get('bookings', [])
        
        if not bookings_data:
            return Response(
                {'error': 'No bookings provided'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        created_bookings = []
        errors = []
        
        for booking_data in bookings_data:
            serializer = self.get_serializer(data=booking_data)
            if serializer.is_valid():
                try:
                    serializer.save()
                    created_bookings.append(serializer.data)
                except DjangoValidationError as e:
                    error_dict = e.message_dict if hasattr(e, 'message_dict') else {'error': str(e)}
                    errors.append({
                        'booking': booking_data,
                        'error': error_dict
                    })
                except Exception as e:
                    errors.append({
                        'booking': booking_data,
                        'error': {'error': str(e)}
                    })
            else:
                # Serializer validation failed
                error_message = serializer.errors
                if isinstance(error_message, dict):
                    if 'date' in error_message:
                        error_message = error_message['date'][0] if isinstance(error_message['date'], list) else error_message['date']
                    elif 'period' in error_message:
                        error_message = error_message['period'][0] if isinstance(error_message['period'], list) else error_message['period']
                
                errors.append({
                    'booking': booking_data,
                    'error': error_message
                })
        
        return Response({
            'created': created_bookings,
            'errors': errors,
            'summary': {
                'total': len(bookings_data),
                'created': len(created_bookings),
                'failed': len(errors)
            }
        }, status=status.HTTP_201_CREATED if created_bookings else status.HTTP_400_BAD_REQUEST)
    
    @action(detail=False, methods=['get'], url_path='availability')
    def availability(self, request):
        """Check desk availability"""
        room_id = request.query_params.get('room')
        check_date = request.query_params.get('date')
        period = request.query_params.get('period', 'full')
        
        if not room_id or not check_date:
            return Response(
                {'error': 'room and date parameters required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        desks = Desk.objects.filter(room_id=room_id, is_active=True)
        
        bookings_query = Q(date=check_date)
        if period != 'full':
            bookings_query &= (Q(period=period) | Q(period='full'))
        
        booked_desk_ids = Booking.objects.filter(
            bookings_query,
            desk__room_id=room_id
        ).values_list('desk_id', flat=True)
        
        available_desks = desks.exclude(id__in=booked_desk_ids)
        serializer = DeskSerializer(available_desks, many=True)
        
        return Response({
            'total_desks': desks.count(),
            'available_desks': available_desks.count(),
            'booked_desks': len(booked_desk_ids),
            'desks': serializer.data
        })


class LDAPSettingsViewSet(viewsets.ModelViewSet):
    """Manage LDAP settings (admin only)"""
    serializer_class = LDAPSettingsSerializer
    permission_classes = [IsAuthenticated, IsAdminUser]

    def get_object(self):
        return LDAPSettings.get_settings()

    def get_queryset(self):
        return LDAPSettings.objects.filter(pk=1)

    @action(detail=True, methods=['post'], url_path='test-connection')
    def test_connection(self, request, pk=None):
        """Test LDAP connection with current settings"""
        import ldap
        from django_auth_ldap.config import LDAPSearch
        settings = self.get_object()

        # Get optional test username from request
        test_username = request.data.get('test_username', 'testuser')
           
        try:
            protocol = 'ldaps://' if settings.use_ssl else 'ldap://'
            uri = f"{protocol}{settings.host}:{settings.port}"
            conn = ldap.initialize(uri)
            
            conn.set_option(ldap.OPT_REFERRALS, 0)
            conn.set_option(ldap.OPT_PROTOCOL_VERSION, settings.version)
            conn.set_option(ldap.OPT_NETWORK_TIMEOUT, settings.timeout)
            
            if settings.use_ssl or settings.use_tls:
                cert_map = {'never': ldap.OPT_X_TLS_NEVER, 'allow': ldap.OPT_X_TLS_ALLOW, 'demand': ldap.OPT_X_TLS_DEMAND}
                conn.set_option(ldap.OPT_X_TLS_REQUIRE_CERT, cert_map.get(settings.cert_require, ldap.OPT_X_TLS_NEVER))
                if settings.cert_file_path:
                    conn.set_option(ldap.OPT_X_TLS_CACERTFILE, settings.cert_file_path)
                if settings.use_tls:
                    conn.start_tls_s()
            
            bind_password = settings.get_bind_password()
            
            if settings.bind_dn and bind_password:
                conn.simple_bind_s(settings.bind_dn, bind_password)
            else:
                conn.simple_bind_s()
            
            # Test search
            search = LDAPSearch(settings.user_search_dn, ldap.SCOPE_SUBTREE, settings.user_search_filter)
            filter_args = {'user': test_username}
            results = search.execute(conn, filter_args)
            
            return Response({'success': True, 'message': 'LDAP connection successful', 'test_search_results': len(results)})
        except Exception as e:
            import traceback
            logger.error(f"LDAP test error: {e}\n{traceback.format_exc()}")
            return Response({'success': False, 'message': str(e)}, status=400)

    def list(self, request, *args, **kwargs):
        """Return single settings object"""
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)


class RoomLayoutViewSet(viewsets.ViewSet):
    """Room Builder layout API contract (admin only)."""
    permission_classes = [IsAuthenticated, IsAdminUser]

    def get_permissions(self):
        """Allow all authenticated users to read layouts, admin for writes."""
        if self.request.method in permissions.SAFE_METHODS:
            return [IsAuthenticated()]
        return [IsAuthenticated(), IsAdminUser()]

    def _get_room(self, room_id):
        return get_object_or_404(Room, pk=room_id)

    def _get_or_create_layout(self, room):
        layout, _ = RoomLayout.objects.get_or_create(room=room)
        return layout

    @action(detail=False, methods=['get', 'put'], url_path=r'(?P<room_id>[^/.]+)')
    def by_room(self, request, room_id=None):
        """
        GET /api/room-layouts/{room_id}/
        PUT /api/room-layouts/{room_id}/
        """
        room = self._get_room(room_id)
        layout = self._get_or_create_layout(room)

        if request.method == 'GET':
            serializer = RoomLayoutSerializer(layout)
            return Response(serializer.data)

        serializer = RoomLayoutSerializer(layout, data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(updated_by=request.user, room=room)
        return Response(serializer.data)

    @action(detail=False, methods=['post'], url_path=r'(?P<room_id>[^/.]+)/autosave')
    def autosave(self, request, room_id=None):
        """
        POST /api/room-layouts/{room_id}/autosave/
        """
        room = self._get_room(room_id)
        layout = self._get_or_create_layout(room)

        serializer = RoomLayoutSerializer(layout, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save(updated_by=request.user, room=room)
        return Response(serializer.data)

    @action(detail=False, methods=['post'], url_path=r'(?P<room_id>[^/.]+)/generate-from-desks')
    def generate_from_desks(self, request, room_id=None):
        """
        POST /api/room-layouts/{room_id}/generate-from-desks/
        """
        room = self._get_room(room_id)
        layout = self._get_or_create_layout(room)

        objects = []
        active_desks = room.desks.filter(is_active=True).order_by('desk_number')
        cols = 6
        spacing_x = 120
        spacing_y = 90
        start_x = 100
        start_y = 100

        for index, desk in enumerate(active_desks):
            row = index // cols
            col = index % cols
            objects.append({
                'id': f'desk_{desk.id}',
                'type': 'desk',
                'x': start_x + (col * spacing_x),
                'y': start_y + (row * spacing_y),
                'width': 80,
                'height': 50,
                'rotation': 0,
                'locked': False,
                'meta': {
                    'deskId': desk.id,
                    'deskNumber': desk.desk_number,
                    'label': f'D{desk.desk_number}',
                },
            })

        layout.layout_json = {
            'schemaVersion': 1,
            'grid': {
                'enabled': True,
                'size': 20,
                'snap': True,
            },
            'objects': objects,
        }
        layout.updated_by = request.user
        layout.save(update_fields=['layout_json', 'updated_by', 'updated_at'])

        serializer = RoomLayoutSerializer(layout)
        return Response(serializer.data)


class AnalyticsViewSet(viewsets.ViewSet):
    """
    ViewSet for analytics and reporting
    """
    permission_classes = [IsAuthenticated]

    def list(self, request):
        """
        Get comprehensive analytics
        GET /api/analytics/
        Optional params: start_date, end_date
        """
        # Get date range from query params
        start_date_param = request.query_params.get('start_date')
        end_date_param = request.query_params.get('end_date')

        # Default to last 30 days if not specified
        if not start_date_param:
            start_date = date.today() - timedelta(days=30)
        else:
            try:
                start_date = datetime.strptime(start_date_param, '%Y-%m-%d').date()
            except ValueError:
                return Response(
                    {'error': 'Invalid start_date format. Use YYYY-MM-DD.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        if not end_date_param:
            end_date = date.today() + timedelta(days=30)
        else:
            try:
                end_date = datetime.strptime(end_date_param, '%Y-%m-%d').date()
            except ValueError:
                return Response(
                    {'error': 'Invalid end_date format. Use YYYY-MM-DD.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        if start_date > end_date:
            return Response(
                {'error': 'start_date cannot be after end_date.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        

        # Filter bookings by date range
        bookings = Booking.objects.filter(date__gte=start_date, date__lte=end_date)

        # Bookings by day of week
        bookings_by_day = {
            'Monday': 0, 'Tuesday': 0, 'Wednesday': 0, 'Thursday': 0,
            'Friday': 0, 'Saturday': 0, 'Sunday': 0
        }
        day_mapping = {
            1: 'Sunday', 2: 'Monday', 3: 'Tuesday', 4: 'Wednesday',
            5: 'Thursday', 6: 'Friday', 7: 'Saturday'
        }
        
        day_counts = bookings.annotate(
            weekday=ExtractWeekDay('date')
        ).values('weekday').annotate(count=Count('id'))
        
        for item in day_counts:
            day_name = day_mapping[item['weekday']]
            bookings_by_day[day_name] = item['count']

        # Bookings by user (top 10)
        bookings_by_user = bookings.values(
            'user__username'
        ).annotate(
            count=Count('id')
        ).order_by('-count')[:10]
        
        bookings_by_user_list = [
            {'username': item['user__username'], 'count': item['count']}
            for item in bookings_by_user
        ]

        # Bookings by room (top 10)
        bookings_by_room = bookings.values(
            'desk__room__name'
        ).annotate(
            count=Count('id')
        ).order_by('-count')[:10]
        
        bookings_by_room_list = [
            {'name': item['desk__room__name'], 'count': item['count']}
            for item in bookings_by_room
        ]

        # Bookings by period
        bookings_by_period = {}
        period_counts = bookings.values('period').annotate(count=Count('id'))
        
        for item in period_counts:
            period_display = dict(Booking.PERIOD_CHOICES).get(item['period'], item['period'])
            bookings_by_period[period_display] = item['count']

        # Booking trend (in certain range)
        booking_trend = []
        for i in range(-30, -13, 1):
            trend_date = end_date + timedelta(days=i)
            count = bookings.filter(date=trend_date).count()
            booking_trend.append({
                'date': trend_date.strftime('%b %d'),
                'count': count
            })

        # Calculate totals and averages
        total_bookings = bookings.count()
        total_users = bookings.values('user').distinct().count()
        total_rooms = Room.objects.count()
        
        days_in_range = (end_date - start_date).days + 1
        avg_bookings_per_day = round(total_bookings / days_in_range, 1) if days_in_range > 0 else 0

        return Response({
            'bookingsByDay': bookings_by_day,
            'bookingsByUser': bookings_by_user_list,
            'bookingsByRoom': bookings_by_room_list,
            'bookingsByPeriod': bookings_by_period,
            'bookingTrend': booking_trend,
            'totalBookings': total_bookings,
            'totalUsers': total_users,
            'totalRooms': total_rooms,
            'averageBookingsPerDay': avg_bookings_per_day,
            'startDate': start_date.isoformat(),
            'endDate': end_date.isoformat(),
        })

    @action(detail=False, methods=['get'], url_path='by-day')
    def by_day(self, request):
        """Get bookings grouped by day of week"""
        bookings = Booking.objects.all()
        
        bookings_by_day = {
            'Monday': 0, 'Tuesday': 0, 'Wednesday': 0, 'Thursday': 0,
            'Friday': 0, 'Saturday': 0, 'Sunday': 0
        }
        day_mapping = {
            1: 'Sunday', 2: 'Monday', 3: 'Tuesday', 4: 'Wednesday',
            5: 'Thursday', 6: 'Friday', 7: 'Saturday'
        }
        
        day_counts = bookings.annotate(
            weekday=ExtractWeekDay('date')
        ).values('weekday').annotate(count=Count('id'))
        
        for item in day_counts:
            day_name = day_mapping[item['weekday']]
            bookings_by_day[day_name] = item['count']
        
        return Response(bookings_by_day)

    @action(detail=False, methods=['get'], url_path='by-user')
    def by_user(self, request):
        """Get bookings grouped by user"""
        limit = int(request.query_params.get('limit', 10))
        
        bookings_by_user = Booking.objects.values(
            'user__username', 'user__first_name', 'user__last_name'
        ).annotate(
            count=Count('id')
        ).order_by('-count')[:limit]
        
        result = [
            {
                'username': item['user__username'],
                'firstName': item['user__first_name'],
                'lastName': item['user__last_name'],
                'count': item['count']
            }
            for item in bookings_by_user
        ]
        
        return Response(result)

    @action(detail=False, methods=['get'], url_path='by-room')
    def by_room(self, request):
        """Get bookings grouped by room"""
        bookings_by_room = Booking.objects.values(
            'desk__room__id', 'desk__room__name'
        ).annotate(
            count=Count('id')
        ).order_by('-count')
        
        result = [
            {
                'roomId': item['desk__room__id'],
                'name': item['desk__room__name'],
                'count': item['count']
            }
            for item in bookings_by_room
        ]
        
        return Response(result)

    @action(detail=False, methods=['get'], url_path='by-period')
    def by_period(self, request):
        """Get bookings grouped by period (AM/PM/Full)"""
        bookings_by_period = {}
        period_counts = Booking.objects.values('period').annotate(count=Count('id'))
        
        for item in period_counts:
            period_display = dict(Booking.PERIOD_CHOICES).get(item['period'], item['period'])
            bookings_by_period[period_display] = item['count']
        
        return Response(bookings_by_period)

    @action(detail=False, methods=['get'], url_path='trend')
    def trend(self, request):
        """Get booking trend over time"""
        days = int(request.query_params.get('days', 7))
        end_date = date.today()
        start_date = end_date - timedelta(days=days - 1)
        
        booking_trend = []
        for i in range(days):
            trend_date = start_date + timedelta(days=i)
            count = Booking.objects.filter(date=trend_date).count()
            booking_trend.append({
                'date': trend_date.strftime('%b %d'),
                'fullDate': trend_date.isoformat(),
                'count': count
            })
        
        return Response(booking_trend)

    @action(detail=False, methods=['get'], url_path='summary')
    def summary(self, request):
        """Get summary statistics"""
        total_bookings = Booking.objects.count()
        total_users = User.objects.count()
        total_rooms = Room.objects.count()
        total_desks = Desk.objects.filter(is_active=True).count()
        
        # Bookings in last 7 days
        seven_days_ago = date.today() - timedelta(days=7)
        recent_bookings = Booking.objects.filter(date__gte=seven_days_ago).count()
        
        # Upcoming bookings
        upcoming_bookings = Booking.objects.filter(date__gte=date.today()).count()
        
        return Response({
            'totalBookings': total_bookings,
            'totalUsers': total_users,
            'totalRooms': total_rooms,
            'totalDesks': total_desks,
            'recentBookings': recent_bookings,
            'upcomingBookings': upcoming_bookings,
        })
