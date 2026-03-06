import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useGrantInfo } from "../hooks/useLoadETH";
import { rest } from "msw";
import { setupServer } from "msw/node";

const server = setupServer(
  rest.get("/api/grant/:address", (req, res, ctx) => {
    return res(ctx.json({ tokens: 10, claimed: false }));
  })
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const wrapper = ({ children }) => {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

test("fetches grant data", async () => {
  const { result, waitFor } = renderHook(() => useGrantInfo("0xabc"), { wrapper });

  await waitFor(() => result.current.isSuccess);

  expect(result.current.data).toEqual({ tokens: 10, claimed: false });
});
