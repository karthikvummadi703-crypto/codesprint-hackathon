import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LocationProvider, toLocationParams, useLocation, type ActiveLocation } from '../LocationContext';

const STORAGE_KEY = 'airguard_active_location';

const hyderabad: ActiveLocation = {
  name: 'Hyderabad',
  latitude: 17.385,
  longitude: 78.4867,
  region: 'Telangana',
  country: 'India',
};
const delhi: ActiveLocation = { name: 'Delhi', latitude: 28.61, longitude: 77.21 };

const mocks = vi.hoisted(() => ({
  location: null as ActiveLocation | null,
  setLocation: null as ((loc: ActiveLocation) => void) | null,
  clearLocation: null as (() => void) | null,
  renders: 0,
}));

function context() {
  if (!mocks.setLocation || !mocks.clearLocation) throw new Error('Location probe did not render');
  return {
    location: mocks.location,
    setLocation: mocks.setLocation,
    clearLocation: mocks.clearLocation,
  };
}

function LocationProbe() {
  const ctx = useLocation();
  useEffect(() => {
    mocks.location = ctx.location;
    mocks.setLocation = ctx.setLocation;
    mocks.clearLocation = ctx.clearLocation;
    mocks.renders += 1;
  }, [ctx]);
  return (
    <main>
      <h1>Location probe</h1>
      <p data-testid="location">{ctx.location?.name ?? 'none'}</p>
      <p data-testid="params">{ctx.location ? JSON.stringify(toLocationParams(ctx.location)) : 'none'}</p>
      <p data-testid="renders">{String(mocks.renders)}</p>
      <button type="button" onClick={() => ctx.setLocation(hyderabad)}>
        Set Hyderabad
      </button>
      <button type="button" onClick={() => ctx.setLocation(delhi)}>
        Set Delhi
      </button>
      <button type="button" onClick={() => ctx.setLocation({ name: '' })}>
        Set empty name
      </button>
      <button type="button" onClick={() => ctx.setLocation(undefined as unknown as ActiveLocation)}>
        Set missing location
      </button>
      <button type="button" onClick={ctx.clearLocation}>
        Clear location
      </button>
    </main>
  );
}

function OutsideLocationProbe() {
  let message = 'useLocation unexpectedly returned a value';
  try {
    useLocation();
  } catch (error) {
    message = error instanceof Error ? error.message : 'unknown error';
  }
  return <p>{message}</p>;
}

function renderProvider() {
  return render(
    <LocationProvider>
      <LocationProbe />
    </LocationProvider>,
  );
}

async function expectAccessible(container: HTMLElement): Promise<void> {
  expect((await axe(container)).violations).toEqual([]);
}

