import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { AuthProvider } from '../../context/AuthContext';
import { server } from '../../test/server';
import BookingApp from './BookingApp';
import { vi } from 'vitest';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const renderBookingApp = () =>
  render(
    <AuthProvider>
      <BookingApp />
    </AuthProvider>
  );

describe('BookingApp', () => {
  test('loads rooms and renders desk options after room selection', async () => {
    server.use(
      http.get(`${API_BASE_URL}/rooms/`, () =>
        HttpResponse.json([
          { id: 1, name: 'Room A', number_of_desks: 2 },
          { id: 2, name: 'Room B', number_of_desks: 1 },
        ])
      ),
      http.get(`${API_BASE_URL}/desks/`, ({ request }) => {
        const url = new URL(request.url);
        const roomId = url.searchParams.get('room');
        if (roomId === '1') {
          return HttpResponse.json([
            { id: 10, desk_number: 1, location_description: 'Window' },
            { id: 11, desk_number: 2, location_description: 'Desk 2' },
          ]);
        }
        return HttpResponse.json([]);
      }),
      http.get(`${API_BASE_URL}/bookings/`, () =>
        HttpResponse.json({ results: [] })
      )
    );

    renderBookingApp();

    expect(await screen.findByRole('option', { name: /Room A/ })).toBeInTheDocument();

    const roomSelect = screen.getByRole('combobox');
    const user = userEvent.setup();
    await user.selectOptions(roomSelect, '1');

    const deskOptions = await screen.findAllByRole('option', { name: /Desk/ });
    expect(deskOptions.some(option => option.textContent === 'Desk 1 - Window')).toBe(true);
    expect(deskOptions.some(option => option.textContent === 'Desk 2')).toBe(true);
  });

  test('shows availability prompt until a desk is selected', async () => {
    server.use(
      http.get(`${API_BASE_URL}/rooms/`, () =>
        HttpResponse.json([{ id: 1, name: 'Room A', number_of_desks: 1 }])
      ),
      http.get(`${API_BASE_URL}/desks/`, () =>
        HttpResponse.json([{ id: 10, desk_number: 1 }])
      ),
      http.get(`${API_BASE_URL}/bookings/`, () =>
        HttpResponse.json({ results: [] })
      )
    );

    renderBookingApp();

    expect(
      await screen.findByText(/Please select a room and desk to view availability/i)
    ).toBeInTheDocument();

    const user = userEvent.setup();
    const roomSelect = screen.getByRole('combobox');
    await user.selectOptions(roomSelect, '1');

    await screen.findByRole('option', { name: /Desk 1/i });
    const [, deskSelect] = screen.getAllByRole('combobox');
    await user.selectOptions(deskSelect, '10');

    await waitFor(() => {
      expect(
        screen.queryByText(/Please select a room and desk to view availability/i)
      ).not.toBeInTheDocument();
    });
  });

  test('selecting a slot reveals the booking button', async () => {
    server.use(
      http.get(`${API_BASE_URL}/rooms/`, () =>
        HttpResponse.json([{ id: 1, name: 'Room A', number_of_desks: 1 }])
      ),
      http.get(`${API_BASE_URL}/desks/`, () =>
        HttpResponse.json([{ id: 10, desk_number: 1 }])
      ),
      http.get(`${API_BASE_URL}/bookings/`, () =>
        HttpResponse.json({ results: [] })
      )
    );

    renderBookingApp();

    const user = userEvent.setup();
    const roomSelect = await screen.findByRole('combobox');
    await user.selectOptions(roomSelect, '1');

    await screen.findByRole('option', { name: /Desk 1/i });
    const [, deskSelect] = screen.getAllByRole('combobox');
    await user.selectOptions(deskSelect, '10');

    await waitFor(() => {
      expect(
        screen.queryByText(/Please select a room and desk to view availability/i)
      ).not.toBeInTheDocument();
    });

    const amButtons = await screen.findAllByRole('button', { name: /AM/ });
    await user.click(amButtons[0]);

    expect(
      await screen.findByRole('button', { name: /Book 1 Slot/i })
    ).toBeInTheDocument();
  });

  test('creates a booking and shows success messaging', async () => {
    const receivedPayloads = [];
    const today = new Date().toISOString().split('T')[0];

    server.use(
      http.get(`${API_BASE_URL}/rooms/`, () =>
        HttpResponse.json([{ id: 1, name: 'Room A', number_of_desks: 1 }])
      ),
      http.get(`${API_BASE_URL}/desks/`, () =>
        HttpResponse.json([{ id: 10, desk_number: 1 }])
      ),
      http.get(`${API_BASE_URL}/bookings/`, () =>
        HttpResponse.json({ results: [] })
      ),
      http.post(`${API_BASE_URL}/bookings/`, async ({ request }) => {
        const body = await request.json();
        receivedPayloads.push(body);
        return HttpResponse.json({
          id: 123,
          ...body,
        });
      })
    );

    renderBookingApp();

    const user = userEvent.setup();
    const roomSelect = await screen.findByRole('combobox');
    await user.selectOptions(roomSelect, '1');

    await screen.findByRole('option', { name: /Desk 1/i });
    const [, deskSelect] = screen.getAllByRole('combobox');
    await user.selectOptions(deskSelect, '10');

    await waitFor(() => {
      expect(
        screen.queryByText(/Please select a room and desk to view availability/i)
      ).not.toBeInTheDocument();
    });

    const amButtons = await screen.findAllByRole('button', { name: /AM/ });
    await user.click(amButtons[0]);

    const bookButton = await screen.findByRole('button', { name: /Book 1 Slot/i });
    await user.click(bookButton);

    expect(
      await screen.findByText(/Successfully booked 1 slot\(s\)!/i)
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(receivedPayloads).toHaveLength(1);
    });
    expect(receivedPayloads[0]).toEqual({
      desk: 10,
      date: today,
      period: 'am',
    });
  });

  test('shows an error message when booking fails', async () => {
    server.use(
      http.get(`${API_BASE_URL}/rooms/`, () =>
        HttpResponse.json([{ id: 1, name: 'Room A', number_of_desks: 1 }])
      ),
      http.get(`${API_BASE_URL}/desks/`, () =>
        HttpResponse.json([{ id: 10, desk_number: 1 }])
      ),
      http.get(`${API_BASE_URL}/bookings/`, () =>
        HttpResponse.json({ results: [] })
      ),
      http.post(`${API_BASE_URL}/bookings/`, () =>
        HttpResponse.json(
          { detail: 'Desk already booked for this slot' },
          { status: 400 }
        )
      )
    );

    renderBookingApp();

    const user = userEvent.setup();
    const roomSelect = await screen.findByRole('combobox');
    await user.selectOptions(roomSelect, '1');

    await screen.findByRole('option', { name: /Desk 1/i });
    const [, deskSelect] = screen.getAllByRole('combobox');
    await user.selectOptions(deskSelect, '10');

    await waitFor(() => {
      expect(
        screen.queryByText(/Please select a room and desk to view availability/i)
      ).not.toBeInTheDocument();
    });

    const amButtons = await screen.findAllByRole('button', { name: /AM/ });
    await user.click(amButtons[0]);

    const bookButton = await screen.findByRole('button', { name: /Book 1 Slot/i });
    await user.click(bookButton);

    expect(
      await screen.findByText(
        /Some bookings failed:\s*Desk already booked for this slot/i
      )
    ).toBeInTheDocument();
  });

  test('formats conflict errors using existing_booking details', async () => {
    server.use(
      http.get(`${API_BASE_URL}/rooms/`, () =>
        HttpResponse.json([{ id: 1, name: 'Room A', number_of_desks: 1 }])
      ),
      http.get(`${API_BASE_URL}/desks/`, () =>
        HttpResponse.json([{ id: 10, desk_number: 1 }])
      ),
      http.get(`${API_BASE_URL}/bookings/`, () =>
        HttpResponse.json({ results: [] })
      ),
      http.post(`${API_BASE_URL}/bookings/`, () =>
        HttpResponse.json(
          {
            existing_booking: {
              date: '2025-02-03',
              period: 'am',
              desk: 10,
              room: 1,
              room_name: 'Room A',
            },
          },
          { status: 400 }
        )
      )
    );

    renderBookingApp();

    const user = userEvent.setup();
    const roomSelect = await screen.findByRole('combobox');
    await user.selectOptions(roomSelect, '1');

    await screen.findByRole('option', { name: /Desk 1/i });
    const [, deskSelect] = screen.getAllByRole('combobox');
    await user.selectOptions(deskSelect, '10');

    await waitFor(() => {
      expect(
        screen.queryByText(/Please select a room and desk to view availability/i)
      ).not.toBeInTheDocument();
    });

    const amButtons = await screen.findAllByRole('button', { name: /AM/ });
    await user.click(amButtons[0]);

    const bookButton = await screen.findByRole('button', { name: /Book 1 Slot/i });
    await user.click(bookButton);

    expect(
      await screen.findByText(
        /Some bookings failed:\s*2025-02-03 \(AM\): You already have a booking for this time slot on Desk 10 in Room A/i
      )
    ).toBeInTheDocument();
  });

  test('shows error when rooms request fails', async () => {
    server.use(
      http.get(`${API_BASE_URL}/rooms/`, () => HttpResponse.json({ detail: 'Boom' }, { status: 500 }))
    );

    renderBookingApp();

    expect(await screen.findByText(/Failed to load rooms/i)).toBeInTheDocument();
  });

  test('shows error when desks request fails after room selection', async () => {
    server.use(
      http.get(`${API_BASE_URL}/rooms/`, () =>
        HttpResponse.json([{ id: 1, name: 'Room A', number_of_desks: 1 }])
      ),
      http.get(`${API_BASE_URL}/desks/`, () => HttpResponse.json({ detail: 'Boom' }, { status: 500 })),
      http.get(`${API_BASE_URL}/bookings/`, () =>
        HttpResponse.json({ results: [] })
      )
    );

    renderBookingApp();

    const user = userEvent.setup();
    const roomSelect = await screen.findByRole('combobox');
    await user.selectOptions(roomSelect, '1');

    expect(await screen.findByText(/Failed to load desks/i)).toBeInTheDocument();
  });

  test('selecting a PM slot reveals booking button', async () => {
    server.use(
      http.get(`${API_BASE_URL}/rooms/`, () =>
        HttpResponse.json([{ id: 1, name: 'Room A', number_of_desks: 1 }])
      ),
      http.get(`${API_BASE_URL}/desks/`, () =>
        HttpResponse.json([{ id: 10, desk_number: 1 }])
      ),
      http.get(`${API_BASE_URL}/bookings/`, () =>
        HttpResponse.json({ results: [] })
      )
    );

    renderBookingApp();

    const user = userEvent.setup();
    const roomSelect = await screen.findByRole('combobox');
    await user.selectOptions(roomSelect, '1');

    await screen.findByRole('option', { name: /Desk 1/i });
    const [, deskSelect] = screen.getAllByRole('combobox');
    await user.selectOptions(deskSelect, '10');

    await waitFor(() => {
      expect(
        screen.queryByText(/Please select a room and desk to view availability/i)
      ).not.toBeInTheDocument();
    });

    const pmButtons = await screen.findAllByRole('button', { name: /PM/ });
    await user.click(pmButtons[0]);

    expect(
      await screen.findByRole('button', { name: /Book 1 Slot/i })
    ).toBeInTheDocument();
  });
});
