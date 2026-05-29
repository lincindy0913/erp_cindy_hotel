import { expect, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as jestDomMatchers from '@testing-library/jest-dom/matchers';

// Extend vitest's expect with jest-dom matchers
// (toBeInTheDocument, toHaveTextContent, toBeDisabled, etc.)
expect.extend(jestDomMatchers);

// Unmount React trees after each test to avoid state bleed-over between tests
afterEach(cleanup);