beforeEach(() => {
  localStorage.clear();
  mocks.location = null;
  mocks.setLocation = null;
  mocks.clearLocation = null;
  mocks.renders = 0;
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('LocationProvider', () => {
  it('starts with no location and removes a stale stored entry', async () => {
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem');
    const { container } = renderProvider();

    expect(screen.getByTestId('location')).toHaveTextContent('none');
    expect(screen.getByTestId('params')).toHaveTextContent('none');
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(removeItem).toHaveBeenCalledWith(STORAGE_KEY);

    await expectAccessible(container);
  });

  it('hydrates a stored location and prefers coordinates for backend requests', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(hyderabad));
    const { container } = renderProvider();

    expect(screen.getByTestId('location')).toHaveTextContent('Hyderabad');
    expect(screen.getByTestId('params')).toHaveTextContent('{"lat":17.385,"lon":78.4867}');
    expect(context().location).toEqual(hyderabad);

    await expectAccessible(container);
  });

  it('hydrates a name-only location and falls back to the city parameter', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ name: 'Delhi' }));
    const { container } = renderProvider();

    expect(screen.getByTestId('location')).toHaveTextContent('Delhi');
    expect(screen.getByTestId('params')).toHaveTextContent('{"city":"Delhi"}');

    await expectAccessible(container);
  });

  it.each(['{not-json', '{}', '{"name":""}', '{"name":42}', 'null'])(
    'ignores the invalid stored value %s',
    async (raw) => {
      localStorage.setItem(STORAGE_KEY, raw);
      const { container } = renderProvider();

      expect(screen.getByTestId('location')).toHaveTextContent('none');
      expect(screen.getByTestId('params')).toHaveTextContent('none');

      await expectAccessible(container);
    },
  );

  it('survives a storage read failure', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    const { container } = renderProvider();

    expect(screen.getByTestId('location')).toHaveTextContent('none');
    expect(getItem).toHaveBeenCalledWith(STORAGE_KEY);

    await expectAccessible(container);
  });

  it('persists a chosen location and uses its coordinates for requests', async () => {
    const user = userEvent.setup();
    const { container } = renderProvider();

    await user.click(screen.getByRole('button', { name: 'Set Hyderabad' }));

    expect(screen.getByTestId('location')).toHaveTextContent('Hyderabad');
    expect(screen.getByTestId('params')).toHaveTextContent('{"lat":17.385,"lon":78.4867}');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as ActiveLocation).toEqual(hyderabad);

    await expectAccessible(container);
  });

  it('removes the stored location when it is cleared', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(hyderabad));
    const user = userEvent.setup();
    const { container } = renderProvider();
    expect(screen.getByTestId('location')).toHaveTextContent('Hyderabad');

    await user.click(screen.getByRole('button', { name: 'Clear location' }));

    expect(screen.getByTestId('location')).toHaveTextContent('none');
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

    await expectAccessible(container);
  });

  it('rejects empty and missing locations without changing state', async () => {
    const user = userEvent.setup();
    const { container } = renderProvider();
    const before = context();
    const rendersBefore = mocks.renders;

    await user.click(screen.getByRole('button', { name: 'Set empty name' }));
    await user.click(screen.getByRole('button', { name: 'Set missing location' }));

    expect(screen.getByTestId('location')).toHaveTextContent('none');
    expect(mocks.renders).toBe(rendersBefore);
    expect(context().setLocation).toBe(before.setLocation);

    await expectAccessible(container);
  });

  it('treats re-pinning the same place as a no-op but accepts a different pin', async () => {
    const user = userEvent.setup();
    const { container } = renderProvider();

    await user.click(screen.getByRole('button', { name: 'Set Delhi' }));
    const pinned = context().location;
    const rendersAfterPin = mocks.renders;

    act(() => {
      context().setLocation({ ...delhi });
      context().setLocation({ ...delhi, region: '', country: '' });
    });

    expect(mocks.renders).toBe(rendersAfterPin);
    expect(context().location).toBe(pinned);

    act(() => {
      context().setLocation({ ...delhi, latitude: 28.62 });
    });

    expect(mocks.renders).toBe(rendersAfterPin + 1);
    expect(screen.getByTestId('location')).toHaveTextContent('Delhi');

    await expectAccessible(container);
  });

  it('keeps the setter and clearer identities stable across location updates', async () => {
    const user = userEvent.setup();
    const { container } = renderProvider();

    await user.click(screen.getByRole('button', { name: 'Set Hyderabad' }));
    const first = context();
    const rendersAfterPin = mocks.renders;

    await user.click(screen.getByRole('button', { name: 'Set Delhi' }));

    expect(context().setLocation).toBe(first.setLocation);
    expect(context().clearLocation).toBe(first.clearLocation);
    expect(mocks.renders).toBe(rendersAfterPin + 1);

    await expectAccessible(container);
  });

  it('survives storage write and removal failures', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    const user = userEvent.setup();
    const { container } = renderProvider();

    await user.click(screen.getByRole('button', { name: 'Set Delhi' }));
    expect(screen.getByTestId('location')).toHaveTextContent('Delhi');

    await user.click(screen.getByRole('button', { name: 'Clear location' }));
    expect(screen.getByTestId('location')).toHaveTextContent('none');

    await expectAccessible(container);
  });
});

describe('useLocation', () => {
  it('explains when it is used outside LocationProvider', async () => {
    const { container } = render(<OutsideLocationProbe />);

    expect(screen.getByText('useLocation must be used within LocationProvider')).toBeInTheDocument();

    await expectAccessible(container);
  });
});
