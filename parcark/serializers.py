import os
from datetime import date, timedelta

from django.contrib.auth import get_user_model, authenticate
from django.contrib.auth.password_validation import validate_password
from django.db.models import Q
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed, PermissionDenied

from .models import Booking, Desk, Room, RoomLayout, LDAPSettings

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    """Serializer for User model - safe for API responses"""
    auth_source = serializers.ReadOnlyField()
    
    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'first_name', 'last_name',
            'is_staff', 'is_active', 'is_ldap_user', 'auth_source', 'department',
            'phone', 'date_joined', 'last_login'
        ]
        read_only_fields = [
            'id', 'is_ldap_user', 'auth_source', 'date_joined', 'last_login'
        ]


class UserCreateSerializer(serializers.ModelSerializer):
    """Serializer for admin-created local users"""
    password = serializers.CharField(write_only=True, min_length=8)
    password_confirm = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'password', 'password_confirm',
            'first_name', 'last_name', 'department', 'phone',
            'is_staff', 'is_active'
        ]
        read_only_fields = ['id']

    def validate_username(self, value):
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError('Username already exists')
        if len(value) < 3:
            raise serializers.ValidationError('Username must be at least 3 characters')
        return value

    def validate_email(self, value):
        if value and User.objects.filter(email=value).exists():
            raise serializers.ValidationError('Email already registered')
        return value

    def validate(self, data):
        if data.get('password') != data.get('password_confirm'):
            raise serializers.ValidationError({'password_confirm': 'Passwords do not match'})

        try:
            validate_password(data.get('password'))
        except DjangoValidationError as exc:
            raise serializers.ValidationError({'password': list(exc.messages)})

        return data

    def create(self, validated_data):
        validated_data.pop('password_confirm')
        password = validated_data.pop('password')

        user = User.objects.create_user(
            password=password,
            is_ldap_user=False,
            **validated_data,
        )
        return user


class UserUpdateSerializer(serializers.ModelSerializer):
    """Serializer for admin updates to existing users"""

    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'first_name', 'last_name',
            'department', 'phone', 'is_staff', 'is_active'
        ]
        read_only_fields = ['id']

    def validate_username(self, value):
        instance = self.instance
        if instance and instance.is_ldap_user and value != instance.username:
            raise serializers.ValidationError('Username cannot be changed for LDAP users')

        queryset = User.objects.filter(username=value)
        if instance:
            queryset = queryset.exclude(pk=instance.pk)
        if queryset.exists():
            raise serializers.ValidationError('Username already exists')

        if len(value) < 3:
            raise serializers.ValidationError('Username must be at least 3 characters')

        return value

    def validate_email(self, value):
        instance = self.instance
        queryset = User.objects.filter(email=value)
        if instance:
            queryset = queryset.exclude(pk=instance.pk)
        if value and queryset.exists():
            raise serializers.ValidationError('Email already registered')
        return value


class UserPasswordResetSerializer(serializers.Serializer):
    """Serializer for admin password resets (local users only)"""
    password = serializers.CharField(write_only=True, min_length=8)
    password_confirm = serializers.CharField(write_only=True)

    def validate(self, data):
        if data.get('password') != data.get('password_confirm'):
            raise serializers.ValidationError({'password_confirm': 'Passwords do not match'})

        try:
            validate_password(data.get('password'))
        except DjangoValidationError as exc:
            raise serializers.ValidationError({'password': list(exc.messages)})

        return data


class RegisterSerializer(serializers.ModelSerializer):
    """Serializer for user registration (local users only)"""
    password = serializers.CharField(
        write_only=True,
        min_length=8,
        style={'input_type': 'password'}
    )
    password_confirm = serializers.CharField(
        write_only=True,
        style={'input_type': 'password'}
    )
    
    class Meta:
        model = User
        fields = [
            'username', 'email', 'password', 'password_confirm',
            'first_name', 'last_name', 'department', 'phone'
        ]
    
    def validate_username(self, value):
        """Validate username"""
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError("Username already exists")
        if len(value) < 3:
            raise serializers.ValidationError("Username must be at least 3 characters")
        return value
    
    def validate_email(self, value):
        """Validate email"""
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("Email already registered")
        return value
    
    def validate(self, data):
        """Validate passwords match"""
        if data['password'] != data['password_confirm']:
            raise serializers.ValidationError({
                'password_confirm': 'Passwords do not match'
            })
        return data
    
    def create(self, validated_data):
        """Create local user"""
        validated_data.pop('password_confirm')
        user = User.objects.create_user(
            username=validated_data['username'],
            email=validated_data['email'],
            password=validated_data['password'],
            first_name=validated_data.get('first_name', ''),
            last_name=validated_data.get('last_name', ''),
            department=validated_data.get('department', ''),
            phone=validated_data.get('phone', ''),
            is_ldap_user=False  # Local user
        )
        return user


