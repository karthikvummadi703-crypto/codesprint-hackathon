import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { describe, expect, it } from 'vitest';

import { Button } from '../ui/Button';
import { Input, Label } from '../ui/Input';

describe('core UI accessibility', () => {
  it('exposes labelled controls and has no axe violations', async () => {
    const { container } = render(
      <form aria-label="Location search">
        <Label htmlFor="city">City</Label>
        <Input id="city" placeholder="Search for a city" />
        <Button type="submit">Search</Button>
        <Button type="button" aria-label="Use my current location">
          <span aria-hidden="true">◎</span>
        </Button>
      </form>
    );

    expect(screen.getByRole('textbox', { name: 'City' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use my current location' })).toBeInTheDocument();

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  it('detects an unlabelled icon-only button', async () => {
    const { container } = render(
      <button type="button">
        <span aria-hidden="true">×</span>
      </button>
    );

    const results = await axe(container);
    expect(results.violations.map((v) => v.id)).toContain('button-name');
  });
});
