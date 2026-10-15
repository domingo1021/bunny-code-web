import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "@/mocks/server";

/* The same MSW handlers that back `next dev` and the deployed demo back the
   tests, so a test can only pass against behaviour the app actually ships. */
beforeAll(() => {
  /* Fail loudly on any request the handlers do not cover, so a test can never
     silently hit the network. (MSW 3 renamed this from `onUnhandledRequest`;
     it now covers WebSocket connections as well as HTTP requests.) */
  server.listen({ onUnhandledFrame: "error" });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});
