import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { AQIStatus } from '../../../types';
import { Badge, getAQIBadgeVariant, getAQIColor, getAQITextColor } from '../Badge';
import { Button, cn } from '../Button';
import { Card, CardContent, CardHeader, CardTitle } from '../Card';
import { Input, Label } from '../Input';

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'purple' | 'blue';

async function expectAccessible(container: HTMLElement): Promise<void> {
  expect((await axe(container)).violations).toEqual([]);
}

describe('Badge', () => {
  it('renders a variant with merged classes and forwarded props', async () => {
    const { container } = render(
      <Badge variant="success" className="px-4" title="Air is clean" data-testid="badge">
        Good
      </Badge>,
    );

    const badge = screen.getByTestId('badge');
    expect(badge).toHaveTextContent('Good');
    expect(badge).toHaveClass('bg-emerald-100', 'text-emerald-800', 'px-4');
    expect(badge).not.toHaveClass('px-2.5');
    expect(badge).toHaveAttribute('title', 'Air is clean');

    await expectAccessible(container);
  });

  it('renders every variant with its own palette', async () => {
    const variants: BadgeVariant[] = ['default', 'success', 'warning', 'danger', 'purple', 'blue'];
    const { container } = render(
      <div>
        {variants.map((variant) => (
          <Badge key={variant} variant={variant}>
            {variant}
          </Badge>
        ))}
      </div>,
    );

    expect(screen.getByText('default')).toHaveClass('bg-slate-100');
    expect(screen.getByText('success')).toHaveClass('bg-emerald-100');
    expect(screen.getByText('warning')).toHaveClass('bg-amber-100');
    expect(screen.getByText('danger')).toHaveClass('bg-red-100');
    expect(screen.getByText('purple')).toHaveClass('bg-purple-100');
    expect(screen.getByText('blue')).toHaveClass('bg-blue-100');

    await expectAccessible(container);
  });
});

describe('Button', () => {
  it('merges variant and size classes with caller classes', async () => {
    const { container } = render(
      <Button type="button" variant="danger" size="lg" className="h-14">
        Delete
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Delete' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveClass('bg-red-50', 'text-base', 'h-14');
    expect(button).not.toHaveClass('h-12');

    await expectAccessible(container);
  });

  it('calls onClick when enabled', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <Button type="button" onClick={onClick}>
        Save
      </Button>,
    );

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).toHaveBeenCalledTimes(1);

    await expectAccessible(container);
  });

  it('disables loading buttons and hides their children', async () => {
    const { container } = render(<Button loading>Submit</Button>);

    const button = screen.getByRole('button', { name: 'Processing...' });
    expect(button).toBeDisabled();
    expect(button.querySelector('svg')).toBeInTheDocument();
    expect(screen.queryByText('Submit')).not.toBeInTheDocument();

    await expectAccessible(container);
  });

  it('honours an explicit disabled prop', async () => {
    const { container } = render(<Button disabled>Disabled</Button>);

    expect(screen.getByRole('button', { name: 'Disabled' })).toBeDisabled();

    await expectAccessible(container);
  });

  it('forwards its ref to the native button', async () => {
    const ref = createRef<HTMLButtonElement>();
    const { container } = render(<Button ref={ref}>Focus target</Button>);

    expect(ref.current).toBe(screen.getByRole('button', { name: 'Focus target' }));

    await expectAccessible(container);
  });
});

describe('Card', () => {
  it('composes header, title and content, merging classes and refs', async () => {
    const cardRef = createRef<HTMLDivElement>();
    const headerRef = createRef<HTMLDivElement>();
    const contentRef = createRef<HTMLDivElement>();
    const titleRef = createRef<HTMLHeadingElement>();
    const { container } = render(
      <Card ref={cardRef} className="shadow-lg">
        <CardHeader ref={headerRef}>
          <CardTitle ref={titleRef} className="text-lg">
            Readings
          </CardTitle>
        </CardHeader>
        <CardContent ref={contentRef} className="py-2">
          Details
        </CardContent>
      </Card>,
    );

    expect(cardRef.current).toHaveClass('shadow-lg');
    expect(cardRef.current).not.toHaveClass('shadow-sm');
    expect(headerRef.current).toHaveClass('px-6');
    expect(contentRef.current).toHaveClass('py-2');
    expect(contentRef.current).not.toHaveClass('py-5');
    expect(titleRef.current).toBe(screen.getByRole('heading', { level: 2, name: 'Readings' }));
    expect(screen.getByText('Details')).toBeInTheDocument();

    await expectAccessible(container);
  });
});

describe('Input', () => {
  it('associates a label, forwards props and accepts typing', async () => {
    const ref = createRef<HTMLInputElement>();
    const user = userEvent.setup();
    const { container } = render(
      <div>
        <Label htmlFor="city">City</Label>
        <Input id="city" ref={ref} placeholder="Enter a city" autoComplete="off" />
      </div>,
    );

    const input = screen.getByRole('textbox', { name: 'City' });
    expect(ref.current).toBe(input);
    expect(input).toHaveAttribute('placeholder', 'Enter a city');
    expect(input).toHaveAttribute('autocomplete', 'off');

    await user.type(input, 'Pune');
    expect(input).toHaveValue('Pune');

    await expectAccessible(container);
  });

  it('forwards the disabled state', async () => {
    const { container } = render(<Input aria-label="Locked input" disabled value="fixed" readOnly />);

    expect(screen.getByRole('textbox', { name: 'Locked input' })).toBeDisabled();

    await expectAccessible(container);
  });
});

describe('primitives helpers', () => {
  it('merges and deduplicates Tailwind classes with cn', () => {
    const maybeLarge = (enabled: boolean): string => cn('text-sm', enabled && 'text-lg', ['p-2']);

    expect(cn('px-2', 'px-4')).toBe('px-4');
    expect(maybeLarge(false)).toBe('text-sm p-2');
    expect(maybeLarge(true)).toBe('text-lg p-2');
  });

  const badgeCases: ReadonlyArray<readonly [AQIStatus, string]> = [
    ['Good', 'success'],
    ['Moderate', 'warning'],
    ['Unhealthy for Sensitive Groups', 'warning'],
    ['Unhealthy', 'danger'],
    ['Very Unhealthy', 'purple'],
    ['Hazardous', 'danger'],
  ];

  it.each(badgeCases)('maps %s to the %s badge variant', (status, variant) => {
    expect(getAQIBadgeVariant(status)).toBe(variant);
  });

  const colorCases: ReadonlyArray<readonly [number, string, string]> = [
    [50, '#10B981', 'text-emerald-600'],
    [51, '#F59E0B', 'text-amber-600'],
    [100, '#F59E0B', 'text-amber-600'],
    [101, '#F97316', 'text-orange-600'],
    [150, '#F97316', 'text-orange-600'],
    [151, '#EF4444', 'text-red-600'],
    [200, '#EF4444', 'text-red-600'],
    [201, '#8B5CF6', 'text-purple-600'],
    [300, '#8B5CF6', 'text-purple-600'],
    [301, '#991B1B', 'text-red-900'],
  ];

  it.each(colorCases)('uses the right colours for AQI %i', (aqi, color, textColor) => {
    expect(getAQIColor(aqi)).toBe(color);
    expect(getAQITextColor(aqi)).toBe(textColor);
  });
});