class LoginSerializer(serializers.Serializer):
    """Serializer for login (works with both local and LDAP)"""
    username = serializers.CharField()
    password = serializers.CharField(
        write_only=True,
        style={'input_type': 'password'}
    )
    
    def validate(self, data):
        """Authenticate user"""
        username = data.get('username')
        password = data.get('password')
        
        if not username or not password:
            raise serializers.ValidationError("Must provide username and password")
        
        # Django will try all AUTHENTICATION_BACKENDS in order
        user = authenticate(
            request=self.context.get('request'),
            username=username,
            password=password
        )
        
        if not user:
            # Return 401 for bad username/password
            raise AuthenticationFailed("Invalid username or password")
        
        if not user.is_active:
            raise PermissionDenied("User account is disabled")
        
        data['user'] = user
        return data


class RoomSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()
    
    class Meta:
        model = Room
        fields = [
            'id', 'name', 'number_of_desks', 'image', 'image_url',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'image_url', 'created_at', 'updated_at']
    
    def get_image_url(self, obj):
        """Return full URL for image"""
        if obj.image:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.image.url)
            return obj.image.url
        return None

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Room name cannot be empty")
        if len(value) < 3:
            raise serializers.ValidationError("Room name must be at least 3 characters long")
        if len(value) > 100:
            raise serializers.ValidationError("Room name must be less than 100 characters")
        return value

    def validate_number_of_desks(self, value):
        if value < 1:
            raise serializers.ValidationError("Must have at least 1 desk")
        if value > 100:
            raise serializers.ValidationError("Cannot exceed 100 desks")
        return value
    
    def validate_image(self, value):
        """Validate image file"""
        if value:
            # Check file size (max 2MB)
            if value.size > 2 * 1024 * 1024:
                raise serializers.ValidationError("Image file too large. Maximum size is 2MB.")
            
            # Check MIME type
            allowed_types = ['image/jpeg', 'image/png', 'image/webp']
            if value.content_type not in allowed_types:
                raise serializers.ValidationError(
                    "Invalid image type. Only JPG, PNG, and WebP are allowed."
                )
        
        return value

    def validate(self, data):
        """Object-level validation"""
        name = data.get('name', '').strip()
        queryset = Room.objects.filter(name__iexact=name)
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError({'name': 'A room with this name already exists'})
        return data
    
    def update(self, instance, validated_data):
        """Handle image update/deletion"""
        # If new image is provided, delete old one
        if 'image' in validated_data and validated_data['image']:
            if instance.image:
                # Delete old image file
                if os.path.isfile(instance.image.path):
                    os.remove(instance.image.path)
        
        return super().update(instance, validated_data)

class DeskSerializer(serializers.ModelSerializer):
    room_name = serializers.CharField(source='room.name', read_only=True)
    
    class Meta:
        model = Desk
        fields = [
            'id', 'room', 'room_name', 'desk_number', 
            'location_description', 'is_active'
        ]
        read_only_fields = ['id', 'room_name']

