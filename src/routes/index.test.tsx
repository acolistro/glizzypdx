import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { HomePage } from "./-HomePage";

// The real "/" route file (src/routes/index.tsx) will export two things:
// a plain `HomePage` component (imported here directly, no router needed),
// and a `Route = createFileRoute("/")({ component: HomePage })` that
// TanStack Router's file-based convention requires. We test `HomePage`
// directly rather than going through the router, because this test only
// cares "does the home route render InquiryForm" — routing mechanics
// themselves (matching, navigation, 404s) are covered in app/router.test.tsx.
//
// InquiryForm is mocked here for the same reason InquiryForm.test.tsx
// mocks useVendorInquiry: this test isn't re-testing form validation or
// submission behavior, only that HomePage puts InquiryForm on the page —
// replacing the GLPDX-129 throwaway placeholder in App.tsx.
vi.mock("../features/vendor-inquiry/components/InquiryForm", () => ({
  InquiryForm: () => <div data-testid="mock-inquiry-form" />,
}));

describe("HomePage (index route)", () => {
  it("renders the vendor inquiry form", () => {
    render(<HomePage />);

    expect(screen.getByTestId("mock-inquiry-form")).toBeInTheDocument();
  });
});