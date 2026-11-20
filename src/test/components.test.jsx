import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '../components/common/Button';
import { Badge } from '../components/common/Badge';
import { Card } from '../components/common/Card';
import { SectionHeading } from '../components/common/SectionHeading';
import { EmptyState } from '../components/common/EmptyState';
import { Input } from '../components/common/Input';

describe('Reusable UI Components', () => {
  describe('Button Component', () => {
    it('renders with label and responds to clicks', () => {
      const handleClick = vi.fn();
      render(<Button onClick={handleClick}>Donate Food</Button>);
      const btn = screen.getByRole('button', { name: /donate food/i });
      expect(btn).toBeInTheDocument();
      fireEvent.click(btn);
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('handles disabled state cleanly without firing click', () => {
      const handleClick = vi.fn();
      render(<Button disabled onClick={handleClick}>Action</Button>);
      const btn = screen.getByRole('button', { name: /action/i });
      expect(btn).toBeDisabled();
      fireEvent.click(btn);
      expect(handleClick).not.toHaveBeenCalled();
    });

    it('renders loading spinner and disables button', () => {
      render(<Button loading>Saving</Button>);
      const btn = screen.getByRole('button');
      expect(btn).toBeDisabled();
      expect(btn.querySelector('svg.animate-spin')).toBeInTheDocument();
    });
  });

  describe('Badge Component', () => {
    it('renders category and status badges correctly', () => {
      render(
        <div>
          <Badge variant="human">Human-Food</Badge>
          <Badge variant="animal">Animal-Feed</Badge>
          <Badge variant="compost">Compost</Badge>
          <Badge variant="biogas">Biogas</Badge>
        </div>
      );
      expect(screen.getByText('Human-Food')).toBeInTheDocument();
      expect(screen.getByText('Animal-Feed')).toBeInTheDocument();
      expect(screen.getByText('Compost')).toBeInTheDocument();
      expect(screen.getByText('Biogas')).toBeInTheDocument();
    });
  });

  describe('Card Component', () => {
    it('renders children with container styling', () => {
      render(<Card><span>Card Content</span></Card>);
      expect(screen.getByText('Card Content')).toBeInTheDocument();
    });
  });

  describe('SectionHeading Component', () => {
    it('renders overline, title, and subtitle', () => {
      render(
        <SectionHeading
          overline="Redistribution"
          title="Community Impact"
          subtitle="Real data from verified records"
        />
      );
      expect(screen.getByText('Redistribution')).toBeInTheDocument();
      expect(screen.getByText('Community Impact')).toBeInTheDocument();
      expect(screen.getByText('Real data from verified records')).toBeInTheDocument();
    });
  });

  describe('EmptyState Component', () => {
    it('renders title, description, and action button', () => {
      render(
        <EmptyState
          title="No Active Listings"
          description="Check back shortly as donors list surplus food."
          action={<button>Refresh</button>}
        />
      );
      expect(screen.getByText('No Active Listings')).toBeInTheDocument();
      expect(screen.getByText(/check back shortly/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument();
    });
  });

  describe('Input Component', () => {
    it('renders input with label and handles changes', () => {
      const handleChange = vi.fn();
      render(
        <Input
          id="food-name"
          label="Food Item"
          value="Cooked Rice"
          onChange={handleChange}
        />
      );
      expect(screen.getByLabelText(/food item/i)).toBeInTheDocument();
      const input = screen.getByDisplayValue('Cooked Rice');
      fireEvent.change(input, { target: { value: 'Cooked Lentils' } });
      expect(handleChange).toHaveBeenCalled();
    });

    it('renders validation error message when provided', () => {
      render(
        <Input
          id="quantity"
          label="Quantity"
          error="Quantity must be greater than zero"
        />
      );
      expect(screen.getByText('Quantity must be greater than zero')).toBeInTheDocument();
    });
  });
});
