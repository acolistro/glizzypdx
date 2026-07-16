import { InquiryForm } from "../features/vendor-inquiry/components/InquiryForm";

// Kept out of index.tsx so the route file itself only wires up `Route` —
// exporting a component directly from a route file blocks TanStack
// Router's automatic code-splitting for that route (it can't split out
// something it doesn't fully own). This file isn't a route itself (hence
// the "-" prefix), so the plugin ignores it entirely.
export function HomePage() {
  return <InquiryForm />;
}