class BookingSerializer(serializers.ModelSerializer):
    user_username = serializers.CharField(source='user.username', read_only=True)
    desk_number = serializers.IntegerField(source='desk.desk_number', read_only=True)
    room_name = serializers.CharField(source='desk.room.name', read_only=True)
    is_mine = serializers.SerializerMethodField()
    
    class Meta:
        model = Booking
        fields = [
            'id', 'user', 'user_username', 'desk', 'desk_number', 
            'room_name', 'date', 'period', 'is_mine', 'created_at'
        ]
        read_only_fields = ['id', 'user', 'user_username', 'desk_number', 
                           'room_name', 'is_mine', 'created_at']
    
    def get_is_mine(self, obj):
        """Check if booking belongs to current user"""
        request = self.context.get('request')
        if request and request.user:
            return obj.user == request.user
        return False
    
    def validate_date(self, value):
        """Validate date is not in the past"""
        if value < date.today():
            raise serializers.ValidationError("Cannot book a desk in the past")
        return value
    
    def validate(self, data):
        """Check for booking conflicts"""
        user = self.context['request'].user
        booking_date = data.get('date')
        period = data.get('period')

        # Get all user bookings for that date with desk + room info included
        conflicting_bookings = (
            Booking.objects
            .filter(user=user, date=booking_date)
            .select_related('desk__room')
        )

        # If this is an update, exclude the instance itself
        if self.instance:
            conflicting_bookings = conflicting_bookings.exclude(pk=self.instance.pk)

        def format_existing(existing):
            """Return a structured clash description for the frontend"""
            return {
                "date": existing.date,
                "period": existing.period,
                "desk": existing.desk.desk_number,
                "desk_name": getattr(existing.desk, 'name', None),
                "room": existing.desk.room.id if existing.desk.room else None,
                "room_name": getattr(existing.desk.room, 'name', None),
            }

        # FULL DAY block → any booking that day is a conflict
        if period == 'full':
            existing = conflicting_bookings.first()
            if existing:
                raise serializers.ValidationError({
                    "error": "You already have a booking for this day.",
                    "existing_booking": format_existing(existing)
                })

        # AM/PM block → conflict only if same period or full-day booking exists
        else:
            existing = conflicting_bookings.filter(
                Q(period='full') | Q(period=period)
            ).first()
            if existing:
                raise serializers.ValidationError({
                    "error": "You already have a booking in this timeslot.",
                    "existing_booking": format_existing(existing)
                })

        return data

    def create(self, validated_data):
        """Auto-set user from request"""
        validated_data['user'] = self.context['request'].user
        return super().create(validated_data)


class LDAPSettingsSerializer(serializers.ModelSerializer):
    updated_by_username = serializers.ReadOnlyField(source='updated_by.username')
    bind_password = serializers.CharField(write_only=True, required=False) 

    class Meta:
        model = LDAPSettings
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at', 'updated_by']

    def validate(self, data):
        if data.get('use_ssl') and data.get('use_tls'):
            raise serializers.ValidationError("Cannot use both SSL and TLS")
        # Auto-correct port for SSL
        if data.get('use_ssl') and data.get('port') != 636:
            data['port'] = 636
        return data

    def update(self, instance, validated_data):
        password = validated_data.pop('bind_password', None)
        if password is not None:  # Allow empty string to clear password
            instance.set_bind_password(password)
        return super().update(instance, validated_data)
    
    def to_representation(self, instance):
        """Never return password in API responses"""
        data = super().to_representation(instance)
        data.pop('bind_password', None)
        return data


class RoomLayoutSerializer(serializers.ModelSerializer):
    room_name = serializers.CharField(source='room.name', read_only=True)
    updated_by_username = serializers.ReadOnlyField(source='updated_by.username')

    class Meta:
        model = RoomLayout
        fields = [
            'id',
            'room',
            'room_name',
            'version',
            'canvas_width',
            'canvas_height',
            'layout_json',
            'created_at',
            'updated_at',
            'updated_by',
            'updated_by_username',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'updated_by', 'updated_by_username']

    def validate_layout_json(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError('layout_json must be an object')

        if 'schemaVersion' not in value:
            raise serializers.ValidationError('layout_json must include schemaVersion')

        if value.get('schemaVersion') != 1:
            raise serializers.ValidationError('Only schemaVersion 1 is currently supported')

        objects = value.get('objects', [])
        if not isinstance(objects, list):
            raise serializers.ValidationError('layout_json.objects must be an array')

        for item in objects:
            if not isinstance(item, dict):
                raise serializers.ValidationError('Each object entry must be an object')
            if 'id' not in item or 'type' not in item:
                raise serializers.ValidationError('Each object must include id and type')

        return value

    def validate(self, data):
        width = data.get('canvas_width', getattr(self.instance, 'canvas_width', 1200))
        height = data.get('canvas_height', getattr(self.instance, 'canvas_height', 800))

        if width < 200 or width > 5000:
            raise serializers.ValidationError({'canvas_width': 'Canvas width must be between 200 and 5000'})
        if height < 200 or height > 5000:
            raise serializers.ValidationError({'canvas_height': 'Canvas height must be between 200 and 5000'})

        return data
