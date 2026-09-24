import { VendorLoginForm } from "../../features/vendor-portal/components/VendorLoginForm";

// Content for /portal/login (GLPDX-50). "-" prefix tells TanStack
// Router's file-based routing to ignore this file -- same convention
// as -HomePage.tsx, -AboutPage.tsx, and admin's -AdminHomePage.tsx.
export function LoginPage() {
  return (
    <>
      <h2>Vendor Login</h2>
      <VendorLoginForm />
    </>
  );
}