import { createFileRoute } from "@tanstack/react-router";
import { FaqPage } from "./-FaqPage";

// Registers /faq, mirroring about.tsx's pattern exactly.
export const Route = createFileRoute("/faq")({
  component: FaqPage,
});