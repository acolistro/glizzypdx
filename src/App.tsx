import "./App.css";

// This is a placeholder root component — its only job right now is to
// prove the scaffold works (Vite + React + TS all compiling and rendering
// together). It will be replaced by real routing and the public map view
// as later GLPDX tickets land (map experience, vendor portal, admin).
//
// Deliberately a plain function component with no props: the root of the
// tree doesn't receive data from anywhere "above" it, so there's nothing
// to type here yet.
function App() {
  return (
    <main>
      <h1>GlizzyPDX</h1>
      <p>Scaffold is running. Map and vendor data come next.</p>
    </main>
  );
}

export default App;
