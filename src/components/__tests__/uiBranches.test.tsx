import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { describe, expect, it } from 'vitest';

import { cn } from '../ui/Button';
import { Button } from '../ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Input, Label } from '../ui/Input';

async function expectNoViolations(container: HTMLElement) {
  const results = await axe(container);
  expect(results.violations).toEqual([]);
}

describe('Card primitives', () => {
  it('forwards refs, props and display names for every card part', async () => {
    const cardRef = createRef<HTMLDivElement>();
    const headerRef = createRef<HTMLDivElement>();
    const contentRef = createRef<HTMLDivElement>();
    const titleRef = createRef<HTMLHeadingElement>();
    const { container } = render(
      <Card ref={cardRef} id="card" role="region" aria-label="Air quality summary">
        <CardHeader ref={headerRef} data-testid="header">
          <CardTitle ref={titleRef}>Readings</CardTitle>
        </CardHeader>
        <CardContent ref={contentRef} data-testid="content">
          Body
        </CardContent>
      </Card>
    );

    expect(cardRef.current).toBe(screen.getByRole('region', { name: 'Air quality summary' }));
    expect(headerRef.current).toBe(screen.getByTestId('header'));
    expect(contentRef.current).toBe(screen.getByTestId('content'));
    expect(titleRef.current).toBe(screen.getByRole('heading', { name: 'Readings' }));
    expect(screen.getByRole('heading', { name: 'Readings' }).tagName).toBe('H2');
    expect(Card.displayName).toBe('Card');
    expect(CardHeader.displayName).toBe('CardHeader');
    expect(CardContent.displayName).toBe('CardContent');
    expect(CardTitle.displayName).toBe('CardTitle');
    await expectNoViolations(container);
  });

  it('merges custom classes over the defaults for every card part', async () => {
    const { container } = render(
      <Card className="p-8">
        <CardHeader className="px-2">Header</CardHeader>
        <CardContent className="py-2">Content</CardContent>
        <CardTitle className="text-lg">Title</CardTitle>
      </Card>
    );

    expect(screen.getByText('Header')).toHaveClass('px-2');
    expect(screen.getByText('Header')).not.toHaveClass('px-6');
    expect(screen.getByText('Content')).toHaveClass('py-2');
    expect(screen.getByText('Content')).not.toHaveClass('py-5');
    expect(screen.getByRole('heading', { name: 'Title' })).toHaveClass('text-lg');
    expect(screen.getByRole('heading', { name: 'Title' })).not.toHaveClass('text-base');
    expect(container.firstElementChild).toHaveClass('p-8', 'bg-white', 'rounded-2xl');
    await expectNoViolations(container);
  });

  it('resolves conflicting Tailwind classes with cn', () => {
    expect(cn('px-4 py-2', 'px-8')).toBe('py-2 px-8');
    expect(cn('bg-white', null, undefined, false, 'rounded-xl')).toBe('bg-white rounded-xl');
  });
});

describe('Button branches', () => {
  it.each([
    ['primary', 'bg-brand-600'],
    ['secondary', 'bg-brand-50'],
    ['outline', 'border-slate-200'],
    ['ghost', 'text-slate-600'],
    ['danger', 'bg-red-50'],
  ] as const)('applies the %s variant styles', async (variant, expectedClass) => {
    const { container } = render(<Button variant={variant}>Action</Button>);

    expect(screen.getByRole('button', { name: 'Action' })).toHaveClass(expectedClass);
    await expectNoViolations(container);
  });

  it.each([
    ['sm', 'h-8'],
    ['md', 'h-10'],
    ['lg', 'h-12'],
  ] as const)('applies the %s size styles', async (size, expectedClass) => {
    const { container } = render(<Button size={size}>Action</Button>);

    expect(screen.getByRole('button', { name: 'Action' })).toHaveClass(expectedClass);
    await expectNoViolations(container);
  });

  it('replaces the default padding with a custom class', async () => {
    const { container } = render(<Button className="px-8">Action</Button>);

    expect(screen.getByRole('button', { name: 'Action' })).toHaveClass('px-8');
    expect(screen.getByRole('button', { name: 'Action' })).not.toHaveClass('px-4');
    await expectNoViolations(container);
  });

  it('renders the spinner instead of children and disables the button while loading', async () => {
    const { container } = render(
      <Button loading type="submit">
        Save
      </Button>
    );
    const button = screen.getByRole('button', { name: 'Processing...' });

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('type', 'submit');
    expect(screen.queryByText('Save')).not.toBeInTheDocument();
    expect(container.querySelector('svg')).toHaveClass('animate-spin');
    await expectNoViolations(container);
  });

  it('honors an explicit disabled prop, forwards a ref and handles clicks', async () => {
    const user = userEvent.setup();
    const ref = createRef<HTMLButtonElement>();
    let clicks = 0;
    const { container, rerender } = render(
      <Button ref={ref} onClick={() => (clicks += 1)}>
        Click me
      </Button>
    );

    expect(ref.current).toBe(screen.getByRole('button', { name: 'Click me' }));
    expect(Button.displayName).toBe('Button');
    await user.click(screen.getByRole('button', { name: 'Click me' }));
    expect(clicks).toBe(1);

    rerender(
      <Button disabled onClick={() => (clicks += 1)}>
        Click me
      </Button>
    );
    await user.click(screen.getByRole('button', { name: 'Click me' }));
    expect(clicks).toBe(1);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeDisabled();
    await expectNoViolations(container);
  });
});

describe('Input and Label branches', () => {
  it('associates a label with the input, forwards refs and accepts typing', async () => {
    const user = userEvent.setup();
    const inputRef = createRef<HTMLInputElement>();
    const labelRef = createRef<HTMLLabelElement>();
    const { container } = render(
      <div>
        <Label ref={labelRef} htmlFor="city">
          City
        </Label>
        <Input ref={inputRef} id="city" placeholder="Search" />
      </div>
    );

    expect(inputRef.current).toBe(screen.getByRole('textbox', { name: 'City' }));
    expect(labelRef.current).toBe(screen.getByText('City'));
    expect(Input.displayName).toBe('Input');
    expect(Label.displayName).toBe('Label');
    await user.type(screen.getByRole('textbox', { name: 'City' }), 'Pune');
    expect(screen.getByRole('textbox', { name: 'City' })).toHaveValue('Pune');
    await expectNoViolations(container);
  });

  it('merges custom classes and supports disabled and typed inputs', async () => {
    const { container } = render(
      <form aria-label="Credentials">
        <Input aria-label="Email" type="email" className="h-11" placeholder="you@example.com" />
        <Input aria-label="Token" disabled value="locked" readOnly />
      </form>
    );

    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveAttribute('type', 'email');
    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveClass('h-11', 'py-2');
    expect(screen.getByRole('textbox', { name: 'Token' })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'Token' })).toHaveValue('locked');
    await expectNoViolations(container);
  });

  it('applies a custom label class without losing the base styles', async () => {
    const { container } = render(
      <div>
        <Label htmlFor="threshold" className="text-xs">
          Threshold
        </Label>
        <Input id="threshold" type="number" defaultValue={100} />
      </div>
    );

    expect(screen.getByText('Threshold')).toHaveClass('text-xs');
    expect(screen.getByText('Threshold')).not.toHaveClass('text-sm');
    expect(screen.getByRole('spinbutton', { name: 'Threshold' })).toHaveValue(100);
    await expectNoViolations(container);
  });
});
