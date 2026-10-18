import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ToastViewport } from "./components/ui";
import { Overview } from "./pages/Overview";
import { Events } from "./pages/Events";
import { Claim } from "./pages/Claim";
import { Badges } from "./pages/Badges";
import { Verify } from "./pages/Verify";
import { Organizer } from "./pages/Organizer";
import { Series } from "./pages/Series";
import { Admin } from "./pages/Admin";
import { Diagnostics } from "./pages/Diagnostics";
import { NotFound } from "./pages/NotFound";

export default function App() {
  return (
    <>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Overview />} />
          <Route path="/events" element={<Events />} />
          <Route path="/claim" element={<Claim />} />
          <Route path="/badges" element={<Badges />} />
          <Route path="/verify" element={<Verify />} />
          <Route path="/organizer" element={<Organizer />} />
          <Route path="/series" element={<Series />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/check" element={<Diagnostics />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
      <ToastViewport />
    </>
  );
}
