import { useEffect, useState } from 'react';
import { Calendar, MapPin, Clock, Trash2 } from 'lucide-react';
import { useBookingData } from '../../hooks/useBookingData';
import { bookingService } from '../../services/bookingService';
import { roomLayoutService } from '../../services/roomLayoutService';
import { useAuth } from '../../context/AuthContext';
import RoomLayoutViewer from './components/RoomLayoutViewer';

// Period Button Component
function PeriodButton({ period, label, isSelected, isBooked, bookedBy, isMine, onClick, onCancel, disabled }) {
  const getButtonStyle = () => {
    if (isBooked) {
      if (isMine) {
        return 'bg-blue-100 dark:bg-blue-900/30 border-2 border-blue-500 dark:border-blue-400';
      }
      return 'bg-gray-200 dark:bg-gray-700 border-2 border-gray-400 dark:border-gray-600 cursor-not-allowed';
    }
    if (isSelected) {
      return 'bg-green-100 dark:bg-green-900/30 border-2 border-green-500 dark:border-green-400 ring-2 ring-green-300 dark:ring-green-700';
    }
    return 'bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 hover:border-green-400 dark:hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-900/10';
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || (isBooked && !isMine)}
      className={`p-3 rounded-lg transition-all ${getButtonStyle()} ${
        disabled || (isBooked && !isMine) ? 'cursor-not-allowed' : 'cursor-pointer'
      }${period === "full" ? " col-span-2" : ""}`}
    >
      <div className="text-xs font-semibold text-gray-900 dark:text-white mb-1">
        {label}
      </div>
      {isBooked ? (
        <div className="space-y-1">
          <div className="text-xs text-gray-700 dark:text-gray-300">
            {isMine ? '✓ Your booking' : `Booked by ${bookedBy}`}
          </div>
          {isMine && onCancel && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCancel();
              }}
              className="text-xs text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 underline"
            >
              Cancel
            </button>
          )}
        </div>
      ) : (
        <div className="text-xs text-gray-600 dark:text-gray-400">
          {isSelected ? 'Selected' : 'Available'}
        </div>
      )}
    </button>
  );
}

// Cancel Booking Modal
function CancelBookingModal({ booking, onConfirm, onClose, loading }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <Trash2 className="h-6 w-6 text-red-600 dark:text-red-400" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
            Cancel Booking?
          </h3>
        </div>
        
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Are you sure you want to cancel your booking for{' '}
          <strong>{new Date(booking.date).toLocaleDateString()}</strong>{' '}
          ({booking.period === 'am' ? 'Morning' : booking.period === 'pm' ? 'Afternoon' : 'Full Day'})?
        </p>
        
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            Keep Booking
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {loading ? 'Cancelling...' : 'Cancel Booking'}
          </button>
        </div>
      </div>
    </div>
  );
}

function getDeskStatusKeyFromDesk(desk) {
  return `id:${desk.id}`;
}

const MAP_PERIODS = [
  { value: 'am', label: 'AM' },
  { value: 'pm', label: 'PM' },
  { value: 'full', label: 'Full Day' },
];

function bookingMatchesRequestedPeriod(bookingPeriod, requestedPeriod) {
  if (requestedPeriod === 'full') {
    return true;
  }
  return bookingPeriod === requestedPeriod || bookingPeriod === 'full';
}

function getDeskBookingDetails(bookings, requestedPeriod) {
  if (!bookings || bookings.length === 0) {
    return null;
  }

  const matching = bookings.filter((booking) =>
    bookingMatchesRequestedPeriod(booking.period, requestedPeriod)
  );

  if (matching.length === 0) {
    return null;
  }

  const mine = matching.find((booking) => booking.is_mine);
  const chosen = mine || matching[0];

  if (matching.length > 1) {
    const distinctUsers = new Set(matching.map((booking) => booking.user_username));
    if (distinctUsers.size > 1) {
      return {
        ...chosen,
        multipleUsers: true,
      };
    }
  }

  return {
    ...chosen,
    multipleUsers: false,
  };
}

