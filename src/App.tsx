import "./App.css";
import { InquiryForm } from "./features/vendor-inquiry/components/InquiryForm";

// TEMPORARY placeholder root component (see GLPDX-144). This is not the
// real app shell — there's no routing, no GeoCities page chrome, no
// layout. It exists solely so InquiryForm (GLPDX-129) is reachable for
// manual smoke testing and Playwright E2E while GLPDX-144 (real routing +
// layout) is still unscoped/unbuilt. Replace this whole component body
// once GLPDX-144 lands.
function App() {
  return (
    <main>
      <h1>GlizzyPDX</h1>
      <p>Scaffold is running. Map and vendor data come next.</p>
      <InquiryForm />
    </main>
  );
}

export default App;