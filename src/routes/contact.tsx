import { createFileRoute } from "@tanstack/react-router";
import { ContactPage } from "./-ContactPage";

// Registers /contact, mirroring about.tsx/faq.tsx's pattern exactly.
export const Route = createFileRoute("/contact")({
  component: ContactPage,
});