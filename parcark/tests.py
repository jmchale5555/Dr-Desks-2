from django.contrib.auth import get_user_model
from django.test import TestCase
from django.test.utils import override_settings
from rest_framework.test import APIClient
from datetime import date, timedelta
from unittest import skip

from .models import Room, Booking


@override_settings(AUTHENTICATION_BACKENDS=['django.contrib.auth.backends.ModelBackend'])
class LoginTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(
            username='alice',
            password='password123',
            email='alice@example.com',
        )

    def test_login_invalid_credentials_returns_403(self):
        response = self.client.post(
            '/api/auth/login/',
            {'username': self.user.username, 'password': 'wrong-password'},
            format='json',
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data.get('detail'), 'Invalid username or password')

    def test_login_unknown_username_returns_403(self):
        response = self.client.post(
            '/api/auth/login/',
            {'username': 'does-not-exist', 'password': 'password123'},
            format='json',
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data.get('detail'), 'Invalid username or password')

    def test_login_success_returns_user(self):
        response = self.client.post(
            '/api/auth/login/',
            {'username': self.user.username, 'password': 'password123'},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data.get('message'), 'Login successful')
        self.assertEqual(response.data.get('user', {}).get('username'), self.user.username)

    def test_login_sets_session_cookie(self):
        response = self.client.post(
            '/api/auth/login/',
            {'username': self.user.username, 'password': 'password123'},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn('sessionid', response.cookies)
        self.assertTrue(response.cookies['sessionid'].value)

        me_response = self.client.get('/api/auth/me/', format='json')
        self.assertEqual(me_response.status_code, 200)
        self.assertEqual(me_response.data.get('username'), self.user.username)

    def test_current_user_requires_authentication(self):
        response = self.client.get('/api/auth/me/', format='json')
        self.assertEqual(response.status_code, 403)

    def test_login_disabled_user_returns_403(self):
        disabled_user = get_user_model().objects.create_user(
            username='disabled',
            password='password123',
            email='disabled@example.com',
            is_active=False,
        )

        response = self.client.post(
            '/api/auth/login/',
            {'username': disabled_user.username, 'password': 'password123'},
            format='json',
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data.get('detail'), 'Invalid username or password')

    def test_logout_invalidates_session(self):
        login_response = self.client.post(
            '/api/auth/login/',
            {'username': self.user.username, 'password': 'password123'},
            format='json',
        )
        self.assertEqual(login_response.status_code, 200)

        logout_response = self.client.post('/api/auth/logout/', format='json')
        self.assertEqual(logout_response.status_code, 200)

        me_response = self.client.get('/api/auth/me/', format='json')
        self.assertEqual(me_response.status_code, 403)

    def test_change_password_success(self):
        self.client.force_authenticate(user=self.user)

        response = self.client.post(
            '/api/auth/change-password/',
            {
                'old_password': 'password123',
                'new_password': 'NewStrongPassword123!',
                'new_password_confirm': 'NewStrongPassword123!',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data.get('message'), 'Password updated successfully')

        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('NewStrongPassword123!'))

    def test_change_password_rejects_wrong_current_password(self):
        self.client.force_authenticate(user=self.user)

        response = self.client.post(
            '/api/auth/change-password/',
            {
                'old_password': 'wrong-password',
                'new_password': 'NewStrongPassword123!',
                'new_password_confirm': 'NewStrongPassword123!',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn('Current password is incorrect', str(response.data))

    def test_change_password_blocked_for_ldap_user(self):
        ldap_user = get_user_model().objects.create_user(
            username='ldap-user',
            password='password123',
            email='ldap-user@example.com',
            is_ldap_user=True,
        )
        self.client.force_authenticate(user=ldap_user)

        response = self.client.post(
            '/api/auth/change-password/',
            {
                'old_password': 'password123',
                'new_password': 'NewStrongPassword123!',
                'new_password_confirm': 'NewStrongPassword123!',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data.get('error'), 'Password reset is not available for LDAP users.')


@override_settings(AUTHENTICATION_BACKENDS=['django.contrib.auth.backends.ModelBackend'])
class AuthSecurityTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username='alice',
            password='password123',
            email='alice@example.com',
        )

    def test_logout_requires_csrf_token(self):
        csrf_client = APIClient(enforce_csrf_checks=True)
        csrf_client.login(username=self.user.username, password='password123')

        response = csrf_client.post('/api/auth/logout/', format='json')

        self.assertEqual(response.status_code, 403)
        self.assertIn('CSRF', str(response.data.get('detail', '')))

    def test_ldap_settings_requires_admin(self):
        client = APIClient()
        client.force_authenticate(user=self.user)

        response = client.get('/api/settings/ldap/', format='json')

        self.assertEqual(response.status_code, 403)


@override_settings(AUTHENTICATION_BACKENDS=['django.contrib.auth.backends.ModelBackend'])
class AnalyticsDateRangeTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(
            username='analytics_user',
            password='password123',
            email='analytics@example.com',
        )
        self.client.force_authenticate(user=self.user)

        self.room = Room.objects.create(name='Room A', number_of_desks=1)
        self.desk = self.room.desks.first()

    def test_analytics_defaults_to_30_day_window_when_no_params(self):
        response = self.client.get('/api/analytics/', format='json')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.data.get('startDate'),
            (date.today() - timedelta(days=30)).isoformat(),
        )
        self.assertEqual(
            response.data.get('endDate'),
            (date.today() + timedelta(days=30)).isoformat(),
        )

    def test_analytics_uses_explicit_date_range(self):
        start_date = date.today() + timedelta(days=1)
        end_date = date.today() + timedelta(days=3)

        Booking.objects.create(
            user=self.user,
            desk=self.desk,
            date=start_date + timedelta(days=1),
            period='am',
        )
        Booking.objects.create(
            user=self.user,
            desk=self.desk,
            date=end_date + timedelta(days=2),
            period='pm',
        )

        response = self.client.get(
            '/api/analytics/',
            {
                'start_date': start_date.isoformat(),
                'end_date': end_date.isoformat(),
            },
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data.get('startDate'), start_date.isoformat())
        self.assertEqual(response.data.get('endDate'), end_date.isoformat())
        self.assertEqual(response.data.get('totalBookings'), 1)

    def test_analytics_rejects_invalid_start_date_format(self):
        response = self.client.get(
            '/api/analytics/',
            {'start_date': '2026/01/01', 'end_date': '2026-01-10'},
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.data.get('error'),
            'Invalid start_date format. Use YYYY-MM-DD.',
        )

    def test_analytics_rejects_start_date_after_end_date(self):
        response = self.client.get(
            '/api/analytics/',
            {'start_date': '2026-02-10', 'end_date': '2026-02-01'},
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.data.get('error'),
            'start_date cannot be after end_date.',
        )


@override_settings(AUTHENTICATION_BACKENDS=['django.contrib.auth.backends.ModelBackend'])
class UserManagementGuardrailTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.User = get_user_model()
        self.admin = self.User.objects.create_user(
            username='admin',
            password='password123',
            email='admin@example.com',
            is_staff=True,
            is_active=True,
        )
        self.client.force_authenticate(user=self.admin)

    def test_non_admin_cannot_access_user_management(self):
        non_admin = self.User.objects.create_user(
            username='nonadmin',
            password='password123',
            email='nonadmin@example.com',
            is_staff=False,
        )

        client = APIClient()
        client.force_authenticate(user=non_admin)

        response = client.get('/api/users/', format='json')
        self.assertEqual(response.status_code, 403)

    def test_admin_can_create_local_user(self):
        payload = {
            'username': 'localuser',
            'email': 'local@example.com',
            'password': 'StrongPassword123!',
            'password_confirm': 'StrongPassword123!',
            'first_name': 'Local',
            'last_name': 'User',
            'is_staff': False,
            'is_active': True,
        }

        response = self.client.post('/api/users/', payload, format='json')
        self.assertEqual(response.status_code, 201)

        created = self.User.objects.get(username='localuser')
        self.assertFalse(created.is_ldap_user)
        self.assertTrue(created.check_password('StrongPassword123!'))

    def test_cannot_delete_last_active_admin(self):
        response = self.client.delete(f'/api/users/{self.admin.id}/', format='json')

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data.get('error'), 'Cannot delete the last active admin user.')
        self.assertTrue(self.User.objects.filter(id=self.admin.id).exists())

    def test_cannot_demote_last_active_admin(self):
        response = self.client.patch(
            f'/api/users/{self.admin.id}/',
            {'is_staff': False},
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data.get('error'), 'Cannot remove or deactivate the last active admin user.')

        self.admin.refresh_from_db()
        self.assertTrue(self.admin.is_staff)

    def test_cannot_deactivate_last_active_admin(self):
        response = self.client.patch(
            f'/api/users/{self.admin.id}/',
            {'is_active': False},
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data.get('error'), 'Cannot remove or deactivate the last active admin user.')

        self.admin.refresh_from_db()
        self.assertTrue(self.admin.is_active)

    def test_ldap_user_delete_soft_disables_only(self):
        ldap_user = self.User.objects.create_user(
            username='ldapuser',
            password='password123',
            email='ldap@example.com',
            is_ldap_user=True,
            is_active=True,
        )

        response = self.client.delete(f'/api/users/{ldap_user.id}/', format='json')
        self.assertEqual(response.status_code, 204)

        ldap_user.refresh_from_db()
        self.assertFalse(ldap_user.is_active)
        self.assertTrue(self.User.objects.filter(id=ldap_user.id).exists())

    def test_ldap_username_change_is_blocked(self):
        ldap_user = self.User.objects.create_user(
            username='ldapname',
            password='password123',
            email='ldapname@example.com',
            is_ldap_user=True,
        )

        response = self.client.patch(
            f'/api/users/{ldap_user.id}/',
            {'username': 'newldapname'},
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn('Username cannot be changed for LDAP users', str(response.data))

        ldap_user.refresh_from_db()
        self.assertEqual(ldap_user.username, 'ldapname')

    def test_ldap_password_reset_is_blocked(self):
        ldap_user = self.User.objects.create_user(
            username='ldappass',
            password='password123',
            email='ldappass@example.com',
            is_ldap_user=True,
        )

        response = self.client.post(
            f'/api/users/{ldap_user.id}/set-password/',
            {
                'password': 'NewPassword123!',
                'password_confirm': 'NewPassword123!',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data.get('error'), 'Password reset is not allowed for LDAP users.')

    def test_local_password_reset_succeeds(self):
        user = self.User.objects.create_user(
            username='localreset',
            password='password123',
            email='localreset@example.com',
            is_ldap_user=False,
        )

        response = self.client.post(
            f'/api/users/{user.id}/set-password/',
            {
                'password': 'BrandNewPassword123!',
                'password_confirm': 'BrandNewPassword123!',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data.get('message'), 'Password updated successfully')

        user.refresh_from_db()
        self.assertTrue(user.check_password('BrandNewPassword123!'))


@skip('LDAP auth tests temporarily disabled until LDAP backend is re-enabled')
class LDAPAuthTests(TestCase):
    """Placeholder suite for LDAP authentication behavior tests."""

    def test_ldap_login_flow_placeholder(self):
        pass


@override_settings(AUTHENTICATION_BACKENDS=['django.contrib.auth.backends.ModelBackend'])
class BookingApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.User = get_user_model()
        self.user = self.User.objects.create_user(
            username='booking-user',
            password='password123',
            email='booking-user@example.com',
        )
        self.other_user = self.User.objects.create_user(
            username='other-user',
            password='password123',
            email='other-user@example.com',
        )
        self.admin = self.User.objects.create_user(
            username='booking-admin',
            password='password123',
            email='booking-admin@example.com',
            is_staff=True,
        )

        self.room = Room.objects.create(name='Booking Room', number_of_desks=2)
        self.desk_1 = self.room.desks.order_by('desk_number').first()
        self.desk_2 = self.room.desks.order_by('desk_number')[1]

    def test_create_booking_success_returns_201_and_booking_message(self):
        self.client.force_authenticate(user=self.user)
        booking_date = date.today() + timedelta(days=1)

        response = self.client.post(
            '/api/bookings/',
            {
                'desk': self.desk_1.id,
                'date': booking_date.isoformat(),
                'period': 'am',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data.get('message'), 'Booking created successfully')
        self.assertEqual(response.data.get('booking', {}).get('desk'), self.desk_1.id)
        self.assertEqual(response.data.get('booking', {}).get('period'), 'am')

    def test_create_booking_rejects_past_date(self):
        self.client.force_authenticate(user=self.user)
        booking_date = date.today() - timedelta(days=1)

        response = self.client.post(
            '/api/bookings/',
            {
                'desk': self.desk_1.id,
                'date': booking_date.isoformat(),
                'period': 'am',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data.get('error'), 'Cannot book a desk in the past')

    def test_create_booking_rejects_user_timeslot_conflict(self):
        self.client.force_authenticate(user=self.user)
        booking_date = date.today() + timedelta(days=2)

        Booking.objects.create(
            user=self.user,
            desk=self.desk_1,
            date=booking_date,
            period='am',
        )

        response = self.client.post(
            '/api/bookings/',
            {
                'desk': self.desk_2.id,
                'date': booking_date.isoformat(),
                'period': 'am',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data.get('error'), 'You already have a booking in this timeslot.')
        self.assertEqual(response.data.get('existing_booking', {}).get('desk'), self.desk_1.desk_number)

    def test_cancel_booking_owner_can_cancel_future_booking(self):
        self.client.force_authenticate(user=self.user)
        booking = Booking.objects.create(
            user=self.user,
            desk=self.desk_1,
            date=date.today() + timedelta(days=3),
            period='pm',
        )

        response = self.client.delete(f'/api/bookings/{booking.id}/', format='json')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data.get('message'), 'Booking cancelled successfully')
        self.assertFalse(Booking.objects.filter(id=booking.id).exists())

    def test_cancel_booking_non_owner_non_admin_gets_403(self):
        self.client.force_authenticate(user=self.user)
        booking = Booking.objects.create(
            user=self.other_user,
            desk=self.desk_1,
            date=date.today() + timedelta(days=3),
            period='pm',
        )

        response = self.client.delete(f'/api/bookings/{booking.id}/', format='json')

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data.get('error'), 'You can only cancel your own bookings')
        self.assertTrue(Booking.objects.filter(id=booking.id).exists())

    def test_cancel_booking_admin_can_cancel_other_users_booking(self):
        self.client.force_authenticate(user=self.admin)
        booking = Booking.objects.create(
            user=self.other_user,
            desk=self.desk_1,
            date=date.today() + timedelta(days=4),
            period='full',
        )

        response = self.client.delete(f'/api/bookings/{booking.id}/', format='json')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data.get('message'), 'Booking cancelled successfully')
        self.assertFalse(Booking.objects.filter(id=booking.id).exists())

    def test_my_bookings_returns_only_authenticated_users_upcoming(self):
        self.client.force_authenticate(user=self.user)
        upcoming_date = date.today() + timedelta(days=1)
        past_date = date.today() - timedelta(days=1)

        Booking.objects.create(
            user=self.user,
            desk=self.desk_1,
            date=upcoming_date,
            period='am',
        )
        Booking.objects.create(
            user=self.user,
            desk=self.desk_1,
            date=past_date,
            period='pm',
        )
        Booking.objects.create(
            user=self.other_user,
            desk=self.desk_2,
            date=upcoming_date,
            period='am',
        )

        response = self.client.get('/api/bookings/my-bookings/', format='json')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data.get('count'), 1)
        self.assertEqual(len(response.data.get('results', [])), 1)
        self.assertEqual(response.data['results'][0]['user'], self.user.id)
        self.assertEqual(response.data['results'][0]['date'], upcoming_date.isoformat())

    def test_availability_requires_room_and_date(self):
        self.client.force_authenticate(user=self.user)

        response = self.client.get('/api/bookings/availability/', {'room': self.room.id}, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data.get('error'), 'room and date parameters required')
