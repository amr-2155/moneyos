import "@testing-library/jest-dom/vitest";
import * as FakeIndexedDB from "fake-indexeddb";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Dexie requires `indexedDB` and related APIs on `globalThis`.
// fake-indexeddb provides these; assign them to the jsdom window.
window.indexedDB = FakeIndexedDB.indexedDB;
window.IDBKeyRange = FakeIndexedDB.IDBKeyRange;

// Prevent real network calls during tests — the auth flow performs fetch
// calls to the backend; in test env these must not leave the process.
globalThis.fetch = vi.fn(
  (): Promise<Response> => Promise.resolve(new Response(null, { status: 401 })),
) as unknown as typeof fetch;

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("prefers-reduced-motion"),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

afterEach(() => {
  cleanup();
});
