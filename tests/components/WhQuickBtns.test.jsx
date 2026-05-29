// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WhQuickBtns from '@/app/bnb/_components/WhQuickBtns.jsx';

const WAREHOUSES = ['麗格', '悅格', '逸格'];

describe('WhQuickBtns', () => {
  it('renders one button per warehouse', () => {
    render(<WhQuickBtns list={WAREHOUSES} value="" onChange={() => {}} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(WAREHOUSES.length);
    expect(screen.getByText('麗格')).toBeInTheDocument();
    expect(screen.getByText('悅格')).toBeInTheDocument();
  });

  it('applies active (indigo) style to the selected warehouse', () => {
    render(<WhQuickBtns list={WAREHOUSES} value="麗格" onChange={() => {}} />);
    expect(screen.getByText('麗格').className).toContain('bg-indigo-600');
    expect(screen.getByText('悅格').className).not.toContain('bg-indigo-600');
  });

  it('calls onChange with the warehouse name when an inactive button is clicked', async () => {
    const onChange = vi.fn();
    render(<WhQuickBtns list={WAREHOUSES} value="" onChange={onChange} />);
    await userEvent.click(screen.getByText('悅格'));
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith('悅格');
  });

  it('calls onChange with empty string when the active button is clicked (deselect)', async () => {
    const onChange = vi.fn();
    render(<WhQuickBtns list={WAREHOUSES} value="悅格" onChange={onChange} />);
    await userEvent.click(screen.getByText('悅格'));
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('renders nothing when list is empty', () => {
    const { container } = render(<WhQuickBtns list={[]} value="" onChange={() => {}} />);
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });
});