// Main Booking App Component
export default function BookingApp() {
  const { user } = useAuth();
  const {
    rooms,
    desks,
    bookings,
    selectedRoom,
    setSelectedRoom,
    selectedDesk,
    setSelectedDesk,
    loading,
    error: dataError,
    refresh,
  } = useBookingData();

  const [selectedSlots, setSelectedSlots] = useState([]);
  const [cancelBooking, setCancelBooking] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [roomLayout, setRoomLayout] = useState(null);
  const [mapState, setMapState] = useState('noRoomSelected');
  const [mapMessage, setMapMessage] = useState('Select a room to view layout');
  const [mapDate, setMapDate] = useState('');
  const [mapPeriod, setMapPeriod] = useState('full');
  const [deskStatusById, setDeskStatusById] = useState({});
  const [deskBookingById, setDeskBookingById] = useState({});
  const [inspectedDeskId, setInspectedDeskId] = useState('');

  const hasLayout = (() => {
    const objects = roomLayout?.layout_json?.objects || [];
    return objects.some((obj) => obj.type === 'desk');
  })();

  const canSubmitBooking = hasLayout
    ? !!(selectedRoom && selectedDesk && mapDate && mapPeriod)
    : !!(selectedRoom && selectedDesk && selectedSlots.length === 1);

  const activeDeskId = inspectedDeskId || selectedDesk;
  const activeDesk = desks.find((desk) => String(desk.id) === String(activeDeskId));
  const activeDeskBooking = activeDeskId ? deskBookingById[String(activeDeskId)] : null;

  const generateDates = () => {
    const dates = [];
    const today = new Date();
    for (let i = 0; i < 20; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      dates.push(date);
    }
    return dates;
  };

  const dates = generateDates();

  useEffect(() => {
    setMapDate('');
    setMapPeriod('full');
    setSelectedSlots([]);
    setInspectedDeskId('');
    setDeskBookingById({});
  }, [selectedRoom]);

  useEffect(() => {
    if (hasLayout) {
      setSelectedSlots([]);
    }
  }, [hasLayout]);

  useEffect(() => {
    if (selectedDesk) {
      setInspectedDeskId(selectedDesk);
    }
  }, [selectedDesk]);

  useEffect(() => {
    let cancelled = false;

    const loadRoomLayout = async () => {
      if (!selectedRoom) {
        setRoomLayout(null);
        setDeskStatusById({});
        setMapState('noRoomSelected');
        setMapMessage('Select a room to view layout');
        return;
      }

      setMapState('layoutLoading');
      setMapMessage('Loading room layout...');
      setDeskStatusById({});

      try {
        const layout = await roomLayoutService.getRoomLayout(selectedRoom);
        if (cancelled) return;

        setRoomLayout(layout);
        const objects = layout?.layout_json?.objects || [];
        const deskObjects = objects.filter((obj) => obj.type === 'desk');

        if (deskObjects.length === 0) {
          setMapState('layoutMissing');
          setMapMessage('No room map available yet. Use desk dropdown for now.');
          return;
        }

        if (!mapDate || !mapPeriod) {
          setMapState('dateNotSelected');
          setMapMessage('Pick a date and period to check live desk availability.');
        }
      } catch (err) {
        if (cancelled) return;
        setRoomLayout(null);
        setMapState('layoutMissing');
        setMapMessage('No room map available yet. Use desk dropdown for now.');
      }
    };

    loadRoomLayout();

    return () => {
      cancelled = true;
    };
  }, [selectedRoom]);

  useEffect(() => {
    let cancelled = false;

    const loadAvailabilityForMap = async () => {
      if (!selectedRoom) return;

      const objects = roomLayout?.layout_json?.objects || [];
      const deskObjects = objects.filter((obj) => obj.type === 'desk');
      if (!roomLayout || deskObjects.length === 0) {
        return;
      }

      if (!mapDate || !mapPeriod) {
        const unknownStatuses = {};
        const emptyBookingMap = {};
        desks.forEach((desk) => {
          unknownStatuses[getDeskStatusKeyFromDesk(desk)] = desk.is_active === false ? 'inactive' : 'unknown';
          unknownStatuses[`num:${desk.desk_number}`] = desk.is_active === false ? 'inactive' : 'unknown';
          emptyBookingMap[String(desk.id)] = null;
        });
        setDeskStatusById(unknownStatuses);
        setDeskBookingById(emptyBookingMap);
        setMapState('dateNotSelected');
        setMapMessage('Pick a date and period to check live desk availability.');
        return;
      }

      setMapState('availabilityLoading');
      setMapMessage('Loading desk availability...');

      try {
        const result = await bookingService.checkAvailability(selectedRoom, mapDate, mapPeriod);
        if (cancelled) return;

        const availableIds = new Set((result?.desks || []).map((desk) => String(desk.id)));
        const statusMap = {};
        const bookingMap = {};
        const bookingsForDate = bookings.filter((booking) => booking.date === mapDate);

        desks.forEach((desk) => {
          const active = desk.is_active !== false;
          const keyById = getDeskStatusKeyFromDesk(desk);
          const keyByNum = `num:${desk.desk_number}`;
          const deskBookings = bookingsForDate.filter((booking) => String(booking.desk) === String(desk.id));
          const bookingDetails = getDeskBookingDetails(deskBookings, mapPeriod);
          bookingMap[String(desk.id)] = bookingDetails;

          if (!active) {
            statusMap[keyById] = 'inactive';
            statusMap[keyByNum] = 'inactive';
            return;
          }

          const status = availableIds.has(String(desk.id)) ? 'available' : 'unavailable';
          statusMap[keyById] = status;
          statusMap[keyByNum] = status;
        });

        setDeskStatusById(statusMap);
        setDeskBookingById(bookingMap);

        const selectedDeskStatus = selectedDesk ? statusMap[`id:${selectedDesk}`] : null;
        if (selectedDesk && selectedDeskStatus && selectedDeskStatus !== 'available') {
          setSelectedDesk('');
          setMapState('selectionInvalidated');
          setMapMessage('Selected desk is unavailable for this time. Please choose another desk.');
          return;
        }

        setMapState('availabilityReady');
        setMapMessage('Desk map is interactive. Click an available desk to select it.');
      } catch (err) {
        if (cancelled) return;
        setDeskBookingById({});
        setMapState('availabilityError');
        setMapMessage('Could not load availability. Please try again.');
      }
    };

    loadAvailabilityForMap();

    return () => {
      cancelled = true;
    };
  }, [selectedRoom, roomLayout, mapDate, mapPeriod, desks, bookings, selectedDesk, setSelectedDesk]);

  useEffect(() => {
    if (!actionError) return undefined;

    const timeoutId = setTimeout(() => {
      setActionError(null);
    }, 5000);

    return () => clearTimeout(timeoutId);
  }, [actionError]);

  const formatDate = (date) => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    return {
      day: days[date.getDay()],
      date: date.getDate(),
      month: months[date.getMonth()],
    };
  };

  const isToday = (date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const isWeekend = (date) => {
    return date.getDay() === 0 || date.getDay() === 6;
  };

  const getBookingForSlot = (dateStr, period) => {
    return bookings.find(b => 
      b.desk.toString() === selectedDesk && 
      b.date === dateStr && 
      b.period === period  // Just match the exact period!
    );
  };

  const isSlotSelected = (dateStr, period) => {
    return selectedSlots.some(slot => slot.date === dateStr && slot.period === period);
  };

  const toggleSlot = (dateStr, period) => {
    const booking = getBookingForSlot(dateStr, period);
    if (booking) return;

    const isSameSlotSelected = selectedSlots.length === 1
      && selectedSlots[0].date === dateStr
      && selectedSlots[0].period === period;

    if (isSameSlotSelected) {
      setSelectedSlots([]);
      return;
    }

    setSelectedSlots([{ date: dateStr, period }]);
  };

  const handleBookSlots = async () => {
    const bookingDate = hasLayout ? mapDate : selectedSlots[0]?.date;
    const bookingPeriod = hasLayout ? mapPeriod : selectedSlots[0]?.period;

    if (!selectedRoom || !selectedDesk || !bookingDate || !bookingPeriod) {
      setActionError('Please select a room, desk, date, and period');
      return;
    }
  
    setActionLoading(true);
    setActionError(null);
    setSuccessMessage(null);
  
    try {
      const bookingsData = [{
        desk: parseInt(selectedDesk, 10),
        date: bookingDate,
        period: bookingPeriod,
      }];

      const response = await bookingService.createBooking(bookingsData);
    
        if (response.errors.length > 0) {
          const errorMessages = response.errors
            .map(e => {
              // Single message string formatter
              if (typeof e.error === 'object' && e.error.existing_booking) {
                const ex = e.error.existing_booking;
                const periodName = ex.period.toUpperCase();
                const deskName = `Desk ${ex.desk}`;
                const roomName = ex.room_name || `Room ${ex.room}`;
        
                return `${ex.date} (${periodName}): You already have a booking for this time slot on ${deskName} in ${roomName}`;
              }
        
              // Fallback
              const msg = typeof e.error === 'string'
                ? e.error
                : e.error?.detail || e.error?.error || JSON.stringify(e.error);
        
              return msg;
            })
            .join('\n');
        
          setActionError(`Booking failed:\n${errorMessages}`);
        }
    
      if (response.created.length > 0) {
        setSuccessMessage('Successfully booked slot!');
      }
    
      setSelectedSlots([]);
      await refresh();
      setTimeout(() => setSuccessMessage(null), 5000);
    
    } catch (err) {
      setActionError(err.message || 'Failed to create booking(s)');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelBooking = async () => {
    if (!cancelBooking) return;

    setActionLoading(true);
    setActionError(null);

    try {
      await bookingService.cancelBooking(cancelBooking.id);
      setSuccessMessage('Booking cancelled successfully!');
      setCancelBooking(null);
      await refresh();
      
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      setActionError(err.message || 'Failed to cancel booking');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Book a Desk</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Select your preferred desk and time slots
          </p>
        </div>
        
        {canSubmitBooking && (
          <button
            onClick={handleBookSlots}
            disabled={actionLoading}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 font-medium flex items-center gap-2"
          >
            {actionLoading ? (
              <>
                <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                Booking...
              </>
            ) : (
              <>Book Slot</>
            )}
          </button>
        )}
      </div>

      {successMessage && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 rounded-lg">
          {successMessage}
        </div>
      )}

      {(actionError || dataError) && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg whitespace-pre-line">
          {actionError || dataError}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Select Location
            </h2>
            
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Room
                </label>
                {loading.rooms ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">Loading rooms...</p>
                ) : (
                  <select
                    value={selectedRoom}
                    onChange={(e) => setSelectedRoom(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Choose a room...</option>
                    {rooms.map(room => (
                      <option key={room.id} value={room.id}>
                        {room.name} ({room.number_of_desks} desks)
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {selectedRoom && !hasLayout && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Desk
                  </label>
                  {loading.desks ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">Loading desks...</p>
                  ) : (
                    <select
                      value={selectedDesk}
                      onChange={(e) => setSelectedDesk(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">Choose a desk...</option>
                      {desks.map(desk => {
                        const deskLabel = `Desk ${desk.desk_number}`;
                        const location = desk.location_description?.trim();
                        const showLocation =
                          location &&
                          location.toLowerCase() !== deskLabel.toLowerCase();
                        return (
                          <option key={desk.id} value={desk.id}>
                            {deskLabel}
                            {showLocation && ` - ${location}`}
                          </option>
                        );
                      })}
                    </select>
                  )}
                </div>
              )}
            </div>

            {selectedRoom && selectedDesk && (
              <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <p className="text-sm font-medium text-blue-900 dark:text-blue-300">
                  Selected:
                </p>
                <p className="text-xs text-blue-700 dark:text-blue-400 mt-1">
                  {rooms.find(r => r.id.toString() === selectedRoom)?.name}
                </p>
                <p className="text-xs text-blue-700 dark:text-blue-400">
                  Desk {desks.find(d => d.id.toString() === selectedDesk)?.desk_number}
                </p>
              </div>
            )}

          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3 text-sm">
              Legend
            </h3>
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 rounded"></div>
                <span className="text-gray-700 dark:text-gray-300">Available</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-green-100 dark:bg-green-900/30 border-2 border-green-500 dark:border-green-400 rounded"></div>
                <span className="text-gray-700 dark:text-gray-300">Selected</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-blue-100 dark:bg-blue-900/30 border-2 border-blue-500 dark:border-blue-400 rounded"></div>
                <span className="text-gray-700 dark:text-gray-300">Your Booking</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-gray-200 dark:bg-gray-700 border-2 border-gray-400 dark:border-gray-600 rounded"></div>
                <span className="text-gray-700 dark:text-gray-300">Unavailable</span>
              </div>
            </div>
          </div>

          {hasLayout && selectedRoom && (
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-3 text-sm">
                Desk Details
              </h3>

              {!activeDesk ? (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Click a desk in the map to view booking details.
                </p>
              ) : (
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Desk</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">Desk {activeDesk.desk_number}</p>
                  </div>

                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Date / Period</p>
                    <p className="text-sm text-gray-900 dark:text-white">
                      {mapDate ? new Date(mapDate).toLocaleDateString() : 'Not selected'} / {mapPeriod ? mapPeriod.toUpperCase() : 'Not selected'}
                    </p>
                  </div>

                  {activeDeskBooking ? (
                    <div className="rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3">
                      <p className="text-xs font-medium text-red-800 dark:text-red-300">
                        {activeDeskBooking.is_mine
                          ? 'Your booking'
                          : activeDeskBooking.multipleUsers
                            ? 'Booked by multiple users'
                            : `Booked by ${activeDeskBooking.user_username}`}
                      </p>
                      {activeDeskBooking.is_mine && (
                        <button
                          type="button"
                          onClick={() => setCancelBooking(activeDeskBooking)}
                          className="mt-2 text-xs text-red-700 dark:text-red-300 underline hover:text-red-900 dark:hover:text-red-100"
                        >
                          Cancel booking
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-md border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-3">
                      <p className="text-xs font-medium text-green-800 dark:text-green-300">Available</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="lg:col-span-3">
          {hasLayout ? (
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Room Layout
                </h2>
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <Clock className="h-4 w-4" />
                  Pick date and period, then click a desk
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Date</label>
                  <select
                    value={mapDate}
                    onChange={(e) => setMapDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="">Choose date...</option>
                    {dates.map((date) => {
                      const dateStr = date.toISOString().split('T')[0];
                      const dayName = date.toLocaleDateString(undefined, { weekday: 'long' });
                      return (
                        <option key={dateStr} value={dateStr}>
                          {date.toLocaleDateString()} - {dayName}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Period</label>
                  <select
                    value={mapPeriod}
                    onChange={(e) => setMapPeriod(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="">Choose period...</option>
                    {MAP_PERIODS.map((period) => (
                      <option key={period.value} value={period.value}>
                        {period.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <RoomLayoutViewer
                layout={roomLayout}
                desks={desks}
                deskStatusById={deskStatusById}
                selectedDeskId={selectedDesk}
                interactive={mapState === 'availabilityReady' || mapState === 'selectionInvalidated'}
                onDeskSelect={setSelectedDesk}
                onDeskInspect={setInspectedDeskId}
                state={mapState}
                message={mapMessage}
              />
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Next 20 Days
                </h2>
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <Clock className="h-4 w-4" />
                  Choose one date and period
                </div>
              </div>

              {!selectedDesk ? (
                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                  Please select a room and desk to view availability
                </div>
              ) : loading.bookings ? (
                <div className="text-center py-12">
                  <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                  <p className="mt-4 text-gray-500 dark:text-gray-400">Loading availability...</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {dates.map((date, index) => {
                    const { day, date: dateNum, month } = formatDate(date);
                    const dateStr = date.toISOString().split('T')[0];
                    const weekend = isWeekend(date);
                    const today = isToday(date);

                    const amBooking = getBookingForSlot(dateStr, 'am');
                    const pmBooking = getBookingForSlot(dateStr, 'pm');
                    const fullBooking = getBookingForSlot(dateStr, 'full');

                    return (
                      <div
                        key={index}
                        className={`rounded-lg border-2 overflow-hidden transition-all ${
                          today
                            ? 'border-blue-500 dark:border-blue-400 shadow-md'
                            : 'border-gray-200 dark:border-gray-700'
                        } ${weekend ? 'opacity-60' : ''}`}
                      >
                        <div className={`px-3 py-2 text-center ${
                          today
                            ? 'bg-blue-500 text-white'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white'
                        }`}>
                          <div className="text-xs font-medium">{day}</div>
                          <div className="text-lg font-bold">{dateNum}</div>
                          <div className="text-xs">{month}</div>
                        </div>

                        <div className="p-2 grid grid-cols-2 gap-2">
                          {!isSlotSelected(dateStr, 'full') && !fullBooking && (
                            <>
                              <PeriodButton
                                period="am"
                                label="AM"
                                isSelected={isSlotSelected(dateStr, 'am')}
                                isBooked={!!amBooking}
                                bookedBy={amBooking?.user_username}
                                isMine={amBooking?.is_mine}
                                onClick={() => !weekend && toggleSlot(dateStr, 'am')}
                                onCancel={amBooking?.is_mine ? () => setCancelBooking(amBooking) : null}
                                disabled={weekend}
                              />

                              <PeriodButton
                                period="pm"
                                label="PM"
                                isSelected={isSlotSelected(dateStr, 'pm')}
                                isBooked={!!pmBooking}
                                bookedBy={pmBooking?.user_username}
                                isMine={pmBooking?.is_mine}
                                onClick={() => !weekend && toggleSlot(dateStr, 'pm')}
                                onCancel={pmBooking?.is_mine ? () => setCancelBooking(pmBooking) : null}
                                disabled={weekend}
                              />
                            </>
                          )}

                          {!isSlotSelected(dateStr, 'am') && !isSlotSelected(dateStr, 'pm') && !amBooking && !pmBooking && (
                            <PeriodButton
                              period="full"
                              label="Full Day"
                              isSelected={isSlotSelected(dateStr, 'full')}
                              isBooked={!!fullBooking}
                              bookedBy={fullBooking?.user_username}
                              isMine={fullBooking?.is_mine}
                              onClick={() => !weekend && toggleSlot(dateStr, 'full')}
                              onCancel={fullBooking?.is_mine ? () => setCancelBooking(fullBooking) : null}
                              disabled={weekend}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {cancelBooking && (
        <CancelBookingModal
          booking={cancelBooking}
          onConfirm={handleCancelBooking}
          onClose={() => setCancelBooking(null)}
          loading={actionLoading}
        />
      )}
    </div>
  );
}
