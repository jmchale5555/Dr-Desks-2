# Developer Showcase: DR Desks

This document highlights the technical architecture and implementation patterns used in this project, from a developer perspective.

## Stack and architecture

DR Desks is a full-stack desk-booking system built with:

- **Backend:** Django + Django REST Framework + PostgreSQL
- **Frontend:** React + Vite + Tailwind + React Router
- **Infra:** Docker Compose (`db`, `web`, `node`, `nginx`)

The backend exposes REST endpoints for auth, booking, analytics, settings, and room-layout management. The frontend consumes these endpoints through service modules and custom hooks, with route-level auth and role checks.

## API-oriented domain model

The booking domain is represented in Django models (`Room`, `Desk`, `Booking`) and exposed through DRF viewsets. Business constraints (conflicts, date/period semantics) are enforced server-side.

### Example: room layout model for editor + viewer reuse

`RoomLayout` stores a versioned JSON payload that is used by both the admin editor and booking-time viewer.

```python
# parcark/models.py
class RoomLayout(models.Model):
    room = models.OneToOneField(Room, on_delete=models.CASCADE, related_name='layout')
    version = models.PositiveIntegerField(default=1)
    canvas_width = models.PositiveIntegerField(default=800)
    canvas_height = models.PositiveIntegerField(default=800)
    layout_json = models.JSONField(default=default_room_layout_json)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='room_layout_updates',
    )
```

This separation keeps rendering concerns in the frontend while preserving canonical room/desk identity in backend data.

## Permissions strategy: read for users, write for admins

Room layout APIs are intentionally split by operation:

- **Read (`GET`)**: any authenticated user (for booking-time map display)
- **Write (`PUT`/`POST`)**: admin only (for Room Builder)

```python
# parcark/views.py
class RoomLayoutViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated, IsAdminUser]

    def get_permissions(self):
        if self.request.method in permissions.SAFE_METHODS:
            return [IsAuthenticated()]
        return [IsAuthenticated(), IsAdminUser()]
```

This enables role-appropriate access without duplicating layout endpoints.

## Interactive Room Builder (admin)

Room Builder is implemented with `react-konva`, using a JSON-backed canvas model and a toolbar-driven editing workflow.

Implemented editor capabilities include:

- selection + transform
- drag/nudge
- rotate (90deg shortcut action)
- scale (+/- percentage)
- duplicate/delete
- undo/redo history stack

### Example: history-based immutable updates

```jsx
// frontend/src/apps/roomBuilder/RoomBuilderApp.jsx
const setLayoutWithHistory = (updater) => {
  setLayout((prevLayout) => {
    const nextLayout = typeof updater === 'function' ? updater(prevLayout) : updater;
    if (!prevLayout || !nextLayout || nextLayout === prevLayout) return nextLayout;

    setHistory((prevHistory) => ({
      past: [...prevHistory.past, prevLayout].slice(-HISTORY_LIMIT),
      future: [],
    }));

    return nextLayout;
  });
};
```

The same layout schema is reused in booking mode as a read-only, status-aware viewer.

## Booking UX modes driven by data availability

The booking flow supports two modes:

1. **Layout mode** (if room layout exists): map-based desk selection with date/period selectors.
2. **Fallback mode** (if no layout): calendar-based desk-slot selection.

This mode-switching is state-driven and allows gradual rollout of room maps without blocking booking operations.

### Example: map layout fetch and mode state

```jsx
// frontend/src/apps/booking/BookingApp.jsx
const layout = await roomLayoutService.getRoomLayout(selectedRoom);
setRoomLayout(layout);

const deskObjects = (layout?.layout_json?.objects || []).filter((obj) => obj.type === 'desk');
if (deskObjects.length === 0) {
  setMapState('layoutMissing');
  setMapMessage('No room map available yet. Use desk dropdown for now.');
  return;
}
```

## Availability-aware map rendering

In layout mode, desk shapes are rendered with status colors derived from real-time availability, and desk identity is mapped via `meta.deskId` (with `deskNumber` fallback).

### Example: click behavior with inspect vs select

```jsx
// frontend/src/apps/booking/components/RoomLayoutViewer.jsx
onClick={() => {
  if (canInspect) onDeskInspect(String(obj.meta.deskId));
  if (canSelect) {
    onDeskSelect(String(obj.meta.deskId));
  } else if (canInspect) {
    onDeskSelect('');
  }
}}
```

This prevents accidental booking when inspecting a desk that is unavailable.

## Shared interaction patterns across app areas

A consistent cancel-confirmation pattern is used in both Booking and My Bookings for safer destructive actions:

- explicit modal confirmation
- clear date/period context
- disabled states while action is running
- optimistic/local refresh after completion

This consistency improves usability and reduces accidental cancellations.

## Developer workflow and quality checks

The project uses Docker-first local development and straightforward verification steps:

- `docker compose up --build`
- `docker compose exec web python manage.py migrate`
- `docker compose exec web python manage.py test`
- `docker compose exec node npm run build`

Recent development included handling container mount/watch edge cases (Vite cache path and shared SELinux labels) to keep HMR and backend reload stable in containerized development.

## Why this project is portfolio-worthy

This codebase demonstrates practical full-stack engineering:

- role-aware API design
- interactive editor tooling with robust state/history patterns
- graceful feature fallback when optional data is missing
- backend-first business rules for booking integrity
- iterative UX hardening based on realistic user behavior

It shows not only feature delivery, but also system thinking across data modeling, permissions, interaction design, and operational reliability.
